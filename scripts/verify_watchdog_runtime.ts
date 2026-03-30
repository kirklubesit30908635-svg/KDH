import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { normalizeWatchdogRun } from "../src/lib/operator-watchdog";

type JsonRecord = Record<string, unknown>;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const envFile of [".env.local", ".env.production.local", ".env"]) {
  const fullPath = path.join(repoRoot, envFile);
  if (existsSync(fullPath)) {
    dotenvConfig({ path: fullPath, override: false });
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildSlug(prefix: string, runId: string) {
  return `${prefix}-${runId.replace(/_/g, "-").toLowerCase().slice(0, 48)}`;
}

async function insertSingle<T extends JsonRecord>(
  client: unknown,
  schema: string,
  table: string,
  payload: JsonRecord,
) {
  const insertClient = client as {
    schema(schema: string): {
      from(table: string): {
        insert(payload: JsonRecord): {
          select(): {
            single(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
          };
        };
      };
    };
  };
  const { data, error } = await insertClient
    .schema(schema)
    .from(table)
    .insert(payload)
    .select()
    .single();
  if (error) {
    throw new Error(`Insert ${schema}.${table} failed: ${error.message}`);
  }
  return data as T;
}

async function main() {
  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const runId = randomId("akwatchdog");
  const pastDueAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const tenant = await insertSingle<{ id: string }>(supabase, "core", "tenants", {
    name: `AutoKirk Watchdog Verification ${runId}`,
    slug: buildSlug("autokirk-watchdog-verify", runId),
  });

  const workspace = await insertSingle<{ id: string }>(supabase, "core", "workspaces", {
    tenant_id: tenant.id,
    name: `AutoKirk Watchdog Verification ${runId} Ops`,
    slug: buildSlug("autokirk-watchdog-ops", runId),
  });

  const object = await insertSingle<{ id: string }>(supabase, "core", "objects", {
    workspace_id: workspace.id,
    kernel_class: "invoice",
    economic_posture: "direct_revenue",
    acknowledged_by_actor_class: "system",
    acknowledged_by_actor_id: "watchdog-verifier",
    source_ref: `watchdog-invoice-${runId}`,
    metadata: {
      verification_fixture: true,
      run_id: runId,
      face: "billing",
      title: "Watchdog verification invoice",
    },
  });

  const obligation = await insertSingle<{ id: string }>(supabase, "core", "obligations", {
    workspace_id: workspace.id,
    object_id: object.id,
    obligation_type: "record_revenue",
    opened_by_actor_class: "system",
    opened_by_actor_id: "watchdog-verifier",
    metadata: {
      verification_fixture: true,
      run_id: runId,
      face: "billing",
      severity: "critical",
      due_at: pastDueAt,
      title: "Watchdog verification obligation",
      why: "Deliberately late obligation for watchdog verification.",
    },
  });

  const obligationId = obligation.id;

  const invokeRun = async () => {
    const { data, error } = await supabase.schema("api").rpc("run_workspace_watchdog", {
      p_workspace_id: workspace.id,
      p_actor_id: "system:watchdog-verifier",
    });

    if (error) {
      throw new Error(`run_workspace_watchdog failed: ${error.message}`);
    }

    const run = normalizeWatchdogRun(data);
    if (!run) {
      throw new Error("run_workspace_watchdog returned an invalid payload");
    }

    return run;
  };

  const firstRun = await invokeRun();
  const replayRun = await invokeRun();

  const { count: watchdogEventCount, error: eventError } = await supabase
    .schema("ledger")
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("chain_key", `obligation:${obligationId}`)
    .eq("idempotency_key", `watchdog:${obligationId}:late_obligation`);

  if (eventError) {
    throw new Error(`Failed to count watchdog events: ${eventError.message}`);
  }

  if (firstRun.emitted_signal_count !== 1) {
    throw new Error(`Expected first watchdog run to emit 1 signal, received ${firstRun.emitted_signal_count}`);
  }

  if (replayRun.emitted_signal_count !== 0) {
    throw new Error(`Expected replay watchdog run to emit 0 signals, received ${replayRun.emitted_signal_count}`);
  }

  if (watchdogEventCount !== 1) {
    throw new Error(`Expected exactly 1 watchdog signal event, received ${watchdogEventCount ?? 0}`);
  }

  console.log(
    JSON.stringify(
      {
        run_id: runId,
        workspace_id: workspace.id,
        obligation_id: obligationId,
        first_run: firstRun,
        replay_run: replayRun,
        watchdog_event_count: watchdogEventCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

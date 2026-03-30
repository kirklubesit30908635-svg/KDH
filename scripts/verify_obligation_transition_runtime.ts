import crypto from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config as dotenvConfig } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

type VerificationAuditRow = {
  check_name: string;
  status: "ok" | "violation";
  detail: Record<string, unknown>;
};

type TransitionRpcResult = {
  ok: boolean;
  transition_id: string;
  obligation_id: string;
  current_state: string;
  next_state: string;
  ledger_event_id: string;
  receipt_id: string;
  event_seq: number;
  event_hash: string;
  receipt_seq: number;
  receipt_hash: string;
};

type ClosureVerificationRow = {
  obligation_id: string;
  transition_id: string;
  current_state: string;
  next_state: string;
  transition_at: string;
  ledger_event_id: string;
  event_type_name: string;
  event_seq: number;
  event_hash: string;
  event_payload: Record<string, unknown>;
  receipt_id: string | null;
  receipt_type_name: string | null;
  receipt_seq: number | null;
  receipt_hash: string | null;
  receipt_payload: Record<string, unknown> | null;
  receipt_count: number;
  closed_revenue_count: number;
  terminal_count: number;
};

type JsonRecord = Record<string, unknown>;

type Fixture = {
  tenantId: string;
  workspaceId: string;
  objectId: string;
  obligationId: string;
  runId: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const envFile of [".env.local", ".env.prod.local", ".env"]) {
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

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const stripeWebhookSecret = requiredEnv("STRIPE_WEBHOOK_SECRET");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildSlug(prefix: string, runId: string) {
  return `${prefix}-${runId.replace(/_/g, "-").toLowerCase().slice(0, 48)}`;
}

async function insertSingle<T extends JsonRecord>(
  client: SupabaseClient,
  schema: string,
  table: string,
  payload: JsonRecord,
) {
  const { data, error } = await client.schema(schema).from(table).insert(payload).select().single();
  if (error) {
    throw new Error(`Insert ${schema}.${table} failed: ${error.message}`);
  }
  return data as T;
}

async function callTransition(
  obligationId: string,
  nextState: "created" | "in_progress" | "pending_payment",
  payload: JsonRecord,
) {
  const { data, error } = await supabase.schema("api").rpc("record_obligation_transition", {
    p_obligation_id: obligationId,
    p_next_state: nextState,
    p_actor_class: "system",
    p_actor_id: "runtime-verifier",
    p_reason_code: nextState === "created" ? "obligation_created" : "action_completed",
    p_payload: payload,
  });

  if (error) {
    throw new Error(`record_obligation_transition(${nextState}) failed: ${error.message}`);
  }

  return data as TransitionRpcResult;
}

async function createFixture() {
  const runId = randomId("akverify");
  const tenant = await insertSingle<{ id: string }>(supabase, "core", "tenants", {
    name: `AutoKirk Runtime Verification ${runId}`,
    slug: buildSlug("autokirk-runtime-verify", runId),
  });

  const workspace = await insertSingle<{ id: string }>(supabase, "core", "workspaces", {
    tenant_id: tenant.id,
    name: `AutoKirk Runtime Verification ${runId} Ops`,
    slug: buildSlug("autokirk-runtime-verify-ops", runId),
  });

  const object = await insertSingle<{ id: string }>(supabase, "core", "objects", {
    workspace_id: workspace.id,
    kernel_class: "subscription",
    economic_posture: "direct_revenue",
    acknowledged_by_actor_class: "system",
    acknowledged_by_actor_id: "runtime-verifier",
    source_ref: `verification-subscription-${runId}`,
    metadata: {
      verification_fixture: true,
      run_id: runId,
      source: "verify_obligation_transition_runtime",
    },
  });

  const obligation = await insertSingle<{ id: string }>(supabase, "core", "obligations", {
    workspace_id: workspace.id,
    object_id: object.id,
    obligation_type: "operationalize_subscription",
    opened_by_actor_class: "system",
    opened_by_actor_id: "runtime-verifier",
    metadata: {
      verification_fixture: true,
      run_id: runId,
      source: "verify_obligation_transition_runtime",
      face: "billing",
      severity: "due_today",
    },
  });

  await callTransition(obligation.id, "created", {
    source: "verify_obligation_transition_runtime",
    run_id: runId,
    stage: "created",
  });
  await callTransition(obligation.id, "in_progress", {
    source: "verify_obligation_transition_runtime",
    run_id: runId,
    stage: "in_progress",
  });
  await callTransition(obligation.id, "pending_payment", {
    source: "verify_obligation_transition_runtime",
    run_id: runId,
    stage: "pending_payment",
  });

  return {
    tenantId: tenant.id,
    workspaceId: workspace.id,
    objectId: object.id,
    obligationId: obligation.id,
    runId,
  } satisfies Fixture;
}

function buildSyntheticStripeEvent(fixture: Fixture) {
  const paymentIntentId = `pi_${fixture.runId}`;
  const stripeEvent = {
    id: `evt_${fixture.runId}`,
    object: "event",
    api_version: "2026-02-25.clover",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: paymentIntentId,
        object: "payment_intent",
        amount: 1337,
        currency: "usd",
        metadata: {
          obligation_id: fixture.obligationId,
          verification_fixture: "true",
          run_id: fixture.runId,
        },
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type: "payment_intent.succeeded",
  };

  return {
    rawBody: JSON.stringify(stripeEvent),
    eventId: stripeEvent.id,
    paymentIntentId,
  };
}

async function invokeWebhook(rawBody: string) {
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: stripeWebhookSecret,
  });

  const { NextRequest } = await import("next/server");
  const routeModuleUrl = pathToFileURL(
    path.join(repoRoot, "src", "app", "api", "stripe", "webhook", "route.ts"),
  ).href;
  const { POST } = await import(routeModuleUrl);

  const response = await POST(
    new NextRequest("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signature,
      },
      body: rawBody,
    }),
  );

  return {
    status: response.status,
    json: (await response.json()) as JsonRecord,
  };
}

async function auditRuntime() {
  const { data, error } = await supabase.schema("api").rpc("audit_obligation_transition_runtime");
  if (error) {
    throw new Error(`audit_obligation_transition_runtime failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as VerificationAuditRow[];
  const violations = rows.filter((row) => row.status !== "ok");
  if (violations.length > 0) {
    throw new Error(`Runtime audit violations: ${JSON.stringify(violations, null, 2)}`);
  }

  return rows;
}

async function verifyClosure(obligationId: string) {
  const { data, error } = await supabase
    .schema("api")
    .rpc("verify_obligation_closure", { p_obligation_id: obligationId });

  if (error) {
    throw new Error(`verify_obligation_closure failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as ClosureVerificationRow[];
  if (rows.length !== 1) {
    throw new Error(`Expected 1 verification row, received ${rows.length}`);
  }

  return rows[0];
}

function assertClosure(row: ClosureVerificationRow, paymentIntentId: string) {
  if (row.next_state !== "closed_revenue") {
    throw new Error(`Expected next_state=closed_revenue, received ${row.next_state}`);
  }

  if (row.closed_revenue_count !== 1) {
    throw new Error(`Expected closed_revenue_count=1, received ${row.closed_revenue_count}`);
  }

  if (row.terminal_count !== 1) {
    throw new Error(`Expected terminal_count=1, received ${row.terminal_count}`);
  }

  if (row.receipt_count !== 1) {
    throw new Error(`Expected receipt_count=1, received ${row.receipt_count}`);
  }

  if (!row.receipt_id || !row.receipt_type_name || !row.receipt_seq || !row.receipt_hash) {
    throw new Error("Expected linked receipt proof on the latest transition");
  }

  if (!row.event_seq || !row.event_hash) {
    throw new Error("Expected committed ledger event proof on the latest transition");
  }

  const payload = asRecord(row.event_payload);
  const transitionPayload = asRecord(payload.payload);
  const resolvedPaymentIntentId =
    typeof transitionPayload.payment_intent_id === "string"
      ? transitionPayload.payment_intent_id
      : typeof payload.payment_intent_id === "string"
        ? String(payload.payment_intent_id)
        : undefined;

  if (resolvedPaymentIntentId !== paymentIntentId) {
    throw new Error(
      `Expected payment_intent_id=${paymentIntentId}, received ${String(resolvedPaymentIntentId)}`,
    );
  }
}

async function main() {
  const auditRows = await auditRuntime();
  const fixture = await createFixture();
  const syntheticEvent = buildSyntheticStripeEvent(fixture);
  const firstWebhook = await invokeWebhook(syntheticEvent.rawBody);
  const replayWebhook = await invokeWebhook(syntheticEvent.rawBody);
  const closure = await verifyClosure(fixture.obligationId);

  if (firstWebhook.status !== 200) {
    throw new Error(
      `First webhook returned HTTP ${firstWebhook.status}: ${JSON.stringify(firstWebhook.json, null, 2)}`,
    );
  }

  if (replayWebhook.status !== 200) {
    throw new Error(
      `Replay webhook returned HTTP ${replayWebhook.status}: ${JSON.stringify(replayWebhook.json, null, 2)}`,
    );
  }

  if (firstWebhook.json.ok !== true) {
    throw new Error(`First webhook failed: ${JSON.stringify(firstWebhook.json, null, 2)}`);
  }

  if (replayWebhook.json.ok !== true) {
    throw new Error(`Replay webhook failed: ${JSON.stringify(replayWebhook.json, null, 2)}`);
  }

  assertClosure(closure, syntheticEvent.paymentIntentId);

  const summary = {
    audit: auditRows,
    fixture,
    first_webhook: firstWebhook.json,
    replay_webhook: replayWebhook.json,
    verification: closure,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

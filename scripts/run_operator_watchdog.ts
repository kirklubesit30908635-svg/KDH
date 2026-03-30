import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { config as dotenvConfig } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { normalizeWatchdogRun } from "../src/lib/operator-watchdog";

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

  const explicitWorkspaceId = process.argv[2] ?? process.env.WATCHDOG_WORKSPACE_ID ?? null;

  let workspaceIds: string[] = [];

  if (explicitWorkspaceId) {
    workspaceIds = [explicitWorkspaceId];
  } else {
    const { data, error } = await supabase
      .schema("core")
      .from("obligations")
      .select("workspace_id, state")
      .neq("state", "resolved");

    if (error) {
      throw new Error(`Failed to list live watchdog workspaces: ${error.message}`);
    }

    workspaceIds = [
      ...new Set(
        (data ?? [])
          .map((row) => row.workspace_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    ];
  }

  const results = [];
  for (const workspaceId of workspaceIds) {
    const { data, error } = await supabase
      .schema("api")
      .rpc("run_workspace_watchdog", {
        p_workspace_id: workspaceId,
        p_actor_id: "system:watchdog-runner",
      });

    if (error) {
      throw new Error(`run_workspace_watchdog failed for ${workspaceId}: ${error.message}`);
    }

    const run = normalizeWatchdogRun(data);
    if (!run) {
      throw new Error(`run_workspace_watchdog returned invalid payload for ${workspaceId}`);
    }

    results.push(run);
  }

  console.log(
    JSON.stringify(
      {
        workspace_count: workspaceIds.length,
        runs: results,
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

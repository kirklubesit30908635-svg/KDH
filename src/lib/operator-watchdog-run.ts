import { normalizeWatchdogRun, type OperatorWatchdogRun } from "@/lib/operator-watchdog";

interface RpcError {
  message: string;
}

interface RpcClient {
  schema(schema: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: RpcError | null }>;
  };
}

function asRpcClient(client: unknown): RpcClient {
  return client as RpcClient;
}

export async function runWorkspaceWatchdog(
  client: unknown,
  workspaceId: string,
  actorId: string,
): Promise<OperatorWatchdogRun> {
  const { data, error } = await asRpcClient(client).schema("api").rpc(
    "run_workspace_watchdog",
    {
      p_workspace_id: workspaceId,
      p_actor_id: actorId,
    },
  );

  if (error) {
    throw new Error(`run_workspace_watchdog failed: ${error.message}`);
  }

  const run = normalizeWatchdogRun(data);
  if (!run) {
    throw new Error("run_workspace_watchdog returned an invalid payload");
  }

  return run;
}

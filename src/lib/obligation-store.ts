export interface ObligationInput {
  title: string;
  why?: string | null;
  face?: string;
  severity?: string;
  due_at?: string | null;
  economic_ref_type?: string | null;
  economic_ref_id?: string | null;
  source_event_id?: string | null;
  workspace_id?: string | null;
  idempotency_key?: string | null;
}

interface GovernedMutationResult {
  ok: boolean;
  obligation_id: string;
  ledger_event_id: string;
  receipt_id: string;
  event_seq: number;
  event_hash: string;
  receipt_seq: number;
  receipt_hash: string;
  next_due_at?: string;
  resolved_at?: string;
  terminal_action?: string;
  reason_code?: string;
  // Present on ok=false paths (0035 structured error contract).
  duplicate?: boolean;
  outcome?: string;
  rejection_class?: string;
  error_message?: string;
  attempt_id?: string;
}

interface SealObligationOptions {
  terminalAction?: "closed" | "terminated" | "eliminated";
  reasonCode?: string;
  metadata?: Record<string, unknown>;
}

interface RpcError {
  message: string;
}

export class CommandRpcError extends Error {
  outcome: string;
  rejection_class: string | undefined;
  reason_code: string | undefined;
  attempt_id: string | undefined;

  constructor(result: GovernedMutationResult) {
    const detail = result.error_message ?? result.outcome ?? "unknown failure";
    super(`command_resolve_obligation returned ok=false [${result.outcome ?? "?"}/${result.rejection_class ?? "?"}]: ${detail}`);
    this.name = "CommandRpcError";
    this.outcome = result.outcome ?? "failed_execution";
    this.rejection_class = result.rejection_class;
    this.reason_code = result.reason_code;
    this.attempt_id = result.attempt_id;
  }
}

interface RpcClient {
  schema(schema: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>
    ): Promise<{ data: unknown; error: RpcError | null }>;
  };
}

function asRpcClient(client: unknown): RpcClient {
  return client as RpcClient;
}

async function runJsonRpc(
  client: unknown,
  fn: "command_resolve_obligation",
  args: Record<string, unknown>
): Promise<GovernedMutationResult> {
  const { data, error } = await asRpcClient(client).schema("api").rpc(fn, args);

  if (error) {
    throw new Error(`${fn} failed: ${error.message}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${fn} returned an invalid payload`);
  }

  const result = data as GovernedMutationResult;

  // 0035 contract: the DB function returns ok=false for all business-layer
  // failures instead of raising exceptions. Check ok explicitly — a successful
  // Supabase transport does NOT mean the obligation was resolved.
  if (result.ok === false) {
    throw new CommandRpcError(result);
  }

  return result;
}

export async function sealObligation(
  client: unknown,
  obligationId: string,
  actorId: string,
  options?: SealObligationOptions
): Promise<GovernedMutationResult> {
  return runJsonRpc(client, "command_resolve_obligation", {
    p_obligation_id: obligationId,
    p_actor_id: actorId,
    p_terminal_action: options?.terminalAction ?? "closed",
    p_reason_code: options?.reasonCode ?? "action_completed",
    p_metadata: options?.metadata ?? {},
  });
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { callRpc } from '../services/supabase.js';
export function registerKernelTools(server: McpServer): void {
  server.registerTool('ak_acknowledge_object', { title: 'Acknowledge Kernel Object', description: 'Calls api.acknowledge_object RPC — seals an object into the kernel as acknowledged. Idempotent.', inputSchema: z.object({ workspace_id: z.string().uuid(), object_id: z.string().uuid(), actor: z.string().min(1) }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ workspace_id, object_id, actor }) => {
    const r = await callRpc('acknowledge_object', { p_workspace_id: workspace_id, p_object_id: object_id, p_actor: actor });
    const out = r.ok ? { ok: true, object_id, actor, result: r.data } : { ok: false, error: r.error };
    return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
  });
  server.registerTool('ak_open_obligation', { title: 'Open Kernel Obligation', description: 'Calls api.open_obligation RPC — creates a new open obligation on an object. Appends to ledger.events.', inputSchema: z.object({ workspace_id: z.string().uuid(), object_id: z.string().uuid(), obligation_type: z.string().min(1), actor: z.string().min(1), due_at: z.string().datetime().optional(), payload: z.record(z.unknown()).optional() }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, async ({ workspace_id, object_id, obligation_type, actor, due_at, payload }) => {
    const r = await callRpc('open_obligation', { p_workspace_id: workspace_id, p_object_id: object_id, p_obligation_type: obligation_type, p_actor: actor, p_due_at: due_at ?? null, p_payload: payload ?? {} });
    const out = r.ok ? { ok: true, obligation_type, object_id, actor, result: r.data } : { ok: false, error: r.error };
    return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
  });
  server.registerTool('ak_resolve_obligation', { title: 'Resolve Kernel Obligation', description: 'Calls api.resolve_obligation RPC — transitions obligation from open to resolved and issues a ledger.receipt.', inputSchema: z.object({ workspace_id: z.string().uuid(), obligation_id: z.string().uuid(), actor: z.string().min(1), resolution_payload: z.record(z.unknown()).optional() }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, async ({ workspace_id, obligation_id, actor, resolution_payload }) => {
    const r = await callRpc('resolve_obligation', { p_workspace_id: workspace_id, p_obligation_id: obligation_id, p_actor: actor, p_resolution_payload: resolution_payload ?? {} });
    const out = r.ok ? { ok: true, obligation_id, actor, result: r.data } : { ok: false, error: r.error };
    return { content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }] };
  });
}
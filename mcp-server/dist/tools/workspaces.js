import { z } from 'zod';
import { queryTable, queryRow } from '../services/supabase.js';
export function registerWorkspaceTools(server) {
    server.registerTool('ak_list_workspaces', { title: 'List Workspaces', description: 'List all workspaces from core.workspaces. Full tenant hierarchy: KDH -> ak-ip -> ak-systems -> OSM. Use to get workspace UUIDs for other tools.', inputSchema: z.object({ parent_id: z.string().uuid().optional(), tier: z.string().optional(), limit: z.number().int().min(1).max(100).default(25) }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ parent_id, tier, limit }) => {
        const filters = {};
        if (parent_id)
            filters['parent_id'] = parent_id;
        if (tier)
            filters['tier'] = tier;
        const r = await queryTable('core', 'workspaces', { filters, limit, order: { column: 'created_at', ascending: true } });
        const out = r.ok ? { ok: true, count: r.data.length, workspaces: r.data } : { ok: false, error: r.error };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
    server.registerTool('ak_get_workspace', { title: 'Get Workspace', description: 'Fetch a single workspace by UUID.', inputSchema: z.object({ workspace_id: z.string().uuid() }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ workspace_id }) => {
        const r = await queryRow('core', 'workspaces', workspace_id);
        return { content: [{ type: 'text', text: JSON.stringify(r.ok ? { ok: true, workspace: r.data } : { ok: false, error: r.error }, null, 2) }] };
    });
}

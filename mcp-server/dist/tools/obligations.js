import { z } from 'zod';
import { queryTable, queryRow } from '../services/supabase.js';
export function registerObligationTools(server) {
    server.registerTool('ak_list_obligations', { title: 'List Kernel Obligations', description: 'Query core.obligations. Filter by state (open/resolved/eliminated), object_id, or type. Paginated, newest first.', inputSchema: z.object({ workspace_id: z.string().uuid(), state: z.enum(['open', 'resolved', 'eliminated']).optional(), object_id: z.string().uuid().optional(), obligation_type: z.string().optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ workspace_id, state, object_id, obligation_type, limit, offset }) => {
        const filters = { workspace_id };
        if (state)
            filters['state'] = state;
        if (object_id)
            filters['object_id'] = object_id;
        if (obligation_type)
            filters['obligation_type'] = obligation_type;
        const r = await queryTable('core', 'obligations', { filters, limit, offset, order: { column: 'created_at', ascending: false } });
        const out = r.ok ? { ok: true, count: r.data.length, offset, has_more: r.data.length === limit, obligations: r.data } : { ok: false, error: r.error };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
    server.registerTool('ak_get_obligation', { title: 'Get Single Obligation', description: 'Fetch a single obligation by UUID from core.obligations.', inputSchema: z.object({ obligation_id: z.string().uuid() }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ obligation_id }) => {
        const r = await queryRow('core', 'obligations', obligation_id);
        const out = r.ok ? { ok: true, obligation: r.data } : { ok: false, error: r.error };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
}

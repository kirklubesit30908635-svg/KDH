import { z } from 'zod';
import { queryTable, queryRow } from '../services/supabase.js';
export function registerEventTools(server) {
    server.registerTool('ak_list_events', { title: 'List Kernel Events', description: 'Query ledger.events — the append-only event log. Filter by event_type or subject. Default newest first.', inputSchema: z.object({ workspace_id: z.string().uuid(), event_type: z.string().optional(), subject: z.string().optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0), ascending: z.boolean().default(false) }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ workspace_id, event_type, subject, limit, offset, ascending }) => {
        const filters = { workspace_id };
        if (event_type)
            filters['event_type'] = event_type;
        if (subject)
            filters['subject'] = subject;
        const r = await queryTable('ledger', 'events', { filters, limit, offset, order: { column: 'created_at', ascending } });
        const out = r.ok ? { ok: true, count: r.data.length, has_more: r.data.length === limit, events: r.data } : { ok: false, error: r.error };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
    server.registerTool('ak_get_event', { title: 'Get Single Kernel Event', description: 'Fetch a single event by UUID from ledger.events. Returns hash chain fields.', inputSchema: z.object({ event_id: z.string().uuid() }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ event_id }) => {
        const r = await queryRow('ledger', 'events', event_id);
        return { content: [{ type: 'text', text: JSON.stringify(r.ok ? { ok: true, event: r.data } : { ok: false, error: r.error }, null, 2) }] };
    });
}

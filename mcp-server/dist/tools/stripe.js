import { z } from 'zod';
import { callRpc, queryTable } from '../services/supabase.js';
export function registerStripeTools(server) {
    server.registerTool('ak_ingest_stripe_event', { title: 'Ingest Stripe Event', description: 'Pushes a Stripe event through the AutoKirk kernel pipeline. Idempotent via stripe_event_id. Use for manual replay or testing.', inputSchema: z.object({ stripe_event_id: z.string().min(1), event_type: z.string().min(1), payload: z.record(z.unknown()) }).strict(), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ stripe_event_id, event_type, payload }) => {
        const r = await callRpc('ingest_stripe_event', { p_stripe_event_id: stripe_event_id, p_event_type: event_type, p_payload: payload });
        const out = r.ok ? { ok: true, stripe_event_id, event_type, result: r.data } : { ok: false, error: r.error };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
    server.registerTool('ak_list_stripe_events', { title: 'List Stripe Events', description: 'Query ingest.stripe_events — raw Stripe event log before kernel processing. Diagnose webhook gaps.', inputSchema: z.object({ workspace_id: z.string().uuid().optional(), event_type: z.string().optional(), limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0) }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ workspace_id, event_type, limit, offset }) => {
        const filters = {};
        if (workspace_id)
            filters['workspace_id'] = workspace_id;
        if (event_type)
            filters['event_type'] = event_type;
        const r = await queryTable('ingest', 'stripe_events', { filters, limit, offset, order: { column: 'created_at', ascending: false } });
        const out = r.ok ? { ok: true, count: r.data.length, stripe_events: r.data } : { ok: false, error: r.error };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
}

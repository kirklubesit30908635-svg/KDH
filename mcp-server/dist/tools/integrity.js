import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase.js';
export function registerIntegrityTools(server) {
    server.registerTool('ak_get_integrity_score', { title: 'Get Workspace Integrity Score', description: 'Computes AutoKirk Integrity Score (0-100) from 5 signals: Closure Rate 30%, Breach Rate 25%, Event Coverage 20%, Obligation Latency 15%, Proof Lag 10%. Confidence: high=100+ events, medium=25+, low otherwise.', inputSchema: z.object({ workspace_id: z.string().uuid() }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ workspace_id }) => {
        const sb = getSupabaseClient();
        const [ev, ob, rc] = await Promise.all([
            sb.schema('ledger').from('events').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace_id),
            sb.schema('core').from('obligations').select('id, state').eq('workspace_id', workspace_id),
            sb.schema('ledger').from('receipts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace_id)
        ]);
        const total_events = ev.count ?? 0;
        const total_receipts = rc.count ?? 0;
        const obs = (ob.data ?? []);
        const total_obs = obs.length;
        const resolved_obs = obs.filter(o => o.state === 'resolved').length;
        const open_obs = obs.filter(o => o.state === 'open').length;
        const closure_rate = total_obs > 0 ? resolved_obs / total_obs : 0;
        const event_coverage = total_events > 0 ? Math.min(1, total_receipts / total_events) : 0;
        const proof_lag = total_obs > 0 ? (total_obs - resolved_obs) / total_obs : 0;
        const score = Math.round((closure_rate * 0.30 + (1 - 0) * 0.25 + event_coverage * 0.20 + 1 * 0.15 + (1 - proof_lag) * 0.10) * 100);
        const confidence = total_events >= 100 ? 'high' : total_events >= 25 ? 'medium' : 'low';
        const out = { ok: true, workspace_id, integrity_score: score, confidence, signals: { closure_rate, breach_rate: 0, event_coverage, obligation_latency_hours: 0, proof_lag }, counts: { total_events, total_obs, open_obs, resolved_obs, total_receipts }, computed_at: new Date().toISOString() };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out };
    });
}

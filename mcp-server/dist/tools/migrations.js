import { z } from 'zod';
import { getSupabaseClient } from '../services/supabase.js';
const GAPS = [{ name: 'kernel_command_policy_v1', description: 'Command/Policy enforcement layer' }, { name: 'weight_engine_v1', description: 'Object weight measurement and obligation threshold classification' }];
export function registerMigrationTools(server) {
    server.registerTool('ak_list_migrations', { title: 'List Applied Migrations', description: 'List all applied Supabase migrations from schema_migrations. Shows full chain in version order.', inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async ({ limit }) => {
        const sb = getSupabaseClient();
        const { data, error } = await sb.schema('supabase_migrations').from('schema_migrations').select('version, name, executed_at').order('version', { ascending: true }).limit(limit);
        const out = error ? { ok: false, error: error.message } : { ok: true, count: (data ?? []).length, migrations: data, known_gaps: GAPS };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
    server.registerTool('ak_check_schema_conflicts', { title: 'Check Schema Conflicts', description: 'Inspects for known schema conflicts. Checks core.obligations for dual status/state column conflict (old 0020 vs new constitution migration).', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async () => {
        const sb = getSupabaseClient();
        const conflicts = [];
        const { data } = await sb.schema('core').from('obligations').select('*').limit(1);
        if (data && data.length > 0) {
            const cols = Object.keys(data[0]);
            if (cols.includes('status') && cols.includes('state'))
                conflicts.push({ id: 'dual_core_obligations', detail: 'Both status and state columns exist in core.obligations', fix: "Drop 'status' column. Verify state CHECK constraint: open, resolved, eliminated." });
        }
        const out = { ok: true, clean: conflicts.length === 0, conflicts, known_gaps: GAPS, summary: conflicts.length === 0 ? 'No conflicts detected.' : conflicts.length + ' conflict(s) found.' };
        return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    });
    server.registerTool('ak_get_designed_migrations', { title: 'Get Designed-Not-Built Migrations', description: 'Returns migrations designed in doctrine but not yet applied: kernel_command_policy_v1 and weight_engine_v1.', inputSchema: z.object({}).strict(), annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, async () => {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, count: GAPS.length, designed_not_built: GAPS }, null, 2) }] };
    });
}

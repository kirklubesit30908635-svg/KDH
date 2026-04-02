import { createClient } from '@supabase/supabase-js';
let _client = null;
export function getSupabaseClient() {
    if (_client)
        return _client;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    return _client;
}
export async function queryTable(schema, table, opts = {}) {
    try {
        const sb = getSupabaseClient();
        let q = sb.schema(schema).from(table).select(opts.select ?? '*');
        for (const [col, val] of Object.entries(opts.filters ?? {})) {
            if (val != null)
                q = q.eq(col, val);
        }
        if (opts.order)
            q = q.order(opts.order.column, { ascending: opts.order.ascending ?? false });
        const limit = opts.limit ?? 25;
        const offset = opts.offset ?? 0;
        q = q.range(offset, offset + limit - 1);
        const { data, error } = await q;
        if (error)
            return { ok: false, error: error.message, hint: error.hint ?? undefined };
        return { ok: true, data: (data ?? []) };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}
export async function callRpc(fn, params) {
    try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.rpc(fn, params);
        if (error)
            return { ok: false, error: error.message, hint: error.hint ?? undefined };
        return { ok: true, data: data };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown RPC error' };
    }
}
export async function queryRow(schema, table, id, idCol = 'id') {
    try {
        const sb = getSupabaseClient();
        const { data, error } = await sb.schema(schema).from(table).select('*').eq(idCol, id).single();
        if (error)
            return { ok: false, error: error.message, hint: error.code === 'PGRST116' ? 'No row with ' + idCol + '=' + id : error.hint ?? undefined };
        return { ok: true, data: data };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

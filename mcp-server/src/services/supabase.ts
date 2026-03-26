import { createClient, SupabaseClient } from '@supabase/supabase-js';
let _client: SupabaseClient | null = null;
export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}
export async function queryTable<T>(schema: string, table: string, opts: { select?: string; filters?: Record<string,unknown>; limit?: number; offset?: number; order?: { column: string; ascending?: boolean } } = {}): Promise<{ ok: true; data: T[] } | { ok: false; error: string; hint?: string }> {
  try {
    const sb = getSupabaseClient();
    let q = sb.schema(schema).from(table).select(opts.select ?? '*');
    for (const [col, val] of Object.entries(opts.filters ?? {})) { if (val != null) q = q.eq(col, val as string); }
    if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? false });
    const limit = opts.limit ?? 25; const offset = opts.offset ?? 0;
    q = q.range(offset, offset + limit - 1);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
    return { ok: true, data: (data ?? []) as T[] };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }; }
}
export async function callRpc<T>(fn: string, params: Record<string,unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string; hint?: string }> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.rpc(fn, params);
    if (error) return { ok: false, error: error.message, hint: error.hint ?? undefined };
    return { ok: true, data: data as T };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Unknown RPC error' }; }
}
export async function queryRow<T>(schema: string, table: string, id: string, idCol = 'id'): Promise<{ ok: true; data: T } | { ok: false; error: string; hint?: string }> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.schema(schema).from(table).select('*').eq(idCol, id).single();
    if (error) return { ok: false, error: error.message, hint: error.code === 'PGRST116' ? 'No row with ' + idCol + '=' + id : error.hint ?? undefined };
    return { ok: true, data: data as T };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }; }
}
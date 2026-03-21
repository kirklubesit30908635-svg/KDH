import { createClient } from "@supabase/supabase-js";

// Server-only admin client. Requires service role key.
// NOTE: This module must never be imported into client components.

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Lazy singleton — only instantiated on first call at runtime, not at module load
let _admin: ReturnType<typeof getSupabaseAdmin> | null = null;
export const supabaseAdmin = new Proxy({} as ReturnType<typeof getSupabaseAdmin>, {
  get(_target, prop) {
    if (!_admin) _admin = getSupabaseAdmin();
    return Reflect.get(_admin, prop);
  },
});

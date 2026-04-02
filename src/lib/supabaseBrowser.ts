// Re-export shim — canonical browser client lives at @/lib/supabase/supabaseBrowser
import { createBrowserSupabaseClient } from "@/lib/supabase/supabaseBrowser";

export const supabaseBrowser = createBrowserSupabaseClient;

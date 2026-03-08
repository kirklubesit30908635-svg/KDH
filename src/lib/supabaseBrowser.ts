// Re-export shim — canonical browser client lives at @/lib/supabase/supabaseBrowser
import { createClient } from "@/lib/supabase/supabaseBrowser";

export const supabaseBrowser = createClient;

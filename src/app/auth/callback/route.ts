import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function normalizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/command";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = normalizeNextPath(searchParams.get("next"));

  if (code) {
    // Build the redirect response first so we can set cookies on it
    const redirectTo = new URL(next, origin);
    const response = NextResponse.redirect(redirectTo);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Write auth session cookies directly onto the outgoing response
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Auto-provision operator row on first login
      const user = sessionData?.user;
      if (user) {
        await provisionOperator(user.id, user.email ?? "");
      }
      return response; // session cookies are baked in, redirect to /command
    }

    // Surface the real error for debugging
    const msg = encodeURIComponent(error.message ?? "exchange_failed");
    return NextResponse.redirect(new URL(`/login?error=auth_failed&detail=${msg}`, origin));
  }

  // No code param — likely implicit-flow hash redirect; send to login with hint
  return NextResponse.redirect(new URL("/login?error=no_code", origin));
}

// Create a core.operators row for new users on their first sign-in.
// Uses ON CONFLICT DO NOTHING so repeat logins are a no-op.
async function provisionOperator(authUid: string, email: string) {
  try {
    const admin = getSupabaseAdmin();

    // Derive a handle from the email prefix, then sanitize
    const raw = (email.split("@")[0] ?? authUid.slice(0, 8))
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 32);

    // Append 4 chars of the UID to avoid handle collisions across accounts
    const handle = `${raw}_${authUid.replace(/-/g, "").slice(0, 4)}`;

    await admin
      .schema("core")
      .from("operators")
      .upsert(
        { auth_uid: authUid, handle },
        { onConflict: "auth_uid", ignoreDuplicates: true }
      );
  } catch {
    // Provisioning failure is non-fatal — user can still navigate the app,
    // they just won't have workspace access until manually provisioned.
  }
}

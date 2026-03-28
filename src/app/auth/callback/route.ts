import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { linkOperatorOnLogin } from "@/lib/kernel/linkOperatorOnLogin";

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
      // Link operator to provisioned workspaces on every login.
      // Creates operator row if first login. Links to any workspaces
      // provisioned for this email via Stripe. Idempotent.
      const user = sessionData?.user;
      if (user) {
        try {
          const linkResult = await linkOperatorOnLogin(user.id, user.email ?? "");
          if (linkResult.workspaces_linked && linkResult.workspaces_linked > 0) {
            console.log(
              `[auth-callback] Linked ${linkResult.workspaces_linked} workspace(s) for ${user.email}`
            );
          }
        } catch {
          // Non-fatal — user can still navigate, workspace linking
          // will retry on next login.
        }
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

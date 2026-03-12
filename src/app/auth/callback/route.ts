import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/command";

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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response; // session cookies are baked in, redirect to /command
    }

    // Surface the real error for debugging
    const msg = encodeURIComponent(error.message ?? "exchange_failed");
    return NextResponse.redirect(new URL(`/login?error=auth_failed&detail=${msg}`, origin));
  }

  // No code param — likely implicit-flow hash redirect; send to login with hint
  return NextResponse.redirect(new URL("/login?error=no_code", origin));
}

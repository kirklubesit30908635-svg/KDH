import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that require an active subscription
const GATED_PREFIXES = [
  "/command",
  "/integrity",
  "/billing-ops",
  "/advertising",
  "/receipts",
  "/users",
];

// Operator emails that bypass the subscription check
const FOUNDER_EMAILS = new Set(["kirklubesit30908635@gmail.com"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only run on gated routes
  const isGated = GATED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isGated) return NextResponse.next();

  // Build Supabase client — required to refresh session cookies in middleware
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // No session → login
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Founder bypass — skip subscription check
  if (user.email && FOUNDER_EMAILS.has(user.email)) {
    return response;
  }

  // Check subscription status via Supabase REST (edge-compatible)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const opRes = await fetch(
    `${supabaseUrl}/rest/v1/operators?auth_uid=eq.${encodeURIComponent(user.id)}&select=subscription_status&limit=1`,
    {
      headers: {
        apikey:           serviceKey,
        Authorization:    `Bearer ${serviceKey}`,
        "Accept-Profile": "core",
      },
      cache: "no-store",
    }
  );

  if (opRes.ok) {
    const rows = await opRes.json() as { subscription_status: string }[];
    const status = rows[0]?.subscription_status ?? "inactive";
    if (status !== "active") {
      return NextResponse.redirect(new URL("/subscribe", request.url));
    }
  }
  // If the fetch fails (cold start, env missing) — allow through rather than hard-block

  return response;
}

export const config = {
  matcher: [
    "/command/:path*",
    "/integrity/:path*",
    "/billing-ops/:path*",
    "/advertising/:path*",
    "/receipts/:path*",
    "/users/:path*",
  ],
};

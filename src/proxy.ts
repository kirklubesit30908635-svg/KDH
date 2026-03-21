import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getStripeFirstWedgeRouteGate,
  isWedgeProtectedPath,
} from "@/lib/stripe_first_wedge_closure";

function blockedSurfaceResponse(
  request: NextRequest,
  classification: "deferred" | "dead",
  reason: string,
) {
  const status = classification === "deferred" ? 409 : 410;
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: `${classification} surface`,
        classification,
        reason,
      },
      { status },
    );
  }

  return new NextResponse(`${classification.toUpperCase()}: ${reason}`, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const routeGate = getStripeFirstWedgeRouteGate(pathname, request.method);
  if (
    routeGate.classification === "deferred" ||
    routeGate.classification === "dead"
  ) {
    return blockedSurfaceResponse(request, routeGate.classification, routeGate.reason ?? "Closed");
  }

  const isProtected = isWedgeProtectedPath(pathname);
  if (!isProtected) {
    return NextResponse.next();
  }

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
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

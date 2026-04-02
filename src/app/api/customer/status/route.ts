import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options, maxAge: 0 });
          } catch {}
        },
      },
    }
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      {
        ok: false,
        reason: "unauthenticated",
        activation: null,
      },
      { status: 401 }
    );
  }

  const { data, error } = await supabase.rpc("customer_activation_status");

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "rpc_failed",
        message: error.message,
        activation: null,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      activation: data,
    },
    { status: 200 }
  );
}
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

const DEFAULT_FOUNDER_EMAIL = "kirklubesit30908635@gmail.com";

export function getFounderEmail() {
  return (
    process.env.FOUNDER_EMAIL ||
    process.env.NEXT_PUBLIC_FOUNDER_EMAIL ||
    DEFAULT_FOUNDER_EMAIL
  ).toLowerCase();
}

export function isFounderEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase() === getFounderEmail();
}

export async function requireFounderPageAccess(pathname: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  if (!isFounderEmail(user.email)) {
    redirect("/command");
  }

  return user;
}

export async function ensureFounderRouteAccess(pathname: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized", path: pathname }, { status: 401 }),
    };
  }

  if (!isFounderEmail(user.email)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden", path: pathname }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

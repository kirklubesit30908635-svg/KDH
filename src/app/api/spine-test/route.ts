// src/app/api/spine-test/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type CommitReceiptInput = {
  tenant_id: string;
  actor_id: string;
  verb: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
};

function jsonError(
  status: number,
  step: string,
  message: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(
    { ok: false, step, error: message, ...(extra ?? {}) },
    { status }
  );
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.SPINE_TEST_ENABLED !== "true") {
    return jsonError(403, "guard", "spine-test endpoint disabled");
  }

  const supabase = await supabaseServer();

  // 1) Verify authenticated context (cookie-based)
  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    return jsonError(401, "auth.getUser", authErr.message);
  }
  const user = authData?.user;
  if (!user?.id) {
    return jsonError(401, "auth.getUser", "no authenticated user");
  }

  // 2) Inputs (allow override via querystring for testing)
  const url = new URL(req.url);
  const tenantId =
    url.searchParams.get("tenant_id") ?? "00000000-0000-0000-0000-000000000001";
  const verb = url.searchParams.get("verb") ?? "TEST";
  const idem =
    url.searchParams.get("idempotency_key") ?? `spine-test-${Date.now()}`;

  const p_receipt: CommitReceiptInput = {
    tenant_id: tenantId,
    actor_id: user.id,
    verb,
    payload: {
      ok: true,
      route: "/api/spine-test",
      ts: new Date().toISOString(),
    },
    idempotency_key: idem,
  };

  // 3) Kernel RPC
  const rpc = await supabase.rpc("commit_receipt", { p_receipt });

  if (rpc.error) {
    return jsonError(500, "rpc.commit_receipt", rpc.error.message, {
      hint: "Check EXECUTE grants + function guards (auth.uid/tenant enforcement) + RLS",
    });
  }

  return NextResponse.json({
    ok: true,
    user_id: user.id,
    tenant_id: tenantId,
    idempotency_key: idem,
    receipt: rpc.data ?? null,
  });
}

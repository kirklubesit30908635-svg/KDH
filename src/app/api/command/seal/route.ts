import { NextRequest, NextResponse } from "next/server";
import { requireOperatorRouteContext } from "@/lib/operator-access";
import { sealObligation } from "@/lib/obligation-store";

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function buildActivationSealMetadata(
  obligationId: string,
  objectId: string,
  workspaceId: string,
  obligationMetadata: RecordLike,
  objectMetadata: RecordLike,
) {
  const now = new Date().toISOString();

  return {
    surface: "command",
    action: "seal",
    workspace_id: workspaceId,
    source: "stripe",
    object_id: objectId,
    obligation_id: obligationId,
    stripe_customer_id: firstString(
      obligationMetadata.stripe_customer_id,
      objectMetadata.stripe_customer_id,
    ),
    stripe_subscription_id: firstString(
      obligationMetadata.stripe_subscription_id,
      objectMetadata.stripe_subscription_id,
      obligationMetadata.economic_ref_id,
      objectMetadata.economic_ref_id,
    ),
    stripe_invoice_id: firstString(
      obligationMetadata.stripe_invoice_id,
      objectMetadata.stripe_invoice_id,
    ),
    stripe_checkout_session_id: firstString(
      obligationMetadata.stripe_checkout_session_id,
      objectMetadata.stripe_checkout_session_id,
    ),
    operator_identity_id: firstString(
      obligationMetadata.operator_identity_id,
      objectMetadata.operator_identity_id,
    ),
    source_event_id: firstString(
      obligationMetadata.source_event_id,
      objectMetadata.source_event_id,
    ),
    economic_ref_type: firstString(
      obligationMetadata.economic_ref_type,
      objectMetadata.economic_ref_type,
      "subscription",
    ),
    economic_ref_id: firstString(
      obligationMetadata.economic_ref_id,
      objectMetadata.economic_ref_id,
      obligationMetadata.stripe_subscription_id,
      objectMetadata.stripe_subscription_id,
    ),
    resolution: "fulfilled",
    resolution_state: "completed",
    proof_ref: "/command",
    occurred_at: now,
    recorded_at: now,
    proof: {
      access_granted: true,
      return_surface: "/command",
    },
  };
}

export async function POST(request: NextRequest) {
  const access = await requireOperatorRouteContext();
  if (!access.ok) {
    return access.response;
  }

  try {
    const { supabase, user, defaultWorkspaceId } = access.context;
    const body = await request.json();
    const obligationId = body.obligation_id;

    if (!obligationId || typeof obligationId !== "string") {
      return NextResponse.json(
        { error: "obligation_id is required" },
        { status: 400 }
      );
    }

    const { data: obligationRow, error: obligationErr } = await supabase
      .schema("core")
      .from("obligations")
      .select("object_id, obligation_type, metadata")
      .eq("id", obligationId)
      .maybeSingle();

    if (obligationErr) {
      return NextResponse.json({ error: obligationErr.message }, { status: 500 });
    }

    if (!obligationRow) {
      return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
    }

    const action = body.action ?? "seal"; // "seal" | "quote"
    let metadata: Record<string, unknown> =
      action === "quote"
        ? { surface: "command", action: "mark_quote_sent", workspace_id: defaultWorkspaceId }
        : { surface: "command", action: "seal", workspace_id: defaultWorkspaceId };
    let reasonCode: string | undefined;

    if (action !== "quote" && obligationRow.obligation_type === "activate_operator_access") {
      const { data: objectRow, error: objectErr } = await supabase
        .schema("core")
        .from("objects")
        .select("metadata")
        .eq("id", obligationRow.object_id)
        .maybeSingle();

      if (objectErr) {
        return NextResponse.json({ error: objectErr.message }, { status: 500 });
      }

      metadata = buildActivationSealMetadata(
        obligationId,
        obligationRow.object_id,
        defaultWorkspaceId,
        asRecord(obligationRow.metadata),
        asRecord(objectRow?.metadata),
      );
      reasonCode = "access_activated";
    }

    const result = await sealObligation(
      supabase,
      obligationId,
      user.email ?? user.id,
      {
        metadata,
        reasonCode,
      }
    );

    // sealObligation throws if result.ok === false (0035 contract).
    // A duplicate-or-noop is ok=true with duplicate=true — surface it
    // distinctly so callers know no new mutation occurred.
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate === true,
      obligation_id: result.obligation_id,
      ledger_event_id: result.ledger_event_id,
      receipt_id: result.receipt_id,
      event_seq: result.event_seq,
      event_hash: result.event_hash,
      receipt_seq: result.receipt_seq,
      receipt_hash: result.receipt_hash,
      action,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

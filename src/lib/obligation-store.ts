import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface ObligationInput {
  title: string;
  why?: string | null;
  face?: string;
  severity?: string;
  due_at?: string | null;
  economic_ref_type?: string | null;
  economic_ref_id?: string | null;
  source_event_id?: string | null;
  workspace_id?: string | null;
}

export interface ReceiptInput {
  obligation_id: string;
  sealed_by?: string | null;
  face?: string | null;
  economic_ref_type?: string | null;
  economic_ref_id?: string | null;
  ledger_event_id?: string | null;
  payload?: Record<string, unknown> | null;
  workspace_id?: string | null;
}

export interface Obligation {
  id: string;
  title: string;
  why: string | null;
  face: string;
  severity: string;
  status: string;
  due_at: string | null;
  created_at: string;
  sealed_at: string | null;
  sealed_by: string | null;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
  source_event_id: string | null;
}

export interface Receipt {
  id: string;
  obligation_id: string;
  sealed_at: string;
  sealed_by: string | null;
  face: string | null;
  economic_ref_type: string | null;
  economic_ref_id: string | null;
  ledger_event_id: string | null;
  payload: Record<string, unknown> | null;
}

export async function createObligation(input: ObligationInput): Promise<Obligation> {
  const { data, error } = await supabaseAdmin
    .schema("core")
    .from("obligations")
    .insert({
      title:             input.title,
      why:               input.why ?? null,
      face:              input.face ?? "unknown",
      severity:          input.severity ?? "queue",
      due_at:            input.due_at ?? null,
      economic_ref_type: input.economic_ref_type ?? null,
      economic_ref_id:   input.economic_ref_id ?? null,
      source_event_id:   input.source_event_id ?? null,
      workspace_id:      input.workspace_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createObligation failed: ${error.message}`);
  return data as Obligation;
}

export async function createReceipt(input: ReceiptInput): Promise<Receipt> {
  const { data, error } = await supabaseAdmin
    .schema("core")
    .from("receipts")
    .insert({
      obligation_id:     input.obligation_id,
      sealed_by:         input.sealed_by ?? null,
      face:              input.face ?? null,
      economic_ref_type: input.economic_ref_type ?? null,
      economic_ref_id:   input.economic_ref_id ?? null,
      ledger_event_id:   input.ledger_event_id ?? null,
      payload:           input.payload ?? null,
      workspace_id:      input.workspace_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createReceipt failed: ${error.message}`);
  return data as Receipt;
}

export async function sealObligation(
  obligationId: string,
  sealedBy: string,
  receiptPayload?: Record<string, unknown>
): Promise<{ obligation: Obligation; receipt: Receipt }> {
  const { data: obl, error: oblErr } = await supabaseAdmin
    .schema("core")
    .from("obligations")
    .update({
      status: "sealed",
      sealed_at: new Date().toISOString(),
      sealed_by: sealedBy,
    })
    .eq("id", obligationId)
    .select()
    .single();

  if (oblErr) throw new Error(`sealObligation failed: ${oblErr.message}`);

  const obligation = obl as Obligation;

  const receipt = await createReceipt({
    obligation_id:     obligationId,
    sealed_by:         sealedBy,
    face:              obligation.face,
    economic_ref_type: obligation.economic_ref_type,
    economic_ref_id:   obligation.economic_ref_id,
    payload:           receiptPayload ?? { sealed: true },
  });

  return { obligation, receipt };
}

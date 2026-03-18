export type SeverityGroup = "critical" | "at_risk" | "due_today" | "queue";
export type FaceOrigin = "dealership" | "advertising" | "contractor" | "unknown";
export type EconomicRefType = "invoice" | "lead" | "campaign" | "customer" | "unknown";

export interface NextActionRow {
  obligation_id: string;
  title: string;
  why: string | null;
  face: FaceOrigin | string | null;
  severity: SeverityGroup;
  due_at: string | null;
  created_at: string | null;
  age_hours: number | null;
  is_breach: boolean | null;
  economic_ref_type: EconomicRefType | string | null;
  economic_ref_id: string | null;
  location: string | null;
}

export interface ReceiptRow {
  receipt_id: string;
  obligation_id: string;
  sealed_at: string;
  sealed_by: string | null;
  face: FaceOrigin | string | null;
  economic_ref_type: EconomicRefType | string | null;
  economic_ref_id: string | null;
  ledger_event_id: string | null;
  payload: unknown;
}

export interface RevenueStateModel {
  face: FaceOrigin | string;
  line_1: string;
  line_2: string;
  line_3: string;
  line_4: string | null;
  line_5: string | null;
  proposal_text: string | null;
  updated_at: string | null;
}

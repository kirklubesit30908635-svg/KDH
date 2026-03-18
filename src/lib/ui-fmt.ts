export function fmtFace(face: string | null | undefined): string {
  if (!face) return "Unknown";
  const f = face.toLowerCase();
  if (f === "dealership") return "Dealership";
  if (f === "advertising") return "Advertising";
  if (f === "contractor") return "Contractor";
  return face;
}

export function fmtDue(dueAtIso: string | null | undefined): string | null {
  if (!dueAtIso) return null;
  const d = new Date(dueAtIso);
  if (Number.isNaN(d.getTime())) return dueAtIso;
  return d.toLocaleString();
}

export function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

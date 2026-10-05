// Figure-gate verdict logic, ported VERBATIM in behaviour from ~/arthur lib/figures/gate.mjs (stem, tokensOf, namesSubject,
// verdictFor; arthur/runtime @ 95170c8b). Only the pure part is ported: no file paths, no override log, no approvals file.
// Parity: lib/engine/__tests__/parity.test.mjs runs the same fixtures through both copies and fails on any difference.
export type FactRow = {
  canonical_name?: string | null; prop: string; value: string | null; value_num?: number | null;
  source_system?: string | null; source_ref?: string | null; observed_at?: string | null;
};
export type Verdict = { verdict: "SUPPORTED" | "UNSUPPORTED" | "UNTRACEABLE" | "AMBIGUOUS"; note: string; subject?: string };

const TOL = 0.005;
export const stem = (w: string): string => { w = String(w).toLowerCase(); return w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w; };
export const tokensOf = (t: string): string[] => String(t).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function namesSubject(row: FactRow, claim: string): boolean {
  const lower = String(claim).toLowerCase();
  if (row.canonical_name && lower.includes(String(row.canonical_name).toLowerCase())) return true;
  const have = new Set(tokensOf(claim).map(stem));
  return String(row.prop).split("_").filter((w) => w.length > 3).some((w) => have.has(stem(w)));
}

export function verdictFor(fig: { n: number }, claim: string, rows: FactRow[]): Verdict {
  const hits = rows.filter((r) => {
    const v = r.value_num != null ? r.value_num : Number(String(r.value).replace(/[$,%\s]/g, ""));
    return Number.isFinite(v) && Math.abs(v - fig.n) <= Math.max(Math.abs(fig.n) * TOL, 1e-9);
  });
  if (!hits.length) return { verdict: "UNSUPPORTED", note: "no live property holds this value" };
  const traced = hits.filter((h) => h.source_system && h.source_ref);
  if (!traced.length) return { verdict: "UNTRACEABLE", note: `matches ${hits.length} row(s), none carrying lineage` };
  const tied = traced.filter((r) => namesSubject(r, claim));
  if (!tied.length) return { verdict: "AMBIGUOUS", note: `${traced.length} row(s) hold this value but the claim names none of them (e.g. ${traced[0].canonical_name}.${traced[0].prop})` };
  const h = tied[0];
  return { verdict: "SUPPORTED", note: `${h.canonical_name}.${h.prop} <- ${h.source_system}: ${h.source_ref}`, subject: `${h.canonical_name}.${h.prop}` };
}

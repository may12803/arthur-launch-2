import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { dbFail, isAdminRole } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";

type Row = { id: number; actor: string | null; action: string; target: string | null; meta: unknown; at: string };
const PAGE = 1000;
const HARD_CAP = 200_000;

const csvCell = (v: unknown) => {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Exports the whole filtered trail, not the page on screen: audit_export(p_tenant, p_from, p_to, p_after_id, p_limit)
// is walked by id (keyset) until it runs out, so there is no 200-row ceiling. Owners and admins only; the export is
// itself written to the trail by the RPC. Formats: csv, jsonl.
export async function GET(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isAdminRole(ctx.role)) return NextResponse.json({ error: "Only an owner or admin can export the audit trail." }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "jsonl" ? "jsonl" : "csv";
  const from = q.get("from") || null;
  const to = q.get("to") || null;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return NextResponse.json({ error: "Dates must look like 2026-10-05." }, { status: 400 });

  const all: Row[] = [];
  let after: number | null = null;
  while (all.length < HARD_CAP) {
    const res = (await ctx.supabase.rpc("audit_export", { p_tenant: ctx.tenantId, p_from: from, p_to: to, p_after_id: after, p_limit: PAGE })) as { data: Row[] | null; error: { message: string } | null };
    if (res.error) return dbFail(res.error.message, "Could not export the audit trail");
    const page: Row[] = res.data ?? [];
    all.push(...page);
    if (page.length < PAGE) break;
    after = page[page.length - 1].id;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const body = format === "jsonl"
    ? all.map((r) => JSON.stringify(r)).join("\n") + (all.length ? "\n" : "")
    : ["id,at,actor,action,target,detail", ...all.map((r) => [r.id, r.at, r.actor, r.action, r.target, r.meta].map(csvCell).join(","))].join("\n") + "\n";
  return new NextResponse(body, {
    headers: {
      "content-type": format === "jsonl" ? "application/x-ndjson; charset=utf-8" : "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-trail-${stamp}.${format}"`,
      "cache-control": "no-store",
      "x-row-count": String(all.length),
      "x-truncated": all.length >= HARD_CAP ? "1" : "0",
    },
  });
}

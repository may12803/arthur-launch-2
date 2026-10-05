import Link from "next/link";
import { LocalTime } from "../LocalTime";
import { Panel, PanelHead, Pill, TableWrap } from "../cp";

export type AuditRow = { id: number; actor: string | null; action: string; target: string | null; meta: Record<string, unknown> | null; at: string };
export type AuditFilters = { prefix: string; actor: string; from: string; to: string };

export const AUDIT_PREFIXES = ["document", "share", "sharing", "invite", "connection", "connector", "upload", "approval", "entity", "api_key", "webhook", "security", "staff", "tenant", "audit"];
export const PAGE_SIZE = 50;

export function actionLabel(a: string): string {
  const s = a.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function detail(r: AuditRow): string {
  const m = r.meta ?? {};
  const bits: string[] = [];
  for (const k of ["name", "connector", "title", "reason", "decision", "file_name", "rows", "url"]) {
    const v = m[k];
    if (v != null && typeof v !== "object") bits.push(`${k.replace(/_/g, " ")}: ${String(v).slice(0, 80)}`);
  }
  return [r.target, ...bits].filter(Boolean).join(" · ");
}

export function auditQuery(f: AuditFilters, extra: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  if (f.prefix) q.set("action", f.prefix);
  if (f.actor) q.set("actor", f.actor);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Server-rendered. Filters are a plain GET form and paging is keyset (rows older than the last id shown), so the trail
// pages past any fixed row ceiling and every page is a shareable link. Export covers the whole filtered range.
export function AuditView({ rows, filters, nextAfter, hasPrev, people, emails, total }: { rows: AuditRow[]; filters: AuditFilters; nextAfter: number | null; hasPrev: boolean; people: { id: string; email: string }[]; emails: Record<string, string>; total?: number | null }) {
  const active = !!(filters.prefix || filters.actor || filters.from || filters.to);
  return (
    <div className="grid gap-6">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="ll-field w-[170px] max-sm:w-[calc(50%-6px)]"><span>Type</span>
          <select name="action" defaultValue={filters.prefix} className="ll-input"><option value="">All activity</option>{AUDIT_PREFIXES.map((p) => <option key={p} value={p}>{actionLabel(p)}</option>)}</select>
        </label>
        <label className="ll-field w-[210px] max-sm:w-[calc(50%-6px)]"><span>Who</span>
          <select name="actor" defaultValue={filters.actor} className="ll-input"><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.email}</option>)}</select>
        </label>
        <label className="ll-field w-[150px] max-sm:w-[calc(50%-6px)]"><span>From</span><input type="date" name="from" defaultValue={filters.from} className="ll-input" /></label>
        <label className="ll-field w-[150px] max-sm:w-[calc(50%-6px)]"><span>To</span><input type="date" name="to" defaultValue={filters.to} className="ll-input" /></label>
        <button type="submit" className="ll-primary">Apply</button>
        {active ? <Link href="/client/audit" className="ll-secondary">Clear</Link> : null}
      </form>

      <Panel className="overflow-hidden">
        <PanelHead
          title="Audit trail"
          sub={`${rows.length} shown${total != null ? ` of ${total.toLocaleString("en-US")}` : ""}${active ? " matching your filters" : ""}, newest first`}
          right={
            <>
              <a className="ll-secondary" href={`/api/client/audit/export${auditQuery(filters, { format: "csv" })}`}>Export CSV</a>
              <a className="ll-secondary" href={`/api/client/audit/export${auditQuery(filters, { format: "jsonl" })}`}>Export JSONL</a>
            </>
          }
        />
        {rows.length ? (
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>When</th><th>Who</th><th>What happened</th><th>Detail</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-[12px]"><LocalTime iso={r.at} /></td>
                    <td className="text-[12.5px]">{r.actor ? emails[r.actor] ?? "Former member" : "LOVELEEDAY"}</td>
                    <td><Pill>{actionLabel(r.action)}</Pill></td>
                    <td className="max-w-[360px] break-words text-[12px] text-[var(--muted)]">{detail(r) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <div className="cp-panel-b py-10 text-center text-[14px] text-[var(--muted)]">{active ? "Nothing matches these filters." : "No activity has been recorded yet."}</div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-[#edf0f4] px-6 py-4 max-sm:px-4">
          {hasPrev ? <Link href={`/client/audit${auditQuery(filters)}`} className="ll-secondary">Newest</Link> : <span />}
          {nextAfter != null ? <Link href={`/client/audit${auditQuery(filters, { after: String(nextAfter) })}`} className="ll-secondary">Older entries</Link> : <span className="text-[12px] text-[var(--muted)]">End of the trail</span>}
        </div>
      </Panel>
    </div>
  );
}

import Link from "next/link";
import { ago, computeDataHealth, type CatalogEntry, type ConnRow } from "@/lib/client-portal/connector-ui";
import { Logo, Panel, PanelHead, Pill, Stat, TableWrap } from "../cp";

const ORDER = ["failing", "stale", "not_running", "verifying", "connected", "requested", "invited", "paused", "verified", "live"];

// Presentational: every number here is computed from connection rows and their sync records at render time. Nothing on
// this screen is a typed status; a system that has not reported shows as not running, not as healthy.
export function HealthView({ entries, conns, now }: { entries: CatalogEntry[]; conns: ConnRow[]; now: number }) {
  const h = computeDataHealth(entries, conns, now);
  const lines = [...h.lines].sort((a, b) => ORDER.indexOf(a.state.id) - ORDER.indexOf(b.state.id) || a.name.localeCompare(b.name));
  const attention = h.failing + h.stale + h.notRunning;

  return (
    <div className="grid gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live and moving data" value={h.live} sub={h.total ? `of ${h.total} connected` : "Nothing connected yet"} tone={h.live ? "good" : undefined} />
        <Stat label="Stale" value={h.stale} sub={h.stale ? "Past the freshness window" : "None behind"} tone={h.stale ? "wait" : "good"} />
        <Stat label="Failing" value={h.failing} sub={h.failing ? "Needs your attention" : "No failing syncs"} tone={h.failing ? "bad" : "good"} />
        <Stat label="Not running" value={h.notRunning} sub={h.notRunning ? "Authorized, no sync scheduled" : "None idle"} tone={h.notRunning ? "wait" : "good"} />
      </div>

      {h.total === 0 ? (
        <Panel>
          <div className="cp-panel-b py-10 text-center">
            <p className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">No data sources yet</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-[15px] leading-[1.7] text-[var(--muted)]">Connect a system or upload a file and its freshness shows up here, computed from every sync it completes.</p>
            <div className="mt-5 flex justify-center gap-3"><Link href="/client/connections" className="ll-primary">Browse connectors</Link><Link href="/client/data/upload" className="ll-secondary">Upload a file</Link></div>
          </div>
        </Panel>
      ) : (
        <Panel className="overflow-hidden">
          <PanelHead title="Sources" sub={attention ? `${attention} ${attention === 1 ? "needs" : "need"} attention` : "Every connected source reported inside its window"} />
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>System</th><th>State</th><th>Last successful sync</th><th className="num">Rows, last sync</th><th>Why</th></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const e = entries.find((x) => x.key === l.key);
                  return (
                    <tr key={l.key}>
                      <td>
                        <Link href={`/client/connections/${l.key}`} className="flex items-center gap-3"><Logo src={e?.logo} name={l.name} size={30} /><b>{l.name}</b></Link>
                      </td>
                      <td><Pill tone={l.state.tone} dot>{l.state.label}</Pill></td>
                      <td className="whitespace-nowrap">{l.lastSuccess ? ago(l.lastSuccess, now) : "Never"}</td>
                      <td className="num">{l.lastRows != null ? l.lastRows.toLocaleString("en-US") : "-"}</td>
                      <td className="max-w-[360px] text-[12px] text-[var(--muted)]">{l.state.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      )}

      <Panel>
        <PanelHead title="Coverage by area" sub="Live or verified systems against what is available to connect." />
        <div className="cp-panel-b grid gap-5">
          {h.coverage.map((c) => {
            const pct = Math.round((c.connected / c.available) * 100);
            return (
              <div key={c.group} className="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] items-center gap-4 max-sm:grid-cols-[minmax(0,1fr)_auto]">
                <span className="truncate text-[13.5px] text-[var(--ink)]">{c.label}</span>
                <div className={`cp-bar max-sm:order-3 max-sm:col-span-2 ${c.connected ? "" : "wait"}`}><i style={{ width: `${Math.max(c.connected ? 4 : 0, pct)}%` }} /></div>
                <span className="text-[12px] tabular-nums text-[var(--muted)]">{c.connected} of {c.available}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

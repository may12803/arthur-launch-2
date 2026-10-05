import Link from "next/link";
import { ago, computeDataHealth, type CatalogEntry, type ConnRow } from "@/lib/client-portal/connector-ui";
import { Panel, PanelHead, Pill, Stat } from "@/components/client-portal/cp";

export function StatusView({ entries, conns, now, dbOk, errors }: { entries: CatalogEntry[]; conns: ConnRow[]; now: number; dbOk: boolean; errors?: (string | null)[] }) {
  const h = computeDataHealth(entries, conns, now);
  const lastAny = conns.map((c) => c.last_success_at).filter((x): x is string => !!x).sort().pop() ?? null;
  const rows = [
    { name: "Client portal", state: <Pill tone="good" dot>Operational</Pill>, note: "This page loaded, so the portal is answering." },
    { name: "Your data store", state: dbOk ? <Pill tone="good" dot>Reachable</Pill> : <Pill tone="bad" dot>Not reachable</Pill>, note: dbOk ? "The queries behind this page succeeded." : "A query on this page failed. See the message above." },
    { name: "Scheduled syncs", state: lastAny ? <Pill tone={h.stale + h.failing ? "wait" : "good"} dot>{h.stale + h.failing ? "Some behind" : "Reporting"}</Pill> : <Pill tone="off">No syncs yet</Pill>, note: lastAny ? `Most recent successful sync ${ago(lastAny, now)}.` : "No connection has completed a sync yet." },
  ];

  return (
    <div className="grid gap-6">
      {errors?.some(Boolean) ? <div className="cp-banner bad" role="alert"><div><b>Some status data did not load.</b>{errors.filter(Boolean).map((e, i) => <div key={i} className="mt-0.5 break-words">{e}</div>)}</div></div> : null}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live" value={h.live} sub={`of ${h.total} connected`} tone={h.live ? "good" : undefined} />
        <Stat label="Stale" value={h.stale} tone={h.stale ? "wait" : "good"} sub={h.stale ? "Behind their window" : "None"} />
        <Stat label="Failing" value={h.failing} tone={h.failing ? "bad" : "good"} sub={h.failing ? "Needs attention" : "None"} />
        <Stat label="Not running" value={h.notRunning} tone={h.notRunning ? "wait" : "good"} sub={h.notRunning ? "No sync scheduled" : "None"} />
      </div>

      <Panel className="overflow-hidden">
        <PanelHead title="Service" sub="Measured when this page loads, not copied from a status feed." right={<Link href="/client/data/health" className="ll-secondary">Data health</Link>} />
        <ul>
          {rows.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-b border-[#edf0f4] px-6 py-4 last:border-0 max-sm:px-4">
              <div className="min-w-0"><div className="text-[14px] font-medium text-[var(--ink)]">{r.name}</div><div className="text-[12.5px] text-[var(--muted)]">{r.note}</div></div>
              {r.state}
            </li>
          ))}
        </ul>
        <p className="border-t border-[#edf0f4] px-6 py-4 text-[12.5px] leading-[1.7] text-[var(--muted)] max-sm:px-4">Incident history is not published through the portal yet. If something affects your account we tell your owners and admins directly.</p>
      </Panel>

      <Panel>
        <PanelHead title="Notifications" />
        <div className="cp-panel-b text-[13.5px] leading-[1.7] text-[#303238]">Your notification choices appear below. Status and data health are measured each time you open these pages.</div>
      </Panel>
    </div>
  );
}

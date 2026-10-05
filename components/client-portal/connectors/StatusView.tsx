"use client";

import Link from "next/link";
import { useState } from "react";
import { ago, computeDataHealth, type CatalogEntry, type ConnRow } from "@/lib/client-portal/connector-ui";
import { Panel, PanelHead, Pill, Stat } from "../cp";

const PREFS = [
  { id: "connection_failing", label: "A connection starts failing", hint: "Sign-in expired, credential rejected or a sync errored." },
  { id: "connection_stale", label: "A connection falls behind", hint: "No successful sync inside its freshness window." },
  { id: "approval_waiting", label: "An approval is waiting on me", hint: "Money, send or legal items that need a person." },
  { id: "weekly_digest", label: "Weekly summary", hint: "Data health and decisions made, every Monday." },
];

export function StatusView({ entries, conns, now, dbOk, errors }: { entries: CatalogEntry[]; conns: ConnRow[]; now: number; dbOk: boolean; errors?: (string | null)[] }) {
  const h = computeDataHealth(entries, conns, now);
  const lastAny = conns.map((c) => c.last_success_at).filter((x): x is string => !!x).sort().pop() ?? null;
  const [events, setEvents] = useState<string[]>([]);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/client/status/prefs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events, email }) });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: j.error ?? "That did not save." });
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "That did not save." }); }
    setBusy(false);
  }

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
        <PanelHead title="Notify me" sub="Email, to the address you sign in with. Each person sets their own." />
        <div className="cp-panel-b grid gap-4">
          {PREFS.map((p) => (
            <label key={p.id} className="flex items-start gap-3">
              <input type="checkbox" className="mt-1" checked={events.includes(p.id)} onChange={() => setEvents(events.includes(p.id) ? events.filter((x) => x !== p.id) : [...events, p.id])} />
              <span><span className="block text-[14px] text-[var(--ink)]">{p.label}</span><span className="block text-[12.5px] text-[var(--muted)]">{p.hint}</span></span>
            </label>
          ))}
          <label className="flex items-center gap-3 border-t border-[#edf0f4] pt-4 text-[13.5px] text-[#303238]"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />Send these by email</label>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="ll-primary" disabled={busy} onClick={save}>{busy ? "Saving..." : "Save preferences"}</button>
            {msg ? <span role="status" className={`text-[13px] ${msg.ok ? "text-[#1e6b3a]" : "text-[#a1291f]"}`}>{msg.text}</span> : null}
          </div>
        </div>
      </Panel>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GROUPS, connState, findConnection, type CatalogEntry, type ConnRow, type GroupId } from "@/lib/client-portal/connector-ui";
import { Logo, Pill, brandColor, textOn } from "../cp";
import reads from "@/lib/client-portal/connector-reads.json";

// Plain-language one-liner from the researched object list. Always read-only wording: nothing is written back.
export function describe(e: CatalogEntry): string {
  const written = (reads as Record<string, string>)[e.key];
  if (written) return written;
  if (e.legacy?.uses && !e.objects.length) return e.legacy.uses;
  if (!e.objects.length) return "Reads the data you choose to share.";
  const list = e.objects.slice(0, 5).map((o) => o.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  return `Reads ${list.join(", ")}${e.objects.length > 5 ? ` and ${e.objects.length - 5} more` : ""}. Read-only.`;
}

export function CatalogView({ entries, conns, now, canManage, notReady = [] }: { entries: CatalogEntry[]; conns: ConnRow[]; now: number; canManage: boolean; notReady?: string[] }) {
  const [tab, setTab] = useState<GroupId | "all">("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length };
    for (const e of entries) c[e.group] = (c[e.group] ?? 0) + 1;
    return c;
  }, [entries]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => (tab === "all" || e.group === tab) && (!needle || `${e.name} ${e.vendor} ${e.categoryLabel} ${e.objects.join(" ")}`.toLowerCase().includes(needle)));
  }, [entries, tab, q]);

  const groups = GROUPS.filter((g) => shown.some((e) => e.group === g.id));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categories">
          {[{ id: "all" as const, label: "All" }, ...GROUPS.filter((g) => counts[g.id])].map((g) => (
            <button key={g.id} type="button" className="cp-tab" aria-pressed={tab === g.id} onClick={() => setTab(g.id as GroupId | "all")}>
              {g.label}
              <small>{counts[g.id]}</small>
            </button>
          ))}
        </div>
        <label className="cp-search w-full md:w-[280px]">
          <span className="sr-only">Search connectors</span>
          <input type="search" placeholder={`Search ${entries.length} connectors`} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>


      {!groups.length ? (
        <div className="mt-10 rounded-2xl border border-[var(--line)] p-10 text-center">
          <p className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Nothing matches &ldquo;{q}&rdquo;</p>
          <p className="mx-auto mt-2 max-w-[44ch] text-[15px] leading-[1.7] text-[var(--muted)]">If your system is not listed, send us a file from it. Upload works with any system that can export a spreadsheet.</p>
          <Link href="/client/data/upload" className="ll-primary mt-5">Upload a file</Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-12">
          {groups.map((g) => {
            const list = shown.filter((e) => e.group === g.id);
            return (
              <div key={g.id} aria-labelledby={`g-${g.id}`}>
                <h2 id={`g-${g.id}`} className="mb-4 flex items-baseline gap-3 text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">
                  {g.label}
                  <span className="text-[12px] font-normal text-[var(--muted)]">{list.length} connectors</span>
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {list.map((e) => {
                    const row = findConnection(conns, e);
                    const st = connState(row, now);
                    const connected = st.id !== "none" && st.id !== "disconnected";
                    const soon = !connected && notReady.includes(e.key);
                    const bg = brandColor(e.logo);
                    const fg = textOn(bg);
                    return (
                      <Link key={e.key} href={`/client/connections/${e.key}`} className="cp-card-link cp-card-brand" style={{ background: bg, borderColor: bg, color: fg }}>
                        <span className="flex items-start gap-3">
                          <Logo src={e.logo} name={e.name} size={40} plain />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium">{e.name}</span>
                            <span className="block truncate text-[11.5px] opacity-85">{e.categoryLabel}</span>
                          </span>
                          {connected ? (
                            <Pill tone={st.tone} dot>
                              {st.label}
                            </Pill>
                          ) : soon ? (
                            <Pill tone="off">Coming soon</Pill>
                          ) : null}
                        </span>
                        <span className="text-[13px] leading-[1.6] opacity-95">{describe(e)}</span>
                        <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span />
                          <span className="text-[12px] font-medium underline underline-offset-2">
                            {connected ? (st.id === "failing" ? "Re-authorize" : "Manage") : soon ? "View" : canManage ? "Connect" : "View"}
                          </span>
                        </span>
                        {connected ? <span className="-mt-1 text-[11.5px] opacity-85">{st.reason}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

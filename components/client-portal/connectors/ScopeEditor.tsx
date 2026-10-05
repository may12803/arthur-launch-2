"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pill } from "../cp";
import type { EntityRow } from "./EntitiesView";

export type ScopeMember = { user_id: string; label: string; role: string; entityIds: string[] };

// Scoped membership (G09): a member can be limited to parts of the organization. Owners and admins always see the whole
// company, so their scope is shown as such and cannot be narrowed. No scope rows means the whole company.
export function ScopeEditor({ members, entities, canEdit }: { members: ScopeMember[]; entities: EntityRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = (id: string) => entities.find((e) => e.id === id)?.name ?? "Removed item";

  async function save(userId: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/client/entities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "scope", user_id: userId, entity_ids: sel }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "That did not save.");
      else { setOpen(null); router.refresh(); }
    } catch (e) { setErr(e instanceof Error ? e.message : "That did not save."); }
    setBusy(false);
  }

  if (!entities.length) {
    return <p className="text-[13px] leading-[1.65] text-[var(--muted)]">Everyone currently sees the whole company. Add entities and locations in <a className="text-[var(--blue)]" href="/client/organization/entities">Organization</a> to limit a teammate to part of it.</p>;
  }

  return (
    <div className="flex flex-col">
      {members.map((m) => {
        const wide = m.role === "owner" || m.role === "admin" || m.role === "staff";
        const editing = open === m.user_id;
        return (
          <div key={m.user_id} className="border-b border-[#edf0f4] py-3.5 last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[var(--ink)]">{m.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--muted)]">
                  {wide ? <span>Sees the whole company</span> : m.entityIds.length ? m.entityIds.map((id) => <Pill key={id}>{name(id)}</Pill>) : <span>Sees the whole company</span>}
                </div>
              </div>
              {canEdit && !wide ? <button type="button" className="ll-secondary cp-sm" onClick={() => { setOpen(editing ? null : m.user_id); setSel(m.entityIds); setErr(null); }}>{editing ? "Close" : "Edit access"}</button> : null}
            </div>
            {editing ? (
              <div className="mt-3 rounded-xl border border-[#d8e6f8] bg-[#f0f5fc] p-4">
                <p className="mb-3 text-[12px] text-[#3970af]">Choose where {m.label} works. Leave everything unchecked to give access to the whole company.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {entities.map((e) => (
                    <label key={e.id} className="flex items-center gap-2.5 text-[13px] text-[#303238]">
                      <input type="checkbox" checked={sel.includes(e.id)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} />
                      <span className="truncate">{e.name}</span><span className="text-[11px] text-[var(--muted)]">{e.kind}</span>
                    </label>
                  ))}
                </div>
                {err ? <p role="alert" className="mt-3 text-[13px] text-[#a1291f]">{err}</p> : null}
                <button type="button" className="ll-primary mt-4" disabled={busy} onClick={() => save(m.user_id)}>{busy ? "Saving..." : "Save access"}</button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

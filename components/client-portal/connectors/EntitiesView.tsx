"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice, Panel, PanelHead, Pill } from "../cp";

export type EntityRow = { id: string; parent_id: string | null; kind: "org" | "entity" | "location" | "department"; name: string; code: string | null };

const KIND_LABEL: Record<string, string> = { org: "Organization", entity: "Legal entity", location: "Location", department: "Department" };
const CHILD_KINDS: Record<string, EntityRow["kind"][]> = { org: ["entity", "location", "department"], entity: ["location", "department"], location: ["department"], department: [] };

type Draft = { id?: string; parent_id: string | null; kind: EntityRow["kind"]; name: string; code: string };

export function EntitiesView({ entities, canEdit }: { entities: EntityRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const kids = (id: string | null) => entities.filter((e) => e.parent_id === id).sort((a, b) => a.name.localeCompare(b.name));
  const roots = kids(null);
  const count = (id: string): number => kids(id).reduce((n, c) => n + 1 + count(c.id), 0);

  async function call(body: Record<string, unknown>, done: string) {
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await fetch("/api/client/entities", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(j.error ?? "That did not save.");
      else { setOk(done); setDraft(null); router.refresh(); }
    } catch (e) { setErr(e instanceof Error ? e.message : "That did not save."); }
    setBusy(false);
  }

  function renderNode(e: EntityRow, depth: number) {
    const children = kids(e.id);
    const editing = draft?.id === e.id;
    const adding = draft && !draft.id && draft.parent_id === e.id;
    return (
      <li key={e.id}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#edf0f4] py-3" style={{ paddingLeft: Math.min(depth, 5) * 22 }}>
          {depth > 0 ? <span aria-hidden className="h-3 w-3 flex-none rounded-bl-md border-b border-l border-[#c9ccd3]" /> : null}
          <span className="min-w-0 flex-1 basis-[180px]">
            <span className="block truncate text-[14px] font-medium text-[var(--ink)]">{e.name}</span>
            <span className="block text-[11.5px] text-[var(--muted)]">{e.code ? `Code ${e.code} · ` : ""}{children.length ? `${count(e.id)} below` : "Nothing below"}</span>
          </span>
          <Pill tone={e.kind === "org" ? "info" : "off"}>{KIND_LABEL[e.kind]}</Pill>
          {canEdit ? (
            <span className="flex gap-1.5">
              {CHILD_KINDS[e.kind].length ? <button type="button" className="ll-secondary cp-sm" onClick={() => setDraft({ parent_id: e.id, kind: CHILD_KINDS[e.kind][0], name: "", code: "" })}>Add below</button> : null}
              <button type="button" className="ll-secondary cp-sm" onClick={() => setDraft({ id: e.id, parent_id: e.parent_id, kind: e.kind, name: e.name, code: e.code ?? "" })}>Rename</button>
              <button type="button" className="ll-danger cp-sm" disabled={busy || children.length > 0} title={children.length ? "Move or remove what is inside first" : undefined} onClick={() => { if (confirm(`Delete ${e.name}?`)) call({ action: "delete", id: e.id }, `${e.name} was deleted.`); }}>Delete</button>
            </span>
          ) : null}
        </div>
        {editing || adding ? <div style={{ paddingLeft: Math.min(depth + 1, 5) * 22 }}>{Form()}</div> : null}
        {children.length ? <ul>{children.map((c) => renderNode(c, depth + 1))}</ul> : null}
      </li>
    );
  }

  function Form() {
    if (!draft) return null;
    const parent = entities.find((x) => x.id === draft.parent_id);
    const kinds = draft.id ? (Object.keys(KIND_LABEL) as EntityRow["kind"][]) : parent ? CHILD_KINDS[parent.kind] : (["org", "entity"] as EntityRow["kind"][]);
    return (
      <form className="my-3 grid gap-3 rounded-xl border border-[#d8e6f8] bg-[#f0f5fc] p-4 sm:grid-cols-[1fr_170px_130px_auto] sm:items-end" onSubmit={(ev) => { ev.preventDefault(); call({ action: "upsert", id: draft.id, parent_id: draft.parent_id, kind: draft.kind, name: draft.name, code: draft.code }, `${draft.name} saved.`); }}>
        <label className="ll-field"><span>Name</span><input className="ll-input" required autoFocus value={draft.name} onChange={(ev) => setDraft({ ...draft, name: ev.target.value })} /></label>
        <label className="ll-field"><span>Type</span><select className="ll-input" value={draft.kind} onChange={(ev) => setDraft({ ...draft, kind: ev.target.value as EntityRow["kind"] })}>{kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label className="ll-field"><span>Code (optional)</span><input className="ll-input" value={draft.code} onChange={(ev) => setDraft({ ...draft, code: ev.target.value })} /></label>
        <span className="flex gap-2"><button type="submit" className="ll-primary" disabled={busy}>{busy ? "Saving..." : "Save"}</button><button type="button" className="ll-secondary" onClick={() => setDraft(null)}>Cancel</button></span>
      </form>
    );
  }

  return (
    <div className="grid gap-5">
      {err ? <div className="cp-banner bad" role="alert"><div>{err}</div></div> : null}
      {ok ? <Notice tone="good"><div>{ok}</div></Notice> : null}
      <Panel>
        <PanelHead
          title="Structure"
          sub={`${entities.length} ${entities.length === 1 ? "item" : "items"}. Reports, approvals and access can follow this tree.`}
          right={canEdit ? <button type="button" className="ll-primary" onClick={() => setDraft({ parent_id: null, kind: roots.length ? "entity" : "org", name: "", code: "" })}>Add {roots.length ? "top-level item" : "your organization"}</button> : null}
        />
        <div className="cp-panel-b !pt-2">
          {draft && !draft.id && draft.parent_id === null ? Form() : null}
          {entities.length ? (
            <ul>{roots.map((r) => renderNode(r, 0))}</ul>
          ) : (
            <div className="py-10 text-center">
              <p className="text-[18px] font-medium tracking-[-0.025em] text-[var(--ink)]">Your locations and teams have not been added yet</p>
              <p className="mx-auto mt-2 max-w-[52ch] text-[14px] leading-[1.7] text-[var(--muted)]">Add your organization, then the legal entities, locations or departments below it: campuses, stores, properties, plants, chapters or practice groups. Teammates can then be limited to the parts they work in.</p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

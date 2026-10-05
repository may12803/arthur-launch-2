"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { API_KEY_SCOPES, WEBHOOK_EVENTS } from "@/lib/client-portal/connector-ui";
import { LocalTime } from "../LocalTime";
import { Notice, Panel, PanelHead, Pill, TableWrap } from "../cp";

export type ApiKeyRow = { id: string; name: string; prefix: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null };
export type WebhookRow = { id: string; url: string; events: string[]; active: boolean; created_at: string };
export type DeliveryRow = { id: string; endpoint_id: string; event: string; status: string; response_code: number | null; attempt: number | null; at: string };

const SCOPE_LABEL: Record<string, string> = { "connections:read": "Connections and health", "records:read": "Synced records", "approvals:read": "Approvals", "records:write": "Submit records" };

async function post(url: string, body: unknown) {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, json: { error: e instanceof Error ? e.message : "The request did not complete." } as Record<string, unknown> };
  }
}

function Secret({ title, value, hint, onDone }: { title: string; value: string; hint: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-[#cfe3d8] bg-[#f3faf6] p-4">
      <p className="text-[13px] font-semibold text-[#2f6b4f]">{title}</p>
      <p className="cp-copy mt-2 !border-[#cfe3d8] select-all">{value}</p>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-[#2f6b4f]">{hint}</p>
      <div className="mt-3 flex gap-2.5">
        <button type="button" className="ll-secondary" onClick={() => { navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? "Copied" : "Copy"}</button>
        <button type="button" className="ll-primary" onClick={onDone}>I have saved it</button>
      </div>
    </div>
  );
}

export function DeveloperView({ keys, webhooks, deliveries, canManage, errors }: { keys: ApiKeyRow[]; webhooks: WebhookRow[]; deliveries: DeliveryRow[]; canManage: boolean; errors?: (string | null)[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["connections:read"]);
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["sync.failed"]);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const hookUrlById = new Map(webhooks.map((w) => [w.id, w.url]));

  async function run(fn: () => Promise<{ ok: boolean; json: Record<string, unknown> }>, after: (j: Record<string, unknown>) => void) {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setErr(String(r.json.error ?? "That did not save.")); return; }
    after(r.json);
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {errors?.some(Boolean) ? <div className="cp-banner bad" role="alert"><div><b>Some developer settings did not load.</b>{errors.filter(Boolean).map((e, i) => <div key={i} className="mt-0.5 break-words">{e}</div>)}</div></div> : null}
      {!canManage ? <Notice tone="info"><div>Only owners and admins can create keys and webhooks. You can see what exists.</div></Notice> : null}
      {err ? <div className="cp-banner bad" role="alert"><div>{err}</div></div> : null}

      <Panel className="overflow-hidden">
        <PanelHead title="API keys" sub="Read-only credentials for your own tools. The key is shown once, when it is created." />
        {revealKey ? <div className="cp-panel-b"><Secret title="Copy your new key now" value={revealKey} hint="This is the only time it is shown. We keep a hash, not the key, so it cannot be recovered. Lose it and you revoke it and make another." onDone={() => setRevealKey(null)} /></div> : null}
        {keys.length ? (
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>Name</th><th>Key</th><th>Can read</th><th>Created</th><th>Last used</th><th /></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className={k.revoked_at ? "opacity-60" : ""}>
                    <td><b>{k.name}</b></td>
                    <td className="cp-mono text-[12px]">{k.prefix}…</td>
                    <td className="text-[12px]">{k.scopes.map((s) => SCOPE_LABEL[s] ?? s).join(", ")}</td>
                    <td className="whitespace-nowrap text-[12px]"><LocalTime iso={k.created_at} /></td>
                    <td className="whitespace-nowrap text-[12px]">{k.last_used_at ? <LocalTime iso={k.last_used_at} /> : "Never"}</td>
                    <td className="text-right">{k.revoked_at ? <Pill tone="off">Revoked</Pill> : canManage ? <button type="button" className="ll-danger cp-sm" disabled={busy} onClick={() => { if (confirm(`Revoke ${k.name}? Anything using it stops working immediately.`)) run(() => post("/api/client/developer/keys", { action: "revoke", id: k.id }), () => undefined); }}>Revoke</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <div className="cp-panel-b text-[14px] text-[var(--muted)]">No keys yet.</div>}
        {canManage ? (
          <form className="grid gap-4 border-t border-[#edf0f4] p-6 max-sm:p-4" onSubmit={(e) => { e.preventDefault(); run(() => post("/api/client/developer/keys", { action: "create", name, scopes }), (j) => { setRevealKey(String(j.key ?? "")); setName(""); }); }}>
            <label className="ll-field max-w-[380px]"><span>Name</span><input className="ll-input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Finance dashboard" /></label>
            <fieldset><legend className="ll-label mb-1.5 text-[11px] text-[#7a8492]">Permissions</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{API_KEY_SCOPES.map((s) => <label key={s} className="flex items-center gap-2 text-[13px] text-[#303238]"><input type="checkbox" checked={scopes.includes(s)} onChange={() => setScopes(toggle(scopes, s))} />{SCOPE_LABEL[s] ?? s}</label>)}</div></fieldset>
            <button type="submit" className="ll-primary justify-self-start" disabled={busy || !scopes.length}>{busy ? "Creating..." : "Create key"}</button>
          </form>
        ) : null}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHead title="Webhooks" sub="We call your address when something happens. Each call is signed so you can verify it came from us." />
        {revealSecret ? <div className="cp-panel-b"><Secret title="Copy the signing secret now" value={revealSecret} hint="Use it to verify the signature on each delivery. It is shown once and cannot be read again." onDone={() => setRevealSecret(null)} /></div> : null}
        {webhooks.length ? (
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>Address</th><th>Events</th><th>State</th><th /></tr></thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td className="cp-mono max-w-[300px] break-all text-[12px]">{w.url}</td>
                    <td className="text-[12px]">{w.events.join(", ")}</td>
                    <td><Pill tone={w.active ? "good" : "off"} dot>{w.active ? "Active" : "Paused"}</Pill></td>
                    <td className="whitespace-nowrap text-right">
                      {canManage ? (
                        <span className="flex justify-end gap-1.5">
                          <button type="button" className="ll-secondary cp-sm" disabled={busy} onClick={() => run(() => post("/api/client/developer/webhooks", { action: "save", id: w.id, url: w.url, events: w.events, active: !w.active }), () => undefined)}>{w.active ? "Pause" : "Resume"}</button>
                          <button type="button" className="ll-danger cp-sm" disabled={busy} onClick={() => { if (confirm("Delete this webhook?")) run(() => post("/api/client/developer/webhooks", { action: "delete", id: w.id }), () => undefined); }}>Delete</button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <div className="cp-panel-b text-[14px] text-[var(--muted)]">No webhooks yet.</div>}
        {canManage ? (
          <form className="grid gap-4 border-t border-[#edf0f4] p-6 max-sm:p-4" onSubmit={(e) => { e.preventDefault(); run(() => post("/api/client/developer/webhooks", { action: "save", url: hookUrl, events, active: true }), (j) => { setHookUrl(""); if (typeof j.secret === "string") setRevealSecret(j.secret); }); }}>
            <label className="ll-field max-w-[520px]"><span>Address (https only)</span><input className="ll-input" type="url" required value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.org/hooks/loveleeday" /></label>
            <fieldset><legend className="mb-1.5 text-[11px] text-[#7a8492]">Events</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{WEBHOOK_EVENTS.map((ev) => <label key={ev} className="flex items-center gap-2 text-[13px] text-[#303238]"><input type="checkbox" checked={events.includes(ev)} onChange={() => setEvents(toggle(events, ev))} /><span className="cp-mono text-[12px]">{ev}</span></label>)}</div></fieldset>
            <button type="submit" className="ll-primary justify-self-start" disabled={busy || !events.length}>{busy ? "Saving..." : "Add webhook"}</button>
          </form>
        ) : null}
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHead title="Delivery log" sub={deliveries.length ? `Latest ${deliveries.length} deliveries` : undefined} />
        {deliveries.length ? (
          <TableWrap>
            <table className="cp-table">
              <thead><tr><th>When</th><th>Event</th><th>Address</th><th className="num">Response</th><th className="num">Attempt</th><th>Result</th></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap text-[12px]"><LocalTime iso={d.at} /></td>
                    <td className="cp-mono text-[12px]">{d.event}</td>
                    <td className="cp-mono max-w-[170px] truncate text-[12px]">{hookUrlById.get(d.endpoint_id) ?? "Deleted webhook"}</td>
                    <td className="num">{d.response_code ?? "-"}</td>
                    <td className="num">{d.attempt ?? 1}</td>
                    <td><Pill tone={d.status === "delivered" || d.status === "succeeded" ? "good" : d.status === "failed" ? "bad" : "wait"}>{d.status.charAt(0).toUpperCase() + d.status.slice(1)}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : <div className="cp-panel-b text-[14px] text-[var(--muted)]">No deliveries yet. They appear here as events fire.</div>}
      </Panel>
    </div>
  );
}

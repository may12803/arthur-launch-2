"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUTH_LABEL, ago, connState, parseIntervalHours, type CatalogEntry, type ConnRow, type SyncRun } from "@/lib/client-portal/connector-ui";
import { LocalTime } from "../LocalTime";
import { Logo, Notice, Panel, PanelHead, Pill, Stat, TableWrap } from "../cp";

type Msg = { ok: boolean; text: string } | null;

async function post(url: string, body: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, json };
  } catch (e) {
    return { ok: false, json: { error: e instanceof Error ? e.message : "The request did not complete." } };
  }
}

function duration(r: SyncRun): string {
  if (!r.finished_at) return r.status === "running" ? "running" : "-";
  const s = Math.max(0, (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000);
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
}

function keyFieldsFor({ entry }: { entry: CatalogEntry }): { name: string; label: string; hint?: string; secret?: boolean }[] {
  if (entry.legacy?.key_fields?.length) return entry.legacy.key_fields.map((f) => ({ ...f, secret: true }));
  switch (entry.authMethod) {
    case "oauth2_client_credentials":
      return [
        { name: "client_id", label: "Client ID" },
        { name: "client_secret", label: "Client secret", secret: true, hint: "Created by your administrator in the vendor's admin console." },
        { name: "account", label: "Account or tenant identifier", hint: "Shown in the vendor's admin console. Leave blank if there is none." },
      ];
    case "basic":
      return [
        { name: "username", label: "Service user name" },
        { name: "password", label: "Password", secret: true, hint: "Use a dedicated read-only service user, not a person's login." },
        { name: "base_url", label: "System address", hint: "Where your system is reached, for example the server or tenant address." },
      ];
    case "api_key":
      return [{ name: "api_key", label: "API key", secret: true, hint: "A read-only key. Stored encrypted and never shown again." }];
    default:
      return [];
  }
}

export function DetailView({
  entry, row, runs, now, canManage, flash, errors,
}: { entry: CatalogEntry; row?: ConnRow; runs: SyncRun[]; now: number; canManage: boolean; flash?: string | null; errors?: (string | null)[] }) {
  const router = useRouter();
  const st = connState(row, now);
  const connected = st.id !== "none" && st.id !== "disconnected";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"all" | "errors">("all");

  const limitH = parseIntervalHours(row?.stale_after);
  const ageH = row?.last_success_at ? (now - new Date(row.last_success_at).getTime()) / 3.6e6 : null;
  const week = runs.filter((r) => now - new Date(r.started_at).getTime() < 7 * 864e5);
  const rows7 = week.reduce((a, r) => a + (r.rows_read ?? 0), 0);
  const failed7 = week.filter((r) => r.status === "failed").length;
  const ok7 = week.length ? Math.round(((week.length - failed7) / week.length) * 1000) / 10 : null;
  const shownRuns = runs.filter((r) => filter === "all" || r.status === "failed" || r.status === "partial");
  const failing = st.id === "failing" || st.id === "stale";

  async function act(action: string, extra?: Record<string, unknown>, okText?: string) {
    setBusy(true); setMsg(null);
    const r = await post("/api/client/connections", { connector: entry.legacy?.key ?? entry.key, definition: entry.key, action, ...extra });
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: String(r.json.error ?? "That did not save.") }); return; }
    setVals({});
    setMsg({ ok: true, text: okText ?? "Saved." });
    router.refresh();
  }

  async function startOAuth() {
    setBusy(true); setMsg(null);
    const r = await post(`/api/client/connectors/${entry.key}/oauth/start`, {});
    if (r.ok && typeof r.json.url === "string") { window.location.assign(r.json.url); return; }
    setBusy(false);
    setMsg({ ok: false, text: String(r.json.error ?? "Sign-in could not start.") });
  }

  const fields = keyFieldsFor({ entry });
  const m = entry.authMethod;

  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]">
        <Link href="/client/connections" className="text-[var(--blue)]">Connections</Link> / {entry.categoryLabel} / <b className="font-medium text-[var(--ink)]">{entry.name}</b>
      </p>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <Logo src={entry.logo} name={entry.name} size={56} />
          <div className="min-w-0">
            <h1 className="text-[34px] font-medium leading-[1.1] tracking-[-0.04em] text-[var(--ink)] max-md:text-[28px]">{entry.name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Pill tone={st.tone} dot>{st.label}</Pill>
              <Pill>{AUTH_LABEL[m] ?? m}</Pill>
              {row?.managed_by === "loveleeday" ? <Pill>Managed by LOVELEEDAY</Pill> : null}
              {row?.external_account_id ? <span className="text-[11.5px] text-[var(--muted)]">Account {row.external_account_id}</span> : null}
            </div>
          </div>
        </div>
        {canManage && connected ? (
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="ll-danger" disabled={busy} onClick={() => { if (confirm(`Disconnect ${entry.name}? Any stored credential is deleted.`)) act("disconnect", undefined, "Disconnected. Any stored credential was deleted."); }}>Disconnect</button>
            {m === "oauth2_authcode" ? <button type="button" className="ll-primary" disabled={busy} onClick={startOAuth}>Re-authorize</button> : null}
          </div>
        ) : null}
      </div>

      {flash ? <div className="mt-6"><Notice tone="good">{flash}</Notice></div> : null}
      {errors?.some(Boolean) ? (
        <div className="cp-banner bad mt-6" role="alert"><div><b>Some details did not load.</b>{errors.filter(Boolean).map((e, i) => <div key={i} className="mt-0.5 break-words">{e}</div>)}</div></div>
      ) : null}
      {failing ? (
        <div className="mt-6">
          <Notice tone={st.id === "failing" ? "bad" : "wait"}>
            <div>
              <b className="font-semibold">{st.id === "failing" ? "This connection needs attention." : "This connection is behind."}</b> {st.reason}
              {canManage && m === "oauth2_authcode" ? <> <button type="button" className="underline" onClick={startOAuth}>Re-authorize now</button>.</> : null}
            </div>
          </Notice>
        </div>
      ) : null}

      {connected ? (
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Last successful sync" value={row?.last_success_at ? ago(row.last_success_at, now) : "None yet"} sub={row?.stale_after ? `Expected within ${Math.round(limitH)} hr` : undefined} tone={ageH != null && ageH > limitH ? "wait" : "good"} />
          <Stat label="Rows read, last sync" value={row?.last_rows != null ? row.last_rows.toLocaleString("en-US") : "-"} sub={row?.last_rows === 0 ? "The last sync moved no rows" : undefined} tone={row?.last_rows === 0 ? "wait" : undefined} />
          <Stat label="Rows read, 7 days" value={week.length ? rows7.toLocaleString("en-US") : "-"} sub={week.length ? `${week.length} syncs${ok7 != null ? `, ${ok7}% succeeded` : ""}` : "No syncs recorded"} tone={failed7 ? "wait" : undefined} />
          <Stat label="Objects in scope" value={entry.objects.length || "-"} sub={entry.incremental ? "Reads only what changed" : undefined} />
        </div>
      ) : null}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid gap-6">
          {!connected || st.id === "disconnected" ? (
            <Panel>
              <PanelHead title={`Connect ${entry.name}`} sub={entry.gate.kind === "partner" ? "This vendor reviews access before a sign-in can complete." : "Read-only. You can disconnect at any time."} right={<Pill tone={entry.gate.kind === "partner" ? "wait" : "good"}>{entry.gate.label}</Pill>} />
              <div className="cp-panel-b grid gap-5">
                <div>
                  <span className="cp-cap">Before you authorize, this is what we will read</span>
                  <ul className="mt-2 grid gap-1 text-[13.5px] text-[#303238]">
                    {(entry.scopes.length ? entry.scopes : ["Read access to the objects listed on this page"]).map((s) => (
                      <li key={s} className="flex gap-2"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-[#9aa3b0]" /><span className={entry.scopes.includes(s) ? "cp-mono text-[12.5px]" : ""}>{s}</span></li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[12px] text-[var(--muted)]">Nothing is written to {entry.name}. Any change we propose comes to Approvals first.</p>
                </div>

                {entry.gate.kind === "partner" ? <Notice tone="info"><div>{entry.gate.detail}</div></Notice> : entry.customerAdmin ? (
                  <div><span className="cp-cap">What your administrator does</span><p className="mt-1.5 text-[13.5px] leading-[1.65] text-[#303238]">{entry.customerAdmin}</p></div>
                ) : null}

                {!canManage ? (
                  <Notice tone="info"><div>Ask an owner or admin on your account to connect this system.</div></Notice>
                ) : entry.legacy?.method === "invite" ? (
                  <div>
                    <p className="text-[13.5px] leading-[1.65] text-[#303238]">{entry.legacy.invite_steps}</p>
                    <button type="button" className="ll-primary mt-4" disabled={busy} onClick={() => act("invited", undefined, "Thanks. We will confirm the invitation and show the proof here.")}>{busy ? "Saving..." : "I have added LOVELEEDAY"}</button>
                  </div>
                ) : entry.gate.kind === "partner" ? (
                  <button type="button" className="ll-primary justify-self-start" disabled={busy || st.id === "requested"} onClick={() => act("request", undefined, "Requested. We will start the vendor approval with you and show progress here.")}>{st.id === "requested" ? "Requested" : busy ? "Saving..." : `Request ${entry.name} access`}</button>
                ) : m === "oauth2_authcode" ? (
                  <button type="button" className="ll-primary justify-self-start" disabled={busy} onClick={startOAuth}>{busy ? "Opening..." : `Continue to ${entry.name}`}</button>
                ) : m === "none" || m === "upload" ? (
                  <Link href="/client/data/upload" className="ll-primary justify-self-start">Upload a file</Link>
                ) : m === "service_account" ? (
                  <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); try { const j = JSON.parse(vals.service_account_json ?? ""); if (!j.client_email || !j.private_key) throw new Error("This file is missing client_email or private_key."); } catch (err) { setMsg({ ok: false, text: err instanceof Error && err.message.includes("missing") ? err.message : "That is not a valid service account JSON file." }); return; } act("key", { payload: { service_account_json: vals.service_account_json } }, "Service account stored encrypted. A live read will confirm it."); }}>
                    <label className="ll-field"><span>Service account JSON</span><textarea className="ll-input cp-mono min-h-[120px] text-[12px]" autoComplete="off" spellCheck={false} placeholder='{ "type": "service_account", ... }' value={vals.service_account_json ?? ""} onChange={(e) => setVals({ service_account_json: e.target.value })} /></label>
                    <p className="text-[12px] text-[var(--muted)]">Create the account with read-only roles on the datasets you choose. The file is encrypted with your company&apos;s own key and is never shown again.</p>
                    <button type="submit" className="ll-primary justify-self-start" disabled={busy}>{busy ? "Encrypting..." : "Store service account"}</button>
                  </form>
                ) : m === "key_pair" ? (
                  <div className="grid gap-3">
                    <p className="text-[13.5px] leading-[1.65] text-[#303238]">{entry.key === "sftp-drop" ? "Send files to a private folder on our SFTP endpoint, signed in with a key pair. We create the pair and the folder with you." : "You add a public key that we provide to a read-only user. The matching half stays with us, encrypted, and is never shown."}</p>
                    <p className="text-[12.5px] text-[var(--muted)]">Setup is done with you rather than self-served. Request it and we will send the connection details to your owners and admins.</p>
                    <button type="button" className="ll-primary justify-self-start" disabled={busy || st.id === "requested"} onClick={() => act("request", undefined, "Requested. We will set this up with you and show progress here.")}>{st.id === "requested" ? "Requested" : busy ? "Saving..." : "Request setup"}</button>
                  </div>
                ) : (
                  <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); act("key", { payload: vals }, "Credential stored encrypted. A live read will confirm it and the proof will appear here."); }}>
                    {fields.map((f) => (
                      <label key={f.name} className="ll-field"><span>{f.label}</span>
                        <input className="ll-input" type={f.secret ? "password" : "text"} autoComplete="off" value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} required={f.name !== "account"} />
                        {f.hint ? <span className="text-[12px] text-[var(--muted)]">{f.hint}</span> : null}
                      </label>
                    ))}
                    <p className="text-[12px] text-[var(--muted)]">Credentials are encrypted with your company&apos;s own key and are never shown again, to you or to us in the portal.</p>
                    <button type="submit" className="ll-primary justify-self-start" disabled={busy}>{busy ? "Encrypting..." : "Store credential"}</button>
                  </form>
                )}
                {entry.recommendedPath === "sftp_csv" && m !== "none" && m !== "key_pair" ? (
                  <p className="text-[12.5px] text-[var(--muted)]">No API access? This system can also send a scheduled CSV. <Link href="/client/data/upload" className="text-[var(--blue)]">Upload a file instead</Link>.</p>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {connected ? (
            <Panel className="overflow-hidden">
              <PanelHead
                title="Sync history"
                sub={runs.length ? `Latest ${runs.length} runs` : undefined}
                right={<div className="flex gap-2"><button type="button" className="cp-tab" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button><button type="button" className="cp-tab" aria-pressed={filter === "errors"} onClick={() => setFilter("errors")}>Errors<small>{runs.filter((r) => r.status === "failed" || r.status === "partial").length}</small></button></div>}
              />
              {shownRuns.length ? (
                <TableWrap>
                  <table className="cp-table">
                    <thead><tr><th>Started</th><th>Object</th><th className="num">Rows read</th><th className="num">Duration</th><th>Result</th></tr></thead>
                    <tbody>
                      {shownRuns.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap"><LocalTime iso={r.started_at} /></td>
                          <td>{r.object ?? "All objects"}</td>
                          <td className="num">{(r.rows_read ?? 0).toLocaleString("en-US")}</td>
                          <td className="num whitespace-nowrap">{duration(r)}</td>
                          <td>
                            <Pill tone={r.status === "succeeded" ? "good" : r.status === "failed" ? "bad" : r.status === "running" ? "info" : "wait"}>{r.status === "succeeded" ? "Complete" : r.status === "failed" ? "Failed" : r.status === "partial" ? "Partial" : "Running"}</Pill>
                            {r.error ? <span className="sub max-w-[320px] break-words">{r.error}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              ) : (
                <div className="cp-panel-b text-[14px] leading-[1.7] text-[var(--muted)]">
                  {runs.length ? "No runs match this filter." : "No syncs have been recorded for this connection yet. The first scheduled sync will appear here, and this connection reads Live only after rows have moved."}
                </div>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="grid gap-6">
          <Panel>
            <PanelHead title="What this connection can read" sub="Nothing is written back." />
            <div className="cp-panel-b grid gap-4">
              {entry.objects.length ? (
                <div className="flex flex-wrap gap-2">{entry.objects.map((o) => <Pill key={o}>{o}</Pill>)}</div>
              ) : <p className="text-[13.5px] text-[var(--muted)]">Objects are agreed with you when the connection is set up.</p>}
              {entry.scopes.length ? (
                <div><span className="cp-cap">Permissions requested</span><ul className="mt-1.5 grid gap-1 text-[13px] text-[#303238]">{(connected && row?.scopes?.length ? row.scopes : entry.scopes).map((s) => <li key={s}><span className={entry.scopes.includes(s) ? "cp-mono text-[12.5px]" : ""}>{s}</span></li>)}</ul></div>
              ) : null}
              {entry.incremental ? <div><span className="cp-cap">How changes are picked up</span><p className="mt-1.5 text-[13px] leading-[1.65] text-[#303238]">{entry.incremental}</p></div> : null}
              {entry.sandbox != null ? <p className="text-[12px] text-[var(--muted)]">{entry.sandbox ? "A sandbox or test environment is available for trying this first." : "This vendor does not offer a sandbox."}</p> : null}
            </div>
          </Panel>

          <Panel>
            <PanelHead title="Access" />
            <div className="cp-panel-b grid gap-3 text-[13px] leading-[1.65] text-[#303238]">
              <div className="flex items-center justify-between gap-3"><span className="text-[var(--muted)]">Vendor requirement</span><Pill tone={entry.gate.kind === "partner" ? "wait" : "good"}>{entry.gate.label}</Pill></div>
              <div className="flex items-center justify-between gap-3"><span className="text-[var(--muted)]">Method</span><span>{AUTH_LABEL[m] ?? m}</span></div>
              {row?.token_expires_at ? <div className="flex items-center justify-between gap-3"><span className="text-[var(--muted)]">Sign-in expires</span><LocalTime iso={row.token_expires_at} /></div> : null}
              {row?.proof ? <div className="rounded-xl bg-[#f5f5f7] p-3.5"><span className="cp-cap">How we know it works</span><p className="mt-1 text-[#2f6b4f]">{row.proof}</p></div> : null}
              {row?.error ? <div className="rounded-xl bg-[#fdf4f3] p-3.5"><span className="cp-cap">What needs attention</span><p className="mt-1 text-[#a1291f]">{row.error}</p></div> : null}
            </div>
          </Panel>
        </div>
      </div>

      {msg ? <p role="status" className={`mt-5 text-[13px] ${msg.ok ? "text-[#1e6b3a]" : "text-[#a1291f]"}`}>{msg.text}</p> : null}
    </div>
  );
}

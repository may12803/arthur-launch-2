"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice, Panel, PanelHead, Pill, Switch } from "../cp";

export type SecurityRow = { sso_enforced: boolean; sso_domains: string[]; scim_enabled: boolean; session_hours: number; retention_days: number };

const SESSION_OPTIONS = [8, 12, 24, 72, 168, 720];
const RETENTION_OPTIONS = [90, 180, 365, 730, 1095, 2555];
const hoursLabel = (h: number) => (h % 24 === 0 && h >= 24 ? `${h / 24} ${h === 24 ? "day" : "days"}` : `${h} hours`);
const daysLabel = (d: number) => (d >= 365 && d % 365 === 0 ? `${d / 365} ${d === 365 ? "year" : "years"}` : `${d} days`);

export function SecurityView({ security, isOwner, loadError }: { security: SecurityRow | null; isOwner: boolean; loadError?: string | null }) {
  const router = useRouter();
  const base: SecurityRow = security ?? { sso_enforced: false, sso_domains: [], scim_enabled: false, session_hours: 12, retention_days: 365 };
  const [enforced, setEnforced] = useState(base.sso_enforced);
  const [domains, setDomains] = useState<string[]>(base.sso_domains);
  const [domain, setDomain] = useState("");
  const [hours, setHours] = useState(base.session_hours);
  const [retention, setRetention] = useState(base.retention_days);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = enforced !== base.sso_enforced || hours !== base.session_hours || retention !== base.retention_days || domains.join() !== base.sso_domains.join();

  function addDomain() {
    const d = domain.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) { setMsg({ ok: false, text: `"${d}" is not a valid domain. Use the part after the @, for example example.org.` }); return; }
    if (!domains.includes(d)) setDomains([...domains, d]);
    setDomain(""); setMsg(null);
  }

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/client/security", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sso_enforced: enforced, sso_domains: domains, session_hours: hours, retention_days: retention }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "That did not save." });
      else { setMsg({ ok: true, text: "Saved and recorded in your audit trail." }); router.refresh(); }
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "That did not save." }); }
    setBusy(false);
  }

  const row = "flex items-center justify-between gap-6 border-b border-[#edf0f4] py-4 last:border-0 max-sm:flex-col max-sm:items-start max-sm:gap-3";

  return (
    <div className="grid gap-6">
      {loadError ? <div className="cp-banner bad" role="alert"><div>Security settings did not load: {loadError}. The values below are defaults, not your saved settings.</div></div> : null}
      {!isOwner ? <Notice tone="info"><div>Only an owner can change these settings. You can see them here.</div></Notice> : null}

      <Panel>
        <PanelHead title="Single sign-on" sub="SAML 2.0 through your identity provider, which then owns the second factor." right={<Pill tone={enforced ? "good" : "off"} dot>{enforced ? "Enforced" : "Not enforced"}</Pill>} />
        <div className="cp-panel-b grid gap-5">
          <div>
            <span className="cp-cap">Domains</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {domains.length ? domains.map((d) => (
                <span key={d} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[#fafbfd] py-1 pl-3 pr-1.5 text-[12.5px]">
                  {d}
                  {isOwner ? <button type="button" aria-label={`Remove ${d}`} className="cp-chip-x flex h-5 w-5 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[#eceff3]" onClick={() => setDomains(domains.filter((x) => x !== d))}>×</button> : null}
                </span>
              )) : <span className="text-[13px] text-[var(--muted)]">No domains yet.</span>}
            </div>
            {isOwner ? (
              <div className="mt-3 flex max-w-[460px] gap-2">
                <input className="ll-input" placeholder="example.org" value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }} aria-label="Add a domain" />
                <button type="button" className="ll-secondary" onClick={addDomain}>Add</button>
              </div>
            ) : null}
          </div>
          <div className={row + " !border-t !border-[#edf0f4] !pt-4"}>
            <div><div className="text-[14px] font-medium text-[var(--ink)]">Require single sign-on for these domains</div><div className="text-[12.5px] text-[var(--muted)]">People with an address on a listed domain sign in through your identity provider. Joining still takes an invitation.</div></div>
            <Switch checked={enforced} onChange={setEnforced} label="Require single sign-on" disabled={!isOwner || (!enforced && !domains.length)} />
          </div>
          <p className="text-[12.5px] leading-[1.7] text-[var(--muted)]">Your identity provider connection is set up with LOVELEEDAY, not self-served here. To start or change it, ask your LOVELEEDAY lead. Add at least one domain before turning enforcement on, so a mistake cannot lock the company out.</p>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHead title="Multi-factor sign-in" />
          <div className="cp-panel-b !py-2">
            <div className={row}><div><div className="text-[14px] font-medium text-[var(--ink)]">Required for every member</div><div className="text-[12.5px] text-[var(--muted)]">A one-time code from an authenticator app. The database refuses a session that skipped it.</div></div><Pill tone="good">Always on</Pill></div>
            <div className={row}><div><div className="text-[14px] font-medium text-[var(--ink)]">Single sign-on sessions</div><div className="text-[12.5px] text-[var(--muted)]">Your identity provider owns the second factor.</div></div><Pill>Accepted</Pill></div>
            <p className="pb-2 pt-3 text-[12px] text-[var(--muted)]">This policy is fixed by the platform and cannot be turned off.</p>
          </div>
        </Panel>
        <Panel>
          <PanelHead title="Sessions and retention" />
          <div className="cp-panel-b !py-2">
            <div className={row}><div><div className="text-[14px] font-medium text-[var(--ink)]">Maximum session length</div><div className="text-[12.5px] text-[var(--muted)]">Require a fresh sign-in at least this often.</div></div>
              <select className="cp-select" value={hours} disabled={!isOwner} onChange={(e) => setHours(Number(e.target.value))} aria-label="Maximum session length">{(SESSION_OPTIONS.includes(hours) ? SESSION_OPTIONS : [...SESSION_OPTIONS, hours].sort((a, b) => a - b)).map((h) => <option key={h} value={h}>{hoursLabel(h)}</option>)}</select></div>
            <div className={row}><div><div className="text-[14px] font-medium text-[var(--ink)]">Data retention</div><div className="text-[12.5px] text-[var(--muted)]">How long synced records are kept. On request, your data is deleted and a deletion record is issued.</div></div>
              <select className="cp-select" value={retention} disabled={!isOwner} onChange={(e) => setRetention(Number(e.target.value))} aria-label="Data retention">{(RETENTION_OPTIONS.includes(retention) ? RETENTION_OPTIONS : [...RETENTION_OPTIONS, retention].sort((a, b) => a - b)).map((d) => <option key={d} value={d}>{daysLabel(d)}</option>)}</select></div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHead title="SCIM provisioning" sub="Create and remove accounts automatically from your identity provider." right={<Pill tone={base.scim_enabled ? "good" : "off"} dot>{base.scim_enabled ? "Enabled" : "Not enabled"}</Pill>} />
        <div className="cp-panel-b text-[13.5px] leading-[1.7] text-[#303238]">
          {base.scim_enabled ? "SCIM is enabled for your account. Provisioning changes appear in the audit trail." : "SCIM is not enabled for your account. People are added by invitation on the Team page. Automatic provisioning is configured with LOVELEEDAY alongside single sign-on and shows as enabled here only once it is working."}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Access and records" />
        <div className="cp-panel-b flex flex-wrap gap-3">
          <Link href="/client/audit" className="ll-secondary">Audit trail</Link>
          <Link href="/client/access" className="ll-secondary">Access history</Link>
          <Link href="/trust" className="ll-secondary">Trust center</Link>
        </div>
      </Panel>

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" className="ll-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving..." : "Save changes"}</button>
          {msg ? <span role="status" className={`text-[13px] ${msg.ok ? "text-[#1e6b3a]" : "text-[#a1291f]"}`}>{msg.text}</span> : dirty ? <span className="text-[12.5px] text-[var(--muted)]">Unsaved changes</span> : null}
        </div>
      ) : null}
    </div>
  );
}

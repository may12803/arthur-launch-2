"use client";

import { useState, FormEvent } from "react";
import { FormField, PortalButton, inputClass } from "./ui";

export type StaffTenant = { id: string; name: string; data_class: string; grant_expires_at: string | null };

export function StaffConsole({ tenants }: { tenants: StaffTenant[] }) {
  const [tenant, setTenant] = useState(tenants[0]?.id || "");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = tenants.find((t) => t.id === tenant);
  const max = selected?.data_class === "regulated" ? 4 : 8;

  async function openAccess(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await fetch("/api/client/staff", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant, reason, hours: Math.min(hours, max) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Couldn't open access."); setBusy(false); return; }
    window.location.href = "/client";
  }

  async function classify(id: string, cls: string) {
    await fetch("/api/client/staff", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant: id, data_class: cls }) });
    window.location.reload();
  }

  if (tenants.length === 0) return <p className="ll-note">There are no client accounts yet.</p>;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={openAccess} className="flex flex-col gap-5">
        <FormField label="Client" htmlFor="staff-tenant">
          <select id="staff-tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} className={inputClass}>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.data_class === "regulated" ? " (regulated)" : ""}{t.grant_expires_at ? " · access open" : ""}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Reason (the client sees this)" htmlFor="staff-reason">
          <input id="staff-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass}
            placeholder="Deliver the Q3 compliance calendar" />
        </FormField>
        <FormField label={`For how long (up to ${max} hours for this client)`} htmlFor="staff-hours">
          <select id="staff-hours" value={Math.min(hours, max)} onChange={(e) => setHours(Number(e.target.value))} className={inputClass}>
            {[1, 2, 4, 8].filter((h) => h <= max).map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
          </select>
        </FormField>
        {error && <p className="ll-feedback warn">{error}</p>}
        <PortalButton type="submit" disabled={busy || reason.trim().length < 10} className="w-full">
          {busy ? "Opening…" : "Open access and notify the client"}
        </PortalButton>
      </form>

      <div className="border-t border-[var(--line)] pt-5 flex flex-col gap-2">
        <span className="ll-label">Data classification</span>
        {tenants.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-[var(--ink)]">{t.name}</span>
            <button type="button" className="ll-text-link" onClick={() => classify(t.id, t.data_class === "regulated" ? "standard" : "regulated")}>
              {t.data_class === "regulated" ? "Regulated · mark standard" : "Standard · mark regulated"}
            </button>
          </div>
        ))}
        <p className="ll-note">Regulated turns outside sharing off, revokes live links, and caps links at 7 days and staff access at 4 hours.</p>
      </div>
    </div>
  );
}

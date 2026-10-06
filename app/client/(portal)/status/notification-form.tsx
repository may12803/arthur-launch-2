"use client";

import { useState, type FormEvent } from "react";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { inputClass } from "@/components/client-portal/ui";

type Prefs = { approvals_digest: "off" | "daily" | "instant"; sync_failures: boolean; weekly_summary: boolean };

export function NotificationForm({ tenantId, initial }: { tenantId: string; initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { error } = await loveleeday.rpc("notification_prefs_set", {
      p_tenant: tenantId,
      p_approvals_digest: prefs.approvals_digest,
      p_sync_failures: prefs.sync_failures,
      p_weekly_summary: prefs.weekly_summary,
    });
    setMessage(error ? "Notification settings could not be saved. Try again." : "Notification settings saved.");
    setSaving(false);
  }

  return <section className="cp-panel p-6">
    <h2 className="text-[17px] font-medium">Notifications</h2>
    <p className="ll-note mt-1">These email notifications are coming soon. Your choices will be saved for launch.</p>
    <form onSubmit={save} className="mt-5 grid gap-4 text-[13.5px]">
      <label className="grid gap-1.5">Approval updates
        <select className={inputClass} value={prefs.approvals_digest} onChange={(e) => setPrefs({ ...prefs, approvals_digest: e.target.value as Prefs["approvals_digest"] })}>
          <option value="off">Off</option><option value="daily">Daily digest</option><option value="instant">As they happen</option>
        </select>
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.sync_failures} onChange={(e) => setPrefs({ ...prefs, sync_failures: e.target.checked })} />Connection failure alerts</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={prefs.weekly_summary} onChange={(e) => setPrefs({ ...prefs, weekly_summary: e.target.checked })} />Weekly summary</label>
      <button type="submit" className="ll-secondary justify-self-start" disabled={saving}>{saving ? "Saving…" : "Save notifications"}</button>
      {message && <p role="status" className="ll-note">{message}</p>}
    </form>
  </section>;
}

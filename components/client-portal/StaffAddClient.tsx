"use client";

import { useRef, useState, FormEvent } from "react";
import { FormField, PortalButton, inputClass } from "./ui";

const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// Staff add a client business: creates the company and emails its owner an invite (POST /api/client/staff/provision).
// One idempotency key per form instance, so a double click or a retry after a lost response never creates a second company.
export function StaffAddClient() {
  const key = useRef(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ name: string; email: string; emailSent: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const res = await fetch("/api/client/staff/provision", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, ownerEmail, idempotencyKey: key.current }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "Couldn't add that client."); return; }
    setDone({ name, email: ownerEmail, emailSent: !!data.emailSent });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-[var(--ink)] font-medium">{done.name} is set up.</p>
        <p className="ll-note">
          {done.emailSent
            ? `An invitation was emailed to ${done.email}. The link works only for that address and expires in 7 days.`
            : `The company and invitation exist, but the email did not send. Submit the same details again to resend it.`}
        </p>
        <button type="button" className="ll-text-link self-start" onClick={() => window.location.reload()}>Add another client</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <FormField label="Business name" htmlFor="add-name">
        <input id="add-name" required value={name} className={inputClass} placeholder="Harbor & Vine"
          onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(slugify(e.target.value)); }} />
      </FormField>
      <FormField label="Short name for the address (letters, digits, hyphens)" htmlFor="add-slug">
        <input id="add-slug" required value={slug} className={inputClass} placeholder="harbor-and-vine"
          onChange={(e) => { setSlug(slugify(e.target.value)); setSlugEdited(true); }} />
      </FormField>
      <FormField label="Owner's email" htmlFor="add-owner">
        <input id="add-owner" type="email" required value={ownerEmail} className={inputClass} placeholder="owner@company.com"
          onChange={(e) => setOwnerEmail(e.target.value)} />
      </FormField>
      <p className="ll-note">The owner gets an invitation email and joins by creating an account or signing in. Nothing is shared with anyone else.</p>
      {error && <p className="ll-feedback warn">{error}</p>}
      <PortalButton type="submit" disabled={busy || name.trim().length < 2 || slug.length < 3 || !ownerEmail} className="w-full">
        {busy ? "Adding…" : "Add client and email the owner"}
      </PortalButton>
    </form>
  );
}

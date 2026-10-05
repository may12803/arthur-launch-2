"use client";

import { useState } from "react";
import { PortalButton, Card, Muted } from "./ui";
import { PLANS, AUDITS, priceKey, annualCents, money, type Interval } from "@/lib/billing/plans";

export function PlanPicker({ canBuy, currentLookupKey }: { canBuy: boolean; currentLookupKey: string | null }) {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function start(lookup: string) {
    setBusy(lookup);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lookup_key: lookup }) });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) { setError(data.error || "Couldn't start checkout."); setBusy(""); return; }
      window.location.href = data.url;
    } catch {
      setError("Network error. Try again.");
      setBusy("");
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="font-serif text-h3 text-text-active">Plans</p>
        <div role="group" aria-label="Billing interval" className="flex gap-2">
          <PortalButton variant={interval === "monthly" ? "primary" : "secondary"} onClick={() => setInterval("monthly")}>Monthly</PortalButton>
          <PortalButton variant={interval === "annual" ? "primary" : "secondary"} onClick={() => setInterval("annual")}>Annual, two months free</PortalButton>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLANS.map((p) => {
          const current = currentLookupKey === priceKey(p.key, interval);
          const cents = interval === "monthly" ? p.monthlyCents : annualCents(p);
          return (
            <Card key={p.key} className="p-6 flex flex-col gap-3">
              <p className="font-serif text-h3 text-text-active">{p.name}</p>
              <Muted>{p.blurb}</Muted>
              <p className="text-[26px] text-text-active">{money(cents)}<span className="text-[14px] text-[var(--muted)]"> / {interval === "monthly" ? "month" : "year"}</span></p>
              <PortalButton disabled={!canBuy || current || busy !== ""} onClick={() => start(priceKey(p.key, interval))}>
                {current ? "Current plan" : busy === priceKey(p.key, interval) ? "Opening…" : "Choose " + p.name}
              </PortalButton>
            </Card>
          );
        })}
      </div>
      <p className="font-serif text-h3 text-text-active mt-8 mb-4">Fixed-price audit</p>
      <div className="grid gap-4 md:grid-cols-2">
        {AUDITS.map((a) => (
          <Card key={a.key} className="p-6 flex flex-col gap-3">
            <p className="font-serif text-h3 text-text-active">{a.name}</p>
            <Muted>{a.blurb}</Muted>
            <p className="text-[26px] text-text-active">{money(a.amountCents)}<span className="text-[14px] text-[var(--muted)]"> one time</span></p>
            <PortalButton disabled={!canBuy || busy !== ""} onClick={() => start(a.key)}>{busy === a.key ? "Opening…" : "Book the audit"}</PortalButton>
          </Card>
        ))}
      </div>
      <Muted className="mt-4">Larger teams, several locations or a portfolio are a conversation, not a checkout. Tell your LOVELEEDAY contact.</Muted>
      {!canBuy && <Muted className="mt-2">Only owners and admins can change a plan.</Muted>}
      {error && <p role="alert" className="ll-feedback warn mt-3">{error}</p>}
    </div>
  );
}

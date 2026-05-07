"use client";

import { useEffect, useState } from "react";
import { Nav, Footer } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { EmptyState } from "../_components/EmptyState";

interface Subscription {
  id: string;
  name: string;
  vendor: string;
  amount_usd: number;
  billing_cycle: "monthly" | "yearly" | "other";
  next_charge_iso: string | null;
  virtual_card_id: string | null;
  credentials_op_ref: string | null;
  status: "active" | "canceling" | "canceled";
  notes: string | null;
  last_seen_iso: string | null;
}

interface SubsResponse {
  subscriptions: Subscription[];
  monthly_total_usd: number;
}

// Placeholder data — wired to /api/subs on load. Replace with real data once Plaid connected.
const PLACEHOLDER: Subscription[] = [
  { id: "claude-pro", name: "Claude Pro", vendor: "Anthropic", amount_usd: 20, billing_cycle: "monthly", next_charge_iso: new Date(Date.now() + 18 * 864e5).toISOString(), virtual_card_id: null, credentials_op_ref: null, status: "active", notes: null, last_seen_iso: null },
  { id: "vercel-pro", name: "Vercel Pro", vendor: "Vercel", amount_usd: 20, billing_cycle: "monthly", next_charge_iso: new Date(Date.now() + 7 * 864e5).toISOString(), virtual_card_id: "vpc_123", credentials_op_ref: null, status: "active", notes: null, last_seen_iso: null },
  { id: "supabase", name: "Supabase Pro", vendor: "Supabase", amount_usd: 25, billing_cycle: "monthly", next_charge_iso: new Date(Date.now() + 12 * 864e5).toISOString(), virtual_card_id: null, credentials_op_ref: null, status: "active", notes: null, last_seen_iso: null },
  { id: "old-sub", name: "Adobe CC", vendor: "Adobe", amount_usd: 54.99, billing_cycle: "monthly", next_charge_iso: null, virtual_card_id: null, credentials_op_ref: null, status: "canceled", notes: null, last_seen_iso: null },
];

function monthlyDisplay(sub: Subscription): number {
  return sub.billing_cycle === "yearly" ? sub.amount_usd / 12 : sub.amount_usd;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);
}

// ── Active subscription card ──────────────────────────────────────────────────

function SubCard({ sub }: { sub: Subscription }) {
  const days = daysUntil(sub.next_charge_iso);
  const isUrgent = days !== null && days <= 7;
  const cancelMethod = sub.virtual_card_id ? "Privacy card" : sub.credentials_op_ref ? "1Password + Stagehand" : null;

  return (
    <>
      <GlassPanel
        tier={3}
        style={{
          padding: "var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
          <div>
            <h3 style={{
              fontSize: "var(--fs-h3)",
              fontWeight: 700,
              color: "var(--text-active)",
              margin: "0 0 var(--space-1)",
              lineHeight: 1.2,
            }}>
              {sub.name}
            </h3>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {sub.vendor}
            </div>
          </div>
          <TokenChip
            label={sub.status}
            variant="status"
            color={sub.status === "active" ? "success" : "warning"}
            size="sm"
            style={{ textTransform: "capitalize", flexShrink: 0 }}
          />
        </div>

        {/* Price — large mono */}
        <div>
          <div style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-h2)",
            fontWeight: 700,
            color: "var(--text-active)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            ${monthlyDisplay(sub).toFixed(2)}
            <span style={{
              fontSize: "var(--fs-xs)",
              fontWeight: 400,
              color: "var(--text-faint)",
              marginLeft: "var(--space-1)",
            }}>
              / mo
            </span>
          </div>
          {sub.billing_cycle === "yearly" && (
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)", marginTop: "var(--space-1)" }}>
              ${sub.amount_usd.toFixed(2)} billed annually
            </div>
          )}
        </div>

        {/* Next renewal */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)", letterSpacing: "0.04em" }}>Next charge</span>
          <span style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-xs)",
            color: isUrgent ? "var(--tint-amber)" : "var(--text-muted)",
            fontWeight: isUrgent ? 600 : 400,
          }}>
            {fmtDate(sub.next_charge_iso)}
            {days !== null && ` (${days}d)`}
          </span>
        </div>

        {/* Cancel method badge */}
        {cancelMethod && (
          <TokenChip
            label={cancelMethod}
            variant="tag"
            color="blue"
            size="sm"
            style={{ alignSelf: "flex-start" }}
          />
        )}

        {/* CTA */}
        <a
          href="https://billing.stripe.com/p/login/test_28o17k2MH1YC9AY000"
          target="_blank"
          rel="noreferrer"
          className="cta-button"
        >
          Manage in Stripe →
        </a>
      </GlassPanel>
      <style jsx>{`
        .cta-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: auto;
          padding: 9px var(--space-4);
          background: transparent;
          border: 1px solid var(--accent-orange);
          border-radius: var(--radius-sm);
          color: var(--accent-orange);
          font-size: var(--fs-small);
          font-weight: 600;
          text-decoration: none;
          transition: background-color 150ms ease-out, color 150ms ease-out;
          letter-spacing: 0.01em;
        }
        .cta-button:hover {
          background-color: var(--accent-orange);
          color: var(--accent-text-on);
        }
      `}</style>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [data, setData] = useState<SubsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/subs");
      const json = await res.json() as SubsResponse;
      if (json.subscriptions && json.subscriptions.length > 0) {
        setData(json);
      } else {
        setData({ subscriptions: PLACEHOLDER, monthly_total_usd: PLACEHOLDER.filter(s => s.status === "active").reduce((a, s) => a + monthlyDisplay(s), 0) });
      }
    } catch {
      setData({ subscriptions: PLACEHOLDER, monthly_total_usd: PLACEHOLDER.filter(s => s.status === "active").reduce((a, s) => a + monthlyDisplay(s), 0) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSubs(); }, []);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/subs/scan", { method: "POST" });
      const json = await res.json() as { ok?: boolean; error?: string };
      setScanResult(json.error ?? (json.ok ? "Scan complete — refresh to see new subscriptions." : "Unknown error"));
    } catch (e) {
      setScanResult((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const activeSubs = (data?.subscriptions ?? []).filter(s => s.status === "active");
  const canceledSubs = (data?.subscriptions ?? []).filter(s => s.status !== "active");
  const monthlyTotal = data?.monthly_total_usd ?? 0;

  return (
    <>
      <Nav />
      <main style={{ minHeight: "calc(100vh - 60px)" }}>
        <div style={{ maxWidth: "var(--max-w)", margin: "0 auto", padding: "108px var(--page-gutter) var(--space-12)" }}>

          {/* Header */}
          <div style={{ marginBottom: "var(--space-9)", maxWidth: "var(--max-w-narrow)" }}>
            <PageHeader
              eyebrow="recurring charges"
              title="Subscriptions"
              subtitle="Track, manage, and cancel recurring charges. Arthur monitors and can cancel on your behalf."
            />
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-8)", flexWrap: "wrap", gap: "var(--space-4)" }}>
            {!loading && data && (
              <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "baseline" }}>
                <div>
                  <span style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: "var(--fs-h2)",
                    fontWeight: 700,
                    color: "var(--text-active)",
                    letterSpacing: "-0.02em",
                  }}>
                    ${monthlyTotal.toFixed(2)}
                  </span>
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)", marginLeft: "var(--space-1)" }}>/ mo</span>
                </div>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)" }}>
                  {activeSubs.length} active · ${(monthlyTotal * 12).toFixed(0)}/yr
                </div>
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={scanning}
              className="action-button"
            >
              {scanning ? "Scanning…" : "Scan for new subscriptions"}
            </button>
          </div>

          {scanResult && (
            <GlassPanel
              tier={1}
              style={{
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3) var(--space-4)",
                marginBottom: "var(--space-8)",
                fontSize: "var(--fs-small)",
                color: "var(--text-muted)",
              }}
            >
              {scanResult}
            </GlassPanel>
          )}

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
              {[1, 2, 3].map(i => (
                <div key={i} className="arthur-skeleton" style={{ height: 240, opacity: 0.4 }} />
              ))}
            </div>
          ) : (
            <>
              {activeSubs.length > 0 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: "var(--space-5)",
                  marginBottom: "var(--space-9)",
                }}>
                  {activeSubs.map(sub => <SubCard key={sub.id} sub={sub} />)}
                </div>
              )}

              {canceledSubs.length > 0 && (
                <details style={{ marginTop: "var(--space-2)" }}>
                  <summary className="details-summary">
                    <span className="arrow">▶</span>
                    Cancelled ({canceledSubs.length})
                  </summary>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-3)",
                    padding: "var(--space-4)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--line-separator)",
                    borderRadius: "var(--radius-card)",
                  }}>
                    {canceledSubs.map(sub => (
                      <div key={sub.id} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "var(--space-3) var(--space-4)",
                        background: "var(--bg-mid)",
                        borderRadius: "var(--radius-sm)",
                        opacity: 0.6,
                        gap: "var(--space-4)",
                      }}>
                        <div>
                          <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-muted)" }}>{sub.name}</div>
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)" }}>{sub.vendor}</div>
                        </div>
                        <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-small)", color: "var(--text-faint)", textDecoration: "line-through" }}>
                          ${monthlyDisplay(sub).toFixed(2)}/mo
                        </div>
                        <TokenChip
                          label={sub.status}
                          variant="status"
                          color="muted"
                          size="xs"
                          style={{ textTransform: "capitalize" }}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {activeSubs.length === 0 && canceledSubs.length === 0 && (
                <EmptyState
                  icon="💳"
                  title="no subscriptions tracked yet."
                  subtitle="connect Plaid to auto-detect recurring charges, or add Privacy.com virtual cards going forward."
                  size="md"
                  cta={
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", textAlign: "left", width: "100%", maxWidth: 400 }}>
                      {[
                        { label: "Privacy.com", url: "https://privacy.com", cost: "$5/mo", desc: "Virtual debit cards per vendor — close card = subscription dead" },
                        { label: "Plaid (dev tier)", url: "https://dashboard.plaid.com", cost: "Free", desc: "Connect bank accounts to auto-detect recurring charges" },
                      ].map(s => (
                        <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="empty-state-link">
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "var(--fs-small)" }}>{s.label}</div>
                            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-faint)" }}>{s.desc}</div>
                          </div>
                          <div style={{ fontSize: "var(--fs-xs)", color: "var(--tint-emerald)", fontWeight: 600, flexShrink: 0 }}>{s.cost}</div>
                        </a>
                      ))}
                    </div>
                  }
                />
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
      <style jsx>{`
        .action-button {
          background: var(--glass-t2-bg);
          border: 1px solid var(--glass-t2-border);
          border-radius: var(--radius-sm);
          padding: 9px var(--space-4);
          color: var(--text-active);
          cursor: pointer;
          font-size: var(--fs-small);
          font-weight: 500;
          transition: background-color 150ms ease-out, border-color 150ms ease-out;
        }
        .action-button:hover:not(:disabled) {
          background: var(--glass-t3-bg);
          border-color: var(--glass-t3-border);
        }
        .action-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .details-summary {
          cursor: pointer;
          font-family: var(--font-jetbrains, 'JetBrains Mono', monospace);
          font-size: var(--fs-xs);
          letter-spacing: 0.06em;
          color: var(--text-faint);
          padding: var(--space-3) 0;
          user-select: none;
          list-style: none;
          display: flex;
          align-items: center;
          gap: var(--space-2);
          transition: color 150ms ease-out;
        }
        .details-summary:hover {
          color: var(--text-main);
        }
        .details-summary .arrow {
          opacity: 0.5;
          font-size: 10px;
          transition: transform 200ms ease-out;
        }
        details[open] > summary .arrow {
          transform: rotate(90deg);
        }
        .empty-state-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-sm);
          text-decoration: none;
          color: var(--text-active);
          gap: var(--space-4);
          transition: background-color 150ms ease-out, border-color 150ms ease-out;
        }
        .empty-state-link:hover {
          background-color: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
        }
      `}</style>
    </>
  );
}

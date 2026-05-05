"use client";

import { useEffect, useState } from "react";
import { Nav, Footer } from "../_components/Layout";

interface Subscription {
  id:               string;
  name:             string;
  vendor:           string;
  amount_usd:       number;
  billing_cycle:    "monthly" | "yearly" | "other";
  next_charge_iso:  string | null;
  virtual_card_id:  string | null;
  credentials_op_ref: string | null;
  status:           "active" | "canceling" | "canceled";
  notes:            string | null;
  last_seen_iso:    string | null;
}

interface SubsResponse {
  subscriptions:    Subscription[];
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
    <div style={{
      background: "var(--glass-bg)",
      backdropFilter: "blur(var(--blur-amount))",
      border: "1px solid var(--glass-border)",
      borderRadius: "var(--radius-panel)",
      boxShadow: "var(--glass-shadow)",
      padding: "var(--space-5)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
      transition: "border-color var(--duration-quick) var(--ease-out-soft)",
    }}>
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
          <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {sub.vendor}
          </div>
        </div>
        <span style={{
          fontSize: "var(--fs-mono)",
          letterSpacing: "0.06em",
          color: sub.status === "active" ? "#4ade80" : "#f97316",
          background: sub.status === "active" ? "rgba(74,222,128,0.1)" : "rgba(249,115,22,0.1)",
          border: `1px solid ${sub.status === "active" ? "rgba(74,222,128,0.25)" : "rgba(249,115,22,0.25)"}`,
          borderRadius: 20,
          padding: "2px 10px",
          flexShrink: 0,
        }}>
          {sub.status}
        </span>
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
            fontSize: "var(--fs-mono)",
            fontWeight: 400,
            color: "var(--text-faint)",
            marginLeft: "var(--space-1)",
          }}>
            / mo
          </span>
        </div>
        {sub.billing_cycle === "yearly" && (
          <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", marginTop: "var(--space-1)" }}>
            ${sub.amount_usd.toFixed(2)} billed annually
          </div>
        )}
      </div>

      {/* Next renewal */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", letterSpacing: "0.04em" }}>Next charge</span>
        <span style={{
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          fontSize: "var(--fs-mono)",
          color: isUrgent ? "#f97316" : "var(--text-dim)",
          fontWeight: isUrgent ? 600 : 400,
        }}>
          {fmtDate(sub.next_charge_iso)}
          {days !== null && ` (${days}d)`}
        </span>
      </div>

      {/* Cancel method badge */}
      {cancelMethod && (
        <div style={{
          fontSize: "var(--fs-mono)",
          color: "var(--accent-cool)",
          background: "rgba(91,141,239,0.08)",
          border: "1px solid rgba(91,141,239,0.2)",
          borderRadius: 6,
          padding: "3px 8px",
          alignSelf: "flex-start",
          letterSpacing: "0.04em",
        }}>
          {cancelMethod}
        </div>
      )}

      {/* CTA */}
      <a
        href="https://billing.stripe.com/p/login/test_28o17k2MH1YC9AY000"
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: "auto",
          padding: "9px var(--space-4)",
          background: "none",
          border: "1px solid var(--accent-orange)",
          borderRadius: 8,
          color: "var(--accent-orange)",
          fontSize: "var(--fs-small)",
          fontWeight: 600,
          textDecoration: "none",
          transition: "background var(--duration-quick), color var(--duration-quick)",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = "var(--accent-orange)";
          (e.currentTarget as HTMLAnchorElement).style.color = "#fff";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLAnchorElement).style.background = "none";
          (e.currentTarget as HTMLAnchorElement).style.color = "var(--accent-orange)";
        }}
      >
        Manage in Stripe →
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [data, setData]     = useState<SubsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/subs");
      const json = await res.json() as SubsResponse;
      // Use real data if available, fall back to placeholder for display
      if (json.subscriptions && json.subscriptions.length > 0) {
        setData(json);
      } else {
        // Placeholder — wire comment: connect Plaid to populate real data
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
      const res  = await fetch("/api/subs/scan", { method: "POST" });
      const json = await res.json() as { ok?: boolean; error?: string };
      setScanResult(json.error ?? (json.ok ? "Scan complete — refresh to see new subscriptions." : "Unknown error"));
    } catch (e) {
      setScanResult((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const activeSubs   = (data?.subscriptions ?? []).filter(s => s.status === "active");
  const canceledSubs = (data?.subscriptions ?? []).filter(s => s.status !== "active");
  const monthlyTotal = data?.monthly_total_usd ?? 0;

  return (
    <>
      <Nav />
      <main style={{ minHeight: "calc(100vh - 60px)" }}>
        <div className="wrap" style={{ paddingTop: 108, paddingBottom: "var(--space-9)" }}>

          {/* Header */}
          <div style={{ marginBottom: "var(--space-6)" }}>
            <span style={{
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              fontSize: "var(--fs-mono)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-main)",
              opacity: 0.7,
            }}>
              recurring charges
            </span>
            <h1 style={{
              fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
              fontWeight: 800,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              color: "var(--text-main)",
              margin: "var(--space-2) 0 var(--space-3)",
              lineHeight: 0.95,
            }}>
              subscriptions.
            </h1>
            <p style={{ fontSize: "var(--fs-small)", color: "var(--text-main)", opacity: 0.65, maxWidth: "52ch", lineHeight: 1.65, margin: 0 }}>
              Track, manage, and cancel recurring charges. Arthur monitors and can cancel on your behalf.
            </p>
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)", flexWrap: "wrap", gap: "var(--space-3)" }}>
            {/* Summary stats */}
            {!loading && data && (
              <div style={{ display: "flex", gap: "var(--space-5)", alignItems: "baseline" }}>
                <div>
                  <span style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: "var(--fs-h2)",
                    fontWeight: 700,
                    color: "var(--text)",
                    letterSpacing: "-0.02em",
                  }}>
                    ${monthlyTotal.toFixed(2)}
                  </span>
                  <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", marginLeft: "var(--space-1)" }}>/ mo</span>
                </div>
                <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)" }}>
                  {activeSubs.length} active · ${(monthlyTotal * 12).toFixed(0)}/yr
                </div>
              </div>
            )}

            <button
              onClick={handleScan}
              disabled={scanning}
              style={{
                background: "var(--panel-elev)",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                padding: "9px var(--space-4)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: "var(--fs-small)",
                fontWeight: 500,
                opacity: scanning ? 0.6 : 1,
                transition: "opacity var(--duration-quick)",
              }}
            >
              {scanning ? "Scanning…" : "Scan bank accounts"}
            </button>
          </div>

          {scanResult && (
            <div style={{
              background: "var(--panel-elev)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              padding: "var(--space-3) var(--space-4)",
              marginBottom: "var(--space-5)",
              fontSize: "var(--fs-small)",
              color: "var(--text-dim)",
            }}>
              {scanResult}
            </div>
          )}

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--space-4)" }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: 220,
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  opacity: 0.4,
                  animation: "sub-shimmer 1.5s ease-in-out infinite",
                  backgroundImage: "linear-gradient(90deg, var(--panel) 25%, var(--panel-elev) 50%, var(--panel) 75%)",
                  backgroundSize: "600px 100%",
                }} />
              ))}
              <style>{`@keyframes sub-shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }`}</style>
            </div>
          ) : (
            <>
              {/* Active subscriptions grid */}
              {activeSubs.length > 0 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-6)",
                }}>
                  {activeSubs.map(sub => <SubCard key={sub.id} sub={sub} />)}
                </div>
              )}

              {/* Cancelled / expired — collapsible */}
              {canceledSubs.length > 0 && (
                <details style={{ marginTop: "var(--space-2)" }}>
                  <summary style={{
                    cursor: "pointer",
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    fontSize: "var(--fs-mono)",
                    letterSpacing: "0.06em",
                    color: "var(--text-faint)",
                    padding: "var(--space-3) 0",
                    userSelect: "none",
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}>
                    <span style={{ opacity: 0.5, fontSize: 10 }}>▶</span>
                    Cancelled ({canceledSubs.length}) — show
                  </summary>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-2)",
                    marginTop: "var(--space-3)",
                    padding: "var(--space-4)",
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}>
                    {canceledSubs.map(sub => (
                      <div key={sub.id} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "var(--space-3) var(--space-4)",
                        background: "var(--panel-elev)",
                        borderRadius: 8,
                        opacity: 0.55,
                        gap: "var(--space-4)",
                      }}>
                        <div>
                          <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-dim)" }}>{sub.name}</div>
                          <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)" }}>{sub.vendor}</div>
                        </div>
                        <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-small)", color: "var(--text-faint)", textDecoration: "line-through" }}>
                          ${monthlyDisplay(sub).toFixed(2)}/mo
                        </div>
                        <span style={{
                          fontSize: "var(--fs-mono)",
                          color: "var(--text-faint)",
                          background: "var(--panel)",
                          border: "1px solid var(--border)",
                          borderRadius: 20,
                          padding: "2px 8px",
                        }}>
                          {sub.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Empty state */}
              {activeSubs.length === 0 && canceledSubs.length === 0 && (
                <div style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "var(--space-7) var(--space-6)",
                  maxWidth: 560,
                  textAlign: "center",
                }}>
                  <h2 style={{ fontSize: "var(--fs-h3)", fontWeight: 600, marginBottom: "var(--space-3)", color: "var(--text)" }}>
                    no subscriptions tracked yet
                  </h2>
                  <p style={{ color: "var(--text-dim)", fontSize: "var(--fs-small)", marginBottom: "var(--space-5)", lineHeight: 1.6 }}>
                    Connect Plaid to auto-detect recurring charges, or add Privacy.com virtual cards going forward.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {[
                      { label: "Privacy.com", url: "https://privacy.com", cost: "$5/mo", desc: "Virtual debit cards per vendor — close card = subscription dead" },
                      { label: "Plaid (dev tier)", url: "https://dashboard.plaid.com", cost: "Free", desc: "Connect bank accounts to auto-detect recurring charges" },
                    ].map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "var(--space-3) var(--space-4)",
                        background: "var(--panel-elev)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        textDecoration: "none",
                        color: "var(--text)",
                        gap: "var(--space-4)",
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "var(--fs-small)" }}>{s.label}</div>
                          <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)" }}>{s.desc}</div>
                        </div>
                        <div style={{ fontSize: "var(--fs-mono)", color: "#4ade80", fontWeight: 600, flexShrink: 0 }}>{s.cost}</div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

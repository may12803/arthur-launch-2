"use client";

import { useEffect, useState } from "react";
import { Nav, Footer } from "../_components/Layout";

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
      <div style={{
        background: "var(--glass-t3-bg)",
        backdropFilter: "blur(var(--glass-t3-blur))",
        border: "1px solid var(--glass-t3-border)",
        borderRadius: "var(--radius-panel)",
        boxShadow: "var(--glass-t3-shadow)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        transition: "border-color 150ms ease-out, box-shadow 150ms ease-out",
      }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <h3 style={{
              fontSize: "1.25rem", // approx --fs-h3
              fontWeight: 700,
              color: "var(--text-active)",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}>
              {sub.name}
            </h3>
            <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {sub.vendor}
            </div>
          </div>
          <span style={{
            fontSize: "0.75rem",
            letterSpacing: "0.06em",
            color: sub.status === "active" ? "var(--tint-emerald)" : "var(--tint-amber)",
            background: sub.status === "active" ? "var(--tint-emerald-soft)" : "var(--tint-amber-soft)",
            borderRadius: "var(--radius-pill)",
            padding: "2px 10px",
            flexShrink: 0,
            textTransform: "capitalize",
          }}>
            {sub.status}
          </span>
        </div>

        {/* Price — large mono */}
        <div>
          <div style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "2.25rem", // approx --fs-h2
            fontWeight: 700,
            color: "var(--text-active)",
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}>
            ${monthlyDisplay(sub).toFixed(2)}
            <span style={{
              fontSize: "0.75rem",
              fontWeight: 400,
              color: "var(--text-faint)",
              marginLeft: "4px",
            }}>
              / mo
            </span>
          </div>
          {sub.billing_cycle === "yearly" && (
            <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "4px" }}>
              ${sub.amount_usd.toFixed(2)} billed annually
            </div>
          )}
        </div>

        {/* Next renewal */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-faint)", letterSpacing: "0.04em" }}>Next charge</span>
          <span style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "0.75rem",
            color: isUrgent ? "var(--tint-amber)" : "var(--text-muted)",
            fontWeight: isUrgent ? 600 : 400,
          }}>
            {fmtDate(sub.next_charge_iso)}
            {days !== null && ` (${days}d)`}
          </span>
        </div>

        {/* Cancel method badge */}
        {cancelMethod && (
          <div style={{
            fontSize: "0.75rem",
            color: "var(--tint-blue)",
            background: "var(--tint-blue-soft)",
            borderRadius: "var(--radius-sm)",
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
          className="cta-button"
        >
          Manage in Stripe →
        </a>
      </div>
      <style jsx>{`
        .cta-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: auto;
          padding: 9px 16px;
          background: transparent;
          border: 1px solid var(--accent-orange);
          border-radius: var(--radius-sm);
          color: var(--accent-orange);
          font-size: 0.875rem;
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
        <div style={{ maxWidth: "var(--max-w)", margin: "0 auto", padding: "108px var(--page-gutter) 96px" }}>

          {/* Header */}
          <div style={{ marginBottom: "48px", maxWidth: "var(--max-w-narrow)" }}>
            <span style={{
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}>
              recurring charges
            </span>
            <h1 style={{
              fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
              fontWeight: 800,
              fontSize: "clamp(2rem, 4vw, 3rem)",
              letterSpacing: "-0.03em",
              color: "var(--text-active)",
              margin: "8px 0 12px",
              lineHeight: 0.95,
            }}>
              Subscriptions
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", maxWidth: "52ch", lineHeight: 1.65, margin: 0 }}>
              Track, manage, and cancel recurring charges. Arthur monitors and can cancel on your behalf.
            </p>
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", flexWrap: "wrap", gap: "16px" }}>
            {!loading && data && (
              <div style={{ display: "flex", gap: "24px", alignItems: "baseline" }}>
                <div>
                  <span style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: "2.25rem",
                    fontWeight: 700,
                    color: "var(--text-active)",
                    letterSpacing: "-0.02em",
                  }}>
                    ${monthlyTotal.toFixed(2)}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginLeft: "4px" }}>/ mo</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>
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
            <div style={{
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              boxShadow: "var(--glass-t1-shadow)",
              backdropFilter: "blur(var(--glass-t1-blur))",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              marginBottom: "40px",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
            }}>
              {scanResult}
            </div>
          )}

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: 240,
                  background: "var(--glass-t1-bg)",
                  border: "1px solid var(--glass-t1-border)",
                  borderRadius: "var(--radius-panel)",
                  opacity: 0.4,
                  animation: "sub-shimmer 1.5s ease-in-out infinite",
                  backgroundImage: "linear-gradient(90deg, var(--glass-t1-bg) 25%, var(--glass-t2-bg) 50%, var(--glass-t1-bg) 75%)",
                  backgroundSize: "600px 100%",
                }} />
              ))}
            </div>
          ) : (
            <>
              {activeSubs.length > 0 && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: "20px",
                  marginBottom: "48px",
                }}>
                  {activeSubs.map(sub => <SubCard key={sub.id} sub={sub} />)}
                </div>
              )}

              {canceledSubs.length > 0 && (
                <details style={{ marginTop: "8px" }}>
                  <summary className="details-summary">
                    <span className="arrow">▶</span>
                    Cancelled ({canceledSubs.length})
                  </summary>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginTop: "12px",
                    padding: "16px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--line-separator)",
                    borderRadius: "var(--radius-card)",
                  }}>
                    {canceledSubs.map(sub => (
                      <div key={sub.id} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        background: "var(--bg-mid)",
                        borderRadius: "var(--radius-sm)",
                        opacity: 0.6,
                        gap: "16px",
                      }}>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-muted)" }}>{sub.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>{sub.vendor}</div>
                        </div>
                        <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "0.875rem", color: "var(--text-faint)", textDecoration: "line-through" }}>
                          ${monthlyDisplay(sub).toFixed(2)}/mo
                        </div>
                        <span style={{
                          fontSize: "0.75rem",
                          color: "var(--text-faint)",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--line-separator)",
                          borderRadius: "var(--radius-pill)",
                          padding: "2px 8px",
                          textTransform: "capitalize",
                        }}>
                          {sub.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {activeSubs.length === 0 && canceledSubs.length === 0 && (
                <div style={{
                  background: "var(--glass-t1-bg)",
                  border: "1px solid var(--glass-t1-border)",
                  borderRadius: "var(--radius-panel)",
                  backdropFilter: "blur(var(--glass-t1-blur))",
                  boxShadow: "var(--glass-t1-shadow)",
                  padding: "48px 40px",
                  maxWidth: 560,
                  margin: "40px auto 0",
                  textAlign: "center",
                }}>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "12px", color: "var(--text-active)" }}>
                    No subscriptions tracked yet
                  </h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "24px", lineHeight: 1.6 }}>
                    Connect Plaid to auto-detect recurring charges, or add Privacy.com virtual cards going forward.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
                    {[
                      { label: "Privacy.com", url: "https://privacy.com", cost: "$5/mo", desc: "Virtual debit cards per vendor — close card = subscription dead" },
                      { label: "Plaid (dev tier)", url: "https://dashboard.plaid.com", cost: "Free", desc: "Connect bank accounts to auto-detect recurring charges" },
                    ].map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="empty-state-link">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{s.label}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>{s.desc}</div>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--tint-emerald)", fontWeight: 600, flexShrink: 0 }}>{s.cost}</div>
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
      <style jsx>{`
        .action-button {
          background: var(--glass-t2-bg);
          border: 1px solid var(--glass-t2-border);
          border-radius: var(--radius-sm);
          padding: 9px 16px;
          color: var(--text-active);
          cursor: pointer;
          font-size: 0.875rem;
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
          font-size: 0.75rem;
          letter-spacing: 0.06em;
          color: var(--text-faint);
          padding: 12px 0;
          user-select: none;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 8px;
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
          padding: 12px 16px;
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-sm);
          text-decoration: none;
          color: var(--text-active);
          gap: 16px;
          transition: background-color 150ms ease-out, border-color 150ms ease-out;
        }
        .empty-state-link:hover {
          background-color: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
        }
        @keyframes sub-shimmer { 
          0% { background-position: -600px 0; } 
          100% { background-position: 600px 0; } 
        }
      `}</style>
    </>
  );
}
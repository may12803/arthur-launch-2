"use client";

import { useEffect, useState } from "react";

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

// v2 dark tokens
const D2 = {
  bg: '#0c0e12',
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassMid: 'rgba(255,255,255,0.07)',
  text: '#f5f6f8',
  textActive: '#f5f6f8',
  textMuted: 'rgba(245,246,248,0.50)',
  textFaint: 'rgba(245,246,248,0.30)',
  accent: '#d4ff3d',
  accentSoft: 'rgba(212,255,61,0.14)',
  accentOn: '#1a2400',
  sep: 'rgba(255,255,255,0.08)',
  mono: "'JetBrains Mono','GeistMono',monospace",
  radius: '16px',
  radiusPill: '100px',
};

// ── Active subscription card ──────────────────────────────────────────────────

function SubCard({ sub }: { sub: Subscription }) {
  const days = daysUntil(sub.next_charge_iso);
  const isUrgent = days !== null && days <= 7;
  const cancelMethod = sub.virtual_card_id ? "Privacy card" : sub.credentials_op_ref ? "1Password + Stagehand" : null;

  return (
    <div style={{
      background: D2.glass,
      border: `1px solid ${D2.glassBorder}`,
      borderRadius: D2.radius,
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      backdropFilter: "blur(16px)",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <h3 style={{
            fontFamily: "var(--font-lora, Lora, Georgia, serif)",
            fontSize: "16px", fontWeight: 500, color: D2.text,
            margin: "0 0 4px", lineHeight: 1.2, letterSpacing: "-0.02em",
          }}>
            {sub.name}
          </h3>
          <div style={{ fontFamily: D2.mono, fontSize: "0.6875rem", color: D2.textFaint, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {sub.vendor}
          </div>
        </div>
        <span style={{
          fontFamily: D2.mono, fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
          color: sub.status === "active" ? D2.accent : "rgba(251,191,36,0.85)",
          background: sub.status === "active" ? D2.accentSoft : "rgba(251,191,36,0.12)",
          borderRadius: D2.radiusPill, padding: "2px 10px", flexShrink: 0, textTransform: "uppercase",
        }}>
          {sub.status}
        </span>
      </div>

      {/* Price */}
      <div>
        <div style={{
          fontFamily: D2.mono, fontSize: "2.25rem", fontWeight: 700,
          color: D2.text, letterSpacing: "-0.03em", lineHeight: 1,
        }}>
          ${monthlyDisplay(sub).toFixed(2)}
          <span style={{ fontFamily: D2.mono, fontSize: "0.75rem", fontWeight: 400, color: D2.textFaint, marginLeft: "4px" }}>
            / mo
          </span>
        </div>
        {sub.billing_cycle === "yearly" && (
          <div style={{ fontSize: "0.75rem", color: D2.textFaint, marginTop: "4px" }}>
            ${sub.amount_usd.toFixed(2)} billed annually
          </div>
        )}
      </div>

      {/* Next renewal */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontFamily: D2.mono, fontSize: "0.6875rem", color: D2.textFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>Next charge</span>
        <span style={{
          fontFamily: D2.mono, fontSize: "0.75rem",
          color: isUrgent ? "rgba(251,191,36,0.85)" : D2.textMuted,
          fontWeight: isUrgent ? 600 : 400,
        }}>
          {fmtDate(sub.next_charge_iso)}
          {days !== null && ` (${days}d)`}
        </span>
      </div>

      {cancelMethod && (
        <div style={{
          fontFamily: D2.mono, fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
          color: "rgba(91,141,239,0.90)",
          background: "rgba(91,141,239,0.12)",
          borderRadius: "6px", padding: "3px 8px",
          alignSelf: "flex-start", textTransform: "uppercase",
        }}>
          {cancelMethod}
        </div>
      )}

      <a
        href="https://billing.stripe.com/p/login/test_28o17k2MH1YC9AY000"
        target="_blank" rel="noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginTop: "auto", padding: "9px 16px",
          background: "transparent", border: `1px solid ${D2.accent}`,
          borderRadius: "8px", color: D2.accent,
          fontSize: "0.875rem", fontWeight: 700, textDecoration: "none",
          letterSpacing: "0.01em", fontFamily: "inherit",
        }}
      >
        Manage in Stripe →
      </a>
    </div>
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
      <main style={{ minHeight: "100vh", background: D2.bg }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "32px 40px 96px" }}>

          {/* Header */}
          <div style={{ marginBottom: "48px", maxWidth: "680px" }}>
            <div style={{
              fontFamily: D2.mono, fontSize: "9px", fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase", color: D2.textMuted, marginBottom: 8,
            }}>
              recurring charges
            </div>
            <h1 style={{
              fontFamily: "var(--font-lora, Lora, Georgia, serif)",
              fontWeight: 500, fontSize: "28px", letterSpacing: "-0.025em",
              color: D2.text, margin: "8px 0 12px", lineHeight: 1.2,
            }}>
              Subscriptions
            </h1>
            <p style={{ fontSize: "0.875rem", color: D2.textMuted, maxWidth: "52ch", lineHeight: 1.65, margin: 0 }}>
              Track, manage, and cancel recurring charges. Arthur monitors and can cancel on your behalf.
            </p>
          </div>

          {/* Actions row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", flexWrap: "wrap", gap: "16px" }}>
            {!loading && data && (
              <div style={{ display: "flex", gap: "24px", alignItems: "baseline" }}>
                <div>
                  <span style={{ fontFamily: D2.mono, fontSize: "2.25rem", fontWeight: 700, color: D2.accent, letterSpacing: "-0.03em" }}>
                    ${monthlyTotal.toFixed(2)}
                  </span>
                  <span style={{ fontFamily: D2.mono, fontSize: "0.75rem", color: D2.textFaint, marginLeft: "4px" }}>/ mo</span>
                </div>
                <div style={{ fontFamily: D2.mono, fontSize: "0.75rem", color: D2.textFaint }}>
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
              background: "#FFFFFF",
              border: "1px solid #E8E4DB",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "40px",
              fontSize: "13.5px",
              color: "var(--text-muted)",
            }}>
              {scanResult}
            </div>
          )}

          {loading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: 240, background: D2.glass, border: `1px solid ${D2.glassBorder}`,
                  borderRadius: D2.radius, animation: "sub-shimmer 1.5s ease-in-out infinite",
                  backgroundImage: `linear-gradient(90deg, ${D2.glass} 25%, rgba(255,255,255,0.08) 50%, ${D2.glass} 75%)`,
                  backgroundSize: "600px 100%",
                }} />
              ))}
            </div>
          ) : (
            <>
              {activeSubs.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px", marginBottom: "48px" }}>
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
                    display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px",
                    padding: "16px", background: D2.glass, border: `1px solid ${D2.glassBorder}`, borderRadius: "10px",
                  }}>
                    {canceledSubs.map(sub => (
                      <div key={sub.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", background: "rgba(255,255,255,0.03)",
                        borderRadius: "6px", opacity: 0.5, gap: "16px",
                      }}>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: D2.textMuted }}>{sub.name}</div>
                          <div style={{ fontFamily: D2.mono, fontSize: "0.75rem", color: D2.textFaint }}>{sub.vendor}</div>
                        </div>
                        <div style={{ fontFamily: D2.mono, fontSize: "0.875rem", color: D2.textFaint, textDecoration: "line-through" }}>
                          ${monthlyDisplay(sub).toFixed(2)}/mo
                        </div>
                        <span style={{
                          fontFamily: D2.mono, fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
                          color: D2.textFaint, background: D2.glass, border: `1px solid ${D2.glassBorder}`,
                          borderRadius: D2.radiusPill, padding: "2px 8px", textTransform: "capitalize",
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
                  background: D2.glass, border: `1px solid ${D2.glassBorder}`,
                  borderRadius: D2.radius, padding: "48px 40px",
                  maxWidth: 560, margin: "40px auto 0", textAlign: "center",
                }}>
                  <h2 style={{ fontFamily: "var(--font-lora, Lora, Georgia, serif)", fontSize: "18px", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "12px", color: D2.text }}>
                    No subscriptions tracked yet
                  </h2>
                  <p style={{ color: D2.textMuted, fontSize: "0.875rem", marginBottom: "24px", lineHeight: 1.6 }}>
                    Connect Plaid to auto-detect recurring charges, or add Privacy.com virtual cards going forward.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
                    {[
                      { label: "Privacy.com", url: "https://privacy.com", cost: "$5/mo", desc: "Virtual debit cards per vendor — close card = subscription dead" },
                      { label: "Plaid (dev tier)", url: "https://dashboard.plaid.com", cost: "Free", desc: "Connect bank accounts to auto-detect recurring charges" },
                    ].map(s => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="empty-state-link">
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem", color: D2.textActive }}>{s.label}</div>
                          <div style={{ fontSize: "0.75rem", color: D2.textFaint }}>{s.desc}</div>
                        </div>
                        <div style={{ fontFamily: D2.mono, fontSize: "9px", fontWeight: 700, color: D2.accent, flexShrink: 0, letterSpacing: "0.06em" }}>{s.cost}</div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <style jsx>{`
        .action-button {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          padding: 9px 16px;
          color: #f5f6f8;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: background-color 150ms, border-color 150ms;
        }
        .action-button:hover:not(:disabled) {
          background: rgba(255,255,255,0.10);
          border-color: rgba(255,255,255,0.20);
        }
        .action-button:disabled { opacity: 0.5; cursor: not-allowed; }
        .details-summary {
          cursor: pointer;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6875rem;
          letter-spacing: 0.1em;
          color: rgba(245,246,248,0.30);
          padding: 12px 0;
          user-select: none;
          list-style: none;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: color 150ms;
          text-transform: uppercase;
        }
        .details-summary:hover { color: rgba(245,246,248,0.60); }
        .details-summary .arrow { opacity: 0.5; font-size: 10px; transition: transform 200ms; }
        details[open] > summary .arrow { transform: rotate(90deg); }
        .empty-state-link {
          display: flex; justify-content: space-between; align-items: center;
          padding: 12px 16px; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
          text-decoration: none; color: #f5f6f8; gap: 16px; transition: background 150ms;
        }
        .empty-state-link:hover { background: rgba(255,255,255,0.07); }
        @keyframes sub-shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
      `}</style>
    </>
  );
}
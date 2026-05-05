"use client";

import { useEffect, useState, useCallback } from "react";
import { Nav, Footer } from "../../_components/Layout";

interface EmailAccount {
  id: string;
  email: string;
  provider: "gmail" | "yahoo" | "imap" | "microsoft";
  display_name: string | null;
  connected_at: string;
  last_synced_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  has_google_calendar: boolean;
}

const PROVIDER_ICONS: Record<string, string> = {
  gmail:     "G",
  yahoo:     "Y",
  imap:      "✉",
  microsoft: "M",
};

const PROVIDER_COLORS: Record<string, string> = {
  gmail:     "#EA4335",
  yahoo:     "#7B0099",
  imap:      "#f59e0b",
  microsoft: "#0078d4",
};

function relDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function EmailSettingsPage() {
  const [accounts, setAccounts]           = useState<EmailAccount[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectingOAuth, setConnectingOAuth] = useState<string | null>(null);
  const [connectingGcal, setConnectingGcal] = useState<string | null>(null);
  const [showImap, setShowImap]           = useState(false);
  const [showImapAdvanced, setShowImapAdvanced] = useState(false);
  const [imapForm, setImapForm]           = useState({
    email: "", password: "", imap_host: "", imap_port: "", smtp_host: "", smtp_port: "",
  });
  const [imapLoading, setImapLoading]     = useState(false);
  const [imapError, setImapError]         = useState<string | null>(null);
  const [imapSuccess, setImapSuccess]     = useState(false);
  const [statusBanner, setStatusBanner]   = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/accounts");
      if (!res.ok) throw new Error(`${res.status}`);
      setAccounts(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check status param from OAuth callback
    const p = new URLSearchParams(window.location.search);
    const status = p.get("status");
    const email  = p.get("email");
    const reason = p.get("reason");
    if (status === "connected")     setStatusBanner({ type: "success", msg: `Connected ${email ?? "account"} successfully.` });
    if (status === "gcal_connected") setStatusBanner({ type: "success", msg: `Google Calendar connected for ${email ?? "account"}.` });
    if (status === "gcal_error")     setStatusBanner({ type: "error",   msg: `couldn't connect Google Calendar — ${reason ?? "try again"}` });
    if (status === "error")          setStatusBanner({ type: "error",   msg: `connection didn't go through — ${reason ?? "try again"}` });
    load();
  }, [load]);

  async function handleDisconnect(id: string, email: string) {
    if (!confirm(`Disconnect ${email}? Arthur will stop monitoring this inbox.`)) return;
    setDisconnecting(id);
    try {
      const res = await fetch(`/api/email/accounts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`${res.status}`);
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      alert(`couldn't disconnect — ${(e as Error).message}`);
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleConnectGcal(email: string) {
    setConnectingGcal(email);
    try {
      const res = await fetch("/api/calendar/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json() as { auth_url?: string; error?: string };
      if (!data.auth_url) { alert(data.error ?? "couldn't start Google Calendar sign-in — try again"); return; }
      window.location.href = data.auth_url;
    } catch (e) {
      alert(`something went sideways — ${(e as Error).message}`);
    } finally {
      setConnectingGcal(null);
    }
  }

  async function handleOAuthConnect(provider: "gmail" | "microsoft") {
    setConnectingOAuth(provider);
    try {
      const res = await fetch("/api/email/connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json() as { auth_url?: string; error?: string; setup_required?: boolean; instructions?: string };
      if (data.setup_required) {
        alert(`setup needed: NYLAS_CLIENT_ID not configured.\n\n${data.instructions ?? ""}`);
        return;
      }
      if (!data.auth_url) { alert(data.error ?? "couldn't start sign-in — try again"); return; }
      window.location.href = data.auth_url;
    } catch (e) {
      alert(`something went sideways — ${(e as Error).message}`);
    } finally {
      setConnectingOAuth(null);
    }
  }

  async function handleImapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setImapLoading(true);
    setImapError(null);
    setImapSuccess(false);
    try {
      const body: Record<string, unknown> = { email: imapForm.email, password: imapForm.password };
      if (imapForm.imap_host) body.imap_host = imapForm.imap_host;
      if (imapForm.imap_port) body.imap_port = parseInt(imapForm.imap_port);
      if (imapForm.smtp_host) body.smtp_host = imapForm.smtp_host;
      if (imapForm.smtp_port) body.smtp_port = parseInt(imapForm.smtp_port);

      const res = await fetch("/api/email/connect/imap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok?: boolean; error?: string; setup_required?: boolean };

      if (data.setup_required) {
        setImapError("setup needed: NYLAS_CLIENT_ID not configured. Add it via: fly secrets set NYLAS_CLIENT_ID=<id> -a arthur-online");
        return;
      }
      if (!data.ok) { setImapError(data.error ?? "couldn't connect — check credentials and try again"); return; }

      setImapSuccess(true);
      setImapForm({ email: "", password: "", imap_host: "", imap_port: "", smtp_host: "", smtp_port: "" });
      setShowImap(false);
      await load();
    } catch (err) {
      setImapError((err as Error).message);
    } finally {
      setImapLoading(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 108, paddingLeft: "var(--space-lg)", paddingRight: "var(--space-lg)", paddingBottom: 80, maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--accent-orange)",
            marginBottom: 8,
          }}>Settings / Email</div>
          <h1 style={{ margin: 0, fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 200, letterSpacing: "-0.03em", color: "var(--text-active)", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}>email accounts.</h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 13 }}>
            connected inboxes arthur monitors and processes automatically.
          </p>
        </div>

        {/* Status banner */}
        {statusBanner && (
          <div style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: 8,
            background: statusBanner.type === "success" ? "rgba(74, 222, 128, 0.08)" : "rgba(255, 71, 19, 0.1)",
            border: `1px solid ${statusBanner.type === "success" ? "rgba(74, 222, 128, 0.25)" : "var(--accent-soft)"}`,
            color: statusBanner.type === "success" ? "#4ade80" : "var(--accent)",
            fontSize: 13,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{statusBanner.msg}</span>
            <button onClick={() => setStatusBanner(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.7 }}>✕</button>
          </div>
        )}

        {/* Connected accounts */}
        <section style={{
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--blur-amount))",
          border: "1px solid var(--glass-border)",
          borderRadius: "var(--radius-panel)",
          boxShadow: "var(--glass-shadow)",
          marginBottom: 24,
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--glass-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
              connected accounts
              {accounts.length > 0 && (
                <span style={{ marginLeft: 8, background: "var(--accent-soft)", color: "var(--accent)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  {accounts.length}
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>pulling accounts…</div>
          ) : error ? (
            <div style={{ padding: "20px", color: "var(--accent)", fontSize: 13 }}>Error: {error}</div>
          ) : accounts.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>no inboxes connected yet — add one below.</div>
          ) : (
            <div>
              {accounts.map((acct, i) => (
                <div key={acct.id} style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: i < accounts.length - 1 ? "1px solid var(--glass-border)" : "none",
                  flexWrap: "wrap",
                }}>
                  {/* Provider icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `${PROVIDER_COLORS[acct.provider]}20`,
                    border: `1px solid ${PROVIDER_COLORS[acct.provider]}40`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: PROVIDER_COLORS[acct.provider],
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    {PROVIDER_ICONS[acct.provider] ?? "✉"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, wordBreak: "break-all" }}>{acct.email}</div>
                    <div style={{ color: "var(--text-dim)", fontSize: 11, marginBottom: 8 }}>
                      {acct.display_name && acct.display_name !== acct.email ? `${acct.display_name} · ` : ""}
                      <span style={{ textTransform: "capitalize" }}>{acct.provider}</span>
                      {" · "}Connected {relDate(acct.connected_at)}
                      {acct.last_synced_at ? ` · Last sync ${relDate(acct.last_synced_at)}` : ""}
                    </div>
                    {/* Actions row — wraps on narrow screens */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {/* Status badge */}
                      <div style={{
                        padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: "rgba(74, 222, 128, 0.1)", color: "#4ade80",
                        border: "1px solid rgba(74, 222, 128, 0.2)",
                      }}>
                        ACTIVE
                      </div>

                      {/* Connect Google Calendar */}
                      {acct.provider === "gmail" && !acct.has_google_calendar && (
                        <button
                          onClick={() => handleConnectGcal(acct.email)}
                          disabled={connectingGcal === acct.email}
                          title="Authorise Google Calendar access for this account"
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "rgba(66, 133, 244, 0.1)",
                            border: "1px solid rgba(66, 133, 244, 0.35)",
                            borderRadius: 6, padding: "5px 11px", cursor: "pointer",
                            color: "#4285f4", fontSize: 11, fontWeight: 600,
                            opacity: connectingGcal === acct.email ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {connectingGcal === acct.email ? "Redirecting…" : "Connect Calendar"}
                        </button>
                      )}
                      {acct.provider === "gmail" && acct.has_google_calendar && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                          background: "rgba(66, 133, 244, 0.08)", color: "#4285f4",
                          border: "1px solid rgba(66, 133, 244, 0.2)",
                        }}>
                          Cal ✓
                        </div>
                      )}

                      {/* Disconnect */}
                      <button
                        onClick={() => handleDisconnect(acct.id, acct.email)}
                        disabled={disconnecting === acct.id}
                        style={{
                          background: "none", border: "1px solid var(--border-strong)",
                          borderRadius: 6, padding: "5px 12px", cursor: "pointer",
                          color: "var(--text-dim)", fontSize: 12,
                          opacity: disconnecting === acct.id ? 0.5 : 1,
                        }}
                      >
                        {disconnecting === acct.id ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add accounts */}
        <section>
          <h2 style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
            add account
          </h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Gmail OAuth */}
            <button
              onClick={() => handleOAuthConnect("gmail")}
              disabled={connectingOAuth === "gmail"}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "var(--glass-bg)", backdropFilter: "blur(var(--blur-amount))",
                border: "1px solid var(--glass-border)",
                borderRadius: 10, padding: "12px 20px", cursor: "pointer",
                color: "var(--text-active)", fontSize: 13, fontWeight: 500,
                opacity: connectingOAuth === "gmail" ? 0.6 : 1,
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <span style={{ width: 20, height: 20, borderRadius: 4, background: "#EA433520", border: "1px solid #EA433540", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#EA4335" }}>G</span>
              {connectingOAuth === "gmail" ? "Redirecting…" : "+ Connect Gmail"}
            </button>

            {/* Microsoft OAuth */}
            <button
              onClick={() => handleOAuthConnect("microsoft")}
              disabled={connectingOAuth === "microsoft"}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "var(--glass-bg)", backdropFilter: "blur(var(--blur-amount))",
                border: "1px solid var(--glass-border)",
                borderRadius: 10, padding: "12px 20px", cursor: "pointer",
                color: "var(--text-active)", fontSize: 13, fontWeight: 500,
                opacity: connectingOAuth === "microsoft" ? 0.6 : 1,
              }}
            >
              <span style={{ width: 20, height: 20, borderRadius: 4, background: "#0078d420", border: "1px solid #0078d440", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#0078d4" }}>M</span>
              {connectingOAuth === "microsoft" ? "Redirecting…" : "+ Connect Microsoft 365"}
            </button>

            {/* IMAP toggle */}
            <button
              onClick={() => { setShowImap(v => !v); setImapError(null); setImapSuccess(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: showImap ? "var(--glass-bg-strong)" : "var(--glass-bg)",
                backdropFilter: "blur(var(--blur-amount))",
                border: `1px solid ${showImap ? "var(--accent-orange)" : "var(--glass-border)"}`,
                borderRadius: 10, padding: "12px 20px", cursor: "pointer",
                color: "var(--text-active)", fontSize: 13, fontWeight: 500,
              }}
            >
              <span style={{ width: 20, height: 20, borderRadius: 4, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#f59e0b" }}>✉</span>
              + Connect IMAP (Yahoo / AOL / other)
            </button>
          </div>

          {/* IMAP form */}
          {showImap && (
            <form onSubmit={handleImapSubmit} style={{
              marginTop: 16,
              background: "var(--glass-bg)",
              backdropFilter: "blur(var(--blur-amount))",
              border: "1px solid var(--glass-border)",
              borderRadius: 12,
              padding: 20,
            }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>IMAP / App Password</h3>
              <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
                For Yahoo and AOL, use an <strong>app password</strong> — not your regular login password.
                Generate one at <a href="https://security.yahoo.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>security.yahoo.com</a> → Security → App Passwords.
              </p>

              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email address</label>
                  <input
                    type="email" required
                    value={imapForm.email}
                    onChange={e => setImapForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="you@yahoo.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>App password</label>
                  <input
                    type="password" required
                    value={imapForm.password}
                    onChange={e => setImapForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="xxxx xxxx xxxx xxxx"
                    style={inputStyle}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowImapAdvanced(v => !v)}
                style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12, padding: 0 }}
              >
                {showImapAdvanced ? "▾" : "▸"} Custom IMAP / SMTP settings
              </button>

              {showImapAdvanced && (
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr auto 1fr auto", marginTop: 12, alignItems: "end" }}>
                  <div>
                    <label style={labelStyle}>IMAP host</label>
                    <input value={imapForm.imap_host} onChange={e => setImapForm(f => ({ ...f, imap_host: e.target.value }))} placeholder="imap.mail.yahoo.com" style={inputStyle} />
                  </div>
                  <div style={{ width: 70 }}>
                    <label style={labelStyle}>Port</label>
                    <input value={imapForm.imap_port} onChange={e => setImapForm(f => ({ ...f, imap_port: e.target.value }))} placeholder="993" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>SMTP host</label>
                    <input value={imapForm.smtp_host} onChange={e => setImapForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder="smtp.mail.yahoo.com" style={inputStyle} />
                  </div>
                  <div style={{ width: 70 }}>
                    <label style={labelStyle}>Port</label>
                    <input value={imapForm.smtp_port} onChange={e => setImapForm(f => ({ ...f, smtp_port: e.target.value }))} placeholder="465" style={inputStyle} />
                  </div>
                </div>
              )}

              {imapError && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(255,71,19,0.08)", border: "1px solid rgba(255,71,19,0.2)", borderRadius: 8, color: "var(--accent)", fontSize: 12 }}>
                  {imapError}
                </div>
              )}
              {imapSuccess && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, color: "#4ade80", fontSize: 12 }}>
                  Account connected successfully.
                </div>
              )}

              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <button type="submit" disabled={imapLoading} style={submitBtnStyle}>
                  {imapLoading ? "Connecting…" : "Connect IMAP account"}
                </button>
                <button type="button" onClick={() => setShowImap(false)} style={cancelBtnStyle}>Cancel</button>
              </div>
            </form>
          )}
        </section>

        {/* Info note */}
        <div style={{ marginTop: 32, padding: "14px 18px", background: "var(--glass-bg)", backdropFilter: "blur(var(--blur-amount))", border: "1px solid var(--glass-border)", borderRadius: 10, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <strong style={{ color: "var(--text)" }}>Note:</strong> OAuth connect requires <code>NYLAS_CLIENT_ID</code> and <code>NYLAS_CLIENT_SECRET</code> to be set as Fly secrets.
          If not yet configured, run: <code>fly secrets set NYLAS_CLIENT_ID=&lt;id&gt; NYLAS_CLIENT_SECRET=&lt;secret&gt; -a arthur-online</code>.
          The Nylas Client ID is <code>21640001-154e-426f-8710-545c97318298</code> (already in vault).
        </div>
      </main>
      <Footer />
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--glass-bg-strong)",
  border: "1px solid var(--glass-border)",
  borderRadius: 7,
  padding: "8px 12px",
  color: "var(--text-active)",
  fontSize: 13,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-dim)",
  marginBottom: 4,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const submitBtnStyle: React.CSSProperties = {
  background: "var(--accent-orange)",
  color: "var(--accent-text-on)",
  border: "none",
  borderRadius: 7,
  padding: "9px 18px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const cancelBtnStyle: React.CSSProperties = {
  background: "none",
  color: "var(--text-muted)",
  border: "1px solid var(--glass-border)",
  borderRadius: 7,
  padding: "9px 18px",
  cursor: "pointer",
  fontSize: 13,
};

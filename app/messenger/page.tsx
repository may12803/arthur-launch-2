"use client";

import { useEffect, useState, useRef, useCallback } from "react";

interface MetaPage {
  id: string;
  page_id: string;
  page_name: string;
  connected_at: string;
}

interface MetaMessage {
  id: string;
  page_id: string;
  sender_id: string;
  sender_name: string | null;
  message_text: string | null;
  direction: "inbound" | "outbound";
  responded_at: string | null;
  response_text: string | null;
  requires_review: boolean;
  created_at: string;
}

interface Thread {
  sender_id: string;
  sender_name: string | null;
  page_id: string;
  messages: MetaMessage[];
  last_at: string;
  unreviewed: number;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const inputSt: React.CSSProperties = {
  background: "var(--glass-bg)",
  border: "1px solid var(--glass-border)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-active)",
  fontSize: 12,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  height: 36,
};

export default function MessengerPage() {
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMsg, setEditMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  // activeRef avoids including `active` in fetchData deps (would cause re-fetch loop)
  const activeRef = useRef<Thread | null>(null);
  activeRef.current = active;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagesRes, msgsRes] = await Promise.all([
        fetch("/api/meta/pages"),
        fetch("/api/meta/messages"),
      ]);
      const pagesData = await pagesRes.json() as { pages?: MetaPage[] };
      const msgsData = await msgsRes.json() as { messages?: MetaMessage[] };
      const newPages = pagesData.pages ?? [];
      const msgs = msgsData.messages ?? [];
      setPages(newPages);

      const threadMap = new Map<string, Thread>();
      for (const m of msgs) {
        const tKey = m.direction === "inbound" ? `${m.page_id}:${m.sender_id}` : null;
        if (!tKey) continue;
        if (!threadMap.has(tKey)) {
          threadMap.set(tKey, { sender_id: m.sender_id, sender_name: m.sender_name, page_id: m.page_id, messages: [], last_at: m.created_at, unreviewed: 0 });
        }
        const t = threadMap.get(tKey)!;
        t.messages.push(m);
        if (m.created_at > t.last_at) t.last_at = m.created_at;
        if (m.requires_review && m.direction === "inbound") t.unreviewed++;
        if (m.response_text) {
          t.messages.push({ ...m, id: `${m.id}-response`, direction: "outbound", message_text: m.response_text } as MetaMessage);
        }
      }
      const sorted = [...threadMap.values()].sort((a, b) => b.last_at.localeCompare(a.last_at));
      setThreads(sorted);
      // Only auto-select first thread if nothing is currently selected
      if (sorted.length > 0 && !activeRef.current) setActive(sorted[0]);
    } finally {
      setLoading(false);
    }
  }, []); // no `active` dependency — use ref

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResend = async () => {
    if (!active || !editMsg.trim()) return;
    setSending(true);
    setSendErr(null);
    try {
      const res = await fetch("/api/meta/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: active.page_id, sender_id: active.sender_id, message: editMsg.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) { setEditMsg(""); await fetchData(); }
      else setSendErr(data.error ?? "Send failed");
    } catch (err: unknown) {
      setSendErr(err instanceof Error ? err.message : "network error");
    } finally {
      setSending(false);
    }
  };

  const [connectPageId, setConnectPageId] = useState("");
  const [connectPageName, setConnectPageName] = useState("");
  const [connectToken, setConnectToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState<string | null>(null);

  async function handleConnectPage(e: React.FormEvent) {
    e.preventDefault();
    if (!connectPageId.trim() || !connectPageName.trim() || !connectToken.trim()) return;
    setConnecting(true);
    setConnectStatus(null);
    try {
      const res = await fetch("/api/meta/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: connectPageId.trim(), page_name: connectPageName.trim(), access_token: connectToken.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setConnectStatus("page connected.");
        setConnectPageId(""); setConnectPageName(""); setConnectToken("");
        await fetchData();
      } else {
        setConnectStatus("error: " + (data.error ?? res.statusText));
      }
    } catch (err: unknown) {
      setConnectStatus("network error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setConnecting(false);
    }
  }

  const notConfigured = pages.length === 0 && !loading;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  const codeBlockStyle: React.CSSProperties = {
    display: "block",
    background: "var(--glass-bg-strong)",
    border: "1px solid var(--glass-border)",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 11,
    fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
    color: "var(--text-main)",
    overflowX: "auto",
    whiteSpace: "pre",
    marginTop: 4,
    marginBottom: 4,
  };

  return (
    <div style={{ minHeight: "100%", paddingTop: 32, background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 80px" }}>

        {/* Header */}
        <div style={{ paddingTop: 24, paddingBottom: 28, borderBottom: "1px solid var(--line-separator)", marginBottom: 28, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#BAB5AE", marginBottom: 8 }}>
              Meta Business Messaging
            </div>
            <h1 style={{ fontFamily: "var(--font-lora, Lora, Georgia, serif)", margin: 0, fontWeight: 500, fontSize: "28px", letterSpacing: "-0.025em", color: "var(--text-active)", lineHeight: 1.2 }}>
              Messenger
            </h1>
          </div>
          <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 10, color: "var(--text-muted)", paddingBottom: 4 }}>
            {dateStr}
          </div>
        </div>

        {/* Setup instructions (not configured) */}
        {notConfigured && (
          <div style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", backdropFilter: "blur(var(--blur-amount))", borderRadius: "var(--radius-panel)", padding: "var(--space-lg)", maxWidth: 640, marginBottom: 28 }}>
            <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#BAB5AE", marginBottom: 8 }}>Setup Required</div>
            <h2 style={{ fontFamily: "var(--font-lora, Lora, Georgia, serif)", margin: "0 0 12px", fontWeight: 500, fontSize: 20, letterSpacing: "-0.02em", color: "var(--text-active)" }}>No pages connected.</h2>
            <p style={{ color: "var(--text-main)", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>Follow these steps to enable auto-responses.</p>
            <ol style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 2.2, paddingLeft: 20, listStyleType: "decimal" }}>
              <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent-orange)" }}>developers.facebook.com</a> → apps → create app (business type)</li>
              <li>Add the Messenger product to your app</li>
              <li>In Messenger settings → generate page access token for Dabney &amp; Co page</li>
              <li>Configure webhook URL:<pre style={codeBlockStyle}>https://arthur-online.fly.dev/api/meta/webhook</pre></li>
              <li>Set your verify token:<pre style={codeBlockStyle}>fly secrets set META_VERIFY_TOKEN=&lt;random-string&gt; -a arthur-online</pre></li>
              <li>Subscribe to:<pre style={codeBlockStyle}>{`messages\nmessaging_postbacks`}</pre></li>
              <li>Set your page token:<pre style={codeBlockStyle}>fly secrets set META_PAGE_ACCESS_TOKEN_DABNEY=&lt;token&gt; -a arthur-online</pre></li>
            </ol>
          </div>
        )}

        {/* Connect a page form */}
        <div style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", backdropFilter: "blur(var(--blur-amount))", borderRadius: "var(--radius-panel)", padding: "var(--space-lg)", maxWidth: 480, marginBottom: 28 }}>
          <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#BAB5AE", marginBottom: 8 }}>Connect Page</div>
          <h3 style={{ fontFamily: "var(--font-lora, Lora, Georgia, serif)", margin: "0 0 16px", fontWeight: 500, fontSize: 16, letterSpacing: "-0.02em", color: "var(--text-active)" }}>Add a page.</h3>
          <form onSubmit={handleConnectPage} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input aria-label="Facebook Page ID" value={connectPageId} onChange={e => setConnectPageId(e.target.value)} placeholder="page ID" required style={{ ...inputSt, fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }} />
            <input aria-label="Facebook Page name" value={connectPageName} onChange={e => setConnectPageName(e.target.value)} placeholder="page name (e.g. Dabney & Co)" required style={inputSt} />
            <input aria-label="Page access token" value={connectToken} onChange={e => setConnectToken(e.target.value)} placeholder="page access token" type="password" required style={{ ...inputSt, fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
              <button type="submit" disabled={connecting} style={{ background: "var(--accent-orange)", color: "var(--accent-text-on)", border: "none", borderRadius: "var(--radius-pill)", padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: connecting ? "not-allowed" : "pointer", opacity: connecting ? 0.7 : 1 }}>
                {connecting ? "connecting…" : "connect page →"}
              </button>
              {connectStatus && (
                <span style={{ fontSize: 11, color: connectStatus.startsWith("error") ? "#ef4444" : "var(--accent-orange)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}>
                  {connectStatus}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Two-column thread UI — only when pages are connected */}
        {!notConfigured && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, height: "calc(100vh - 320px)", minHeight: 400 }}>
            {/* Conversation list */}
            <div style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", backdropFilter: "blur(var(--blur-amount))", borderRadius: "var(--radius-panel)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-separator)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#BAB5AE" }}>Conversations</div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#0B504F", background: "#E5F0EF", borderRadius: 6, padding: "1px 6px", fontVariantNumeric: "tabular-nums" }}>{threads.length}</span>
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {loading && (
                  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {[1, 2, 3].map(i => <div key={i} style={{ height: 64, borderRadius: 8, background: "rgba(255,255,255,0.04)" }} />)}
                  </div>
                )}
                {threads.length === 0 && !loading && (
                  <div style={{ padding: "24px 16px", color: "var(--text-muted)", fontSize: 12 }}>no conversations yet.</div>
                )}
                {threads.map(t => (
                  <button key={`${t.page_id}:${t.sender_id}`} onClick={() => setActive(t)} style={{ width: "100%", textAlign: "left", padding: "13px 16px", background: active?.sender_id === t.sender_id ? "#E5F0EF" : "transparent", border: "none", borderBottom: "1px solid #F3F0EA", borderLeft: active?.sender_id === t.sender_id ? "2px solid #0B504F" : "2px solid transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 13, color: "var(--text-active)" }}>{t.sender_name ?? t.sender_id.slice(-8)}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {t.unreviewed > 0 && <span style={{ background: "var(--accent-orange)", color: "var(--accent-text-on)", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 10 }}>{t.unreviewed}</span>}
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--text-muted)" }}>{relTime(t.last_at)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.messages.at(-1)?.message_text?.slice(0, 40) ?? "—"}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Thread detail */}
            <div style={{ background: "var(--glass-bg-strong)", border: "1px solid var(--glass-border)", backdropFilter: "blur(var(--blur-amount))", borderRadius: "var(--radius-panel)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {active ? (
                <>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line-separator)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 400, fontSize: 16, color: "var(--text-active)" }}>{active.sender_name ?? active.sender_id.slice(-8)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>{pages.find(p => p.page_id === active.page_id)?.page_name ?? active.page_id}</div>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {active.messages.sort((a, b) => a.created_at.localeCompare(b.created_at)).map(m => (
                      <div key={m.id} style={{ alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                        <div style={{ background: m.direction === "outbound" ? "var(--accent-orange)" : "var(--glass-bg)", border: m.direction === "outbound" ? "none" : `1px solid ${m.requires_review ? "rgba(239,68,68,0.4)" : "var(--glass-border)"}`, borderRadius: m.direction === "outbound" ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "10px 14px" }}>
                          <div style={{ fontSize: 13, lineHeight: 1.5, color: m.direction === "outbound" ? "var(--accent-text-on)" : "var(--text-active)" }}>{m.message_text}</div>
                          <div style={{ fontSize: 10, color: m.direction === "outbound" ? "rgba(250,248,245,0.75)" : "#BAB5AE", marginTop: 5, fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>
                            {m.direction === "outbound" ? "arthur → sent" : "customer"} · {new Date(m.created_at).toLocaleTimeString()}
                            {m.requires_review && <span style={{ color: "#ef4444", marginLeft: 8 }}>⚠ needs review</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "16px 20px", borderTop: "1px solid var(--line-separator)" }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <textarea value={editMsg} onChange={e => setEditMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleResend(); } }} placeholder="edit and resend a response…" rows={2} style={{ flex: 1, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 10, padding: "10px 14px", color: "var(--text-active)", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit" }} />
                      <button onClick={handleResend} disabled={sending || !editMsg.trim()} style={{ background: editMsg.trim() ? "var(--accent-orange)" : "var(--glass-bg-strong)", color: editMsg.trim() ? "var(--accent-text-on)" : "var(--text-muted)", border: "none", borderRadius: "var(--radius-pill)", padding: "0 20px", cursor: editMsg.trim() ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, flexShrink: 0, transition: "background 0.15s" }}>
                        {sending ? "sending…" : "send →"}
                      </button>
                    </div>
                    {sendErr && <p style={{ color: "#ef4444", fontSize: 11, marginTop: 6, fontFamily: "ui-monospace, monospace" }}>{sendErr}</p>}
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  {loading ? "loading conversations…" : "select a conversation"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Shimmer animation without style jsx */}
      <style>{`@keyframes shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }`}</style>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Nav, Footer } from "../_components/Layout";

interface MetaPage {
  id:           string;
  page_id:      string;
  page_name:    string;
  connected_at: string;
}

interface MetaMessage {
  id:             string;
  page_id:        string;
  sender_id:      string;
  sender_name:    string | null;
  message_text:   string | null;
  direction:      "inbound" | "outbound";
  responded_at:   string | null;
  response_text:  string | null;
  requires_review:boolean;
  created_at:     string;
}

interface Thread {
  sender_id:   string;
  sender_name: string | null;
  page_id:     string;
  messages:    MetaMessage[];
  last_at:     string;
  unreviewed:  number;
}

export default function MessengerPage() {
  const [pages,    setPages]    = useState<MetaPage[]>([]);
  const [threads,  setThreads]  = useState<Thread[]>([]);
  const [active,   setActive]   = useState<Thread | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [editMsg,  setEditMsg]  = useState("");
  const [sending,  setSending]  = useState(false);
  const [sendErr,  setSendErr]  = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagesRes, msgsRes] = await Promise.all([
        fetch("/api/meta/pages"),
        fetch("/api/meta/messages"),
      ]);

      const pagesData = await pagesRes.json() as { pages?: MetaPage[]; error?: string };
      const msgsData  = await msgsRes.json() as { messages?: MetaMessage[]; error?: string };

      setPages(pagesData.pages ?? []);

      // Group messages into threads by sender_id + page_id
      const msgs = msgsData.messages ?? [];
      const threadMap = new Map<string, Thread>();

      for (const m of msgs) {
        const key = `${m.page_id}:${m.sender_id === m.page_id ? "outbound" : m.sender_id}`;
        const senderId = m.direction === "inbound" ? m.sender_id : m.page_id;
        const threadKey = `${m.page_id}:${m.direction === "inbound" ? m.sender_id : m.sender_id}`;
        const tKey = m.direction === "inbound" ? `${m.page_id}:${m.sender_id}` : null;
        if (!tKey) continue;

        if (!threadMap.has(tKey)) {
          threadMap.set(tKey, {
            sender_id:   m.sender_id,
            sender_name: m.sender_name,
            page_id:     m.page_id,
            messages:    [],
            last_at:     m.created_at,
            unreviewed:  0,
          });
        }

        const t = threadMap.get(tKey)!;
        t.messages.push(m);
        if (m.created_at > t.last_at) t.last_at = m.created_at;
        if (m.requires_review && m.direction === "inbound") t.unreviewed++;

        // Also add outbound responses to thread
        if (m.response_text) {
          t.messages.push({
            ...m,
            id:        `${m.id}-response`,
            direction: "outbound",
            message_text: m.response_text,
          } as MetaMessage);
        }
      }

      const sorted = [...threadMap.values()].sort((a, b) =>
        b.last_at.localeCompare(a.last_at)
      );

      setThreads(sorted);
      if (sorted.length > 0 && !active) setActive(sorted[0]);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => { fetchData(); }, []);

  const handleResend = async () => {
    if (!active || !editMsg.trim()) return;
    setSending(true);
    setSendErr(null);

    const res = await fetch("/api/meta/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id:    active.page_id,
        sender_id:  active.sender_id,
        message:    editMsg.trim(),
      }),
    });

    const data = await res.json() as { ok?: boolean; error?: string };
    if (data.ok) {
      setEditMsg("");
      await fetchData();
    } else {
      setSendErr(data.error ?? "Send failed");
    }
    setSending(false);
  };

  const notConfigured = pages.length === 0 && !loading;

  // Connect page form state
  const [connectPageId,    setConnectPageId]    = useState("");
  const [connectPageName,  setConnectPageName]  = useState("");
  const [connectToken,     setConnectToken]     = useState("");
  const [connecting,       setConnecting]       = useState(false);
  const [connectStatus,    setConnectStatus]    = useState<string | null>(null);

  async function handleConnectPage(e: React.FormEvent) {
    e.preventDefault();
    if (!connectPageId.trim() || !connectPageName.trim() || !connectToken.trim()) return;
    setConnecting(true);
    setConnectStatus(null);
    try {
      const res = await fetch("/api/meta/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: connectPageId.trim(),
          page_name: connectPageName.trim(),
          access_token: connectToken.trim(),
        }),
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

  const codeStyle: React.CSSProperties = {
    display: "block",
    background: "#0a0a0a",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 12,
    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
    color: "var(--text-dim)",
    overflowX: "auto",
    whiteSpace: "pre",
    marginTop: 4,
    marginBottom: 4,
  };

  return (
    <>
      <Nav />
      <main style={{ minHeight: "calc(100vh - 60px)" }}>
        <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)", letterSpacing: "-0.02em" }}>messenger.</h1>
            <p style={{ color: "var(--text-dim)", fontSize: 14 }}>
              auto-respond to DMs across your meta business pages.
            </p>
          </div>

          {notConfigured && (
            <div style={{
              background: "var(--panel-elev)",
              border: "1px solid var(--border-strong)",
              borderRadius: 12,
              padding: 32,
              maxWidth: 640,
              marginBottom: 32,
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, letterSpacing: "-0.01em" }}>setup required</h2>
              <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 24 }}>
                no meta pages connected yet. follow these steps to enable auto-responses.
              </p>
              <ol style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 2, paddingLeft: 20, listStyleType: "decimal" }}>
                <li>go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>developers.facebook.com</a> → apps → create app (business type)</li>
                <li>add the messenger product to your app</li>
                <li>in messenger settings → generate page access token for dabney &amp; co page</li>
                <li>configure webhook URL:
                  <pre style={codeStyle}>https://arthur-online.fly.dev/api/meta/webhook</pre>
                </li>
                <li>set your verify token as a fly secret:
                  <pre style={codeStyle}>fly secrets set META_VERIFY_TOKEN=&lt;random-string&gt; -a arthur-online</pre>
                </li>
                <li>subscribe to:
                  <pre style={codeStyle}>messages{"\n"}messaging_postbacks</pre>
                </li>
                <li>set your page token:
                  <pre style={codeStyle}>fly secrets set META_PAGE_ACCESS_TOKEN_DABNEY=&lt;token&gt; -a arthur-online</pre>
                </li>
              </ol>
            </div>
          )}

          {/* Connect a page form — always visible */}
          <div style={{
            background: "var(--panel-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            padding: 24,
            maxWidth: 480,
            marginBottom: 32,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.01em" }}>connect a page</h3>
            <form onSubmit={handleConnectPage} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={connectPageId}
                onChange={e => setConnectPageId(e.target.value)}
                placeholder="page ID"
                required
                style={{ fontSize: 13, padding: "8px 12px", height: 38, minHeight: "unset", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}
              />
              <input
                value={connectPageName}
                onChange={e => setConnectPageName(e.target.value)}
                placeholder="page name (e.g. Dabney & Co)"
                required
                style={{ fontSize: 13, padding: "8px 12px", height: 38, minHeight: "unset" }}
              />
              <input
                value={connectToken}
                onChange={e => setConnectToken(e.target.value)}
                placeholder="page access token"
                type="password"
                required
                style={{ fontSize: 13, padding: "8px 12px", height: 38, minHeight: "unset", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}
              />
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <button
                  type="submit"
                  className="cta-btn"
                  disabled={connecting}
                  style={{ fontSize: 12, padding: "8px 16px", minHeight: "unset" }}
                >
                  {connecting ? "connecting…" : "connect page →"}
                </button>
                {connectStatus && (
                  <span style={{
                    fontSize: 12,
                    color: connectStatus.startsWith("error") ? "#ef4444" : "var(--lobe-upgrades)",
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                  }}>
                    {connectStatus}
                  </span>
                )}
              </div>
            </form>
          </div>

          {!notConfigured && (
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, height: "calc(100vh - 220px)" }}>
              {/* Thread list */}
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #222", fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Conversations ({threads.length})
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {loading && <div style={{ padding: 20, color: "var(--text-dim)", fontSize: 14 }}>Loading...</div>}
                  {threads.map(t => (
                    <button
                      key={`${t.page_id}:${t.sender_id}`}
                      onClick={() => setActive(t)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "14px 20px",
                        background: active?.sender_id === t.sender_id ? "var(--panel-elev)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid #1a1a1a",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                          {t.sender_name ?? t.sender_id.slice(-8)}
                        </span>
                        {t.unreviewed > 0 && (
                          <span style={{ background: "#ff4713", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 10 }}>
                            {t.unreviewed}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.messages.at(-1)?.message_text?.slice(0, 40) ?? "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                        {new Date(t.last_at).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Thread detail */}
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {active ? (
                  <>
                    <div style={{ padding: "16px 24px", borderBottom: "1px solid #222", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16 }}>{active.sender_name ?? active.sender_id.slice(-8)}</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{pages.find(p => p.page_id === active.page_id)?.page_name ?? active.page_id}</div>
                      </div>
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                      {active.messages
                        .sort((a, b) => a.created_at.localeCompare(b.created_at))
                        .map(m => (
                          <div
                            key={m.id}
                            style={{
                              alignSelf:    m.direction === "outbound" ? "flex-end" : "flex-start",
                              maxWidth:     "70%",
                              background:   m.direction === "outbound" ? "#1e3a5f" : "var(--panel-elev)",
                              border:       `1px solid ${m.requires_review ? "#ff4713" : "#222"}`,
                              borderRadius: 12,
                              padding:      "10px 16px",
                            }}
                          >
                            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{m.message_text}</div>
                            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }}>
                              {m.direction === "outbound" ? "Arthur → sent" : "customer"} · {new Date(m.created_at).toLocaleTimeString()}
                              {m.requires_review && <span style={{ color: "#ff4713", marginLeft: 8 }}>⚠ needs review</span>}
                            </div>
                          </div>
                        ))}
                    </div>

                    <div style={{ padding: 20, borderTop: "1px solid #222" }}>
                      <div style={{ display: "flex", gap: 12 }}>
                        <textarea
                          value={editMsg}
                          onChange={e => setEditMsg(e.target.value)}
                          placeholder="Edit and resend a response…"
                          rows={2}
                          style={{
                            flex: 1,
                            background: "#0a0a0a",
                            border: "1px solid var(--border-strong)",
                            borderRadius: 8,
                            padding: "10px 14px",
                            color: "var(--text)",
                            fontSize: 14,
                            resize: "none",
                          }}
                        />
                        <button
                          onClick={handleResend}
                          disabled={sending || !editMsg.trim()}
                          style={{
                            background: editMsg.trim() ? "var(--accent)" : "#333",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "0 20px",
                            cursor: editMsg.trim() ? "pointer" : "not-allowed",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {sending ? "Sending…" : "Send →"}
                        </button>
                      </div>
                      {sendErr && <p style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{sendErr}</p>}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 14 }}>
                    Select a conversation
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Nav, Footer } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { EmptyState } from "../_components/EmptyState";

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
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-2) var(--space-3)",
  color: "var(--text-active)",
  fontSize: "var(--fs-xs)",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  height: 36,
  minHeight: "unset",
};

export default function MessengerPage() {
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMsg, setEditMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pagesRes, msgsRes] = await Promise.all([
        fetch("/api/meta/pages"),
        fetch("/api/meta/messages"),
      ]);
      const pagesData = await pagesRes.json() as { pages?: MetaPage[]; error?: string };
      const msgsData = await msgsRes.json() as { messages?: MetaMessage[]; error?: string };
      setPages(pagesData.pages ?? []);
      const msgs = msgsData.messages ?? [];
      const threadMap = new Map<string, Thread>();
      for (const m of msgs) {
        const tKey = m.direction === "inbound" ? `${m.page_id}:${m.sender_id}` : null;
        if (!tKey) continue;
        if (!threadMap.has(tKey)) {
          threadMap.set(tKey, {
            sender_id: m.sender_id,
            sender_name: m.sender_name,
            page_id: m.page_id,
            messages: [],
            last_at: m.created_at,
            unreviewed: 0,
          });
        }
        const t = threadMap.get(tKey)!;
        t.messages.push(m);
        if (m.created_at > t.last_at) t.last_at = m.created_at;
        if (m.requires_review && m.direction === "inbound") t.unreviewed++;
        if (m.response_text) {
          t.messages.push({
            ...m,
            id: `${m.id}-response`,
            direction: "outbound",
            message_text: m.response_text,
          } as MetaMessage);
        }
      }
      const sorted = [...threadMap.values()].sort((a, b) => b.last_at.localeCompare(a.last_at));
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
      body: JSON.stringify({ page_id: active.page_id, sender_id: active.sender_id, message: editMsg.trim() }),
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

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  const codeBlockStyle: React.CSSProperties = {
    display: "block",
    background: "var(--glass-bg-strong)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-2) var(--space-4)",
    fontSize: "var(--fs-mono)",
    fontFamily: "var(--font-mono)",
    color: "var(--text-main)",
    overflowX: "auto",
    whiteSpace: "pre",
    marginTop: "var(--space-1)",
    marginBottom: "var(--space-1)",
  };

  return (
    <>
      <Nav />
      <div style={{ minHeight: "calc(100vh - 108px)", paddingTop: 108, background: "var(--bg-base)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 var(--space-6) var(--space-11)" }}>

          {/* Header */}
          <PageHeader
            eyebrow="meta business messaging"
            title="messenger."
            actions={
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", color: "var(--text-muted)" }}>
                {dateStr}
              </div>
            }
            style={{ paddingTop: "var(--space-6)", paddingBottom: "var(--space-7)", borderBottom: "1px solid var(--line-separator)", marginBottom: "var(--space-7)" }}
          />

          {/* Setup instructions (not configured) */}
          {notConfigured && (
            <GlassPanel
              style={{
                padding: "var(--space-7)",
                maxWidth: 640,
                marginBottom: "var(--space-7)",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-1)" }}>
                setup required
              </div>
              <h2 style={{ margin: "0 0 var(--space-3)", fontWeight: 400, fontSize: 20, color: "var(--text-active)" }}>no pages connected.</h2>
              <p style={{ color: "var(--text-main)", fontSize: "var(--fs-small)", marginBottom: "var(--space-5)", lineHeight: 1.6 }}>
                follow these steps to enable auto-responses.
              </p>
              <ol style={{ color: "var(--text-muted)", fontSize: "var(--fs-xs)", lineHeight: 2.2, paddingLeft: "var(--space-5)", listStyleType: "decimal" }}>
                <li>go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: "var(--accent-orange)" }}>developers.facebook.com</a> → apps → create app (business type)</li>
                <li>add the messenger product to your app</li>
                <li>in messenger settings → generate page access token for dabney &amp; co page</li>
                <li>configure webhook URL:
                  <pre style={codeBlockStyle}>https://arthur-online.fly.dev/api/meta/webhook</pre>
                </li>
                <li>set your verify token:
                  <pre style={codeBlockStyle}>fly secrets set META_VERIFY_TOKEN=&lt;random-string&gt; -a arthur-online</pre>
                </li>
                <li>subscribe to:
                  <pre style={codeBlockStyle}>messages{"\n"}messaging_postbacks</pre>
                </li>
                <li>set your page token:
                  <pre style={codeBlockStyle}>fly secrets set META_PAGE_ACCESS_TOKEN_DABNEY=&lt;token&gt; -a arthur-online</pre>
                </li>
              </ol>
            </GlassPanel>
          )}

          {/* Connect a page form */}
          <GlassPanel
            style={{
              padding: "var(--space-7)",
              maxWidth: 480,
              marginBottom: "var(--space-7)",
            }}
          >
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-1)" }}>
              connect page
            </div>
            <h3 style={{ margin: "0 0 var(--space-4)", fontWeight: 400, fontSize: 18, color: "var(--text-active)" }}>add a page.</h3>
            <form onSubmit={handleConnectPage} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <input
                aria-label="Facebook Page ID"
                value={connectPageId}
                onChange={e => setConnectPageId(e.target.value)}
                placeholder="page ID"
                required
                style={{ ...inputSt, fontFamily: "var(--font-mono)" }}
              />
              <input
                aria-label="Facebook Page name"
                value={connectPageName}
                onChange={e => setConnectPageName(e.target.value)}
                placeholder="page name (e.g. Dabney & Co)"
                required
                style={inputSt}
              />
              <input
                aria-label="Page access token"
                value={connectToken}
                onChange={e => setConnectToken(e.target.value)}
                placeholder="page access token"
                type="password"
                required
                style={{ ...inputSt, fontFamily: "var(--font-mono)" }}
              />
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginTop: "var(--space-1)" }}>
                <button
                  type="submit"
                  disabled={connecting}
                  style={{
                    background: "var(--accent-orange)",
                    color: "var(--accent-text-on)",
                    border: "none",
                    borderRadius: "var(--radius-pill)",
                    padding: "var(--space-2) var(--space-5)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 700,
                    cursor: connecting ? "not-allowed" : "pointer",
                    opacity: connecting ? 0.7 : 1,
                  }}
                >
                  {connecting ? "connecting…" : "connect page →"}
                </button>
                {connectStatus && (
                  <span style={{
                    fontSize: "var(--fs-mono)",
                    color: connectStatus.startsWith("error") ? "var(--tint-red)" : "var(--accent-orange)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {connectStatus}
                  </span>
                )}
              </div>
            </form>
          </GlassPanel>

          {/* Two-column thread UI */}
          {!notConfigured && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "260px 1fr",
              gap: "var(--space-4)",
              height: "calc(100vh - 320px)",
              minHeight: 400,
            }}>
              {/* Conversation list */}
              <GlassPanel
                style={{
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "var(--radius-panel)",
                }}
              >
                <div style={{
                  padding: "var(--space-4)",
                  borderBottom: "1px solid var(--line-separator)",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                    conversations
                  </div>
                  <TokenChip
                    label={String(threads.length)}
                    size="xs"
                    color="orange"
                    style={{ background: "var(--accent-orange-soft)" }}
                  />
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {loading && (
                    <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {[1,2,3].map(i => (
                        <div key={i} className="arthur-skeleton" style={{ height: 64 }} />
                      ))}
                    </div>
                  )}
                  {threads.length === 0 && !loading && (
                    <EmptyState
                      title="no conversations yet."
                      subtitle="messages will appear here once a page is connected."
                      size="sm"
                      align="left"
                    />
                  )}
                  {threads.map(t => (
                    <button
                      key={`${t.page_id}:${t.sender_id}`}
                      onClick={() => setActive(t)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "var(--space-4)",
                        background: active?.sender_id === t.sender_id ? "var(--accent-orange-soft)" : "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--line-separator)",
                        borderLeft: active?.sender_id === t.sender_id ? "2px solid var(--accent-orange)" : "2px solid transparent",
                        cursor: "pointer",
                        transition: "background 0.12s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-1)" }}>
                        <span style={{ fontWeight: 500, fontSize: "var(--fs-small)", color: "var(--text-active)" }}>
                          {t.sender_name ?? t.sender_id.slice(-8)}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                          {t.unreviewed > 0 && (
                            <TokenChip
                              label={String(t.unreviewed)}
                              size="xs"
                              color="orange"
                            />
                          )}
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", color: "var(--text-muted)" }}>
                            {relTime(t.last_at)}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.messages.at(-1)?.message_text?.slice(0, 40) ?? "—"}
                      </div>
                    </button>
                  ))}
                </div>
              </GlassPanel>

              {/* Thread detail */}
              <GlassPanel
                tier={2}
                style={{
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "var(--radius-panel)",
                }}
              >
                {active ? (
                  <>
                    {/* Thread header */}
                    <div style={{
                      padding: "var(--space-4) var(--space-5)",
                      borderBottom: "1px solid var(--line-separator)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}>
                      <div>
                        <div style={{ fontWeight: 400, fontSize: 16, color: "var(--text-active)" }}>{active.sender_name ?? active.sender_id.slice(-8)}</div>
                        <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "var(--space-1)" }}>
                          {pages.find(p => p.page_id === active.page_id)?.page_name ?? active.page_id}
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {active.messages
                        .sort((a, b) => a.created_at.localeCompare(b.created_at))
                        .map(m => (
                          <div
                            key={m.id}
                            style={{
                              alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start",
                              maxWidth: "70%",
                            }}
                          >
                            <div style={{
                              background: m.direction === "outbound"
                                ? "var(--accent-orange)"
                                : "var(--glass-bg)",
                              border: m.direction === "outbound"
                                ? "none"
                                : `1px solid ${m.requires_review ? "var(--tint-red)" : "var(--glass-border)"}`,
                              borderRadius: m.direction === "outbound" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                              padding: "var(--space-2) var(--space-4)",
                            }}>
                              <div style={{
                                fontSize: "var(--fs-small)",
                                lineHeight: 1.5,
                                color: m.direction === "outbound" ? "var(--accent-text-on)" : "var(--text-active)",
                              }}>
                                {m.message_text}
                              </div>
                              <div style={{
                                fontSize: "var(--fs-mono)",
                                color: m.direction === "outbound" ? "rgba(26,36,0,0.6)" : "var(--text-muted)",
                                marginTop: "var(--space-1)",
                                fontFamily: "var(--font-mono)",
                              }}>
                                {m.direction === "outbound" ? "arthur → sent" : "customer"} · {new Date(m.created_at).toLocaleTimeString()}
                                {m.requires_review && <span style={{ color: "var(--tint-red)", marginLeft: "var(--space-2)" }}>⚠ needs review</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* Composer */}
                    <div style={{ padding: "var(--space-4) var(--space-5)", borderTop: "1px solid var(--line-separator)" }}>
                      <div style={{ position: "relative", marginBottom: "var(--space-2)" }}>
                        <span style={{
                          position: "absolute",
                          top: -18,
                          right: 0,
                          fontFamily: "var(--font-mono)",
                          fontSize: "var(--fs-mono)",
                          color: "var(--text-muted)",
                          letterSpacing: "0.04em",
                        }}>
                          ↵ send · ⇧↵ newline
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <textarea
                          value={editMsg}
                          onChange={e => setEditMsg(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleResend(); }
                          }}
                          placeholder="edit and resend a response…"
                          rows={2}
                          style={{
                            flex: 1,
                            background: "var(--glass-bg)",
                            border: "1px solid var(--glass-border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "var(--space-2) var(--space-4)",
                            color: "var(--text-active)",
                            fontSize: "var(--fs-small)",
                            resize: "none",
                            outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                        <button
                          onClick={handleResend}
                          disabled={sending || !editMsg.trim()}
                          style={{
                            background: editMsg.trim() ? "var(--accent-orange)" : "var(--glass-bg-strong)",
                            color: editMsg.trim() ? "var(--accent-text-on)" : "var(--text-muted)",
                            border: "none",
                            borderRadius: "var(--radius-pill)",
                            padding: "0 var(--space-5)",
                            cursor: editMsg.trim() ? "pointer" : "not-allowed",
                            fontSize: "var(--fs-small)",
                            fontWeight: 700,
                            flexShrink: 0,
                            transition: "background 0.15s",
                          }}
                        >
                          {sending ? "sending…" : "send →"}
                        </button>
                      </div>
                      {sendErr && <p style={{ color: "var(--tint-red)", fontSize: "var(--fs-mono)", marginTop: "var(--space-1)", fontFamily: "var(--font-mono)" }}>{sendErr}</p>}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "var(--fs-small)" }}>
                    select a conversation
                  </div>
                )}
              </GlassPanel>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

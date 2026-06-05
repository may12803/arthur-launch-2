"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

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

const DET = "America/Detroit";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: DET });
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: DET });
}

function dateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: DET });
}

const inputSt: React.CSSProperties = {
  background: S.bg,
  border: `1px solid ${S.border2}`,
  borderRadius: 6,
  padding: "9px 12px",
  color: S.textPrimary,
  fontSize: 12,
  fontFamily: S.mono,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
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
  const [connectStatus, setConnectStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  async function handleConnectPage(e: React.FormEvent) {
    e.preventDefault();
    if (!connectPageId.trim() || !connectPageName.trim() || !connectToken.trim()) return;
    setConnecting(true);
    setConnectStatus(null);
    try {
      // connect-page route expects { page_id, name, page_access_token }
      const res = await fetch("/api/meta/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: connectPageId.trim(),
          name: connectPageName.trim(),
          page_access_token: connectToken.trim(),
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setConnectStatus({ ok: true, msg: "page connected" });
        setConnectPageId(""); setConnectPageName(""); setConnectToken("");
        setShowConnect(false);
        await fetchData();
      } else {
        setConnectStatus({ ok: false, msg: data.error ?? res.statusText });
      }
    } catch (err: unknown) {
      setConnectStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setConnecting(false);
    }
  }

  const headerLabelSt: React.CSSProperties = { fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: S.textMuted };
  const noPages = pages.length === 0;

  return (
    <div style={{ minHeight: "100%", background: S.bg, fontFamily: S.sans, color: S.textPrimary }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px 80px" }}>

        {/* Header */}
        <div style={{ paddingBottom: 20, borderBottom: `1px solid ${S.border}`, marginBottom: 24, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...headerLabelSt, marginBottom: 8 }}>Meta Business Messaging</div>
            <h1 style={{ margin: 0, fontWeight: 700, fontSize: 24, letterSpacing: "-0.5px", color: S.textPrimary }}>Messenger</h1>
          </div>
          <button
            onClick={() => { setShowConnect(s => !s); setConnectStatus(null); }}
            style={{ background: showConnect ? S.bg3 : S.accent, color: showConnect ? S.textPrimary : "#000", border: `1px solid ${showConnect ? S.border2 : S.accent}`, borderRadius: 6, padding: "8px 16px", fontSize: 12, fontWeight: 700, fontFamily: S.mono, cursor: "pointer" }}
          >
            {showConnect ? "close" : "+ connect page"}
          </button>
        </div>

        {/* Connected pages summary */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {pages.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 6, padding: "8px 14px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: S.green, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: S.textPrimary }}>{p.page_name}</span>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.textMuted }}>{p.page_id}</span>
              <span style={{ fontFamily: S.mono, fontSize: 10, color: S.textMuted }}>· connected {dateStr(p.connected_at)}</span>
            </div>
          ))}
          {noPages && !loading && !showConnect && (
            <div style={{ fontSize: 12, color: S.textSecondary, fontFamily: S.mono }}>
              no pages connected — hit “+ connect page” to add one.
            </div>
          )}
        </div>

        {/* Connect a page form */}
        {showConnect && (
          <div style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, maxWidth: 480, marginBottom: 24 }}>
            <div style={{ ...headerLabelSt, marginBottom: 8 }}>Connect Page</div>
            <h3 style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15, color: S.textPrimary }}>Connect a Facebook Page</h3>
            <p style={{ margin: "0 0 16px", fontSize: 11.5, lineHeight: 1.6, color: S.textSecondary }}>
              Generate a Page access token in Meta Business Suite (Messenger product → page token), then paste it below. The token is verified against the Graph API before it&apos;s saved.
            </p>
            <form onSubmit={handleConnectPage} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input aria-label="Facebook Page ID" value={connectPageId} onChange={e => setConnectPageId(e.target.value)} placeholder="page ID" required style={inputSt} />
              <input aria-label="Facebook Page name" value={connectPageName} onChange={e => setConnectPageName(e.target.value)} placeholder="page name (e.g. Dabney & Co)" required style={{ ...inputSt, fontFamily: S.sans }} />
              <input aria-label="Page access token" value={connectToken} onChange={e => setConnectToken(e.target.value)} placeholder="page access token" type="password" required style={inputSt} />
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 4 }}>
                <button type="submit" disabled={connecting} style={{ background: S.accent, color: "#000", border: "none", borderRadius: 6, padding: "9px 20px", fontSize: 12, fontWeight: 700, fontFamily: S.mono, cursor: connecting ? "not-allowed" : "pointer", opacity: connecting ? 0.6 : 1 }}>
                  {connecting ? "verifying…" : "connect page →"}
                </button>
                {connectStatus && (
                  <span style={{ fontSize: 11, color: connectStatus.ok ? S.green : S.red, fontFamily: S.mono }}>
                    {connectStatus.ok ? "✓ " : "✗ "}{connectStatus.msg}
                  </span>
                )}
              </div>
            </form>
          </div>
        )}

        {/* Two-column thread UI */}
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, height: "calc(100vh - 300px)", minHeight: 400 }}>
          {/* Conversation list */}
          <div style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={headerLabelSt}>Conversations</div>
              <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.accent, background: S.bg4, borderRadius: 4, padding: "1px 6px", fontVariantNumeric: "tabular-nums" }}>{threads.length}</span>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading && (
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[1, 2, 3].map(i => <div key={i} style={{ height: 60, borderRadius: 6, background: S.bg3 }} />)}
                </div>
              )}
              {threads.length === 0 && !loading && (
                <div style={{ padding: "24px 16px", color: S.textMuted, fontSize: 12, fontFamily: S.mono }}>no conversations yet.</div>
              )}
              {threads.map(t => {
                const isActive = active?.page_id === t.page_id && active?.sender_id === t.sender_id;
                return (
                  <button key={`${t.page_id}:${t.sender_id}`} onClick={() => setActive(t)} style={{ width: "100%", textAlign: "left", padding: "12px 16px", background: isActive ? S.bg3 : "transparent", border: "none", borderBottom: `1px solid ${S.border}`, borderLeft: isActive ? `2px solid ${S.accent}` : "2px solid transparent", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: S.textPrimary }}>{t.sender_name ?? t.sender_id.slice(-8)}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {t.unreviewed > 0 && <span style={{ background: S.orange, color: "#000", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, fontFamily: S.mono }}>{t.unreviewed}</span>}
                        <span style={{ fontFamily: S.mono, fontSize: 10, color: S.textMuted }}>{relTime(t.last_at)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: S.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.messages.at(-1)?.message_text?.slice(0, 40) ?? "—"}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thread detail */}
          <div style={{ background: S.bg2, border: `1px solid ${S.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {active ? (
              <>
                <div style={{ padding: "15px 20px", borderBottom: `1px solid ${S.border}` }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: S.textPrimary }}>{active.sender_name ?? active.sender_id.slice(-8)}</div>
                  <div style={{ fontSize: 11, color: S.textMuted, fontFamily: S.mono, marginTop: 2 }}>{pages.find(p => p.page_id === active.page_id)?.page_name ?? active.page_id}</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...active.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(m => (
                    <div key={m.id} style={{ alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start", maxWidth: "70%" }}>
                      <div style={{ background: m.direction === "outbound" ? S.accent : S.bg3, border: m.direction === "outbound" ? "none" : `1px solid ${m.requires_review ? S.red : S.border2}`, borderRadius: m.direction === "outbound" ? "12px 12px 4px 12px" : "12px 12px 12px 4px", padding: "9px 13px" }}>
                        <div style={{ fontSize: 13, lineHeight: 1.5, color: m.direction === "outbound" ? "#000" : S.textPrimary }}>{m.message_text}</div>
                        <div style={{ fontSize: 10, color: m.direction === "outbound" ? "rgba(0,0,0,0.6)" : S.textMuted, marginTop: 5, fontFamily: S.mono, fontVariantNumeric: "tabular-nums" }}>
                          {m.direction === "outbound" ? "arthur → sent" : "customer"} · {timeStr(m.created_at)}
                          {m.requires_review && m.direction === "inbound" && <span style={{ color: S.red, marginLeft: 8 }}>⚠ needs review</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${S.border}` }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <textarea value={editMsg} onChange={e => setEditMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleResend(); } }} placeholder="write a reply…" rows={2} style={{ flex: 1, background: S.bg, border: `1px solid ${S.border2}`, borderRadius: 6, padding: "9px 13px", color: S.textPrimary, fontSize: 13, resize: "none", outline: "none", fontFamily: S.sans }} />
                    <button onClick={handleResend} disabled={sending || !editMsg.trim()} style={{ background: editMsg.trim() ? S.accent : S.bg3, color: editMsg.trim() ? "#000" : S.textMuted, border: "none", borderRadius: 6, padding: "0 20px", cursor: editMsg.trim() ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, fontFamily: S.mono, flexShrink: 0 }}>
                      {sending ? "sending…" : "send →"}
                    </button>
                  </div>
                  {sendErr && <p style={{ color: S.red, fontSize: 11, marginTop: 6, fontFamily: S.mono }}>{sendErr}</p>}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: S.textMuted, fontSize: 13, fontFamily: S.mono }}>
                {loading ? "loading conversations…" : noPages ? "connect a page to start receiving messages" : "select a conversation"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

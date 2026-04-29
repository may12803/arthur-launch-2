"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Nav, Footer } from "../_components/Layout";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCallsUsed?: number;
  provider?: string;
}

const SESSION_KEY = "arthur_dashboard_session_id";

export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState({ modules: 20, edges: 6293, principles: 24, skills: 130 });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Today section state
  interface ApprovalRow { id: string; subject?: string | null; from_email?: string; from_name?: string | null }
  interface CalRow { id: string; title: string; start: string; type?: string }
  const [todayApprovals, setTodayApprovals] = useState<ApprovalRow[]>([]);
  const [todayCal, setTodayCal]             = useState<CalRow[]>([]);
  const [todayLoading, setTodayLoading]     = useState(true);

  // Load session ID from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) setSessionId(stored);
  }, []);

  useEffect(() => {
    fetch("/api/state")
      .then(r => r.ok ? r.json() : null)
      .then(s => s && setState(prev => ({ ...prev, ...s })))
      .catch(() => {});
  }, []);

  // Load today's data
  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      const [appRes, calRes] = await Promise.allSettled([
        fetch("/api/inbox/list?smart=needs_attention"),
        fetch(`/api/calendar/events?start=${today.toISOString()}&end=${tomorrow.toISOString()}`),
      ]);
      if (appRes.status === "fulfilled" && appRes.value.ok) {
        const j = await appRes.value.json() as { rows?: ApprovalRow[] };
        setTodayApprovals((j.rows ?? []).slice(0, 5));
      }
      if (calRes.status === "fulfilled" && calRes.value.ok) {
        const j = await calRes.value.json();
        if (Array.isArray(j)) setTodayCal((j as CalRow[]).slice(0, 5));
      }
    } catch { /* silent */ } finally {
      setTodayLoading(false);
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function newConversation() {
    localStorage.removeItem(SESSION_KEY);
    setSessionId("");
    setMessages([]);
    setPrompt("");
  }

  async function send() {
    if (!prompt.trim() || busy) return;
    const userMsg = prompt.trim();
    setPrompt("");
    setBusy(true);

    // Optimistically append user message
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    // Add thinking placeholder
    setMessages(prev => [...prev, { role: "assistant", content: "routing through model hierarchy…" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg,
          session_id: sessionId || undefined,
        }),
      });
      const j = await res.json() as {
        response?: string; text?: string; message?: string; error?: string; detail?: unknown;
        session_id?: string; model?: string; tool_calls_used?: number;
      };

      if (!res.ok) {
        const errText = "error: " + (j.error || res.statusText) + (j.detail ? "\n" + String(j.detail) : "");
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "assistant", content: errText },
        ]);
      } else {
        const responseText = j.response ?? j.text ?? j.message ?? JSON.stringify(j, null, 2);

        // Persist new session_id
        if (j.session_id && j.session_id !== sessionId) {
          setSessionId(j.session_id);
          localStorage.setItem(SESSION_KEY, j.session_id);
        }

        // Replace placeholder with real response
        setMessages(prev => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: responseText,
            toolCallsUsed: j.tool_calls_used,
            provider: j.model,
          },
        ]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "network error: " + msg },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  function toggleToolExpand(idx: number) {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <>
      <Nav />
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 80 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 className="section-title" style={{ margin: 0 }}>dashboard.</h1>
          <span className="eyebrow" style={{ color: "var(--accent)" }}>live engine</span>
        </div>
        <p className="section-lede">
          Talk to Arthur. Routes through Pioneer → Groq → Cerebras. Tool calls pull live data from inbox, legal vault, and memory index.
        </p>

        <div className="dash-grid">
          <div className="panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2>ask arthur.</h2>
                <span className="eyebrow">multi-turn · tool calls · session memory</span>
              </div>
              {messages.length > 0 && (
                <button
                  className="btn-ghost"
                  onClick={newConversation}
                  style={{ fontSize: 12, padding: "4px 10px" }}
                >
                  new conversation
                </button>
              )}
            </div>
            <div className="body" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {/* Conversation history */}
              {messages.length > 0 && (
                <div style={{
                  flex: 1,
                  overflowY: "auto",
                  maxHeight: 480,
                  marginBottom: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}>
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <div style={{
                        maxWidth: "88%",
                        padding: "10px 14px",
                        borderRadius: 8,
                        background: msg.role === "user"
                          ? "var(--accent, #222)"
                          : "var(--panel-bg, #111)",
                        border: msg.role === "assistant" ? "1px solid var(--border, #333)" : "none",
                        fontSize: 14,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        color: "var(--fg, #f0f0f0)",
                      }}>
                        {msg.content}
                      </div>
                      {/* Tool call indicator */}
                      {msg.role === "assistant" && msg.toolCallsUsed != null && msg.toolCallsUsed > 0 && (
                        <button
                          onClick={() => toggleToolExpand(idx)}
                          style={{
                            marginTop: 4,
                            fontSize: 11,
                            color: "var(--lobe-upgrades, #888)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        >
                          {expandedTools.has(idx) ? "▲" : "▼"} Arthur used {msg.toolCallsUsed} tool{msg.toolCallsUsed !== 1 ? "s" : ""}
                          {msg.provider ? ` · ${msg.provider.split("/").pop()}` : ""}
                        </button>
                      )}
                      {msg.role === "assistant" && msg.provider && (!msg.toolCallsUsed || msg.toolCallsUsed === 0) && (
                        <span style={{ marginTop: 2, fontSize: 10, color: "var(--muted, #666)" }}>
                          {msg.provider.split("/").pop()}
                        </span>
                      )}
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}

              {/* Empty state */}
              {messages.length === 0 && (
                <div className="response" style={{ marginBottom: 16, fontSize: 13, color: "var(--muted, #666)" }}>
                  Ready. Conversation persists across refreshes. Try asking about your inbox, legal vault, or brain graph.
                </div>
              )}

              {/* Input area */}
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Reconcile the Chase statement. Or: audit my brain graph. Or: what emails need attention today?"
                rows={3}
                style={{ resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button className="cta-btn" onClick={send} disabled={busy}>
                  {busy ? "thinking…" : "send →"}
                </button>
                <button className="btn-ghost" onClick={() => setPrompt("audit my brain graph and find connections I haven't thought of")}>
                  audit brain
                </button>
                <button className="btn-ghost" onClick={() => setPrompt("what emails need my attention today?")}>
                  inbox check
                </button>
                <button className="btn-ghost" onClick={() => setPrompt("distill new principles from this week's sessions")}>
                  distill principles
                </button>
                {sessionId && (
                  <span style={{ fontSize: 10, color: "var(--muted, #555)", marginLeft: "auto" }}>
                    session active
                  </span>
                )}
              </div>
              <p style={{ fontSize: 10, color: "var(--muted, #555)", marginTop: 6, marginBottom: 0 }}>
                ⌘↵ to send
              </p>
            </div>
          </div>

          <aside className="panel">
            <div className="head">
              <h2>state.</h2>
              <span className="eyebrow" style={{ color: "var(--lobe-upgrades)" }}>live</span>
            </div>
            <div className="body">
              <ul className="kv-list">
                <li><span className="k">modules wired</span><span className="v">{state.modules}</span></li>
                <li><span className="k">knowledge edges</span><span className="v">{state.edges.toLocaleString()}</span></li>
                <li><span className="k">principles</span><span className="v">{state.principles}+</span></li>
                <li><span className="k">skills</span><span className="v">{state.skills}+</span></li>
                <li><span className="k">primary model</span><span className="v">pioneer/llama-3.3-70b</span></li>
                <li><span className="k">fallbacks</span><span className="v">groq → cerebras</span></li>
                <li><span className="k">tools</span><span className="v">inbox · legal · memory · graph · actions</span></li>
                <li><span className="k">backfill cron</span><span className="v">Sun 04:00</span></li>
                <li><span className="k">EvolveR distill</span><span className="v">Daily 03:25</span></li>
              </ul>
            </div>
          </aside>
        </div>

        {/* ── Today section ── */}
        <div style={{ marginTop: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{
              fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "-0.01em",
            }}>
              today.
            </span>
            <span className="eyebrow">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {/* Column 1: Pending approvals */}
            <div className="panel">
              <div className="head">
                <h2 style={{ fontSize: 14, margin: 0 }}>pending approvals</h2>
                <a href="/inbox?smart=needs_attention" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>view all →</a>
              </div>
              <div className="body">
                {todayLoading ? (
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>loading…</div>
                ) : todayApprovals.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>no pending approvals.</div>
                ) : (
                  todayApprovals.map(a => (
                    <div key={a.id} style={{
                      borderBottom: "1px solid var(--border)",
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}>
                      <span style={{ fontSize: 12.5, color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.subject ?? "(no subject)"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                        {a.from_name ?? a.from_email}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 2: Today's calendar */}
            <div className="panel">
              <div className="head">
                <h2 style={{ fontSize: 14, margin: 0 }}>today&apos;s calendar</h2>
                <a href="/calendar" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>view all →</a>
              </div>
              <div className="body">
                {todayLoading ? (
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>loading…</div>
                ) : todayCal.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>no events today.</div>
                ) : (
                  todayCal.map(e => (
                    <div key={e.id} style={{
                      borderBottom: "1px solid var(--border)",
                      padding: "8px 0",
                    }}>
                      <span style={{ fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                        {e.title}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                        {e.start ? new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "all day"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Extractions */}
            <div className="panel">
              <div className="head">
                <h2 style={{ fontSize: 14, margin: 0 }}>today&apos;s extractions</h2>
                <a href="/legal" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>view all →</a>
              </div>
              <div className="body">
                <div style={{ fontSize: 12, color: "var(--text-faint)" }}>
                  upload a document in legal vault to see extractions here.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

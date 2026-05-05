"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { Nav } from "../_components/Layout";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCallsUsed?: number;
  modelUsed?: string;
  tierUsed?: string;
  feedback?: "accept" | "reject" | "edit" | null;
  editing?: boolean;
  correction?: string;
}

interface ApprovalRow {
  id: string;
  subject?: string | null;
  from_email?: string;
  from_name?: string | null;
}

interface CalRow {
  id: string;
  title: string;
  start: string;
  type?: string;
}

interface State {
  modules: number;
  edges: number;
  principles: number;
  skills: number;
  pending_tasks?: number;
}

interface LiveEmp { team: string; id: string; name: string; model: string; state: "active" | "training" | "idle"; task: string; timeAgo: string }
const TIER: Record<string, string> = { haiku: "T11", sonnet: "T14", opus: "T17", code: "T16", gemini: "T12", kimi: "T13", o4: "T15" };
const SAMPLE_TASKS = [
  "drafting weekly board update",
  "reviewing the arthur-online deploy",
  "Q3 P&L variance · Dabney books",
  "olldae Q3 launch positioning",
  "Hustle pipeline review · 12 bids",
  "tuning arthur-tuned LoRA · iter 189",
  "ingesting iOS 18 SwiftUI corpus",
  "shipped 18-tier router unification",
  "building offsite quote · 60-guest cocktail",
  "monitoring deploy v172 · all green",
  "drafted IG carousel · jazz brunch",
  "discovery call script update",
];
const SAMPLE_TIMES = ["just now", "2m", "5m", "8m", "12m", "22m", "1h"];

function pickLiveEmployees(roster: Record<string, Array<{ id: string; name: string; model: string }>>): LiveEmp[] {
  // Pseudo-random "live" feed — wire to real activity log when available
  const all: LiveEmp[] = [];
  const teams = Object.entries(roster);
  for (const [team, emps] of teams) {
    for (const emp of emps) {
      const seed = (emp.id.charCodeAt(0) || 0) + emp.id.length + team.length;
      const states: Array<"active" | "training" | "idle"> = ["active", "active", "idle", "active", "idle", "training", "active", "idle"];
      const state = states[seed % states.length];
      if (state === "idle") continue;
      all.push({
        team, id: emp.id, name: emp.name, model: emp.model, state,
        task: SAMPLE_TASKS[seed % SAMPLE_TASKS.length],
        timeAgo: state === "active" ? SAMPLE_TIMES[seed % SAMPLE_TIMES.length] : SAMPLE_TIMES[5 + (seed % 2)],
      });
    }
  }
  // active first, then training, capped at 6
  return all.sort((a, b) => (a.state === "active" ? -1 : 1) - (b.state === "active" ? -1 : 1)).slice(0, 6);
}

const SESSION_KEY = "arthur_dashboard_session_id";

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [state, setState] = useState<State>({ modules: 20, edges: 6293, principles: 24, skills: 130 });
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [todayCal, setTodayCal] = useState<CalRow[]>([]);
  const [liveEmps, setLiveEmps] = useState<LiveEmp[]>([]);
  const [empTotals, setEmpTotals] = useState<{ total: number; active: number }>({ total: 64, active: 0 });
  // Streaming-state UI: live elapsed timer + ETA from rolling window of recent turn durations.
  const [turnStartedAt, setTurnStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recentDurations, setRecentDurations] = useState<number[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("arthur_turn_durations") ?? "[]"); } catch { return []; }
  });

  const streamRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Tick the elapsed timer while busy
  useEffect(() => {
    if (!busy || !turnStartedAt) { setElapsedMs(0); return; }
    const id = setInterval(() => setElapsedMs(Date.now() - turnStartedAt), 250);
    return () => clearInterval(id);
  }, [busy, turnStartedAt]);

  // ETA: median of last 20 turns; cold-start = 5s baseline
  const etaMs = (() => {
    if (!busy) return null;
    if (recentDurations.length >= 3) {
      const sorted = [...recentDurations].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return Math.max(median, elapsedMs * 1.3);
    }
    return 5000;
  })();
  const fmtDur = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
  };

  // ── Load session from local storage ──
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) setSessionId(stored);
  }, []);

  // ── Live state ──
  useEffect(() => {
    fetch("/api/state")
      .then(r => r.ok ? r.json() : null)
      .then(s => s && setState(prev => ({ ...prev, ...s })))
      .catch(() => {});
  }, []);

  // ── Roster + live employees feed (real-time, polls every 10s) ──
  useEffect(() => {
    const load = () => {
      fetch("/api/employees/activity")
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (!j) return;
          const data = j as { total: number; active: number; employees: Array<{ team: string; id: string; name: string; model: string; state: "active" | "training" | "idle"; task: string | null; timeAgo: string | null }>; has_real_data: boolean };
          setEmpTotals({ total: data.total, active: data.active });
          if (data.has_real_data) {
            const top = data.employees
              .filter(e => e.state !== "idle")
              .slice(0, 5)
              .map(e => ({
                team: e.team, id: e.id, name: e.name, model: e.model,
                state: e.state, task: e.task ?? "", timeAgo: e.timeAgo ?? "",
              }));
            setLiveEmps(top);
          } else {
            const roster: Record<string, Array<{ id: string; name: string; model: string }>> = {};
            for (const e of data.employees) {
              if (!roster[e.team]) roster[e.team] = [];
              roster[e.team].push({ id: e.id, name: e.name, model: e.model });
            }
            setLiveEmps(pickLiveEmployees(roster));
          }
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  // ── Today data ──
  const loadToday = useCallback(async () => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    try {
      const [a, c] = await Promise.allSettled([
        fetch("/api/inbox/list?smart=needs_attention"),
        fetch(`/api/calendar/events?start=${today.toISOString()}&end=${tomorrow.toISOString()}`),
      ]);
      if (a.status === "fulfilled" && a.value.ok) {
        const j = await a.value.json() as { rows?: ApprovalRow[] };
        setApprovals((j.rows ?? []).slice(0, 4));
      }
      if (c.status === "fulfilled" && c.value.ok) {
        const j = await c.value.json();
        if (Array.isArray(j)) setTodayCal((j as CalRow[]).slice(0, 4));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  // ── Auto-resize composer ──
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 220) + "px";
  }, [prompt]);

  // ── Scroll stream to bottom on message ──
  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function newConversation() {
    localStorage.removeItem(SESSION_KEY);
    setSessionId("");
    setMessages([]);
    setPrompt("");
    taRef.current?.focus();
  }

  async function send() {
    if (!prompt.trim() || busy) return;
    const userMsg = prompt.trim();
    setPrompt("");
    setBusy(true);
    setMessages(prev => [...prev, { role: "user", content: userMsg }, { role: "assistant", content: "…" }]);

    setTurnStartedAt(Date.now());
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMsg, session_id: sessionId || undefined }),
      });
      const j = await res.json() as {
        response?: string; text?: string; message?: string; error?: string;
        session_id?: string; tool_calls_used?: number;
        model_used?: string; tier_used?: string;
      };
      if (!res.ok) {
        setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "couldn't reach the router — " + (j.error || res.statusText) }]);
      } else {
        if (j.session_id && j.session_id !== sessionId) {
          setSessionId(j.session_id);
          localStorage.setItem(SESSION_KEY, j.session_id);
        }
        setMessages(prev => [
          ...prev.slice(0, -1),
          {
            role: "assistant",
            content: j.response ?? j.text ?? j.message ?? "(empty)",
            toolCallsUsed: j.tool_calls_used,
            modelUsed: j.model_used,
            tierUsed: j.tier_used,
          },
        ]);
      }
    } catch (e: unknown) {
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "network error — " + (e instanceof Error ? e.message : String(e)) }]);
    } finally {
      // Record duration so the next turn can ETA off it
      if (turnStartedAt) {
        const dur = Date.now() - turnStartedAt;
        setRecentDurations(d => {
          const next = [...d.slice(-19), dur];
          try { localStorage.setItem("arthur_turn_durations", JSON.stringify(next)); } catch {}
          return next;
        });
      }
      setBusy(false);
      setTurnStartedAt(null);
    }
  }

  async function sendFeedback(idx: number, signal: "accept" | "reject" | "edit", correction?: string) {
    const m = messages[idx];
    if (!m || m.role !== "assistant") return;
    // The matching prompt is the user message immediately before
    const userMsg = messages[idx - 1];
    if (!userMsg || userMsg.role !== "user") return;
    if (m.content === "…" || m.content.startsWith("couldn't reach") || m.content.startsWith("network error")) return;

    // Optimistic — flip badge immediately
    setMessages(prev => prev.map((msg, i) =>
      i === idx ? { ...msg, feedback: signal, editing: false, correction: correction ?? msg.correction } : msg
    ));

    try {
      await fetch("/api/training/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userMsg.content,
          response: m.content,
          signal,
          session_id: sessionId || undefined,
          model_used: m.modelUsed,
          tier_used: m.tierUsed,
          tools_used: [],
          correction_text: correction,
          source: "dashboard",
          metadata: { tool_calls_used: m.toolCallsUsed ?? 0 },
        }),
      });
    } catch {
      // revert on hard failure
      setMessages(prev => prev.map((msg, i) => i === idx ? { ...msg, feedback: null } : msg));
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline. Cmd+Enter still sends (muscle memory).
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <>
      <Nav />
      <style jsx>{`
        .wrap {
          padding-top: 96px;
          padding-left: var(--space-lg);
          padding-right: var(--space-lg);
          padding-bottom: var(--space-md);
          max-width: 1320px;
          margin: 0 auto;
          height: calc(100vh - 8px);
          display: flex;
          flex-direction: column;
        }
        /* ── Header — compact, info-dense ── */
        .header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-md);
          margin-bottom: var(--space-md);
          flex-shrink: 0;
        }
        .header-left { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
        .header-right { display: flex; align-items: baseline; gap: var(--space-md); }
        .h1 {
          font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif;
          font-size: clamp(1.875rem, 2.6vw, 2.5rem);
          font-weight: 300;
          letter-spacing: -0.03em;
          color: var(--text-active);
          line-height: 1;
          margin: 0;
        }
        /* Inline state strip — replaces the bulky state panel */
        .state-strip {
          display: flex;
          gap: var(--space-md);
          padding-left: var(--space-md);
          margin-left: var(--space-sm);
          border-left: 1px solid rgba(255,255,255,0.10);
        }
        .state-strip .item {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--text-muted);
        }
        .state-strip .item .v {
          color: var(--accent-orange);
          font-weight: 600;
          font-size: 12px;
        }
        @media (max-width: 980px) {
          .state-strip { display: none; }
          .wrap { height: auto; }
        }
        .live-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 11px 5px 9px;
          border-radius: var(--radius-pill);
          background: rgba(74, 222, 128, 0.18);
          border: 1px solid rgba(74, 222, 128, 0.4);
          color: #156c2e;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #22c55e;
          box-shadow: 0 0 0 0 rgba(34,197,94,0.6);
          animation: pulse 1.8s var(--ease-out-soft) infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
          70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        .date {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 12px;
          letter-spacing: 0.08em;
          color: rgba(245,246,248,0.55);
          text-transform: uppercase;
        }
        /* ── Main grid — 3-column layout: chat (left) | activity (center) | quick-access (right) ── */
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr) minmax(280px, 1fr);
          gap: var(--space-md);
          flex: 1;
          min-height: 0;
        }
        @media (max-width: 1200px) {
          .grid { grid-template-columns: minmax(0, 1.55fr) minmax(280px, 1fr); }
        }
        @media (max-width: 980px) {
          .grid { grid-template-columns: 1fr; flex: none; }
        }
        /* ── Composer card — fills its grid cell, internal scroll ── */
        .composer-card {
          background: var(--glass-bg);
          backdrop-filter: blur(var(--blur-amount));
          -webkit-backdrop-filter: blur(var(--blur-amount));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-panel);
          box-shadow: var(--glass-shadow);
          padding: var(--space-lg);
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
          position: relative;
          overflow: hidden;
        }
        .composer-eyebrow {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(245,246,248,0.5);
          margin-bottom: 6px;
        }
        .composer-title {
          font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif;
          font-size: 28px;
          font-weight: 400;
          letter-spacing: -0.015em;
          color: var(--text-active);
          margin: 0 0 var(--space-sm) 0;
          line-height: 1;
        }
        .composer-actions {
          display: flex; align-items: center; gap: 10px; margin-bottom: var(--space-md);
        }
        .ghost-btn {
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--radius-pill);
          padding: 5px 12px;
          color: var(--text-active);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s var(--ease-out-soft);
        }
        .ghost-btn:hover { background: rgba(255,255,255,0.18); }
        /* Conversation stream */
        .stream {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
          padding-right: 4px;
          min-height: 0;
        }
        .stream::-webkit-scrollbar { width: 4px; }
        .stream::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .empty {
          font-size: 14px;
          color: rgba(245,246,248,0.55);
          line-height: 1.6;
          margin: auto 0;
          padding: var(--space-md) 0;
        }
        .empty .empty-pad { font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 11px; color: rgba(245,246,248,0.4); margin-top: 8px; letter-spacing: 0.04em; }
        .bubble {
          max-width: 88%;
          padding: 10px 14px;
          border-radius: 14px;
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .bubble.user {
          align-self: flex-end;
          background: var(--accent-orange);
          color: var(--accent-text-on, #1a2400);
          font-weight: 500;
          border-bottom-right-radius: 5px;
        }
        .bubble.assistant {
          align-self: flex-start;
          background: rgba(255,255,255,0.10);
          color: var(--text-active);
          border: 1px solid rgba(255,255,255,0.18);
          border-bottom-left-radius: 5px;
        }
        .tool-meta {
          align-self: flex-start;
          display: flex;
          gap: 6px;
          align-items: center;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.04em;
          padding-left: 6px;
        }
        .tool-chip {
          color: rgba(120, 220, 150, 0.85);
          padding: 2px 6px;
          background: rgba(120, 220, 150, 0.08);
          border: 1px solid rgba(120, 220, 150, 0.18);
          border-radius: 6px;
        }
        .tier-chip {
          padding: 2px 6px;
          border-radius: 6px;
          font-weight: 600;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          color: rgba(245,246,248,0.7);
        }
        /* Tier-specific colors mirror the TUI palette */
        .tier-chip.tier-t6, .tier-chip.tier-t5, .tier-chip.tier-t7 { color: #b794f6; border-color: rgba(183,148,246,0.25); background: rgba(183,148,246,0.08); }
        .tier-chip.tier-t11 { color: #4fd1c5; border-color: rgba(79,209,197,0.25); background: rgba(79,209,197,0.08); }
        .tier-chip.tier-t12, .tier-chip.tier-t13 { color: #f6ad55; border-color: rgba(246,173,85,0.25); background: rgba(246,173,85,0.08); }
        .tier-chip.tier-t14 { color: #fc8181; border-color: rgba(252,129,129,0.25); background: rgba(252,129,129,0.08); }
        .tier-chip.tier-t17 { color: #f687b3; border-color: rgba(246,135,179,0.30); background: rgba(246,135,179,0.10); }
        .model-chip {
          color: rgba(245,246,248,0.40);
          font-size: 9px;
        }
        /* Streaming placeholder — pulsing dots + elapsed/ETA */
        .thinking {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 12px;
        }
        .thinking .dots {
          color: var(--accent-orange);
          animation: pulse 1.2s ease-in-out infinite;
          letter-spacing: 2px;
        }
        .thinking .elapsed {
          color: rgba(245,246,248,0.65);
        }
        .thinking .eta {
          color: rgba(245,246,248,0.40);
          font-size: 11px;
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        /* Training feedback row — under each assistant bubble */
        .fb-row {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 4px;
          margin-top: 2px;
        }
        .fb-btn {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 8px;
          padding: 3px 8px;
          font-size: 13px;
          line-height: 1;
          cursor: pointer;
          opacity: 0.55;
          transition: opacity 0.15s, background 0.15s, border-color 0.15s, transform 0.1s;
        }
        .fb-btn:hover {
          opacity: 1;
          background: rgba(255,255,255,0.08);
          border-color: rgba(255,255,255,0.18);
        }
        .fb-btn:active { transform: scale(0.94); }
        .fb-tag {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .fb-tag.accept { color: #d4ff3d; border-color: rgba(212,255,61,0.25); }
        .fb-tag.reject { color: #ff7a6b; border-color: rgba(255,122,107,0.25); }
        .fb-tag.edit   { color: rgba(245,246,248,0.65); }
        /* Inline edit panel */
        .fb-edit {
          align-self: flex-start;
          width: min(560px, 100%);
          margin-top: 4px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 12px;
          padding: 8px;
        }
        .fb-edit textarea {
          width: 100%;
          background: transparent;
          border: none;
          resize: vertical;
          color: var(--text-active);
          font-size: 13px;
          line-height: 1.45;
          font-family: inherit;
          outline: none;
          padding: 6px 8px;
          min-height: 64px;
        }
        .fb-edit textarea::placeholder { color: rgba(245,246,248,0.30); }
        .fb-edit-actions {
          display: flex;
          justify-content: flex-end;
          gap: 6px;
          margin-top: 6px;
        }
        .fb-save {
          background: var(--accent-orange);
          color: var(--accent-text-on, #1a2400);
          border: none;
          border-radius: var(--radius-pill);
          padding: 5px 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }
        .fb-save:hover:not(:disabled) { opacity: 0.92; }
        .fb-save:active:not(:disabled) { transform: scale(0.97); }
        .fb-save:disabled { opacity: 0.35; cursor: default; }
        /* Composer input */
        .composer-input-wrap {
          position: relative;
          background: rgba(255,255,255,0.10);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          transition: border-color 0.18s var(--ease-out-soft), box-shadow 0.18s var(--ease-out-soft);
        }
        .composer-input-wrap:focus-within {
          border-color: var(--accent-orange);
          box-shadow: 0 0 0 3px rgba(235, 64, 0, 0.12);
        }
        .composer-input-wrap textarea {
          width: 100%;
          background: transparent;
          border: none;
          resize: none;
          padding: 14px 80px 14px 18px;
          color: var(--text-active);
          font-size: 15px;
          line-height: 1.5;
          font-family: inherit;
          outline: none;
          min-height: 52px;
          max-height: 220px;
        }
        .composer-input-wrap textarea::placeholder { color: rgba(245,246,248,0.35); }
        .send-pill {
          position: absolute;
          right: 8px;
          bottom: 8px;
          background: var(--accent-orange);
          color: var(--accent-text-on, #1a2400);
          border: none;
          border-radius: var(--radius-pill);
          padding: 7px 16px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }
        .send-pill:hover:not(:disabled) { opacity: 0.92; }
        .send-pill:active:not(:disabled) { transform: scale(0.97); }
        .send-pill:disabled { opacity: 0.4; cursor: default; }
        .composer-hint {
          margin-top: 6px;
          padding: 0 4px;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          color: rgba(245,246,248,0.30);
          letter-spacing: 0.06em;
          text-align: right;
        }
        /* ── Side rail — fills cell, two stacked panels share height ── */
        .rail {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
          min-width: 0;
          min-height: 0;
          height: 100%;
        }
        .panel-card {
          background: var(--glass-bg);
          backdrop-filter: blur(var(--blur-amount));
          -webkit-backdrop-filter: blur(var(--blur-amount));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-panel);
          padding: var(--space-md) var(--space-lg) var(--space-lg);
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .panel-card.flex { flex: 1; overflow: hidden; }
        .panel-card.flex .scroll-area { flex: 1; overflow-y: auto; min-height: 0; }
        .panel-card.flex .scroll-area::-webkit-scrollbar { width: 4px; }
        .panel-card.flex .scroll-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
        .panel-eyebrow {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(245,246,248,0.5);
          margin-bottom: 4px;
        }
        .panel-title {
          font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif;
          font-size: 20px;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--text-active);
          margin: 0 0 var(--space-md) 0;
          line-height: 1;
        }
        .kv-row {
          display: flex; align-items: baseline; justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px dashed rgba(255,255,255,0.08);
        }
        .kv-row:last-child { border-bottom: none; }
        .kv-key { font-size: 13px; color: rgba(245,246,248,0.65); }
        .kv-val {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 13px;
          color: var(--text-active);
          font-weight: 500;
          letter-spacing: -0.01em;
        }
        /* Queue items */
        .q-item {
          display: flex; gap: 12px; align-items: flex-start;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          cursor: pointer;
        }
        .q-item:last-child { border-bottom: none; }
        .q-rail { width: 3px; flex-shrink: 0; border-radius: 2px; align-self: stretch; }
        .q-rail.amber { background: var(--accent-orange); }
        .q-rail.cool { background: rgba(91, 141, 239, 0.7); }
        .q-body { flex: 1; min-width: 0; }
        .q-title {
          font-size: 13px;
          color: var(--text-active);
          font-weight: 500;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .q-meta {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 10px;
          color: rgba(245,246,248,0.5);
          letter-spacing: 0.04em;
          margin-top: 2px;
        }
        .q-empty {
          font-size: 13px;
          color: rgba(245,246,248,0.45);
          font-style: italic;
          padding: var(--space-sm) 0;
        }
        .panel-link {
          display: inline-block;
          margin-top: var(--space-sm);
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--accent-orange);
          text-decoration: none;
          transition: opacity 0.15s;
        }
        .panel-link:hover { opacity: 0.75; }

        /* Live employees widget */
        .emp-card { padding: var(--space-md) var(--space-lg) var(--space-lg); }
        .emp-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: var(--space-md); }
        .emp-head .panel-title { margin-bottom: 0; }
        .emp-head a {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 11px; letter-spacing: 0.06em;
          color: var(--accent-orange); text-decoration: none;
          transition: opacity 0.15s;
        }
        .emp-head a:hover { opacity: 0.75; }
        .emp-stats {
          display: flex; gap: var(--space-md); margin-bottom: var(--space-sm);
          padding: 10px 0; border-top: 1px dashed rgba(255,255,255,0.10);
          border-bottom: 1px dashed rgba(255,255,255,0.10);
        }
        .emp-stat {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 22px; font-weight: 200; letter-spacing: -0.02em;
          color: var(--accent-orange);
          display: flex; flex-direction: column; gap: 2px;
        }
        .emp-stat.dim { color: var(--text-active); }
        .emp-stat .sl {
          font-family: ui-monospace, monospace; font-size: 9px;
          color: rgba(245,246,248,0.50); letter-spacing: 0.14em; text-transform: uppercase;
          font-weight: 400;
        }
        .emp-row {
          display: flex; gap: 10px; align-items: center;
          padding: 10px 4px; border-bottom: 1px solid rgba(255,255,255,0.07);
          cursor: pointer; transition: background 0.12s;
          margin-left: -4px; margin-right: -4px; border-radius: 6px;
          text-decoration: none;
        }
        .emp-row:hover { background: rgba(255,255,255,0.12); }
        .emp-row:last-child { border-bottom: none; }
        .emp-status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .emp-status-dot.active { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.6); }
        .emp-status-dot.training { background: #5b8def; animation: emp-pulse 1.6s infinite; }
        @keyframes emp-pulse { 50% { opacity: 0.5; } }
        .emp-name-col { flex: 1; min-width: 0; }
        .emp-name-row { font-size: 13px; font-weight: 500; color: var(--text-active); line-height: 1.3; }
        .emp-doing {
          font-size: 11px; color: rgba(245,246,248,0.55); line-height: 1.35; margin-top: 2px;
          overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
          -webkit-line-clamp: 1; -webkit-box-orient: vertical;
        }
        .emp-tier {
          font-family: ui-monospace, monospace; font-size: 9px; font-weight: 600;
          color: var(--accent-orange); background: rgba(235,64,0,0.14);
          padding: 2px 6px; border-radius: 4px; letter-spacing: 0.06em; flex-shrink: 0;
        }
        .emp-time {
          font-family: ui-monospace, monospace; font-size: 9px;
          color: rgba(245,246,248,0.45); letter-spacing: 0.04em;
          flex-shrink: 0; min-width: 28px; text-align: right;
        }
      `}</style>

      <div className="wrap">
        {/* ── Header — title + LIVE pill + inline state strip + date ── */}
        <div className="header">
          <div className="header-left">
            <h1 className="h1">dashboard.</h1>
            <span className="live-pill"><span className="live-dot" />live</span>
            <div className="state-strip">
              <span className="item">modules <span className="v">{state.modules}</span></span>
              <span className="item">edges <span className="v">{state.edges.toLocaleString()}</span></span>
              <span className="item">principles <span className="v">{state.principles}</span></span>
              <span className="item">skills <span className="v">{state.skills}</span></span>
              <span className="item">employees <span className="v">{empTotals.total}</span></span>
            </div>
          </div>
          <div className="date">{dateStr}</div>
        </div>

        {/* ── Main grid ── */}
        <div className="grid">

          {/* ── Composer ── */}
          <section className="composer-card">
            <div className="composer-eyebrow">operator interface</div>
            <h2 className="composer-title">ask arthur.</h2>
            <div className="composer-actions">
              {messages.length > 0 ? (
                <button type="button" className="ghost-btn" onClick={newConversation}>new thread</button>
              ) : (
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "rgba(245,246,248,0.45)", letterSpacing: "0.04em" }}>
                  multi-turn · tool calls · session memory
                </span>
              )}
              {sessionId && messages.length > 0 && (
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "rgba(245,246,248,0.4)", letterSpacing: "0.06em", marginLeft: "auto" }}>
                  session active
                </span>
              )}
            </div>

            <div className="stream" ref={streamRef}>
              {messages.length === 0 ? (
                <div className="empty">
                  ready. ask about the inbox, calendar, legal vault, brain graph — or anything you want pulled live from the web.
                  <div className="empty-pad">conversation persists across refreshes.</div>
                </div>
              ) : (
                messages.map((m, i) => {
                  const isAsst = m.role === "assistant";
                  const isPlaceholder = m.content === "…";
                  const isErr = m.content.startsWith("couldn't reach") || m.content.startsWith("network error");
                  const showFeedback = isAsst && !isPlaceholder && !isErr;
                  const isStreamingPlaceholder = isAsst && isPlaceholder && busy && i === messages.length - 1;
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 4, marginBottom: 12 }}>
                      <div className={"bubble " + m.role}>
                        {isStreamingPlaceholder ? (
                          <span className="thinking">
                            <span className="dots">●●●</span>
                            <span className="elapsed">⏱ {fmtDur(elapsedMs)}</span>
                            {etaMs != null && etaMs > elapsedMs && (
                              <span className="eta">~{fmtDur(etaMs - elapsedMs)} left</span>
                            )}
                          </span>
                        ) : m.content}
                      </div>
                      {isAsst && (m.toolCallsUsed ?? 0) > 0 && (
                        <div className="tool-meta">
                          <span className="tool-chip">▼ {m.toolCallsUsed} tool{m.toolCallsUsed !== 1 ? "s" : ""}</span>
                          {m.tierUsed && <span className={`tier-chip tier-${m.tierUsed.toLowerCase()}`}>{m.tierUsed}</span>}
                          {m.modelUsed && <span className="model-chip">{m.modelUsed}</span>}
                        </div>
                      )}
                      {showFeedback && (
                        <div className="fb-row">
                          {m.feedback === "accept" && <span className="fb-tag accept">✓ logged · accept</span>}
                          {m.feedback === "reject" && <span className="fb-tag reject">✗ logged · reject</span>}
                          {m.feedback === "edit" && <span className="fb-tag edit">✎ logged · edit</span>}
                          {!m.feedback && (
                            <>
                              <button type="button" className="fb-btn" title="thumbs up — train on this response" onClick={() => sendFeedback(i, "accept")}>👍</button>
                              <button type="button" className="fb-btn" title="thumbs down — flag as bad" onClick={() => sendFeedback(i, "reject")}>👎</button>
                              <button type="button" className="fb-btn" title="provide a corrected response" onClick={() => setMessages(prev => prev.map((msg, idx) => idx === i ? { ...msg, editing: true } : msg))}>✎</button>
                            </>
                          )}
                        </div>
                      )}
                      {isAsst && m.editing && (
                        <div className="fb-edit">
                          <textarea
                            value={m.correction ?? ""}
                            onChange={e => setMessages(prev => prev.map((msg, idx) => idx === i ? { ...msg, correction: e.target.value } : msg))}
                            placeholder="what should arthur have said? this becomes a training pair."
                            rows={3}
                          />
                          <div className="fb-edit-actions">
                            <button type="button" className="ghost-btn" onClick={() => setMessages(prev => prev.map((msg, idx) => idx === i ? { ...msg, editing: false, correction: "" } : msg))}>cancel</button>
                            <button type="button" className="fb-save" disabled={!(m.correction ?? "").trim()} onClick={() => sendFeedback(i, "edit", m.correction)}>save correction</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="composer-input-wrap">
              <textarea
                ref={taRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKey}
                placeholder="ask arthur anything…"
                rows={1}
                aria-label="Ask Arthur"
              />
              <button type="button" className="send-pill" onClick={send} disabled={busy || !prompt.trim()}>
                {busy ? "…" : "send"}
              </button>
            </div>
            <div className="composer-hint">↵ send · ⇧↵ newline</div>
          </section>

          {/* ── Side rail (state moved to header strip; rail = employees + queue) ── */}
          <aside className="rail">
            {/* Live employees — flex-grow with scroll */}
            <div className="panel-card emp-card flex">
              <div className="emp-head">
                <div>
                  <div className="panel-eyebrow">workforce</div>
                  <h3 className="panel-title">live employees.</h3>
                </div>
                <Link href="/employees">view all {empTotals.total} →</Link>
              </div>
              <div className="emp-stats">
                <div className="emp-stat">{empTotals.active}<div className="sl">active now</div></div>
                <div className="emp-stat dim">{empTotals.total}<div className="sl">total</div></div>
                <div className="emp-stat dim">147<div className="sl">routes today</div></div>
              </div>
              <div className="scroll-area">
                {liveEmps.length === 0 ? (
                  <div className="q-empty">pulling roster…</div>
                ) : (
                  liveEmps.map(emp => (
                    <Link key={emp.team + emp.id} href="/employees" className="emp-row">
                      <span className={"emp-status-dot " + emp.state} />
                      <div className="emp-name-col">
                        <div className="emp-name-row">{emp.name}</div>
                        <div className="emp-doing">{emp.task}</div>
                      </div>
                      <span className="emp-tier">{TIER[emp.model] || "T14"}</span>
                      <span className="emp-time">{emp.timeAgo}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Needs attention queue */}
            <div className="panel-card">
              <div className="panel-eyebrow">needs attention</div>
              <h3 className="panel-title">queue.</h3>
              {approvals.length === 0 && todayCal.length === 0 ? (
                <div className="q-empty">all clear — nothing flagged.</div>
              ) : (
                <div>
                  {approvals.slice(0, 3).map(a => (
                    <Link key={a.id} href="/inbox" className="q-item" style={{ textDecoration: "none" }}>
                      <span className="q-rail cool" />
                      <div className="q-body">
                        <div className="q-title">{a.subject ?? "(no subject)"}</div>
                        <div className="q-meta">inbox · {(a.from_name || a.from_email || "unknown").toString().slice(0, 36)}</div>
                      </div>
                    </Link>
                  ))}
                  {todayCal.slice(0, 3).map(e => {
                    const t = new Date(e.start);
                    const tt = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
                    return (
                      <Link key={e.id} href="/calendar" className="q-item" style={{ textDecoration: "none" }}>
                        <span className="q-rail amber" />
                        <div className="q-body">
                          <div className="q-title">{e.title}</div>
                          <div className="q-meta">calendar · today {tt}</div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
              <Link href="/inbox" className="panel-link">view inbox →</Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

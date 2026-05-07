"use client";
import { Nav } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { useState, useEffect } from "react";

const SITE_URL = "https://arthur-online.fly.dev";
const BEARER   = "38c7f157636ead7a948d1a992292d7b8";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IphoneEvent {
  id: string;
  event: string;
  data: Record<string, unknown>;
  ip_addr: string | null;
  created_at: string;
}

interface InboxCounts {
  total: number;
  yahoo: number;
  blackmarble: number;
  drinkswithdabney: number;
  pending_approvals: number;
}

interface StatusData {
  counts: InboxCounts | null;
  events: IphoneEvent[];
  eventsToday: number;
}

// ── Shortcut data ─────────────────────────────────────────────────────────────

const SHORTCUTS = [
  {
    name: "Morning Brief",
    emoji: "☀️",
    description: "Speaks today's plan via Siri. Tap or set as a morning alarm automation.",
    placement: "Lock Screen · Siri · Alarm automation",
    route: "daily-brief",
    method: "POST",
    body: null,
    addResult: "Show Result",
    addSpeak: true,
    color: "var(--tint-amber)",
    colorRaw: "#f59e0b",
    icon: "sunrise.fill",
  },
  {
    name: "What needs my reply?",
    emoji: "📬",
    description: "Fetches the top pending email approval — shows who, subject, and Arthur's proposed draft.",
    placement: "Home Screen · Lock Screen",
    route: "approve-next",
    method: "POST",
    body: null,
    addResult: "Show Result",
    addSpeak: false,
    color: "var(--tint-violet)",
    colorRaw: "#6366f1",
    icon: "envelope.badge.fill",
  },
  {
    name: "Snooze LOW CASH 4h",
    emoji: "💤",
    description: "Silences the LOW CASH alert for 4 hours — useful when you know about it.",
    placement: "Home Screen widget",
    route: "snooze-alert",
    method: "POST",
    body: JSON.stringify({ alert_message: "LOW CASH", hours: 4 }),
    addResult: "Show Result",
    addSpeak: false,
    color: "var(--tint-blue)",
    colorRaw: "#0ea5e9",
    icon: "moon.zzz.fill",
  },
  {
    name: "Quick Task",
    emoji: "⚡",
    description: "Prompts for a task title, sends it to Arthur goals with AI plan generated automatically.",
    placement: "Lock Screen · Share Sheet · Siri",
    route: "quick-create-task",
    method: "POST",
    body: "__ASK__",
    addResult: "Show Result",
    addSpeak: false,
    color: "var(--tint-emerald)",
    colorRaw: "#22c55e",
    icon: "bolt.fill",
  },
  {
    name: "I'm at Dabney",
    emoji: "📍",
    description: "Logs your Dabney arrival. Wire to a location automation in Shortcuts for hands-free logging.",
    placement: "Lock Screen · Location automation",
    route: "log",
    method: "POST",
    body: JSON.stringify({ event: "location_arrived", data: { place: "Dabney" } }),
    addResult: "Show Result",
    addSpeak: false,
    color: "var(--tint-red)",
    colorRaw: "#f43f5e",
    icon: "mappin.circle.fill",
  },
];

// ── Step-by-step walkthrough renderer ────────────────────────────────────────

function ShortcutSteps({ s }: { s: typeof SHORTCUTS[0] }) {
  const steps: { label: string; detail: string }[] = [];

  steps.push({ label: "Open Shortcuts app → tap +", detail: "Top right corner of the app" });
  steps.push({ label: 'Search for "Get Contents of URL"', detail: "Add that action" });
  steps.push({
    label: `Set URL to:`,
    detail: `${SITE_URL}/api/iphone/${s.route}`,
  });
  steps.push({
    label: "Tap Method → change to " + s.method,
    detail: s.method === "POST" ? 'Tap "Headers" → + → Key: Authorization, Value: Bearer ' + BEARER : "Leave as GET",
  });

  if (s.method === "POST") {
    steps.push({
      label: 'Tap "Request Body" → JSON',
      detail: s.body === "__ASK__"
        ? 'Add field: "title" → value: [Ask Each Time]'
        : s.body
          ? `Paste: ${s.body}`
          : "Leave empty (no body needed)",
    });
  } else {
    steps.push({
      label: 'Tap "Headers" → +',
      detail: `Key: Authorization  Value: Bearer ${BEARER}`,
    });
  }

  if (s.addSpeak) {
    steps.push({ label: 'Add action: "Speak Text"', detail: 'Drag after the URL action. Input: Shortcut Result' });
  } else {
    steps.push({ label: `Add action: "${s.addResult}"`, detail: "Drag after the URL action. Input: Shortcut Result" });
  }

  steps.push({
    label: "Name & save",
    detail: `Tap the shortcut name at the top → rename to "${s.name}" → set icon`,
  });
  steps.push({
    label: "Add to " + s.placement.split("·")[0].trim(),
    detail: s.placement.includes("Lock Screen")
      ? "Long-press Lock Screen → Customize → Shortcut widget"
      : s.placement.includes("Siri")
        ? 'Tap "Add to Siri" on the shortcut detail page'
        : 'Tap "Add to Home Screen" on the shortcut detail page',
  });

  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {steps.map((step, i) => (
        <li key={i} style={{ display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
          <span style={{
            flexShrink: 0,
            width: 22, height: 22,
            borderRadius: "50%",
            background: "var(--accent-orange-soft)",
            color: "var(--accent-orange)",
            fontSize: "var(--fs-xs)",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>{i + 1}</span>
          <div>
            <div style={{ fontSize: "var(--fs-small)", color: "var(--text-active)", fontWeight: 500 }}>{step.label}</div>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>{step.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Copy-paste config JSON ────────────────────────────────────────────────────

function ShortcutJSON({ s }: { s: typeof SHORTCUTS[0] }) {
  const [copied, setCopied] = useState(false);

  const config = {
    shortcut_name: s.name,
    steps: [
      {
        action: "Get Contents of URL",
        url:    `${SITE_URL}/api/iphone/${s.route}`,
        method: s.method,
        headers: { Authorization: `Bearer ${BEARER}` },
        ...(s.method === "POST" && s.body && s.body !== "__ASK__"
          ? { body: JSON.parse(s.body) }
          : s.body === "__ASK__"
            ? { body: { title: "[Ask Each Time]" } }
            : {}),
      },
      { action: s.addSpeak ? "Speak Text" : "Show Result", input: "Shortcut Result" },
    ],
  };

  const text = JSON.stringify(config, null, 2);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Config reference
        </span>
        <button
          onClick={copy}
          style={{
            background: copied ? "var(--accent-orange)" : "var(--glass-t2-bg)",
            border: "1px solid var(--glass-t1-border)",
            borderRadius: "var(--radius-sm)",
            color: copied ? "var(--accent-text-on)" : "var(--text-main)",
            cursor: "pointer",
            fontSize: "var(--fs-mono)",
            padding: "3px 10px",
          }}
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>
      <pre style={{
        background: "var(--glass-t1-bg)",
        border: "1px solid var(--glass-t1-border)",
        borderRadius: "var(--radius-sm)",
        padding: "10px var(--space-3)",
        fontSize: "var(--fs-mono)",
        color: "var(--text-main)",
        overflowX: "auto",
        margin: 0,
        lineHeight: 1.5,
      }}>{text}</pre>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IphonePage() {
  const [pushcutKey, setPushcutKey] = useState("");
  const [pushcutSaving, setPushcutSaving] = useState(false);
  const [pushcutResult, setPushcutResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [status, setStatus] = useState<StatusData>({ counts: null, events: [], eventsToday: 0 });
  const [statusLoading, setStatusLoading] = useState(true);
  const [expandedShortcut, setExpandedShortcut] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Load status panel data
  useEffect(() => {
    async function load() {
      setStatusLoading(true);
      try {
        const [countsRes, eventsRes] = await Promise.allSettled([
          fetch(`/api/iphone/inbox-count`, { headers: { Authorization: `Bearer ${BEARER}` } }),
          fetch(`/api/iphone/log`, { method: "GET" }).catch(() => null),
        ]);

        let counts: InboxCounts | null = null;
        if (countsRes.status === "fulfilled" && countsRes.value.ok) {
          counts = await countsRes.value.json() as InboxCounts;
        }

        // Fetch recent events via Supabase (client doesn't have service key, use the log endpoint indirectly)
        // We fetch a summary from the inbox-count endpoint which is available
        setStatus({ counts, events: [], eventsToday: 0 });
      } catch { /* ignore */ } finally {
        setStatusLoading(false);
      }
    }
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  async function savePushcutKey() {
    if (!pushcutKey.trim()) return;
    setPushcutSaving(true);
    setPushcutResult(null);
    try {
      const res = await fetch("/api/iphone/save-pushcut-key", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${BEARER}` },
        body:    JSON.stringify({ api_key: pushcutKey.trim() }),
      });
      const data = await res.json() as { ok?: boolean; message?: string };
      setPushcutResult(data);
    } catch (e) {
      setPushcutResult({ ok: false, message: (e as Error).message });
    } finally {
      setPushcutSaving(false);
    }
  }

  async function sendTestNotification() {
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/iphone/save-pushcut-key", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${BEARER}` },
        body:    JSON.stringify({ api_key: pushcutKey.trim() || "current" }),
      });
      const data = await res.json() as { test_sent?: boolean; test_error?: string; message?: string };
      setTestResult(data.test_sent ? "Test notification sent to your iPhone." : data.test_error ?? "couldn't send — check your Pushcut API key.");
    } catch (e) {
      setTestResult((e as Error).message);
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <>
      <Nav />
      <main style={{ minHeight: "100vh", paddingTop: 108, paddingBottom: "var(--space-11)" }}>
        <div className="wrap" style={{ maxWidth: 740 }}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <PageHeader
            eyebrow="Arthur · iPhone"
            title="iPhone Control Surface"
            subtitle="Arthur on your lock screen. 5 minutes to set up. Notifications with action buttons + shortcuts for the flows you run 10x a day."
            style={{ marginBottom: "var(--space-8)" }}
          />

          {/* ── Section A: Pushcut setup ─────────────────────────────────────── */}
          <section style={{ marginBottom: "var(--space-9)" }}>
            <SectionHeader letter="A" title="Pushcut setup" time="5 min" />

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {[
                {
                  n: 1,
                  title: "Install Pushcut from the App Store",
                  detail: "Free tier: 30 notifications/month. Unlimited for $0.99/mo. Search \"Pushcut\" or scan the QR at pushcut.io.",
                },
                {
                  n: 2,
                  title: "Open the app and allow notifications",
                  detail: "Pushcut will prompt you — tap Allow. Without this, notifications won't appear.",
                },
                {
                  n: 3,
                  title: "Create notification template: arthur-action",
                  detail: 'Tap "Notifications" tab (bottom nav) → "+" button → Name it arthur-action exactly (case-sensitive) → Save.',
                },
                {
                  n: 4,
                  title: "Copy your API key",
                  detail: 'Tap "Settings" tab → "API" → copy the key shown. It starts with a long alphanumeric string.',
                },
              ].map(step => (
                <GlassPanel key={step.n} style={{
                  borderRadius: "var(--radius-sm)",
                  padding: "14px var(--space-4)",
                  display: "flex",
                  gap: "var(--space-4)",
                  alignItems: "flex-start",
                }}>
                  <span style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: "var(--accent-orange-soft)",
                    color: "var(--accent-orange)",
                    fontWeight: 700,
                    fontSize: "var(--fs-small)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>{step.n}</span>
                  <div>
                    <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-active)" }}>{step.title}</div>
                    <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: "var(--space-1)", lineHeight: 1.5 }}>{step.detail}</div>
                  </div>
                </GlassPanel>
              ))}

              {/* Step 5 — paste API key */}
              <GlassPanel style={{
                borderRadius: "var(--radius-sm)",
                padding: "14px var(--space-4)",
              }}>
                <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
                  <span style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: "var(--accent-orange-soft)",
                    color: "var(--accent-orange)",
                    fontWeight: 700,
                    fontSize: "var(--fs-small)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>5</span>
                  <div>
                    <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-active)" }}>Paste your API key here</div>
                    <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>
                      Arthur stores it securely and fires a test push to confirm.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <input
                    type="text"
                    aria-label="Pushcut API key"
                    value={pushcutKey}
                    onChange={e => setPushcutKey(e.target.value)}
                    placeholder="Paste Pushcut API key…"
                    style={{
                      flex: 1,
                      background: "var(--glass-t2-bg)",
                      border: "1px solid var(--glass-t2-border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text-active)",
                      fontSize: "var(--fs-small)",
                      padding: "9px var(--space-3)",
                      fontFamily: "var(--font-jetbrains), monospace",
                    }}
                  />
                  <button
                    onClick={savePushcutKey}
                    disabled={pushcutSaving || !pushcutKey.trim()}
                    style={{
                      background: pushcutSaving ? "var(--glass-t1-border)" : "var(--accent-orange)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-text-on)",
                      cursor: pushcutSaving || !pushcutKey.trim() ? "default" : "pointer",
                      fontSize: "var(--fs-small)",
                      fontWeight: 600,
                      padding: "9px var(--space-5)",
                      opacity: !pushcutKey.trim() ? 0.5 : 1,
                    }}
                  >
                    {pushcutSaving ? "saving…" : "save"}
                  </button>
                </div>
                {pushcutResult && (
                  <div style={{
                    marginTop: "var(--space-3)",
                    padding: "10px var(--space-3)",
                    borderRadius: "var(--radius-sm)",
                    background: pushcutResult.ok ? "var(--tint-emerald-soft)" : "var(--tint-red-soft)",
                    border: `1px solid ${pushcutResult.ok ? "rgba(52,211,153,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: pushcutResult.ok ? "var(--tint-emerald)" : "var(--tint-red)",
                    fontSize: "var(--fs-small)",
                  }}>
                    {pushcutResult.ok ? "✓ " : "✗ "}{pushcutResult.message}
                  </div>
                )}
              </GlassPanel>
            </div>
          </section>

          {/* ── Section B: Shortcuts ──────────────────────────────────────────── */}
          <section style={{ marginBottom: "var(--space-9)" }}>
            <SectionHeader letter="B" title="Shortcut bundles" time="5 min" />

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {SHORTCUTS.map(s => {
                const expanded = expandedShortcut === s.name;
                return (
                  <div key={s.name} style={{
                    background: "var(--glass-t1-bg)",
                    border: `1px solid ${expanded ? "var(--accent-orange)" : "var(--glass-t1-border)"}`,
                    borderRadius: "var(--radius-card)",
                    overflow: "hidden",
                    transition: "border-color 0.15s",
                  }}>
                    <button
                      onClick={() => setExpandedShortcut(expanded ? null : s.name)}
                      style={{
                        width: "100%",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "14px var(--space-4)",
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-3)",
                        textAlign: "left",
                      }}
                    >
                      <span style={{
                        fontSize: "var(--fs-h3)",
                        width: 36, height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "var(--radius-sm)",
                        background: `${s.colorRaw}22`,
                        flexShrink: 0,
                      }}>{s.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "var(--fs-small)", fontWeight: 600, color: "var(--text-active)" }}>{s.name}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>{s.description}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--space-1)", flexShrink: 0 }}>
                        <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", background: "var(--glass-t2-bg)", borderRadius: "var(--radius-sm)", padding: "2px var(--space-2)" }}>
                          {s.placement.split("·")[0].trim()}
                        </span>
                        <span style={{ fontSize: "var(--fs-xs)", color: "var(--accent-orange)", opacity: 0.7 }}>{expanded ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div style={{ padding: "0 var(--space-4) var(--space-4)", borderTop: "1px solid var(--glass-t1-border)" }}>
                        <div style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-4)" }}>
                          <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-3)" }}>
                            Build it step by step
                          </div>
                          <ShortcutSteps s={s} />
                        </div>
                        <div style={{
                          fontSize: "var(--fs-mono)",
                          color: "var(--text-muted)",
                          background: "var(--glass-t2-bg)",
                          border: "1px solid var(--glass-t1-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "var(--space-2) var(--space-3)",
                          marginBottom: "var(--space-1)",
                        }}>
                          Placement: {s.placement}
                        </div>
                        <ShortcutJSON s={s} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Section C: Status panel ───────────────────────────────────────── */}
          <section style={{ marginBottom: "var(--space-9)" }}>
            <SectionHeader letter="C" title="Live status" time="" />

            {statusLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "var(--space-3)",
                }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="arthur-skeleton" style={{ height: 70, opacity: 0.25 + i * 0.05 }} />
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

                {/* Counters */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "var(--space-3)",
                }}>
                  {[
                    { label: "inbox total",        value: status.counts?.total            ?? "—" },
                    { label: "pending approvals",   value: status.counts?.pending_approvals ?? "—" },
                    { label: "yahoo",               value: status.counts?.yahoo             ?? "—" },
                    { label: "blackmarble",         value: status.counts?.blackmarble       ?? "—" },
                    { label: "drinkswithdabney",    value: status.counts?.drinkswithdabney  ?? "—" },
                  ].map(c => (
                    <GlassPanel key={c.label} style={{
                      borderRadius: "var(--radius-sm)",
                      padding: "14px var(--space-4)",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text-active)", fontFamily: "var(--font-jetbrains), monospace" }}>
                        {c.value}
                      </div>
                      <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", marginTop: "var(--space-1)" }}>{c.label}</div>
                    </GlassPanel>
                  ))}
                </div>

                {/* Send test notification */}
                <GlassPanel style={{
                  borderRadius: "var(--radius-sm)",
                  padding: "14px var(--space-4)",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                }}>
                  <button
                    onClick={sendTestNotification}
                    disabled={sendingTest}
                    style={{
                      background: "var(--accent-orange)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--accent-text-on)",
                      cursor: sendingTest ? "default" : "pointer",
                      fontSize: "var(--fs-small)",
                      fontWeight: 600,
                      padding: "9px var(--space-5)",
                      flexShrink: 0,
                    }}
                  >
                    {sendingTest ? "sending…" : "Send test notification"}
                  </button>
                  {testResult && (
                    <span style={{ fontSize: "var(--fs-small)", color: testResult.includes("sent") ? "var(--tint-emerald)" : "var(--tint-red)" }}>
                      {testResult}
                    </span>
                  )}
                  {!testResult && (
                    <span style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)" }}>
                      Fires a test push to confirm Pushcut is wired correctly.
                    </span>
                  )}
                </GlassPanel>

                {/* API endpoints reference */}
                <GlassPanel style={{
                  borderRadius: "var(--radius-sm)",
                  padding: "14px var(--space-4)",
                }}>
                  <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--text-active)", marginBottom: "var(--space-3)" }}>
                    iPhone API endpoints
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                    {[
                      { method: "POST", path: "/api/iphone/daily-brief",       desc: "Morning brief text" },
                      { method: "POST", path: "/api/iphone/approve-next",       desc: "Next pending approval" },
                      { method: "POST", path: "/api/iphone/approval-action",    desc: "Approve / skip / edit" },
                      { method: "POST", path: "/api/iphone/snooze-alert",       desc: "Snooze an alert N hours" },
                      { method: "POST", path: "/api/iphone/quick-create-task",  desc: "Create goal + AI plan" },
                      { method: "POST", path: "/api/iphone/log",                desc: "Log iPhone event" },
                      { method: "GET",  path: "/api/iphone/inbox-count",        desc: "Widget counter data" },
                      { method: "GET",  path: "/api/iphone/calendar-today",     desc: "Today's events compact" },
                    ].map(ep => (
                      <div key={ep.path} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--fs-xs)" }}>
                        <TokenChip
                          label={ep.method}
                          size="xs"
                          color={ep.method === "GET" ? "success" : "purple"}
                          style={{ fontFamily: "var(--font-jetbrains), monospace" }}
                        />
                        <span style={{ fontFamily: "var(--font-jetbrains), monospace", color: "var(--text-main)", flex: 1 }}>
                          {ep.path}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>{ep.desc}</span>
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              </div>
            )}
          </section>

        </div>
      </main>
    </>
  );
}

// ── Section header helper ─────────────────────────────────────────────────────

function SectionHeader({ letter, title, time }: { letter: string; title: string; time: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
      <span style={{
        width: 28, height: 28,
        borderRadius: "50%",
        background: "var(--accent-orange)",
        color: "var(--accent-text-on)",
        fontSize: "var(--fs-small)",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>{letter}</span>
      <h2 style={{ fontSize: "var(--fs-h3)", fontWeight: 700, color: "var(--text-active)", margin: 0 }}>{title}</h2>
      {time && (
        <span style={{
          fontSize: "var(--fs-mono)",
          color: "var(--accent-orange)",
          background: "var(--accent-orange-soft)",
          borderRadius: "var(--radius-pill)",
          padding: "2px var(--space-3)",
          fontWeight: 500,
        }}>{time}</span>
      )}
    </div>
  );
}

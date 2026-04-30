"use client";
import { Nav } from "../_components/Layout";
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
    color: "#f59e0b",
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
    color: "#6366f1",
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
    color: "#0ea5e9",
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
    color: "#22c55e",
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
    color: "#f43f5e",
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
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
      {steps.map((step, i) => (
        <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{
            flexShrink: 0,
            width: 22, height: 22,
            borderRadius: "50%",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>{i + 1}</span>
          <div>
            <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>{step.label}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{step.detail}</div>
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
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Config reference
        </span>
        <button
          onClick={copy}
          style={{
            background: copied ? "var(--accent)" : "var(--panel-elev)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            color: copied ? "#fff" : "var(--text-dim)",
            cursor: "pointer",
            fontSize: 11,
            padding: "3px 10px",
          }}
        >
          {copied ? "copied!" : "copy"}
        </button>
      </div>
      <pre style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 12px",
        fontSize: 11,
        color: "var(--text-dim)",
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
      setTestResult(data.test_sent ? "Test notification sent to your iPhone." : data.test_error ?? "Failed.");
    } catch (e) {
      setTestResult((e as Error).message);
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <>
      <Nav />
      <main style={{ minHeight: "100vh", paddingTop: 80, paddingBottom: 80 }}>
        <div className="wrap" style={{ maxWidth: 740 }}>

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>
              Arthur · iPhone
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: 0, lineHeight: 1.2 }}>
              iPhone Control Surface
            </h1>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8, marginBottom: 0, lineHeight: 1.6 }}>
              Arthur on your lock screen. 5 minutes to set up. Notifications with action buttons + shortcuts
              for the flows you run 10x a day.
            </p>
          </div>

          {/* ── Section A: Pushcut setup ─────────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <SectionHeader letter="A" title="Pushcut setup" time="5 min" />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                <div key={step.n} style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                }}>
                  <span style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontWeight: 700,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>{step.n}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{step.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>{step.detail}</div>
                  </div>
                </div>
              ))}

              {/* Step 5 — paste API key */}
              <div style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "14px 16px",
              }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{
                    flexShrink: 0,
                    width: 28, height: 28,
                    borderRadius: "50%",
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontWeight: 700,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>5</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Paste your API key here</div>
                    <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 3 }}>
                      Arthur stores it securely and fires a test push to confirm.
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={pushcutKey}
                    onChange={e => setPushcutKey(e.target.value)}
                    placeholder="Paste Pushcut API key…"
                    style={{
                      flex: 1,
                      background: "var(--panel-elev)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 8,
                      color: "var(--text)",
                      fontSize: 13,
                      padding: "9px 12px",
                      fontFamily: "var(--font-jetbrains), monospace",
                    }}
                  />
                  <button
                    onClick={savePushcutKey}
                    disabled={pushcutSaving || !pushcutKey.trim()}
                    style={{
                      background: pushcutSaving ? "var(--border)" : "var(--accent)",
                      border: "none",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: pushcutSaving || !pushcutKey.trim() ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "9px 18px",
                      opacity: !pushcutKey.trim() ? 0.5 : 1,
                    }}
                  >
                    {pushcutSaving ? "saving…" : "save"}
                  </button>
                </div>
                {pushcutResult && (
                  <div style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 7,
                    background: pushcutResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                    border: `1px solid ${pushcutResult.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    color: pushcutResult.ok ? "#22c55e" : "#ef4444",
                    fontSize: 13,
                  }}>
                    {pushcutResult.ok ? "✓ " : "✗ "}{pushcutResult.message}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Section B: Shortcuts ──────────────────────────────────────────── */}
          <section style={{ marginBottom: 48 }}>
            <SectionHeader letter="B" title="Shortcut bundles" time="5 min" />

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {SHORTCUTS.map(s => {
                const expanded = expandedShortcut === s.name;
                return (
                  <div key={s.name} style={{
                    background: "var(--panel)",
                    border: `1px solid ${expanded ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 12,
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
                        padding: "14px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        textAlign: "left",
                      }}
                    >
                      <span style={{
                        fontSize: 20,
                        width: 36, height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        background: `${s.color}22`,
                        flexShrink: 0,
                      }}>{s.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{s.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{s.description}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--panel-elev)", borderRadius: 4, padding: "2px 6px" }}>
                          {s.placement.split("·")[0].trim()}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--accent)", opacity: 0.7 }}>{expanded ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {expanded && (
                      <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                        <div style={{ marginTop: 14, marginBottom: 14 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                            Build it step by step
                          </div>
                          <ShortcutSteps s={s} />
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          background: "var(--panel-elev)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "6px 10px",
                          marginBottom: 4,
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
          <section style={{ marginBottom: 48 }}>
            <SectionHeader letter="C" title="Live status" time="" />

            {statusLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="iph-skeleton" style={{ height: 70, borderRadius: 10, opacity: 0.25 + i * 0.05 }} />
                  ))}
                </div>
                <style>{`
                  @keyframes iph-shimmer { 0% { background-position: -600px 0; } 100% { background-position: 600px 0; } }
                  .iph-skeleton { background: linear-gradient(90deg, var(--panel) 25%, var(--panel-elev) 50%, var(--panel) 75%); background-size: 1200px 100%; animation: iph-shimmer 1.6s infinite; }
                `}</style>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Counters */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                }}>
                  {[
                    { label: "inbox total",        value: status.counts?.total            ?? "—" },
                    { label: "pending approvals",   value: status.counts?.pending_approvals ?? "—" },
                    { label: "yahoo",               value: status.counts?.yahoo             ?? "—" },
                    { label: "blackmarble",         value: status.counts?.blackmarble       ?? "—" },
                    { label: "drinkswithdabney",    value: status.counts?.drinkswithdabney  ?? "—" },
                  ].map(c => (
                    <div key={c.label} style={{
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-jetbrains), monospace" }}>
                        {c.value}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Send test notification */}
                <div style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <button
                    onClick={sendTestNotification}
                    disabled={sendingTest}
                    style={{
                      background: "var(--accent)",
                      border: "none",
                      borderRadius: 8,
                      color: "#fff",
                      cursor: sendingTest ? "default" : "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "9px 18px",
                      flexShrink: 0,
                    }}
                  >
                    {sendingTest ? "sending…" : "Send test notification"}
                  </button>
                  {testResult && (
                    <span style={{ fontSize: 13, color: testResult.includes("sent") ? "#22c55e" : "#ef4444" }}>
                      {testResult}
                    </span>
                  )}
                  {!testResult && (
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                      Fires a test push to confirm Pushcut is wired correctly.
                    </span>
                  )}
                </div>

                {/* API endpoints reference */}
                <div style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>
                    iPhone API endpoints
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                      <div key={ep.path} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                        <span style={{
                          flexShrink: 0,
                          background: ep.method === "GET" ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.15)",
                          color:       ep.method === "GET" ? "#22c55e" : "#6366f1",
                          borderRadius: 4,
                          padding: "1px 6px",
                          fontFamily: "var(--font-jetbrains), monospace",
                          fontSize: 10,
                          fontWeight: 700,
                        }}>{ep.method}</span>
                        <span style={{ fontFamily: "var(--font-jetbrains), monospace", color: "var(--text-dim)", flex: 1 }}>
                          {ep.path}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>{ep.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <span style={{
        width: 28, height: 28,
        borderRadius: "50%",
        background: "var(--accent)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>{letter}</span>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>{title}</h2>
      {time && (
        <span style={{
          fontSize: 11,
          color: "var(--accent)",
          background: "var(--accent-soft)",
          borderRadius: 20,
          padding: "2px 10px",
          fontWeight: 500,
        }}>{time}</span>
      )}
    </div>
  );
}

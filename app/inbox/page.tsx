"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Nav, Footer } from "../_components/Layout";

// ── Types ────────────────────────────────────────────────────────────────────

type Folder = "inbox" | "sent" | "archived" | "deleted" | "drafts" | "flagged";

interface Classification {
  intent: string;
  urgency: "p0" | "p1" | "p2" | "p3";
  venue: string;
  confidence: number;
  reasoning: string;
  model?: string;
}

interface EmailRow {
  id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  domain: string | null;
  mailbox: string | null;
  is_read: boolean;
  is_archived: boolean;
  is_deleted: boolean;
  label: string | null;
  replied_at: string | null;
  annotation: string | null;
  direction: "inbound" | "outbound";
  in_reply_to: string | null;
  // automation fields
  classification: Classification | null;
  auto_action: "none" | "archive" | "delete" | "draft" | "flag" | null;
  auto_action_at: string | null;
  requires_review: boolean;
  draft_subject: string | null;
  draft_body: string | null;
  draft_to: string | null;
  actor: "daniel" | "arthur" | "system";
}

interface EmailFull extends EmailRow {
  body_html: string | null;
  raw_headers: Record<string, string> | null;
}

interface FolderCounts {
  inbox: number;
  sent: number;
  archived: number;
  deleted: number;
  drafts: number;
  flagged: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function snippet(text: string | null, len = 100): string {
  if (!text) return "";
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > len ? s.slice(0, len) + "…" : s;
}

function hashToFolder(hash: string): Folder {
  const h = hash.replace("#", "");
  if (h === "sent" || h === "archived" || h === "deleted" || h === "drafts" || h === "flagged") return h;
  return "inbox";
}

// Intent badge colors
const INTENT_COLORS: Record<string, { bg: string; color: string }> = {
  newsletter:     { bg: "#1e3a5f", color: "#7eb8f7" },
  promotion:      { bg: "#3a1e5f", color: "#c07ef7" },
  cold_sales:     { bg: "#5f1e1e", color: "#f78e7e" },
  confirmation:   { bg: "#1e4f3a", color: "#7ef7b0" },
  catering:       { bg: "#4f3a1e", color: "#f7c07e" },
  vendor_invoice: { bg: "#3a3a1e", color: "#f7f07e" },
  press:          { bg: "#1e4f4f", color: "#7ef7f7" },
  personal:       { bg: "#4f4f1e", color: "#f7f7a0" },
  legal:          { bg: "#5f0000", color: "#ff7070" },
  auto_reply:     { bg: "#2a2a2a", color: "#aaaaaa" },
  other:          { bg: "#252525", color: "#888888" },
};

function IntentBadge({ intent }: { intent: string }) {
  const colors = INTENT_COLORS[intent] ?? INTENT_COLORS.other;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: 9,
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: colors.bg,
        color: colors.color,
        flexShrink: 0,
      }}
    >
      {intent.replace(/_/g, " ")}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function InboxPage() {
  const [folder, setFolder] = useState<Folder>("inbox");

  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [repliedOnly, setRepliedOnly] = useState(false);
  const [smart, setSmart] = useState<"" | "needs_attention" | "awaiting_reply" | "this_week">("");
  const [showRawFilters, setShowRawFilters] = useState(false);

  const [rows, setRows] = useState<EmailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<FolderCounts>({ inbox: 0, sent: 0, archived: 0, deleted: 0, drafts: 0, flagged: 0 });
  const [loading, setLoading] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmailFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Manual reply composer
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");

  // Draft approval composer (auto-generated)
  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftSending, setDraftSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");

  const [annotation, setAnnotation] = useState("");
  const [reverting, setReverting] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");

  const [automationOn, setAutomationOn] = useState<boolean | null>(null);

  // Today snapshot (shown in empty right pane)
  const [snapshot, setSnapshot] = useState<{
    pendingApprovals: number;
    extractionsToday: number;
    calendarToday: number;
  } | null>(null);

  const prevTotalRef = useRef(0);

  const domains = Array.from(new Set(rows.map(r => r.domain).filter(Boolean))) as string[];

  // Fetch automation status for indicator
  useEffect(() => {
    fetch("/api/inbox/settings")
      .then(r => r.json())
      .then((d: { automation_enabled?: boolean }) => setAutomationOn(d.automation_enabled ?? true))
      .catch(() => setAutomationOn(null));
  }, []);

  // Fetch today snapshot for empty pane
  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    today.setHours(0, 0, 0, 0);

    Promise.allSettled([
      fetch("/api/inbox/list?smart=needs_attention").then(r => r.json()),
      fetch(`/api/calendar/events?start=${today.toISOString()}&end=${tomorrow.toISOString()}`).then(r => r.json()),
    ]).then(([approvals, cal]) => {
      const pendingApprovals =
        approvals.status === "fulfilled"
          ? ((approvals.value as { rows?: unknown[] }).rows ?? []).length
          : 0;
      const calendarToday =
        cal.status === "fulfilled" && Array.isArray(cal.value)
          ? (cal.value as unknown[]).length
          : 0;
      setSnapshot({ pendingApprovals, extractionsToday: 0, calendarToday });
    }).catch(() => {});
  }, []);

  // ── URL hash sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    setFolder(hashToFolder(window.location.hash));
    function onHashChange() {
      setFolder(hashToFolder(window.location.hash));
      setSelectedId(null);
      setMobilePane("list");
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function switchFolder(f: Folder) {
    window.location.hash = f === "inbox" ? "" : f;
    setFolder(f);
    setSelectedId(null);
    setMobilePane("list");
    setQ("");
    setUnreadOnly(false);
    setRepliedOnly(false);
  }

  // ── Fetch list ─────────────────────────────────────────────────────────────
  const fetchList = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      params.set("folder", folder);
      if (domain) params.set("domain", domain);
      if (q) params.set("q", q);
      if (unreadOnly) params.set("unread_only", "true");
      if (repliedOnly) params.set("replied_only", "true");
      if (smart) params.set("smart", smart);

      try {
        const res = await fetch(`/api/inbox/list?${params}`);
        if (!res.ok) return;
        const json = (await res.json()) as { rows: EmailRow[]; total: number; counts: FolderCounts };
        setRows(json.rows);
        setTotal(json.total);
        if (json.counts) setCounts(json.counts);

        if (silent && json.total > prevTotalRef.current) {
          setNewCount(json.total - prevTotalRef.current);
          setTimeout(() => setNewCount(0), 4000);
        }
        prevTotalRef.current = json.total;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [folder, domain, q, unreadOnly, repliedOnly, smart]
  );

  useEffect(() => { fetchList(false); }, [fetchList]);
  useEffect(() => {
    const id = setInterval(() => fetchList(true), 15000);
    return () => clearInterval(id);
  }, [fetchList]);

  // ── Fetch single email ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setSelected(null); return; }
    setLoadingDetail(true);
    fetch(`/api/inbox/${selectedId}`)
      .then(r => r.json())
      .then((data: EmailFull) => {
        setSelected(data);
        setAnnotation(data.annotation ?? "");
        setReplyTo(data.direction === "outbound" ? data.to_email : data.from_email);
        setReplySubject(`Re: ${data.subject ?? ""}`);
        setReplyText("");
        setReplyOpen(false);
        setReplyStatus("");
        // Draft fields
        setDraftTo(data.draft_to ?? "");
        setDraftSubject(data.draft_subject ?? "");
        setDraftBody(data.draft_body ?? "");
        setDraftStatus("");
        if (!data.is_read && data.direction === "inbound") {
          fetch(`/api/inbox/${selectedId}/mark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_read: true }),
          }).then(() => {
            setRows(prev =>
              prev.map(r => (r.id === selectedId ? { ...r, is_read: true } : r))
            );
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function openEmail(id: string) {
    setSelectedId(id);
    setMobilePane("detail");
  }

  function markAction(patch: Partial<Pick<EmailRow, "is_read" | "is_archived" | "is_deleted" | "label">>) {
    if (!selectedId) return;
    fetch(`/api/inbox/${selectedId}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(() => {
      const removesFromView =
        patch.is_archived === true ||
        patch.is_deleted === true ||
        patch.is_deleted === false ||
        patch.is_archived === false;

      if (removesFromView) {
        setRows(prev => prev.filter(r => r.id !== selectedId));
        setSelectedId(null);
        setMobilePane("list");
        fetchList(true);
      } else {
        setRows(prev => prev.map(r => (r.id === selectedId ? { ...r, ...patch } : r)));
        if (selected) setSelected({ ...selected, ...patch });
      }
    });
  }

  function saveAnnotation() {
    if (!selectedId) return;
    fetch(`/api/inbox/${selectedId}/mark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotation }),
    });
  }

  async function revertAutoAction() {
    if (!selectedId || !selected) return;
    setReverting(true);
    try {
      const res = await fetch(`/api/inbox/${selectedId}/revert`, { method: "POST" });
      if (res.ok) {
        const updated = (await res.json()) as EmailFull;
        setSelected(updated);
        setRows(prev => prev.map(r => r.id === selectedId ? { ...r, ...updated } : r));
        fetchList(true);
      }
    } catch (e) {
      console.error("revert failed", e);
    } finally {
      setReverting(false);
    }
  }

  async function approveDraftAndSend() {
    if (!selectedId || !draftTo || !draftBody.trim()) return;
    setDraftSending(true);
    setDraftStatus("sending…");
    try {
      const res = await fetch(`/api/inbox/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: draftTo, subject: draftSubject, text: draftBody }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setDraftStatus("error: " + (json.error ?? res.statusText));
      } else {
        setDraftStatus("sent.");
        // Clear draft fields on the email row
        await fetch(`/api/inbox/${selectedId}/mark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ annotation }),
        });
        setRows(prev => prev.filter(r => r.id !== selectedId));
        setSelectedId(null);
        setMobilePane("list");
        setCounts(c => ({ ...c, sent: c.sent + 1, drafts: Math.max(0, c.drafts - 1) }));
        fetchList(true);
      }
    } catch (e: unknown) {
      setDraftStatus("network error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDraftSending(false);
    }
  }

  async function discardDraft() {
    if (!selectedId) return;
    // Revert the draft auto_action
    await revertAutoAction();
    setRows(prev => prev.filter(r => r.id !== selectedId));
    setSelectedId(null);
    setMobilePane("list");
    setCounts(c => ({ ...c, drafts: Math.max(0, c.drafts - 1) }));
    fetchList(true);
  }

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return;
    setReplying(true);
    setReplyStatus("sending…");
    try {
      const res = await fetch(`/api/inbox/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: replyTo, subject: replySubject, text: replyText }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setReplyStatus("error: " + (json.error ?? res.statusText));
      } else {
        setReplyStatus("sent.");
        setReplyOpen(false);
        if (selected) setSelected({ ...selected, replied_at: new Date().toISOString() });
        setRows(prev => prev.map(r => r.id === selectedId ? { ...r, replied_at: new Date().toISOString() } : r));
        setCounts(c => ({ ...c, sent: c.sent + 1 }));
      }
    } catch (e: unknown) {
      setReplyStatus("network error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReplying(false);
    }
  }

  async function toggleAutomation() {
    const newVal = !automationOn;
    setAutomationOn(newVal);
    await fetch("/api/inbox/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ automation_enabled: newVal }),
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const unreadCount = rows.filter(r => !r.is_read && r.direction === "inbound").length;

  // Mobile: is folder dropdown open?
  const [mobileFolderOpen, setMobileFolderOpen] = useState(false);

  // Total unread across all folders (for dropdown label)
  const totalUnread = useMemo(
    () => counts.inbox + counts.flagged + counts.drafts,
    [counts]
  );

  const AUTO_ACTION_LABELS: Record<string, string> = {
    archive: "archived",
    delete: "deleted",
    draft: "drafted reply",
    flag: "flagged for review",
  };

  return (
    <>
      <Nav />

      <div style={{ minHeight: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
        {/* ── Top bar ── */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            background: "var(--panel)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }}>
            <span
              style={{
                fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              inbox.
            </span>
            {unreadCount > 0 && (
              <span
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                  letterSpacing: "0.04em",
                }}
              >
                {unreadCount} unread
              </span>
            )}
            {newCount > 0 && (
              <span
                style={{
                  background: "var(--lobe-upgrades)",
                  color: "#000",
                  borderRadius: 10,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                }}
              >
                +{newCount} new
              </span>
            )}
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="search subject, from, body…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{
              flex: "1 1 200px",
              maxWidth: 320,
              padding: "7px 12px",
              fontSize: 12.5,
              height: 34,
              minHeight: "unset",
            }}
          />

          {/* Domain filter */}
          <select
            value={domain}
            onChange={e => setDomain(e.target.value)}
            style={{
              background: "var(--panel-elev)",
              border: "1px solid var(--border-strong)",
              borderRadius: 8,
              color: "var(--text-dim)",
              fontSize: 12.5,
              padding: "6px 10px",
              height: 34,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <option value="">all domains</option>
            <option value="loveleedaystudios.com">loveleedaystudios.com</option>
            <option value="drinkswithdabney.com">drinkswithdabney.com</option>
            <option value="olldae.com">olldae.com</option>
            {domains.filter(d => !["loveleedaystudios.com","drinkswithdabney.com","olldae.com"].includes(d)).map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Smart filter chips — horizontal scroll on mobile */}
          <div className="inbox-filter-chips">
            {folder === "inbox" && (
              <>
                <FilterToggle
                  label="needs attention"
                  active={smart === "needs_attention"}
                  onToggle={() => setSmart(p => p === "needs_attention" ? "" : "needs_attention")}
                />
                <FilterToggle
                  label="this week"
                  active={smart === "this_week"}
                  onToggle={() => setSmart(p => p === "this_week" ? "" : "this_week")}
                />
              </>
            )}
            {folder === "sent" && (
              <FilterToggle
                label="awaiting reply"
                active={smart === "awaiting_reply"}
                onToggle={() => setSmart(p => p === "awaiting_reply" ? "" : "awaiting_reply")}
              />
            )}
          </div>

          {/* Automation indicator */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggleAutomation}
              title="Toggle automation — click to flip, go to /inbox/settings for full control"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: automationOn ? "rgba(0,200,100,0.12)" : "var(--panel-elev)",
                border: `1px solid ${automationOn ? "rgba(0,200,100,0.35)" : "var(--border-strong)"}`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 10.5,
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                letterSpacing: "0.06em",
                color: automationOn ? "#4ade80" : "var(--text-faint)",
                cursor: "pointer",
              }}
            >
              <span>⚙</span>
              <span>automation: {automationOn === null ? "…" : automationOn ? "on" : "off"}</span>
            </button>
            <a
              href="/inbox/settings"
              style={{
                fontSize: 10.5,
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                color: "var(--text-faint)",
                textDecoration: "none",
                letterSpacing: "0.04em",
              }}
            >
              settings →
            </a>
          </div>
        </div>

        {/* ── Three-pane body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Left sidebar ── */}
          <div
            className="inbox-list-pane"
            style={{
              width: 340,
              minWidth: 0,
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Folder nav — desktop: vertical list; mobile: dropdown */}
            <div
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "8px 10px",
                flexShrink: 0,
              }}
            >
              {/* Mobile folder dropdown */}
              <div className="folder-dropdown-mobile">
                <button
                  onClick={() => setMobileFolderOpen(o => !o)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    background: "var(--panel-elev)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 7,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 12.5,
                    color: "var(--accent)",
                    fontWeight: 600,
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                  }}
                >
                  <span>{FOLDER_ICONS[folder]} {folder}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {counts[folder] > 0 && (
                      <span style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                        borderRadius: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 6px",
                      }}>
                        {counts[folder]}
                      </span>
                    )}
                    <span style={{ fontSize: 9, opacity: 0.6 }}>{mobileFolderOpen ? "▲" : "▼"}</span>
                  </span>
                </button>
                {mobileFolderOpen && (
                  <div style={{
                    position: "absolute",
                    zIndex: 50,
                    background: "var(--panel-elev)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 8,
                    padding: 6,
                    marginTop: 4,
                    width: "calc(100% - 20px)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}>
                    {(["inbox", "sent", "archived", "deleted", "drafts", "flagged"] as Folder[]).map(f => (
                      <button
                        key={f}
                        onClick={() => { switchFolder(f); setMobileFolderOpen(false); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          textAlign: "left",
                          background: folder === f ? "var(--accent-soft)" : "transparent",
                          border: "none",
                          borderRadius: 5,
                          padding: "8px 10px",
                          cursor: "pointer",
                          color: folder === f ? "var(--accent)" : "var(--text-dim)",
                          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                          fontSize: 11.5,
                        }}
                      >
                        <span style={{ width: 14, textAlign: "center", opacity: 0.6 }}>{FOLDER_ICONS[f]}</span>
                        <span style={{ flex: 1 }}>{f}</span>
                        {counts[f] > 0 && (
                          <span style={{
                            fontSize: 10,
                            background: "var(--panel)",
                            borderRadius: 8,
                            padding: "1px 6px",
                            color: "var(--text-faint)",
                          }}>
                            {counts[f]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop folder list */}
              <div className="folder-list-desktop" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {(["inbox", "sent", "archived", "deleted", "drafts", "flagged"] as Folder[]).map(f => (
                  <FolderButton
                    key={f}
                    label={f}
                    count={counts[f]}
                    active={folder === f}
                    onClick={() => switchFolder(f)}
                  />
                ))}
              </div>
            </div>

            {/* Email list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="inbox-skeleton" style={{ height: 62, borderRadius: 6, opacity: 0.2 + i * 0.06 }} />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div style={{ padding: "24px 16px" }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6 }}>
                    {q || domain ? "no messages match this filter." : `${folder} is empty.`}
                  </div>
                  {!q && !domain && folder === "inbox" && (
                    <div style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.6 }}>
                      arthur monitors connected inboxes and routes messages here. connect accounts via email settings.
                    </div>
                  )}
                </div>
              ) : (
                rows.map(row => (
                  <EmailCell
                    key={row.id}
                    row={row}
                    active={row.id === selectedId}
                    onClick={() => openEmail(row.id)}
                  />
                ))
              )}
              {!loading && rows.length > 0 && (
                <div style={{ padding: "12px 16px", color: "var(--text-faint)", fontSize: 11, textAlign: "center" }}>
                  {total} total
                </div>
              )}
            </div>
          </div>

          {/* Reading pane */}
          <div
            className="inbox-reading-pane"
            style={{ flex: 1, overflowY: "auto", minWidth: 0 }}
          >
            {mobilePane === "detail" && (
              <button
                className="btn-ghost inbox-back-btn"
                onClick={() => { setMobilePane("list"); setSelectedId(null); }}
                style={{
                  margin: "12px 16px",
                  fontSize: 11.5,
                  padding: "6px 12px",
                  minHeight: "unset",
                }}
              >
                ← back to inbox
              </button>
            )}

            {!selectedId && (
              <div style={{ padding: "32px 32px" }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 24 }}>
                  select a message to read it.
                </div>
                {snapshot && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
                    <div style={{
                      fontSize: 10,
                      fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "var(--text-faint)",
                      marginBottom: 4,
                    }}>
                      today&apos;s snapshot
                    </div>
                    <SnapshotCard
                      label="pending approvals"
                      count={snapshot.pendingApprovals}
                      color="var(--accent)"
                      href="/inbox?smart=needs_attention"
                    />
                    <SnapshotCard
                      label="calendar events"
                      count={snapshot.calendarToday}
                      color="var(--lobe-agentic)"
                      href="/calendar"
                    />
                    <SnapshotCard
                      label="extractions today"
                      count={snapshot.extractionsToday}
                      color="var(--lobe-upgrades)"
                      href="/legal"
                    />
                  </div>
                )}
              </div>
            )}

            {selectedId && loadingDetail && (
              <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 800 }}>
                <div className="inbox-skeleton" style={{ height: 24, width: "60%", borderRadius: 4, opacity: 0.3 }} />
                <div className="inbox-skeleton" style={{ height: 14, width: "40%", borderRadius: 4, opacity: 0.2 }} />
                <div className="inbox-skeleton" style={{ height: 200, borderRadius: 8, opacity: 0.15, marginTop: 16 }} />
              </div>
            )}

            {selected && !loadingDetail && (
              <div style={{ padding: "24px 28px", maxWidth: 800 }}>
                {/* Sent indicator badge */}
                {selected.direction === "outbound" && (
                  <div style={{ marginBottom: 12 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "var(--panel-elev)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 5,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                        letterSpacing: "0.06em",
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                      }}
                    >
                      ↗ sent
                    </span>
                  </div>
                )}

                {/* Auto-action banner */}
                {selected.auto_action && selected.auto_action !== "none" && selected.actor === "arthur" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "rgba(255,180,50,0.08)",
                      border: "1px solid rgba(255,180,50,0.25)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      marginBottom: 16,
                      fontSize: 12,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      ⚙ Arthur {AUTO_ACTION_LABELS[selected.auto_action] ?? selected.auto_action}
                      {selected.auto_action_at ? ` ${relativeTime(selected.auto_action_at)}` : ""}
                      {selected.classification?.reasoning ? ` — ${selected.classification.reasoning}` : ""}
                    </span>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: "4px 10px", minHeight: "unset" }}
                      onClick={revertAutoAction}
                      disabled={reverting}
                    >
                      {reverting ? "reverting…" : "revert"}
                    </button>
                  </div>
                )}

                {/* Subject */}
                <h2
                  style={{
                    fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                    fontWeight: 700,
                    fontSize: 20,
                    letterSpacing: "-0.01em",
                    color: "var(--text)",
                    margin: "0 0 16px",
                    lineHeight: 1.3,
                  }}
                >
                  {selected.subject ?? "(no subject)"}
                </h2>

                {selected.direction === "outbound" ? (
                  <>
                    <MetaRow label="to" value={selected.to_email} accent />
                    <MetaRow label="from" value={selected.from_email} />
                  </>
                ) : (
                  <>
                    <MetaRow label="from" value={selected.from_name ? `${selected.from_name} <${selected.from_email}>` : selected.from_email} />
                    <MetaRow label="to" value={selected.to_email} />
                  </>
                )}
                <MetaRow label="date" value={new Date(selected.received_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} />
                {selected.replied_at && (
                  <MetaRow label="replied" value={relativeTime(selected.replied_at)} accent />
                )}
                {selected.label && <MetaRow label="label" value={selected.label} />}
                {selected.classification && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                        fontSize: 10,
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        minWidth: 48,
                      }}
                    >
                      intent
                    </span>
                    <IntentBadge intent={selected.classification.intent} />
                    <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                      {Math.round(selected.classification.confidence * 100)}% · {selected.classification.urgency}
                    </span>
                  </div>
                )}

                {/* Draft approval composer */}
                {selected.auto_action === "draft" && selected.requires_review && (
                  <div
                    style={{
                      border: "1px solid rgba(255,180,50,0.35)",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 20,
                      background: "rgba(255,180,50,0.06)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,180,50,0.9)",
                        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        marginBottom: 10,
                      }}
                    >
                      ⚙ Arthur&apos;s proposed reply — review before sending
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        value={draftTo}
                        onChange={e => setDraftTo(e.target.value)}
                        placeholder="to"
                        style={{ fontSize: 12.5, padding: "7px 10px", height: 34, minHeight: "unset" }}
                      />
                      <input
                        value={draftSubject}
                        onChange={e => setDraftSubject(e.target.value)}
                        placeholder="subject"
                        style={{ fontSize: 12.5, padding: "7px 10px", height: 34, minHeight: "unset" }}
                      />
                      <textarea
                        value={draftBody}
                        onChange={e => setDraftBody(e.target.value)}
                        rows={6}
                        style={{ fontSize: 12.5 }}
                      />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button
                          className="cta-btn"
                          style={{ fontSize: 11.5, padding: "7px 16px", minHeight: "unset" }}
                          onClick={approveDraftAndSend}
                          disabled={draftSending}
                        >
                          {draftSending ? "sending…" : "approve & send →"}
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 11.5, padding: "7px 14px", minHeight: "unset" }}
                          onClick={discardDraft}
                        >
                          discard
                        </button>
                        {draftStatus && (
                          <span
                            style={{
                              fontSize: 11.5,
                              color: draftStatus.startsWith("error") ? "#ef4444" : "var(--lobe-upgrades)",
                              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                            }}
                          >
                            {draftStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action row */}
                <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }}
                      onClick={() => setReplyOpen(o => !o)}
                    >
                      {replyOpen ? "cancel reply" : "reply"}
                    </button>
                  )}
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }}
                      onClick={() => markAction({ is_archived: !selected.is_archived })}
                    >
                      {selected.is_archived ? "unarchive" : "archive"}
                    </button>
                  )}
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }}
                      onClick={() => markAction({ is_read: !selected.is_read })}
                    >
                      {selected.is_read ? "mark unread" : "mark read"}
                    </button>
                  )}
                  {!selected.is_deleted && (
                    <button
                      className="btn-ghost"
                      style={{
                        fontSize: 11.5,
                        padding: "6px 12px",
                        minHeight: "unset",
                        color: "var(--text-faint)",
                        borderColor: "var(--border-strong)",
                      }}
                      onClick={() => markAction({ is_deleted: true })}
                    >
                      delete
                    </button>
                  )}
                  {selected.is_deleted && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }}
                      onClick={() => markAction({ is_deleted: false })}
                    >
                      restore
                    </button>
                  )}
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <LabelPicker
                      current={selected.label}
                      onChange={label => markAction({ label: label as EmailRow["label"] })}
                    />
                  )}
                </div>

                {/* Manual reply composer */}
                {replyOpen && (
                  <div
                    style={{
                      border: "1px solid var(--border-strong)",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 20,
                      background: "var(--panel-elev)",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                      from: {selected.to_email}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        value={replyTo}
                        onChange={e => setReplyTo(e.target.value)}
                        placeholder="to"
                        style={{ fontSize: 12.5, padding: "7px 10px", height: 34, minHeight: "unset" }}
                      />
                      <input
                        value={replySubject}
                        onChange={e => setReplySubject(e.target.value)}
                        placeholder="subject"
                        style={{ fontSize: 12.5, padding: "7px 10px", height: 34, minHeight: "unset" }}
                      />
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="write your reply…"
                        rows={5}
                        style={{ fontSize: 12.5 }}
                      />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button className="cta-btn" style={{ fontSize: 11.5, padding: "7px 16px", minHeight: "unset" }} onClick={sendReply} disabled={replying}>
                          {replying ? "sending…" : "send →"}
                        </button>
                        {replyStatus && (
                          <span style={{ fontSize: 11.5, color: replyStatus.startsWith("error") ? "#ef4444" : "var(--lobe-upgrades)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                            {replyStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Body */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 20, marginTop: 4 }}>
                  {selected.body_html ? (
                    <iframe
                      srcDoc={selected.body_html}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      style={{
                        width: "100%",
                        minHeight: 320,
                        border: "none",
                        borderRadius: 8,
                        background: "#fff",
                        colorScheme: "light",
                      }}
                      onLoad={(e) => {
                        const iframe = e.currentTarget;
                        try {
                          const h = iframe.contentDocument?.body?.scrollHeight;
                          if (h) iframe.style.height = h + 24 + "px";
                        } catch {}
                      }}
                    />
                  ) : (
                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        lineHeight: 1.65,
                        fontFamily: "inherit",
                        margin: 0,
                      }}
                    >
                      {selected.body_text ?? "(no body)"}
                    </pre>
                  )}
                </div>

                {/* Arthur's note */}
                {selected.direction === "inbound" && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 10.5, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                      arthur&apos;s note
                    </div>
                    <textarea
                      value={annotation}
                      onChange={e => setAnnotation(e.target.value)}
                      onBlur={saveAnnotation}
                      placeholder="add a note about this email…"
                      rows={3}
                      style={{ fontSize: 12.5 }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 700px) {
          .inbox-list-pane {
            width: 100% !important;
            border-right: none !important;
            display: ${mobilePane === "detail" ? "none" : "flex"} !important;
            position: relative;
          }
          .inbox-reading-pane {
            display: ${mobilePane === "list" ? "none" : "flex"} !important;
            flex-direction: column !important;
          }
          .inbox-back-btn {
            display: inline-flex !important;
          }
          /* Mobile: hide desktop folder list, show dropdown */
          .folder-list-desktop { display: none !important; }
          .folder-dropdown-mobile { display: block !important; }
          /* Mobile: filter chips in horizontal scroll row */
          .inbox-filter-chips {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            gap: 6px !important;
            scrollbar-width: none !important;
          }
          .inbox-filter-chips::-webkit-scrollbar { display: none !important; }
        }
        @media (min-width: 701px) {
          .inbox-back-btn {
            display: none !important;
          }
          /* Desktop: hide mobile dropdown, show list */
          .folder-dropdown-mobile { display: none !important; }
          .folder-list-desktop { display: flex !important; }
          /* Desktop: filter chips can wrap */
          .inbox-filter-chips {
            display: flex;
            flex-direction: row;
            flex-wrap: nowrap;
            gap: 6px;
          }
        }
        @keyframes inbox-shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        .inbox-skeleton {
          background: linear-gradient(90deg, var(--panel) 25%, var(--panel-elev) 50%, var(--panel) 75%);
          background-size: 1200px 100%;
          animation: inbox-shimmer 1.6s infinite;
        }
      `}</style>

      <Footer />
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const FOLDER_ICONS: Record<Folder, string> = {
  inbox:   "↓",
  sent:    "↗",
  archived:"□",
  deleted: "×",
  drafts:  "~",
  flagged: "!",
};

function FolderButton({
  label,
  count,
  active,
  onClick,
}: {
  label: Folder;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        background: active ? "var(--accent-soft)" : "transparent",
        border: "none",
        borderRadius: 6,
        padding: "7px 10px",
        cursor: "pointer",
        transition: "background 0.12s",
        color: active ? "var(--accent)" : "var(--text-dim)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          fontSize: 11,
          width: 14,
          textAlign: "center",
          flexShrink: 0,
          opacity: 0.6,
        }}
      >
        {FOLDER_ICONS[label]}
      </span>
      <span
        style={{
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          fontSize: 11.5,
          fontWeight: active ? 600 : 400,
          letterSpacing: "0.04em",
          flex: 1,
        }}
      >
        {label}
      </span>
      {count > 0 && (
        <span
          style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: 10,
            color: active ? "var(--accent)" : "var(--text-faint)",
            background: active ? "var(--accent-soft)" : "var(--panel-elev)",
            borderRadius: 8,
            padding: "1px 6px",
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function EmailCell({ row, active, onClick }: { row: EmailRow; active: boolean; onClick: () => void }) {
  const isSent = row.direction === "outbound";
  const displayName = isSent
    ? `→ ${row.to_email}`
    : row.from_name || row.from_email;

  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: active ? "var(--accent-soft)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--border)",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        padding: "12px 14px",
        cursor: "pointer",
        transition: "background 0.12s",
        opacity: row.is_deleted ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
        {!row.is_read && !isSent && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
        )}
        {isSent && (
          <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", flexShrink: 0 }}>
            ↗
          </span>
        )}
        <span
          style={{
            fontWeight: row.is_read || isSent ? 400 : 600,
            fontSize: 12.5,
            color: "var(--text)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName}
        </span>
        <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", fontSize: 10, color: "var(--text-faint)", flexShrink: 0 }}>
          {relativeTime(row.received_at)}
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: row.is_read || isSent ? "var(--text-dim)" : "var(--text)",
          fontWeight: row.is_read || isSent ? 400 : 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 2,
        }}
      >
        {row.subject ?? "(no subject)"}
      </div>

      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-faint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {snippet(row.body_text, 80)}
      </div>

      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
        {row.label && (
          <span
            style={{
              display: "inline-block",
              padding: "1px 7px",
              borderRadius: 4,
              fontSize: 10,
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              letterSpacing: "0.06em",
              background: "var(--panel-elev)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-dim)",
              textTransform: "uppercase",
            }}
          >
            {row.label}
          </span>
        )}
        {row.classification?.intent && (
          <IntentBadge intent={row.classification.intent} />
        )}
        {row.actor === "arthur" && row.auto_action && row.auto_action !== "none" && (
          <span
            style={{
              display: "inline-block",
              padding: "1px 6px",
              borderRadius: 4,
              fontSize: 9,
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              background: "rgba(255,180,50,0.12)",
              color: "rgba(255,180,50,0.9)",
              border: "1px solid rgba(255,180,50,0.25)",
            }}
          >
            ⚙ {row.auto_action}
          </span>
        )}
      </div>
    </button>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 6, alignItems: "baseline" }}>
      <span
        style={{
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          fontSize: 10,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          minWidth: 48,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: accent ? "var(--lobe-upgrades)" : "var(--text-dim)" }}>
        {value}
      </span>
    </div>
  );
}

function FilterToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        border: `1px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: 6,
        color: active ? "var(--accent)" : "var(--text-dim)",
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        fontSize: 10.5,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 10px",
        cursor: "pointer",
        transition: "all 0.15s",
        height: 28,
      }}
    >
      {label}
    </button>
  );
}

const LABELS = ["priority", "billing", "client", "ops", "spam", "follow-up"];

function LabelPicker({ current, onChange }: { current: string | null; onChange: (l: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn-ghost"
        style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }}
        onClick={() => setOpen(o => !o)}
      >
        label{current ? `: ${current}` : ""}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "var(--panel-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: 6,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 130,
          }}
        >
          <LabelOption label="(none)" active={!current} onClick={() => { onChange(null); setOpen(false); }} />
          {LABELS.map(l => (
            <LabelOption key={l} label={l} active={current === l} onClick={() => { onChange(l); setOpen(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function LabelOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        border: "none",
        borderRadius: 5,
        color: active ? "var(--accent)" : "var(--text-dim)",
        fontSize: 12,
        padding: "6px 10px",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function SnapshotCard({ label, count, color, href }: { label: string; count: number; color: string; href: string }) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "var(--panel-elev)",
        border: "1px solid var(--border-strong)",
        borderRadius: 8,
        textDecoration: "none",
        transition: "border-color 0.15s",
      }}
    >
      <span style={{
        fontSize: 12.5,
        color: "var(--text-dim)",
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 18,
        fontWeight: 700,
        color,
        fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
      }}>
        {count}
      </span>
    </a>
  );
}

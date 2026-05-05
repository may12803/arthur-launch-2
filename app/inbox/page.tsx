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

const INTENT_COLORS: Record<string, { bg: string; color: string }> = {
  newsletter:     { bg: "rgba(30,58,95,0.6)",  color: "#7eb8f7" },
  promotion:      { bg: "rgba(58,30,95,0.6)",  color: "#c07ef7" },
  cold_sales:     { bg: "rgba(95,30,30,0.6)",  color: "#f78e7e" },
  confirmation:   { bg: "rgba(30,79,58,0.6)",  color: "#7ef7b0" },
  catering:       { bg: "rgba(79,58,30,0.6)",  color: "#f7c07e" },
  vendor_invoice: { bg: "rgba(58,58,30,0.6)",  color: "#f7f07e" },
  press:          { bg: "rgba(30,79,79,0.6)",  color: "#7ef7f7" },
  personal:       { bg: "rgba(79,79,30,0.6)",  color: "#f7f7a0" },
  legal:          { bg: "rgba(95,0,0,0.6)",    color: "#ff7070" },
  auto_reply:     { bg: "rgba(40,40,40,0.6)",  color: "rgba(245,246,248,0.45)" },
  other:          { bg: "rgba(30,30,30,0.6)",  color: "rgba(245,246,248,0.35)" },
};

function IntentBadge({ intent }: { intent: string }) {
  const colors = INTENT_COLORS[intent] ?? INTENT_COLORS.other;
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 6px",
      borderRadius: 4,
      fontSize: 9,
      fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      background: colors.bg,
      color: colors.color,
      flexShrink: 0,
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
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

  const [rows, setRows] = useState<EmailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<FolderCounts>({ inbox: 0, sent: 0, archived: 0, deleted: 0, drafts: 0, flagged: 0 });
  const [loading, setLoading] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<EmailFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");

  const [draftTo, setDraftTo] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftSending, setDraftSending] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");

  const [annotation, setAnnotation] = useState("");
  const [reverting, setReverting] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [automationOn, setAutomationOn] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<{
    pendingApprovals: number;
    extractionsToday: number;
    calendarToday: number;
  } | null>(null);

  const prevTotalRef = useRef(0);
  const domains = Array.from(new Set(rows.map(r => r.domain).filter(Boolean))) as string[];

  useEffect(() => {
    fetch("/api/inbox/settings")
      .then(r => r.json())
      .then((d: { automation_enabled?: boolean }) => setAutomationOn(d.automation_enabled ?? true))
      .catch(() => setAutomationOn(null));
  }, []);

  useEffect(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    today.setHours(0, 0, 0, 0);
    Promise.allSettled([
      fetch("/api/inbox/list?smart=needs_attention").then(r => r.json()),
      fetch(`/api/calendar/events?start=${today.toISOString()}&end=${tomorrow.toISOString()}`).then(r => r.json()),
    ]).then(([approvals, cal]) => {
      const pendingApprovals = approvals.status === "fulfilled" ? ((approvals.value as { rows?: unknown[] }).rows ?? []).length : 0;
      const calendarToday = cal.status === "fulfilled" && Array.isArray(cal.value) ? (cal.value as unknown[]).length : 0;
      setSnapshot({ pendingApprovals, extractionsToday: 0, calendarToday });
    }).catch(() => {});
  }, []);

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
            setRows(prev => prev.map(r => (r.id === selectedId ? { ...r, is_read: true } : r)));
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

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
      const removesFromView = patch.is_archived === true || patch.is_deleted === true || patch.is_deleted === false || patch.is_archived === false;
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

  const unreadCount = rows.filter(r => !r.is_read && r.direction === "inbound").length;
  const [mobileFolderOpen, setMobileFolderOpen] = useState(false);
  const totalUnread = useMemo(() => counts.inbox + counts.flagged + counts.drafts, [counts]);
  void unreadOnly; void repliedOnly; void totalUnread;

  const AUTO_ACTION_LABELS: Record<string, string> = {
    archive: "archived",
    delete: "deleted",
    draft: "drafted reply",
    flag: "flagged for review",
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <>
      <Nav />

      <div className="inbox-root" style={{
        minHeight: "calc(100vh - 108px)",
        display: "flex",
        flexDirection: "column",
        paddingTop: 108,
        background: "var(--bg-base)",
      }}>
        {/* ── Page header ── */}
        <div style={{
          padding: "24px 28px 20px",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          borderBottom: "1px solid var(--line-separator)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{
              margin: 0,
              fontWeight: 300,
              fontSize: "clamp(2rem, 4vw, 2.8rem)",
              letterSpacing: "-0.03em",
              color: "var(--text-active)",
              lineHeight: 1,
            }}>
              inbox.
            </h1>
            {unreadCount > 0 && (
              <span style={{
                background: "var(--accent-orange)",
                color: "var(--accent-text-on)",
                borderRadius: "var(--radius-pill)",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
              }}>
                {unreadCount} unread
              </span>
            )}
            {newCount > 0 && (
              <span style={{
                background: "var(--accent-orange)",
                color: "var(--accent-text-on)",
                borderRadius: "var(--radius-pill)",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
              }}>
                +{newCount} new
              </span>
            )}
          </div>
          <div style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: "0.04em",
            paddingBottom: 4,
          }}>
            {dateStr}
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--line-separator)",
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--blur-amount))",
          flexShrink: 0,
        }}>
          <input
            type="search"
            aria-label="Search inbox by subject, sender, or body"
            placeholder="search subject, from, body…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{
              flex: "1 1 200px",
              maxWidth: 300,
              padding: "7px 12px",
              fontSize: 12,
              height: 32,
              minHeight: "unset",
              background: "var(--glass-bg-strong)",
              border: "1px solid var(--glass-border)",
              borderRadius: 8,
              color: "var(--text-active)",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <select
            value={domain}
            onChange={e => setDomain(e.target.value)}
            style={{
              background: "var(--glass-bg-strong)",
              border: "1px solid var(--glass-border)",
              borderRadius: 8,
              color: "var(--text-main)",
              fontSize: 12,
              padding: "6px 10px",
              height: 32,
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
          <div className="inbox-filter-chips" style={{ display: "flex", gap: 6 }}>
            {folder === "inbox" && (
              <>
                <FilterChip label="needs attention" active={smart === "needs_attention"} onToggle={() => setSmart(p => p === "needs_attention" ? "" : "needs_attention")} />
                <FilterChip label="this week" active={smart === "this_week"} onToggle={() => setSmart(p => p === "this_week" ? "" : "this_week")} />
              </>
            )}
            {folder === "sent" && (
              <FilterChip label="awaiting reply" active={smart === "awaiting_reply"} onToggle={() => setSmart(p => p === "awaiting_reply" ? "" : "awaiting_reply")} />
            )}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggleAutomation}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: automationOn ? "rgba(212,255,61,0.10)" : "var(--glass-bg-strong)",
                border: `1px solid ${automationOn ? "rgba(212,255,61,0.30)" : "var(--glass-border)"}`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 10,
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
                color: automationOn ? "var(--accent-orange)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <span>⚙</span>
              <span>automation: {automationOn === null ? "…" : automationOn ? "on" : "off"}</span>
            </button>
            <a href="/inbox/settings" style={{ fontSize: 10, fontFamily: "ui-monospace, 'JetBrains Mono', monospace", color: "var(--text-muted)", textDecoration: "none", letterSpacing: "0.04em" }}>
              settings →
            </a>
          </div>
        </div>

        {/* ── Three-pane body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Folder rail (220px glass card) ── */}
          <div className="inbox-folder-rail" style={{
            width: 220,
            flexShrink: 0,
            borderRight: "1px solid var(--line-separator)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            padding: "12px 10px",
            gap: 2,
            background: "var(--glass-bg)",
            backdropFilter: "blur(var(--blur-amount))",
          }}>
            <div style={{
              fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
              fontSize: 9,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              padding: "4px 8px 8px",
            }}>
              folders
            </div>
            {/* Mobile dropdown */}
            <div className="folder-dropdown-mobile">
              <button
                onClick={() => setMobileFolderOpen(o => !o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  background: "var(--glass-bg-strong)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--accent-orange)",
                  fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                }}
              >
                <span>{FOLDER_ICONS[folder]} {folder}</span>
                <span style={{ fontSize: 9, opacity: 0.6 }}>{mobileFolderOpen ? "▲" : "▼"}</span>
              </button>
              {mobileFolderOpen && (
                <div style={{
                  position: "absolute",
                  zIndex: 50,
                  background: "var(--glass-bg-strong)",
                  border: "1px solid var(--glass-border)",
                  backdropFilter: "blur(var(--blur-amount))",
                  borderRadius: 8,
                  padding: 6,
                  marginTop: 4,
                  width: "calc(100% - 20px)",
                  boxShadow: "var(--glass-shadow)",
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
                        background: folder === f ? "rgba(212,255,61,0.10)" : "transparent",
                        border: "none",
                        borderRadius: 5,
                        padding: "8px 10px",
                        cursor: "pointer",
                        color: folder === f ? "var(--accent-orange)" : "var(--text-main)",
                        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                        fontSize: 11,
                      }}
                    >
                      <span style={{ width: 14, textAlign: "center", opacity: 0.6 }}>{FOLDER_ICONS[f]}</span>
                      <span style={{ flex: 1 }}>{f}</span>
                      {counts[f] > 0 && (
                        <span style={{ fontSize: 10, background: "var(--glass-bg)", borderRadius: 8, padding: "1px 6px", color: "var(--text-muted)" }}>
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
                <FolderButton key={f} label={f} count={counts[f]} active={folder === f} onClick={() => switchFolder(f)} />
              ))}
            </div>
          </div>

          {/* ── Thread list (flex 1) ── */}
          <div className="inbox-list-pane" style={{
            flex: 1,
            minWidth: 0,
            borderRight: "1px solid var(--line-separator)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            background: "var(--glass-bg)",
          }}>
            {loading ? (
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="inbox-skeleton" style={{ height: 70, borderRadius: 8, opacity: 0.15 + i * 0.05 }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "32px 20px" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>
                  {q || domain ? "no messages match this filter." : folder === "inbox" ? "inbox is clear." : `${folder} is empty.`}
                </div>
                {!q && !domain && folder === "inbox" && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, opacity: 0.7 }}>
                    arthur monitors connected inboxes and routes messages here.
                  </div>
                )}
              </div>
            ) : (
              rows.map(row => (
                <EmailCell key={row.id} row={row} active={row.id === selectedId} onClick={() => openEmail(row.id)} />
              ))
            )}
            {!loading && rows.length > 0 && (
              <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 10, textAlign: "center", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}>
                {total} total
              </div>
            )}
          </div>

          {/* ── Reading pane (flex 2, glass-bg-strong) ── */}
          <div className="inbox-reading-pane" style={{
            flex: 2,
            overflowY: "auto",
            minWidth: 0,
            background: "var(--glass-bg-strong)",
            backdropFilter: "blur(var(--blur-amount))",
          }}>
            <button
              className="inbox-back-btn"
              onClick={() => { setMobilePane("list"); setSelectedId(null); }}
              style={{
                margin: "12px 16px",
                fontSize: 11,
                padding: "6px 12px",
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
                borderRadius: 6,
                color: "var(--text-main)",
                cursor: "pointer",
              }}
            >
              ← back
            </button>

            {!selectedId && (
              <div style={{ padding: "32px 32px" }}>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
                  select a message to read it.
                </div>
                {snapshot && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
                    <div style={{ fontSize: 9, fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
                      today&apos;s snapshot
                    </div>
                    <SnapshotCard label="pending approvals" count={snapshot.pendingApprovals} href="/inbox?smart=needs_attention" />
                    <SnapshotCard label="calendar events" count={snapshot.calendarToday} href="/calendar" />
                    <SnapshotCard label="extractions today" count={snapshot.extractionsToday} href="/legal" />
                  </div>
                )}
              </div>
            )}

            {selectedId && loadingDetail && (
              <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 12, maxWidth: 800 }}>
                <div className="inbox-skeleton" style={{ height: 24, width: "60%", borderRadius: 4, opacity: 0.2 }} />
                <div className="inbox-skeleton" style={{ height: 14, width: "40%", borderRadius: 4, opacity: 0.15 }} />
                <div className="inbox-skeleton" style={{ height: 200, borderRadius: 8, opacity: 0.10, marginTop: 16 }} />
              </div>
            )}

            {selected && !loadingDetail && (
              <div style={{ padding: "24px 28px", maxWidth: 800 }}>
                {selected.direction === "outbound" && (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: 5,
                      padding: "2px 8px",
                      fontSize: 9,
                      fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                      letterSpacing: "0.06em",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                    }}>
                      ↗ sent
                    </span>
                  </div>
                )}

                {selected.auto_action && selected.auto_action !== "none" && selected.actor === "arthur" && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "rgba(212,255,61,0.06)",
                    border: "1px solid rgba(212,255,61,0.20)",
                    borderRadius: 8,
                    padding: "8px 14px",
                    marginBottom: 16,
                    fontSize: 11,
                    color: "var(--text-main)",
                    fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                  }}>
                    <span style={{ flex: 1 }}>
                      ⚙ arthur {AUTO_ACTION_LABELS[selected.auto_action] ?? selected.auto_action}
                      {selected.auto_action_at ? ` ${relativeTime(selected.auto_action_at)}` : ""}
                      {selected.classification?.reasoning ? ` — ${selected.classification.reasoning}` : ""}
                    </span>
                    <button
                      style={{ fontSize: 10, padding: "4px 10px", background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 5, color: "var(--text-main)", cursor: "pointer" }}
                      onClick={revertAutoAction}
                      disabled={reverting}
                    >
                      {reverting ? "reverting…" : "revert"}
                    </button>
                  </div>
                )}

                <h2 style={{
                  fontWeight: 400,
                  fontSize: 20,
                  letterSpacing: "-0.02em",
                  color: "var(--text-active)",
                  margin: "0 0 16px",
                  lineHeight: 1.3,
                }}>
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
                {selected.replied_at && <MetaRow label="replied" value={relativeTime(selected.replied_at)} accent />}
                {selected.label && <MetaRow label="label" value={selected.label} />}
                {selected.classification && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", minWidth: 48 }}>
                      intent
                    </span>
                    <IntentBadge intent={selected.classification.intent} />
                    <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}>
                      {Math.round(selected.classification.confidence * 100)}% · {selected.classification.urgency}
                    </span>
                  </div>
                )}

                {selected.auto_action === "draft" && selected.requires_review && (
                  <div style={{
                    border: "1px solid rgba(212,255,61,0.25)",
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 20,
                    background: "rgba(212,255,61,0.05)",
                  }}>
                    <div style={{ fontSize: 9, color: "var(--accent-orange)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
                      ⚙ arthur&apos;s proposed reply — review before sending
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input value={draftTo} onChange={e => setDraftTo(e.target.value)} placeholder="to" style={inputSt} />
                      <input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} placeholder="subject" style={inputSt} />
                      <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={6} style={{ ...inputSt, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={approveDraftAndSend} disabled={draftSending} style={accentBtn}>
                          {draftSending ? "sending…" : "approve & send →"}
                        </button>
                        <button onClick={discardDraft} style={ghostBtn}>discard</button>
                        {draftStatus && <span style={{ fontSize: 11, color: draftStatus.startsWith("error") ? "#ef4444" : "var(--accent-orange)", fontFamily: "ui-monospace, monospace" }}>{draftStatus}</span>}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <button onClick={() => setReplyOpen(o => !o)} style={ghostBtn}>{replyOpen ? "cancel reply" : "reply"}</button>
                  )}
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <button onClick={() => markAction({ is_archived: !selected.is_archived })} style={ghostBtn}>
                      {selected.is_archived ? "unarchive" : "archive"}
                    </button>
                  )}
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <button onClick={() => markAction({ is_read: !selected.is_read })} style={ghostBtn}>
                      {selected.is_read ? "mark unread" : "mark read"}
                    </button>
                  )}
                  {!selected.is_deleted && (
                    <button onClick={() => markAction({ is_deleted: true })} style={{ ...ghostBtn, color: "var(--text-muted)" }}>delete</button>
                  )}
                  {selected.is_deleted && (
                    <button onClick={() => markAction({ is_deleted: false })} style={ghostBtn}>restore</button>
                  )}
                  {selected.direction === "inbound" && !selected.is_deleted && (
                    <LabelPicker current={selected.label} onChange={label => markAction({ label: label as EmailRow["label"] })} />
                  )}
                </div>

                {replyOpen && (
                  <div style={{ border: "1px solid var(--glass-border)", borderRadius: 10, padding: 16, marginBottom: 20, background: "var(--glass-bg)" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>
                      from: {selected.to_email}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="to" style={inputSt} />
                      <input value={replySubject} onChange={e => setReplySubject(e.target.value)} placeholder="subject" style={inputSt} />
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="write your reply…" rows={5} style={{ ...inputSt, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button onClick={sendReply} disabled={replying} style={accentBtn}>{replying ? "sending…" : "send →"}</button>
                        {replyStatus && <span style={{ fontSize: 11, color: replyStatus.startsWith("error") ? "#ef4444" : "var(--accent-orange)", fontFamily: "ui-monospace, monospace" }}>{replyStatus}</span>}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--line-separator)", paddingTop: 20, marginTop: 4 }}>
                  {selected.body_html ? (
                    <iframe
                      srcDoc={selected.body_html}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      style={{ width: "100%", minHeight: 320, border: "none", borderRadius: 8, background: "#fff", colorScheme: "light" }}
                      onLoad={(e) => {
                        const iframe = e.currentTarget;
                        try {
                          const h = iframe.contentDocument?.body?.scrollHeight;
                          if (h) iframe.style.height = h + 24 + "px";
                        } catch {}
                      }}
                    />
                  ) : (
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13, color: "var(--text-main)", lineHeight: 1.65, fontFamily: "inherit", margin: 0 }}>
                      {selected.body_text ?? "(no body)"}
                    </pre>
                  )}
                </div>

                {selected.direction === "inbound" && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line-separator)" }}>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                      arthur&apos;s note
                    </div>
                    <textarea
                      value={annotation}
                      onChange={e => setAnnotation(e.target.value)}
                      onBlur={saveAnnotation}
                      placeholder="add a note about this email…"
                      rows={3}
                      style={{ ...inputSt, width: "100%", resize: "vertical" }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 700px) {
          .inbox-folder-rail { display: none !important; }
          .inbox-list-pane {
            width: 100% !important;
            border-right: none !important;
            display: ${mobilePane === "detail" ? "none" : "flex"} !important;
          }
          .inbox-reading-pane {
            display: ${mobilePane === "list" ? "none" : "flex"} !important;
            flex-direction: column !important;
          }
          .inbox-back-btn { display: inline-flex !important; }
          .folder-list-desktop { display: none !important; }
          .folder-dropdown-mobile { display: block !important; }
          .inbox-filter-chips { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
          .inbox-filter-chips::-webkit-scrollbar { display: none; }
        }
        @media (min-width: 701px) {
          .inbox-back-btn { display: none !important; }
          .folder-dropdown-mobile { display: none !important; }
          .folder-list-desktop { display: flex !important; }
        }
        @keyframes inbox-shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        .inbox-skeleton {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.04) 25%,
            rgba(255,255,255,0.08) 50%,
            rgba(255,255,255,0.04) 75%);
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
  minHeight: "unset",
  height: 36,
};

const accentBtn: React.CSSProperties = {
  background: "var(--accent-orange)",
  color: "var(--accent-text-on)",
  border: "none",
  borderRadius: "var(--radius-pill)",
  padding: "7px 16px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.01em",
};

const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-main)",
  border: "1px solid var(--glass-border)",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 11,
  cursor: "pointer",
};

function FolderButton({ label, count, active, onClick }: { label: Folder; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "left",
        background: active ? "rgba(212,255,61,0.10)" : "transparent",
        border: active ? "1px solid rgba(212,255,61,0.20)" : "1px solid transparent",
        borderRadius: 6,
        padding: "7px 10px",
        cursor: "pointer",
        transition: "background 0.12s",
        color: active ? "var(--accent-orange)" : "var(--text-main)",
      }}
    >
      <span style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 11, width: 14, textAlign: "center", flexShrink: 0, opacity: 0.6 }}>
        {FOLDER_ICONS[label]}
      </span>
      <span style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 11, fontWeight: active ? 600 : 400, letterSpacing: "0.04em", flex: 1 }}>
        {label}
      </span>
      {count > 0 && (
        <span style={{
          fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
          fontSize: 9,
          color: active ? "var(--accent-orange)" : "var(--text-muted)",
          background: active ? "rgba(212,255,61,0.12)" : "var(--glass-bg-strong)",
          borderRadius: 8,
          padding: "1px 6px",
          flexShrink: 0,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function EmailCell({ row, active, onClick }: { row: EmailRow; active: boolean; onClick: () => void }) {
  const isSent = row.direction === "outbound";
  const displayName = isSent ? `→ ${row.to_email}` : row.from_name || row.from_email;
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: active ? "rgba(212,255,61,0.07)" : "transparent",
        border: "none",
        borderBottom: "1px solid var(--line-separator)",
        borderLeft: active ? "2px solid var(--accent-orange)" : "2px solid transparent",
        padding: "12px 14px",
        cursor: "pointer",
        transition: "background 0.12s",
        opacity: row.is_deleted ? 0.5 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
        {!row.is_read && !isSent && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-orange)", flexShrink: 0 }} />
        )}
        {isSent && <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "ui-monospace, monospace", flexShrink: 0 }}>↗</span>}
        <span style={{
          fontWeight: row.is_read || isSent ? 400 : 600,
          fontSize: 12,
          color: "var(--text-active)",
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {displayName}
        </span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
          {relativeTime(row.received_at)}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: row.is_read || isSent ? "var(--text-main)" : "var(--text-active)", fontWeight: row.is_read || isSent ? 400 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2 }}>
        {row.subject ?? "(no subject)"}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {snippet(row.body_text, 80)}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
        {row.label && (
          <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em", background: "var(--glass-bg-strong)", border: "1px solid var(--glass-border)", color: "var(--text-muted)", textTransform: "uppercase" }}>
            {row.label}
          </span>
        )}
        {row.classification?.intent && <IntentBadge intent={row.classification.intent} />}
        {row.actor === "arthur" && row.auto_action && row.auto_action !== "none" && (
          <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontFamily: "ui-monospace, monospace", background: "rgba(212,255,61,0.08)", color: "var(--accent-orange)", border: "1px solid rgba(212,255,61,0.18)" }}>
            ⚙ {row.auto_action}
          </span>
        )}
      </div>
    </button>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 6, alignItems: "baseline", borderBottom: "1px dashed rgba(255,255,255,0.10)", paddingBottom: 5 }}>
      <span style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", minWidth: 48, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: accent ? "var(--accent-orange)" : "var(--text-main)", fontFamily: "ui-monospace, monospace" }}>
        {value}
      </span>
    </div>
  );
}

function FilterChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: active ? "rgba(212,255,61,0.12)" : "transparent",
        border: `1px solid ${active ? "rgba(212,255,61,0.35)" : "var(--glass-border)"}`,
        borderRadius: 6,
        color: active ? "var(--accent-orange)" : "var(--text-muted)",
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        fontSize: 9,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "4px 10px",
        cursor: "pointer",
        transition: "all 0.15s",
        height: 28,
        whiteSpace: "nowrap",
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
      <button onClick={() => setOpen(o => !o)} style={ghostBtn}>
        label{current ? `: ${current}` : ""}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          background: "var(--glass-bg-strong)",
          backdropFilter: "blur(var(--blur-amount))",
          border: "1px solid var(--glass-border)",
          borderRadius: 8,
          padding: 6,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 130,
          boxShadow: "var(--glass-shadow)",
        }}>
          <LabelOption label="(none)" active={!current} onClick={() => { onChange(null); setOpen(false); }} />
          {LABELS.map(l => <LabelOption key={l} label={l} active={current === l} onClick={() => { onChange(l); setOpen(false); }} />)}
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
        background: active ? "rgba(212,255,61,0.10)" : "transparent",
        border: "none",
        borderRadius: 5,
        color: active ? "var(--accent-orange)" : "var(--text-main)",
        fontSize: 11,
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

function SnapshotCard({ label, count, href }: { label: string; count: number; href: string }) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: 10,
        textDecoration: "none",
        transition: "transform 0.15s, box-shadow 0.15s",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-main)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}>
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 300, color: "var(--accent-orange)", fontFamily: "ui-monospace, monospace", letterSpacing: "-0.02em" }}>
        {count}
      </span>
    </a>
  );
}

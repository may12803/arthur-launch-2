"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Nav, Footer } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { EmptyState } from "../_components/EmptyState";

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

function IntentBadge({ intent }: { intent: string }) {
  const TINT_MAP: Record<string, string> = {
    newsletter: 'var(--tint-blue)',
    promotion: 'var(--tint-violet)',
    confirmation: 'var(--tint-emerald)',
    vendor_invoice: 'var(--tint-amber)',
    cold_sales: 'var(--tint-red)',
    personal: 'var(--tint-emerald)',
  };
  const color = TINT_MAP[intent] ?? 'var(--text-faint)';

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "11px",
      fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
      color: "var(--text-muted)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    }}>
      <span style={{
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
      }} />
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
  const [selectedIds, setSelectedIds] = useState(new Set<string>());

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
    setSelectedIds(new Set());
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
    setSelectedIds(new Set());
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

  const handleBulkAction = async (action: "archive" | "delete" | "read" | "unread") => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const promises = ids.map(id => {
      let body: Partial<EmailRow> = {};
      if (action === 'archive') body.is_archived = true;
      if (action === 'delete') body.is_deleted = true;
      if (action === 'read') body.is_read = true;
      if (action === 'unread') body.is_read = false;

      return fetch(`/api/inbox/${id}/mark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });

    await Promise.all(promises);

    if (action === 'archive' || action === 'delete') {
      setRows(prev => prev.filter(r => !selectedIds.has(r.id)));
    } else {
      setRows(prev => prev.map(r => selectedIds.has(r.id) ? { ...r, is_read: action === 'read' } : r));
    }
    setSelectedIds(new Set());
    fetchList(true);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectedId(null);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)));
    }
    setSelectedId(null);
  };

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
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        paddingTop: 60,
        background: "var(--bg-base)",
      }}>
        {/* ── Page header ── */}
        <div style={{
          padding: "var(--space-6) var(--page-gutter) var(--space-5)",
          borderBottom: "1px solid var(--line-separator)",
          flexShrink: 0,
        }}>
          <PageHeader
            title="inbox."
            actions={
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                {unreadCount > 0 && (
                  <TokenChip label={`${unreadCount} unread`} color="orange" size="sm" />
                )}
                {newCount > 0 && (
                  <TokenChip label={`+${newCount} new`} color="orange" size="sm" />
                )}
                <span style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-xs)",
                  color: "var(--text-muted)",
                  letterSpacing: "0.04em",
                }}>
                  {dateStr}
                </span>
              </div>
            }
          />
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          padding: "var(--space-2) var(--page-gutter)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--line-separator)",
          background: "var(--bg-mid)",
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
              padding: "var(--space-1) var(--space-3)",
              fontSize: "var(--fs-xs)",
              height: 32,
              minHeight: "unset",
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-active)",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <select
            value={domain}
            onChange={e => setDomain(e.target.value)}
            style={{
              background: "var(--glass-t1-bg)",
              border: "1px solid var(--glass-t1-border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-main)",
              fontSize: "var(--fs-xs)",
              padding: "var(--space-1) var(--space-2)",
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
          <div className="inbox-filter-chips" style={{ display: "flex", gap: "var(--space-1)" }}>
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button
              onClick={toggleAutomation}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-1)",
                background: automationOn ? "var(--accent-orange-soft)" : "var(--glass-t1-bg)",
                border: `1px solid ${automationOn ? "var(--accent-orange)" : "var(--glass-t1-border)"}`,
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-1) var(--space-2)",
                fontSize: "var(--fs-mono)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.06em",
                color: automationOn ? "var(--accent-orange)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              <span>⚙</span>
              <span>automation: {automationOn === null ? "…" : automationOn ? "on" : "off"}</span>
            </button>
            <a href="/inbox/settings" style={{ fontSize: "var(--fs-mono)", fontFamily: "var(--font-mono)", color: "var(--text-muted)", textDecoration: "none", letterSpacing: "0.04em" }}>
              settings →
            </a>
          </div>
        </div>

        {/* ── Three-pane body ── */}
        <div className="inbox-layout" style={{ flex: 1, display: "flex", overflow: "hidden", padding: "var(--space-4) var(--page-gutter)", gap: "var(--space-4)" }}>

          {/* ── Folder rail (220px glass card) ── */}
          <GlassPanel tier={1} as="nav" aria-label="Mail folders" className="inbox-folder-rail" style={{
            width: 220,
            flexShrink: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            padding: "var(--space-3)",
            gap: "var(--space-1)",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-mono)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              padding: "var(--space-1) var(--space-2) var(--space-2)",
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
                  background: "var(--glass-t2-bg)",
                  border: "1px solid var(--glass-t2-border)",
                  borderRadius: "var(--radius-sm)",
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
                  background: "var(--glass-t2-bg)",
                  border: "1px solid var(--glass-t2-border)",
                  backdropFilter: "blur(var(--glass-t2-blur))",
                  borderRadius: "var(--radius-sm)",
                  padding: 6,
                  marginTop: 4,
                  width: "calc(100% - 20px)",
                  boxShadow: "var(--glass-t2-shadow)",
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
                        background: folder === f ? "var(--accent-orange-soft)" : "transparent",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
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
                        <TokenChip label={String(counts[f])} size="xs" color="muted" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Desktop folder list */}
            <div className="folder-list-desktop" style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              {(["inbox", "sent", "archived", "deleted", "drafts", "flagged"] as Folder[]).map(f => (
                <FolderButton key={f} label={f} count={counts[f]} active={folder === f} onClick={() => switchFolder(f)} />
              ))}
            </div>
          </GlassPanel>

          {/* ── Thread list (flex 1) ── */}
          <GlassPanel tier={1} className="inbox-list-pane" style={{
            flex: "1 1 320px",
            minWidth: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}>
            <div className="inbox-list-toolbar" style={{
              display: 'flex',
              alignItems: 'center',
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-3)",
              borderBottom: '1px solid var(--line-separator)',
              flexShrink: 0,
              height: 45,
            }}>
              <input type="checkbox"
                checked={rows.length > 0 && selectedIds.size === rows.length}
                onChange={toggleSelectAll}
                aria-label="Select all"
                style={{ marginRight: "var(--space-2)" }}
              />
              {selectedIds.size > 0 ? (
                <>
                  <span style={{ fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{selectedIds.size} selected</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: "var(--space-1)" }}>
                    <button onClick={() => handleBulkAction('archive')} style={ghostBtn}>Archive</button>
                    <button onClick={() => handleBulkAction('delete')} style={ghostBtn}>Delete</button>
                    <button onClick={() => handleBulkAction('read')} style={ghostBtn}>Mark Read</button>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: "var(--fs-small)", fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>select items for bulk actions</span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: "var(--space-3) var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="arthur-skeleton" style={{ height: 70, borderRadius: "var(--radius-sm)", opacity: 0.15 + i * 0.05 }} />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <EmptyState
                  icon="📭"
                  title={q || domain ? "no messages match this filter." : folder === "inbox" ? "inbox is clear." : `${folder} is empty.`}
                  subtitle={!q && !domain && folder === "inbox" ? "arthur monitors connected inboxes and routes messages here." : undefined}
                  size="md"
                />
              ) : (
                rows.map(row => (
                  <EmailCell key={row.id} row={row} active={row.id === selectedId} isSelected={selectedIds.has(row.id)} onToggleSelect={toggleSelection} onClick={() => openEmail(row.id)} />
                ))
              )}
              {!loading && rows.length > 0 && (
                <div style={{ padding: "var(--space-3) var(--space-4)", color: "var(--text-muted)", fontSize: "var(--fs-mono)", textAlign: "center", fontFamily: "var(--font-mono)" }}>
                  {total} total
                </div>
              )}
            </div>
          </GlassPanel>

          {/* ── Reading pane (flex 2, glass-bg-strong) ── */}
          <GlassPanel tier={2} className="inbox-reading-pane" style={{
            flex: "2 1 500px",
            overflowY: "auto",
            minWidth: 0,
          }}>
            <button
              className="inbox-back-btn"
              onClick={() => { setMobilePane("list"); setSelectedId(null); }}
              style={{
                margin: "var(--space-3) var(--space-4)",
                fontSize: "var(--fs-small)",
                padding: "var(--space-1) var(--space-3)",
                background: "var(--glass-t1-bg)",
                border: "1px solid var(--glass-t1-border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-main)",
                cursor: "pointer",
              }}
            >
              ← back to list
            </button>

            {!selectedId && (
              <div style={{ padding: "var(--space-8)" }}>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginBottom: "var(--space-6)" }}>
                  select a message to read it.
                </div>
                {snapshot && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", maxWidth: 420 }}>
                    <div style={{ fontSize: "var(--fs-mono)", fontFamily: "var(--font-mono)", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-1)" }}>
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
              <div style={{ padding: "var(--space-6) var(--space-7)", display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: 800 }}>
                <div className="arthur-skeleton" style={{ height: 24, width: "60%", borderRadius: "var(--radius-sm)", opacity: 0.2 }} />
                <div className="arthur-skeleton" style={{ height: 14, width: "40%", borderRadius: "var(--radius-sm)", opacity: 0.15 }} />
                <div className="arthur-skeleton" style={{ height: 200, borderRadius: "var(--radius-card)", opacity: 0.10, marginTop: "var(--space-4)" }} />
              </div>
            )}

            {selected && !loadingDetail && (
              <div style={{ padding: "var(--space-6) var(--space-7)", maxWidth: 800 }}>
                {selected.direction === "outbound" && (
                  <div style={{ marginBottom: "var(--space-3)" }}>
                    <TokenChip label="↗ sent" size="xs" color="muted" />
                  </div>
                )}

                {selected.auto_action && selected.auto_action !== "none" && selected.actor === "arthur" && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    background: "var(--accent-orange-soft)",
                    border: "1px solid var(--accent-orange)",
                    borderRadius: "var(--radius-card)",
                    padding: "var(--space-2) var(--space-3)",
                    marginBottom: "var(--space-4)",
                    fontSize: "var(--fs-small)",
                    color: "var(--text-main)",
                    fontFamily: "var(--font-mono)",
                  }}>
                    <span style={{ flex: 1 }}>
                      ⚙ arthur {AUTO_ACTION_LABELS[selected.auto_action] ?? selected.auto_action}
                      {selected.auto_action_at ? ` ${relativeTime(selected.auto_action_at)}` : ""}
                      {selected.classification?.reasoning ? ` — ${selected.classification.reasoning}` : ""}
                    </span>
                    <button
                      style={{ fontSize: "var(--fs-mono)", padding: "var(--space-1) var(--space-2)", background: "var(--glass-t1-bg)", border: "1px solid var(--glass-t1-border)", borderRadius: "var(--radius-sm)", color: "var(--text-main)", cursor: "pointer" }}
                      onClick={revertAutoAction}
                      disabled={reverting}
                    >
                      {reverting ? "reverting…" : "revert"}
                    </button>
                  </div>
                )}

                <h2 style={{
                  fontWeight: 400,
                  fontSize: "var(--fs-h3)",
                  letterSpacing: "var(--ls-heading)",
                  color: "var(--text-active)",
                  margin: "0 0 var(--space-4)",
                  lineHeight: "var(--lh-tight)",
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
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", minWidth: 48 }}>
                      intent
                    </span>
                    <IntentBadge intent={selected.classification.intent} />
                    <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {Math.round(selected.classification.confidence * 100)}% · {selected.classification.urgency}
                    </span>
                  </div>
                )}

                {selected.auto_action === "draft" && selected.requires_review && (
                  <div style={{
                    border: "1px solid var(--accent-orange)",
                    borderRadius: "var(--radius-card)",
                    padding: "var(--space-4)",
                    marginBottom: "var(--space-5)",
                    background: "var(--accent-orange-soft)",
                  }}>
                    <div style={{ fontSize: "var(--fs-mono)", color: "var(--accent-orange)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "var(--space-2)" }}>
                      ⚙ arthur&apos;s proposed reply — review before sending
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      <input value={draftTo} onChange={e => setDraftTo(e.target.value)} placeholder="to" style={inputSt} />
                      <input value={draftSubject} onChange={e => setDraftSubject(e.target.value)} placeholder="subject" style={inputSt} />
                      <textarea value={draftBody} onChange={e => setDraftBody(e.target.value)} rows={6} style={{ ...inputSt, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                        <button onClick={approveDraftAndSend} disabled={draftSending} style={accentBtn}>
                          {draftSending ? "sending…" : "approve & send →"}
                        </button>
                        <button onClick={discardDraft} style={ghostBtn}>discard</button>
                        {draftStatus && <span style={{ fontSize: "var(--fs-small)", color: draftStatus.startsWith("error") ? "var(--tint-red)" : "var(--accent-orange)", fontFamily: "var(--font-mono)" }}>{draftStatus}</span>}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-4) 0", flexWrap: "wrap" }}>
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
                  <div style={{ border: "1px solid var(--glass-t1-border)", borderRadius: "var(--radius-card)", padding: "var(--space-4)", marginBottom: "var(--space-5)", background: "var(--glass-t1-bg)" }}>
                    <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-muted)", marginBottom: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
                      from: {selected.to_email}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      <input value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="to" style={inputSt} />
                      <input value={replySubject} onChange={e => setReplySubject(e.target.value)} placeholder="subject" style={inputSt} />
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="write your reply…" rows={5} style={{ ...inputSt, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                        <button onClick={sendReply} disabled={replying} style={accentBtn}>{replying ? "sending…" : "send →"}</button>
                        {replyStatus && <span style={{ fontSize: "var(--fs-small)", color: replyStatus.startsWith("error") ? "var(--tint-red)" : "var(--accent-orange)", fontFamily: "var(--font-mono)" }}>{replyStatus}</span>}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--line-separator)", paddingTop: "var(--space-5)", marginTop: "var(--space-1)" }}>
                  {selected.body_html ? (
                    <iframe
                      srcDoc={selected.body_html}
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      style={{ width: "100%", minHeight: 320, border: "none", borderRadius: "var(--radius-card)", background: "#ffffff", colorScheme: "light" }}
                      onLoad={(e) => {
                        const iframe = e.currentTarget;
                        try {
                          const h = iframe.contentDocument?.body?.scrollHeight;
                          if (h) iframe.style.height = h + 24 + "px";
                        } catch {}
                      }}
                    />
                  ) : (
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "var(--fs-small)", color: "var(--text-main)", lineHeight: 1.65, fontFamily: "inherit", margin: 0 }}>
                      {selected.body_text ?? "(no body)"}
                    </pre>
                  )}
                </div>

                {selected.direction === "inbound" && (
                  <div style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-5)", borderTop: "1px solid var(--line-separator)" }}>
                    <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "var(--space-1)" }}>
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
          </GlassPanel>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1024px) {
          .inbox-reading-pane { flex-basis: 400px; }
        }
        @media (max-width: 768px) {
          .inbox-layout { flex-direction: column; padding: 8px; gap: 8px; }
          .inbox-folder-rail { display: none !important; }
          .inbox-list-pane {
            width: 100% !important;
            flex: 1;
            display: ${mobilePane === "detail" ? "none" : "flex"} !important;
          }
          .inbox-reading-pane {
            display: ${mobilePane === "list" ? "none" : "block"} !important;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 0;
            z-index: 100;
            background: var(--bg-surface);
          }
          .inbox-back-btn { display: inline-flex !important; }
          .folder-list-desktop { display: none !important; }
          .folder-dropdown-mobile { display: block !important; }
          .inbox-filter-chips { overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
          .inbox-filter-chips::-webkit-scrollbar { display: none; }
        }
        @media (min-width: 769px) {
          .inbox-back-btn { display: none !important; }
          .folder-dropdown-mobile { display: none !important; }
          .folder-list-desktop { display: flex !important; }
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
  background: "var(--glass-t1-bg)",
  border: "1px solid var(--glass-t1-border)",
  borderRadius: "var(--radius-sm)",
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
  background: "var(--glass-t1-bg)",
  color: "var(--text-main)",
  border: "1px solid var(--glass-t1-border)",
  borderRadius: "var(--radius-sm)",
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
        background: active ? "var(--accent-orange-soft)" : "transparent",
        border: "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        padding: "7px 10px",
        cursor: "pointer",
        transition: "background 0.12s",
        color: active ? "var(--accent-orange)" : "var(--text-main)",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-small)", width: 14, textAlign: "center", flexShrink: 0, opacity: 0.6 }}>
        {FOLDER_ICONS[label]}
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-small)", fontWeight: active ? 600 : 400, letterSpacing: "0.04em", flex: 1 }}>
        {label}
      </span>
      {count > 0 && (
        <TokenChip label={String(count)} size="xs" color={active ? "orange" : "muted"} />
      )}
    </button>
  );
}

function EmailCell({ row, active, isSelected, onToggleSelect, onClick }: { row: EmailRow; active: boolean; isSelected: boolean; onToggleSelect: (id: string) => void; onClick: () => void }) {
  const isSent = row.direction === "outbound";
  const displayName = isSent ? `→ ${row.to_email}` : row.from_name || row.from_email;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        background: active ? "var(--accent-orange-soft)" : isSelected ? "var(--glass-t2-bg)" : "transparent",
        borderBottom: "1px solid var(--line-separator)",
        borderLeft: active ? "2px solid var(--accent-orange)" : "2px solid transparent",
        padding: "var(--space-3) 0 var(--space-3) var(--space-3)",
        cursor: "pointer",
        transition: "background var(--duration-instant) var(--ease-out-soft)",
        opacity: row.is_deleted ? 0.5 : 1,
      }}
    >
      <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(row.id)} onClick={e => e.stopPropagation()} style={{ marginTop: "var(--space-1)", marginRight: "var(--space-3)", flexShrink: 0 }} />
      <div onClick={onClick} style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
          {!row.is_read && !isSent && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-orange)", flexShrink: 0 }} />
          )}
          {isSent && <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>↗</span>}
          <span style={{
            fontWeight: row.is_read || isSent ? 400 : 600,
            fontSize: "var(--fs-xs)",
            color: "var(--text-active)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {displayName}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--text-muted)", flexShrink: 0, paddingRight: "var(--space-3)" }}>
            {relativeTime(row.received_at)}
          </span>
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: row.is_read || isSent ? "var(--text-main)" : "var(--text-active)", fontWeight: row.is_read || isSent ? 400 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "var(--space-1)" }}>
          {row.subject ?? "(no subject)"}
        </div>
        <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {snippet(row.body_text, 80)}
        </div>
        <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-1)", flexWrap: "wrap" }}>
          {row.label && (
            <TokenChip label={row.label} size="xs" color="muted" />
          )}
          {row.classification?.intent && <IntentBadge intent={row.classification.intent} />}
          {row.actor === "arthur" && row.auto_action && row.auto_action !== "none" && (
            <TokenChip label={`⚙ ${row.auto_action}`} size="xs" color="orange" />
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-1)", alignItems: "baseline", borderBottom: "1px dashed var(--line-separator)", paddingBottom: "var(--space-1)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-mono)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", minWidth: 48, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--fs-xs)", color: accent ? "var(--accent-orange)" : "var(--text-main)", fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
    </div>
  );
}

function FilterChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <TokenChip
      label={label}
      variant="filter"
      size="sm"
      color={active ? "orange" : "muted"}
      selected={active}
      onClick={onToggle}
    />
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
          background: "var(--glass-t3-bg)",
          backdropFilter: "blur(var(--glass-t3-blur))",
          border: "1px solid var(--glass-t3-border)",
          borderRadius: "var(--radius-card)",
          padding: 6,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 130,
          boxShadow: "var(--glass-t3-shadow)",
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
        background: active ? "var(--accent-orange-soft)" : "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
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
        padding: "var(--space-3) var(--space-4)",
        background: "var(--glass-t1-bg)",
        border: "1px solid var(--glass-t1-border)",
        borderRadius: "var(--radius-card)",
        textDecoration: "none",
        transition: "transform var(--duration-quick) var(--ease-out-soft), box-shadow var(--duration-quick) var(--ease-out-soft)",
      }}
    >
      <span style={{ fontSize: "var(--fs-small)", color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--fs-h3)", fontWeight: 300, color: "var(--accent-orange)", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
        {count}
      </span>
    </a>
  );
}
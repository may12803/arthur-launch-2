"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { EmptyState } from "../_components/EmptyState";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CommRow {
  id: string;
  ts: string;
  channel: "sms" | "voice" | "fax" | "email";
  direction: "inbound" | "outbound";
  from_address: string;
  to_address: string;
  subject: string | null;
  body: string | null;
  attachment_url: string | null;
  status: string;
  external_id: string | null;
  cost_cents: number | null;
  metadata: Record<string, unknown>;
  entity: string | null;
  category: string | null;
  related_to: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function daySeparatorLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  const msgDay = new Date(d); msgDay.setHours(0,0,0,0);
  if (msgDay.getTime() === today.getTime()) return "TODAY";
  if (msgDay.getTime() === yesterday.getTime()) return "YESTERDAY";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

function preview(text: string | null, len = 60): string {
  if (!text) return "";
  const clean = text.replace(/\n/g, " ").trim();
  return clean.length > len ? clean.slice(0, len) + "…" : clean;
}

// ── Channel SVG Icons ─────────────────────────────────────────────────────────

function ChannelSvg({ channel }: { channel: CommRow["channel"] }) {
  const ICONS: Record<string, React.ReactNode> = {
    sms: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="1" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M4 13l3-3h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="4.5" cy="5.5" r="0.8" fill="currentColor"/>
        <circle cx="7" cy="5.5" r="0.8" fill="currentColor"/>
        <circle cx="9.5" cy="5.5" r="0.8" fill="currentColor"/>
      </svg>
    ),
    voice: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M2 2.5C2 2 2.5 1.5 3 1.5h1.5l1 3-1.5 1c.5 1 1.5 2 2.5 2.5l1-1.5 3 1V9c0 .5-.5 1-1 1C4 10 2 6 2 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    fax: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="4" y="1" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        <circle cx="10.5" cy="7.5" r="0.8" fill="currentColor"/>
        <path d="M3 9.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M3 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
    email: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M1 4l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  };
  const COLORS: Record<string, string> = {
    sms:   "#60a5fa",
    voice: "#4ade80",
    fax:   "#f7c07e",
    email: "#c07ef7",
  };
  const color = COLORS[channel] ?? "rgba(245,246,248,0.45)";
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      background: `${color}18`,
      border: `1px solid ${color}30`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color,
      flexShrink: 0,
    }}>
      {ICONS[channel] ?? <span style={{ fontSize: 12 }}>?</span>}
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; dot: string }> = {
    received:  { bg: "rgba(74,222,128,0.1)",   color: "#4ade80",  dot: "#4ade80" },
    queued:    { bg: "rgba(251,146,60,0.1)",   color: "#fb923c",  dot: "#fb923c" },
    sending:   { bg: "rgba(99,102,241,0.12)",  color: "#818cf8",  dot: "#818cf8" },
    sent:      { bg: "rgba(99,102,241,0.12)",  color: "#818cf8",  dot: "#818cf8" },
    delivered: { bg: "rgba(74,222,128,0.1)",   color: "#4ade80",  dot: "#4ade80" },
    failed:    { bg: "rgba(239,68,68,0.1)",    color: "#ef4444",  dot: "#ef4444" },
    read:      { bg: "rgba(148,163,184,0.1)",  color: "#94a3b8",  dot: "#94a3b8" },
  };
  const s = map[status] ?? { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", dot: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "1px 7px 1px 5px",
      borderRadius: 20,
      fontSize: 10,
      fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
      letterSpacing: "0.06em",
      background: s.bg,
      color: s.color,
      flexShrink: 0,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {status}
    </span>
  );
}

// ── Live Dot ──────────────────────────────────────────────────────────────────

function LiveDot({ live }: { live: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: live ? "#4ade80" : "rgba(245,246,248,0.25)",
        boxShadow: live ? "0 0 8px rgba(74,222,128,0.6)" : "none",
        animation: live ? "comm-pulse 2s ease-in-out infinite" : "none",
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        fontSize: 10,
        color: live ? "#4ade80" : "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
      }}>
        {live ? "live" : "connecting"}
      </span>
    </span>
  );
}

// ── Filter Chip ───────────────────────────────────────────────────────────────

function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 11,
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        letterSpacing: "0.04em",
        cursor: "pointer",
        border: active ? "1px solid rgba(212,255,61,0.40)" : "1px solid var(--glass-border)",
        background: active ? "rgba(212,255,61,0.12)" : "var(--glass-bg)",
        color: active ? "var(--accent-orange)" : "var(--text-main)",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {count != null && (
        <span style={{
          fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
          fontSize: 10,
          background: active ? "rgba(212,255,61,0.20)" : "var(--glass-bg-strong)",
          borderRadius: 8,
          padding: "0px 5px",
          color: active ? "var(--accent-orange)" : "var(--text-muted)",
        }}>{count}</span>
      )}
    </button>
  );
}

// ── Day Separator ─────────────────────────────────────────────────────────────

function DaySeparator({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px 8px" }}>
      <div style={{ flex: 1, height: 1, background: "var(--line-separator)" }} />
      <span style={{
        fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
        fontSize: 10,
        color: "var(--text-muted)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--line-separator)" }} />
    </div>
  );
}

// ── Timeline Event Card ───────────────────────────────────────────────────────

function TimelineCard({ row, active, onClick }: { row: CommRow; active: boolean; onClick: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const text = row.body ?? row.subject ?? "";
  const addr = row.direction === "inbound" ? row.from_address : row.to_address;

  return (
    <div style={{
      background: active ? "rgba(212,255,61,0.05)" : "transparent",
      borderLeft: `2px solid ${active ? "var(--accent-orange)" : "transparent"}`,
      transition: "background 0.15s ease, border-color 0.15s ease",
    }}>
      <button
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid var(--line-separator)",
          padding: "12px 16px",
          cursor: "pointer",
        }}
      >
        <ChannelSvg channel={row.channel} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-active)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}>
              {row.direction === "inbound" ? "↓ " : "↑ "}{addr}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <StatusBadge status={row.status} />
              <span style={{ fontSize: 10, fontFamily: "ui-monospace, 'JetBrains Mono', monospace", color: "var(--text-muted)" }}>
                {relTime(row.ts)}
              </span>
            </div>
          </div>

          {text && (
            <div style={{ fontSize: 12, color: "var(--text-main)", lineHeight: 1.5 }}>
              {expanded ? text : preview(text, 80)}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
            {row.entity && (
              <span style={{
                fontSize: 10,
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--glass-bg-strong)",
                border: "1px solid var(--glass-border)",
                color: "var(--text-muted)",
              }}>{row.entity.replace(/_/g, " ")}</span>
            )}
            {row.category && (
              <span style={{
                fontSize: 10,
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--glass-bg-strong)",
                border: "1px solid var(--glass-border)",
                color: "var(--text-muted)",
              }}>{row.category}</span>
            )}
          </div>
        </div>

        {text && text.length > 80 && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "4px",
              flexShrink: 0,
              fontSize: 10,
              marginTop: 2,
            }}
            title={expanded ? "collapse" : "expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </button>
    </div>
  );
}

// ── Detail Pane ───────────────────────────────────────────────────────────────

function CommDetail({ row, onClose }: { row: CommRow; onClose: () => void }) {
  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <button
        onClick={onClose}
        id="comm-back-btn"
        style={{
          background: "transparent",
          border: "1px solid var(--glass-border)",
          borderRadius: 6,
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 11,
          padding: "4px 12px",
          marginBottom: 20,
          fontFamily: "inherit",
        }}
      >← back</button>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <ChannelSvg channel={row.channel} />
        <div>
          <div style={{ fontWeight: 400, fontSize: 18, letterSpacing: "-0.02em", color: "var(--text-active)" }}>
            {row.direction === "inbound" ? row.from_address : row.to_address}
          </div>
          <div style={{ marginTop: 4 }}>
            <StatusBadge status={row.status} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {([
          ["channel",    row.channel],
          ["direction",  row.direction],
          ["from",       row.from_address],
          ["to",         row.to_address],
          ["time",       new Date(row.ts).toLocaleString("en-US", { timeZone: "America/Detroit", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })],
          ["entity",     row.entity],
          ["category",   row.category],
          ["ext. id",    row.external_id],
          ["cost",       row.cost_cents != null ? `$${(row.cost_cents / 100).toFixed(4)}` : null],
        ] as [string, string | null][]).filter(([, v]) => v != null).map(([label, value]) => (
          <div key={label} style={{ display: "flex", gap: 12, alignItems: "center", borderBottom: "1px dashed rgba(255,255,255,0.10)", paddingBottom: 6 }}>
            <span style={{
              fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
              fontSize: 9,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              minWidth: 72,
              flexShrink: 0,
            }}>{label}</span>
            <span style={{ fontSize: 12, color: "var(--text-main)", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}>
              {String(value)}
            </span>
          </div>
        ))}
      </div>

      {row.subject && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>subject</div>
          <p style={{ fontSize: 13, color: "var(--text-active)", margin: 0, lineHeight: 1.6 }}>{row.subject}</p>
        </div>
      )}

      {row.body && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
            {row.channel === "voice" ? "transcript" : "message"}
          </div>
          <div style={{
            padding: 16,
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--text-main)",
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>{row.body}</div>
        </div>
      )}

      {row.attachment_url && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 9, fontFamily: "ui-monospace, 'JetBrains Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>attachment</div>
          <a
            href={`/api/communications/attachment?path=${encodeURIComponent(row.attachment_url)}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 12, color: "var(--accent-orange)", textDecoration: "none" }}
          >
            ↓ {row.channel === "voice" ? "download recording" : "download pdf"}
          </a>
        </div>
      )}

      {row.metadata && Object.keys(row.metadata).length > 0 && (
        <details>
          <summary style={{
            fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            cursor: "pointer",
            marginBottom: 8,
          }}>metadata</summary>
          <pre style={{
            fontSize: 10,
            fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
            color: "var(--text-main)",
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            borderRadius: 6,
            padding: 16,
            overflow: "auto",
          }}>{JSON.stringify(row.metadata, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  initialRows: unknown[];
  initialTotal: number;
}

export default function CommunicationsList({ initialRows, initialTotal }: Props) {
  const [rows, setRows] = useState<CommRow[]>(initialRows as CommRow[]);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<CommRow | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");

  const [channel, setChannel] = useState("");
  const [direction, setDirection] = useState("");
  const [period, setPeriod] = useState("all");
  const [q, setQ] = useState("");

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (channel)          params.set("channel",   channel);
    if (direction)        params.set("direction", direction);
    if (period !== "all") params.set("period",    period);
    if (q)                params.set("q",         q);
    try {
      const res = await fetch(`/api/communications?${params}`);
      if (!res.ok) return;
      const json = await res.json() as { rows: CommRow[]; total: number };
      setRows(json.rows);
      setTotal(json.total);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [channel, direction, period, q]);

  useEffect(() => { fetchList(false); }, [fetchList]);

  useEffect(() => {
    const ch = supabase
      .channel("arthur-comms-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "arthur_communications" }, (payload) => {
        const newRow = payload.new as CommRow;
        const matchChan = !channel || newRow.channel === channel;
        const matchDir  = !direction || newRow.direction === direction;
        if (matchChan && matchDir) {
          setRows(prev => [newRow, ...prev]);
          setTotal(prev => prev + 1);
        }
      })
      .subscribe((status) => { setLive(status === "SUBSCRIBED"); });
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [channel, direction]);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.channel] = (acc[r.channel] ?? 0) + 1;
    return acc;
  }, {});

  type TimelineItem =
    | { kind: "separator"; label: string; key: string }
    | { kind: "row"; row: CommRow };

  const timeline: TimelineItem[] = [];
  let lastDay = "";
  for (const row of rows) {
    const label = daySeparatorLabel(row.ts);
    if (label !== lastDay) {
      timeline.push({ kind: "separator", label, key: `sep-${row.ts}` });
      lastDay = label;
    }
    timeline.push({ kind: "row", row });
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <div style={{ minHeight: "calc(100vh - 108px)", display: "flex", flexDirection: "column", paddingTop: 108, background: "var(--bg-base)" }}>

      {/* ── Page header ── */}
      <div style={{
        padding: "24px 28px 20px",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--line-separator)",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>
            unified communications
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontWeight: 300, fontSize: "clamp(2rem, 4vw, 2.8rem)", letterSpacing: "-0.03em", color: "var(--text-active)", lineHeight: 1 }}>
              communications.
            </h1>
            <LiveDot live={live} />
          </div>
        </div>
        <div style={{ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 10, color: "var(--text-muted)", paddingBottom: 4 }}>
          {dateStr}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        borderBottom: "1px solid var(--line-separator)",
        background: "var(--glass-bg)",
        backdropFilter: "blur(var(--blur-amount))",
        flexShrink: 0,
      }}>
        {/* Channel chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <FilterChip label="All"   count={rows.length}  active={!channel}           onClick={() => setChannel("")} />
          <FilterChip label="SMS"   count={counts.sms}   active={channel === "sms"}   onClick={() => setChannel(channel === "sms"   ? "" : "sms")} />
          <FilterChip label="Voice" count={counts.voice} active={channel === "voice"} onClick={() => setChannel(channel === "voice" ? "" : "voice")} />
          <FilterChip label="Fax"   count={counts.fax}   active={channel === "fax"}   onClick={() => setChannel(channel === "fax"   ? "" : "fax")} />
          <FilterChip label="Email" count={counts.email} active={channel === "email"} onClick={() => setChannel(channel === "email" ? "" : "email")} />
        </div>

        <div style={{ width: 1, height: 20, background: "var(--line-separator)" }} />

        {/* Direction */}
        <div style={{ display: "flex", gap: 6 }}>
          <FilterChip label="↓ in"  active={direction === "inbound"}  onClick={() => setDirection(direction === "inbound"  ? "" : "inbound")} />
          <FilterChip label="↑ out" active={direction === "outbound"} onClick={() => setDirection(direction === "outbound" ? "" : "outbound")} />
        </div>

        <div style={{ width: 1, height: 20, background: "var(--line-separator)" }} />

        {/* Period */}
        <div style={{ display: "flex", gap: 6 }}>
          {(["today", "7d", "30d", "all"] as const).map(p => (
            <FilterChip key={p} label={p} active={period === p} onClick={() => setPeriod(p)} />
          ))}
        </div>

        {/* Search */}
        <input
          type="search"
          placeholder="search from, to, body…"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{
            flex: "1 1 180px",
            maxWidth: 260,
            padding: "7px 12px",
            fontSize: 11,
            height: 30,
            minHeight: "unset",
            background: "var(--glass-bg-strong)",
            border: "1px solid var(--glass-border)",
            borderRadius: 8,
            color: "var(--text-active)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />

        <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 10, color: "var(--text-muted)" }}>
          {total} messages
        </span>
      </div>

      {/* ── Two-pane body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Timeline list */}
        <div
          className="comm-list-pane"
          style={{
            width: 440,
            minWidth: 0,
            borderRight: "1px solid var(--line-separator)",
            overflowY: "auto",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--glass-bg)",
          }}
        >
          {loading ? (
            <div style={{ padding: 24, color: "var(--text-muted)", fontSize: 12, fontFamily: "ui-monospace, monospace" }}>syncing…</div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="📡"
              title={q || channel || direction ? "no messages match these filters." : "no messages yet."}
              subtitle={!q && !channel && !direction ? "webhooks will populate this once Telnyx is live." : undefined}
              size="md"
            />
          ) : (
            timeline.map((item) => {
              if (item.kind === "separator") {
                return <DaySeparator key={item.key} label={item.label} />;
              }
              return (
                <TimelineCard
                  key={item.row.id}
                  row={item.row}
                  active={selected?.id === item.row.id}
                  onClick={() => { setSelected(item.row); setMobilePane("detail"); }}
                />
              );
            })
          )}
          {!loading && rows.length > 0 && (
            <div style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: 10, textAlign: "center", fontFamily: "ui-monospace, 'JetBrains Mono', monospace" }}>
              {total} total · showing {rows.length}
            </div>
          )}
        </div>

        {/* Detail pane */}
        <div
          className="comm-detail-pane"
          style={{
            flex: 1,
            overflowY: "auto",
            minWidth: 0,
            background: "var(--glass-bg-strong)",
          }}
        >
          {!selected && (
            <div style={{ padding: "40px 24px", color: "var(--text-muted)", fontSize: 13 }}>
              select a message to view it.
            </div>
          )}
          {selected && (
            <CommDetail
              row={selected}
              onClose={() => { setSelected(null); setMobilePane("list"); }}
            />
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes comm-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(74,222,128,0.6); }
          50%       { opacity: 0.5; box-shadow: 0 0 3px rgba(74,222,128,0.2); }
        }
        @media (max-width: 700px) {
          .comm-list-pane {
            width: 100% !important;
            border-right: none !important;
            display: ${mobilePane === "detail" ? "none" : "flex"} !important;
          }
          .comm-detail-pane {
            display: ${mobilePane === "list" ? "none" : "block"} !important;
          }
          #comm-back-btn { display: inline-flex !important; }
        }
        @media (min-width: 701px) {
          #comm-back-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}

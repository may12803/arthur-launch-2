"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Nav, Footer } from "../_components/Layout";

// ── Types ────────────────────────────────────────────────────────────────────

interface DocRow {
  id: string;
  entity: string | null;
  category: string | null;
  title: string | null;
  description: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  effective_date: string | null;
  expires_at: string | null;
  parties: Array<{ name: string; role: string }> | null;
  uploaded_at: string;
  uploaded_by: string;
  last_accessed_at: string | null;
  is_archived: boolean;
  metadata: Record<string, unknown> | null;
  extraction_status: "pending" | "extracting" | "complete" | "failed" | null;
  extraction_error: string | null;
}

interface DocFull extends DocRow {
  full_text: string | null;
  archived_at: string | null;
  signed_url: string | null;
}

interface AuditRow {
  id: string;
  action: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface EntityCount  { entity: string;   count: number }
interface CategoryCount { category: string; count: number }

interface ListResponse {
  rows: DocRow[];
  total: number;
  entities: EntityCount[];
  categories: CategoryCount[];
  counts: { by_entity: Record<string, number>; by_category: Record<string, number>; expiring_soon: number };
}

// ── Color helpers ─────────────────────────────────────────────────────────────
// Deterministically map an entity string to one of 8 palette colors
const PALETTE = [
  "#4f91d6", // blue
  "#c07ef7", // purple
  "#0B504F", // teal
  "#ff4713", // orange-red
  "#f7c07e", // gold
  "#22c55e", // green
  "#f472b6", // pink
  "#94a3b8", // slate
];

function entityColor(entity: string): string {
  let hash = 0;
  for (let i = 0; i < entity.length; i++) {
    hash = (hash * 31 + entity.charCodeAt(i)) & 0xffffffff;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function formatEntity(entity: string): string {
  return entity.replace(/_/g, " ");
}

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    formation: "Formation",
    operating_agreement: "Operating Agreements",
    contract: "Contracts",
    sow: "SOWs",
    nda: "NDAs",
    ein: "EIN / Tax",
    tax_filing: "Tax Filings",
    license: "Licenses",
    liquor_license: "Liquor Licenses",
    insurance: "Insurance",
    banking: "Banking",
    hr: "HR",
    correspondence: "Correspondence",
    other: "Other",
  };
  return map[cat] ?? cat.replace(/_/g, " ");
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
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function expiresColor(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = daysUntil(iso);
  if (d <= 30) return "#ef4444";
  if (d <= 90) return "#f59e0b";
  return undefined;
}

function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Entity badge ──────────────────────────────────────────────────────────────

function EntityBadge({ entity }: { entity: string | null }) {
  if (!entity) return null;
  const color = entityColor(entity);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 4,
        fontSize: 9,
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
        flexShrink: 0,
      }}
    >
      {formatEntity(entity)}
    </span>
  );
}

// ── Extraction status badge ───────────────────────────────────────────────────

function ExtractionBadge({ status, onFix }: { status: DocRow["extraction_status"]; onFix?: () => void }) {
  if (status === "complete" || !status) return null;

  if (status === "pending" || status === "extracting") {
    return (
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        borderRadius: 4,
        fontSize: 9,
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        letterSpacing: "0.06em",
        background: "rgba(99,102,241,0.12)",
        color: "#818cf8",
        border: "1px solid rgba(99,102,241,0.3)",
      }}>
        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#818cf8", animation: "pulse 1.2s infinite" }} />
        {status === "extracting" ? "extracting…" : "pending"}
      </span>
    );
  }

  if (status === "failed") {
    return (
      <button
        onClick={onFix}
        style={{
          display: "inline-block",
          padding: "1px 7px",
          borderRadius: 4,
          fontSize: 9,
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          letterSpacing: "0.06em",
          background: "rgba(239,68,68,0.1)",
          color: "#ef4444",
          border: "1px solid rgba(239,68,68,0.3)",
          cursor: "pointer",
        }}
      >
        extraction failed — click to fix
      </button>
    );
  }

  return null;
}

// ── Inline editable field ─────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  mono = false,
  style,
}: {
  value: string;
  onSave: (v: string) => void;
  mono?: boolean;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        title="click to edit"
        style={{
          cursor: "text",
          borderBottom: "1px dashed var(--border-strong)",
          paddingBottom: 1,
          fontFamily: mono ? "var(--font-jetbrains, 'JetBrains Mono', monospace)" : undefined,
          ...style,
        }}
      >
        {value || <em style={{ color: "var(--text-faint)" }}>—</em>}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      onKeyDown={e => {
        if (e.key === "Enter") { setEditing(false); if (draft !== value) onSave(draft); }
        if (e.key === "Escape") { setEditing(false); setDraft(value); }
      }}
      style={{
        fontSize: "inherit",
        fontFamily: mono ? "var(--font-jetbrains, 'JetBrains Mono', monospace)" : "inherit",
        fontWeight: "inherit",
        color: "inherit",
        background: "var(--panel-elev)",
        border: "1px solid var(--accent)",
        borderRadius: 4,
        padding: "2px 6px",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

// ── Doc cell ─────────────────────────────────────────────────────────────────

function DocCell({ doc, active, onClick }: { doc: DocRow; active: boolean; onClick: () => void }) {
  const expColor = expiresColor(doc.expires_at);
  const isPending = doc.extraction_status === "pending" || doc.extraction_status === "extracting";
  const isFailed  = doc.extraction_status === "failed";
  const parties = doc.parties?.slice(0, 2) ?? [];

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
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 3 }}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5, color: "var(--text)", lineHeight: 1.3 }}>
          {isPending ? (
            <span style={{ color: "var(--text-faint)", fontStyle: "italic" }}>extracting…</span>
          ) : (
            doc.title ?? doc.file_name
          )}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", flexShrink: 0 }}>
          {relativeTime(doc.uploaded_at)}
        </span>
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
        {isPending || isFailed ? (
          <ExtractionBadge status={doc.extraction_status} />
        ) : (
          <>
            <EntityBadge entity={doc.entity} />
            {doc.category && (
              <span style={{
                display: "inline-block",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: 9,
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                letterSpacing: "0.06em",
                background: "var(--panel-elev)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-dim)",
              }}>
                {formatCategory(doc.category)}
              </span>
            )}
          </>
        )}
      </div>

      {parties.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 3 }}>
          {parties.map(p => p.name).join(" · ")}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, fontSize: 10.5, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
        {doc.effective_date && (
          <span style={{ color: "var(--text-faint)" }}>eff. {doc.effective_date}</span>
        )}
        {doc.expires_at && (
          <span style={{ color: expColor ?? "var(--text-faint)", fontWeight: expColor ? 600 : 400 }}>
            exp. {doc.expires_at}
            {expColor && ` (${daysUntil(doc.expires_at)}d)`}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Drag-drop upload zone ─────────────────────────────────────────────────────

function UploadZone({ onUpload, large = false }: { onUpload: (file: File) => void; large?: boolean }) {
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onUpload(f);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { onUpload(f); e.target.value = ""; }
  }

  if (large) {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("legal-file-input-large")?.click()}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: 16,
          padding: "60px 40px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "var(--accent-soft)" : "var(--panel-elev)",
          transition: "all 0.15s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <input
          id="legal-file-input-large"
          type="file"
          style={{ display: "none" }}
          onChange={handleInput}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.heic,.webp,.txt,.md"
        />
        <div style={{
          fontSize: 32,
          opacity: dragging ? 1 : 0.4,
          color: dragging ? "var(--accent)" : "var(--text)",
          transition: "all 0.15s",
        }}>
          ↑
        </div>
        <div style={{
          fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
          fontWeight: 700,
          fontSize: 18,
          color: "var(--text)",
          letterSpacing: "-0.01em",
        }}>
          drop a PDF, contract, or image
        </div>
        <div style={{
          fontSize: 13,
          color: "var(--text-faint)",
          maxWidth: 340,
          lineHeight: 1.6,
        }}>
          arthur extracts entity, category, parties, dates, and key data automatically.
        </div>
        <div style={{
          fontSize: 11,
          color: "var(--text-faint)",
          fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
          marginTop: 8,
        }}>
          click to browse · pdf · doc · images
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById("legal-file-input-zone")?.click()}
      style={{
        border: `2px dashed ${dragging ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: 8,
        padding: "10px 16px",
        textAlign: "center",
        cursor: "pointer",
        background: dragging ? "var(--accent-soft)" : "transparent",
        transition: "all 0.15s",
        fontSize: 11.5,
        color: "var(--text-faint)",
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        whiteSpace: "nowrap",
      }}
    >
      <input
        id="legal-file-input-zone"
        type="file"
        style={{ display: "none" }}
        onChange={handleInput}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.heic,.webp,.txt,.md"
      />
      + drop or pick file
    </div>
  );
}

// ── Audit log row ─────────────────────────────────────────────────────────────

function AuditLogRow({ a }: { a: AuditRow }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-faint)", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", minWidth: 70, color: "var(--text-dim)" }}>
        {a.action}
      </span>
      <span>{a.actor}</span>
      <span style={{ marginLeft: "auto" }}>{relativeTime(a.created_at)}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LegalPage() {
  const [entityFilter,   setEntityFilter]   = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [q,              setQ]              = useState("");
  const [showArchived,   setShowArchived]   = useState(false);

  const [rows,       setRows]       = useState<DocRow[]>([]);
  const [total,      setTotal]      = useState(0);
  const [entities,   setEntities]   = useState<EntityCount[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [expiringSoon, setExpiringSoon] = useState(0);
  const [loading,    setLoading]    = useState(true);

  const [selectedId,     setSelectedId]     = useState<string | null>(null);
  const [selected,       setSelected]       = useState<DocFull | null>(null);
  const [auditLog,       setAuditLog]       = useState<AuditRow[]>([]);
  const [loadingDetail,  setLoadingDetail]  = useState(false);

  const [saving,      setSaving]      = useState(false);
  const [extracting,  setExtracting]  = useState(false);
  const [mobilePane,  setMobilePane]  = useState<"list" | "detail">("list");

  // Track polling interval for in-progress extractions
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch list ─────────────────────────────────────────────────────────────
  const fetchList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (entityFilter)   params.set("entity", entityFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (q)              params.set("q", q);
    if (showArchived)   params.set("archived", "true");

    try {
      const res = await fetch(`/api/legal?${params}`);
      if (!res.ok) return;
      const json = (await res.json()) as ListResponse;
      setRows(json.rows);
      setTotal(json.total);
      setEntities(json.entities ?? []);
      setCategories(json.categories ?? []);
      setExpiringSoon(json.counts?.expiring_soon ?? 0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [entityFilter, categoryFilter, q, showArchived]);

  useEffect(() => { fetchList(false); }, [fetchList]);
  useEffect(() => {
    const id = setInterval(() => fetchList(true), 30000);
    return () => clearInterval(id);
  }, [fetchList]);

  // ── Fetch single doc ───────────────────────────────────────────────────────
  const fetchDoc = useCallback(async (id: string) => {
    const res = await fetch(`/api/legal/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as DocFull;
  }, []);

  useEffect(() => {
    if (!selectedId) { setSelected(null); setAuditLog([]); return; }
    setLoadingDetail(true);
    fetchDoc(selectedId)
      .then(doc => {
        if (doc) setSelected(doc);
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false));
  }, [selectedId, fetchDoc]);

  // ── Upload handler ─────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    // Optimistic row
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticRow: DocRow = {
      id: optimisticId,
      entity: null,
      category: null,
      title: null,
      description: null,
      storage_path: "",
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      effective_date: null,
      expires_at: null,
      parties: null,
      uploaded_at: new Date().toISOString(),
      uploaded_by: "daniel",
      last_accessed_at: null,
      is_archived: false,
      metadata: null,
      extraction_status: "pending",
      extraction_error: null,
    };
    setRows(prev => [optimisticRow, ...prev]);

    const fd = new FormData();
    fd.append("file", file);

    let realId: string | null = null;
    try {
      const res = await fetch("/api/legal/upload", { method: "POST", body: fd });
      const json = await res.json() as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !json.id) {
        // Remove optimistic row on failure
        setRows(prev => prev.filter(r => r.id !== optimisticId));
        return;
      }
      realId = json.id;
      // Replace optimistic row with real id (still pending)
      setRows(prev => prev.map(r => r.id === optimisticId ? { ...r, id: realId! } : r));
    } catch {
      setRows(prev => prev.filter(r => r.id !== optimisticId));
      return;
    }

    // Poll until extraction complete
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const doc = await fetchDoc(realId!);
      if (!doc) return;
      setRows(prev => prev.map(r => r.id === realId ? { ...r, ...doc } : r));
      if (doc.extraction_status === "complete" || doc.extraction_status === "failed") {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        fetchList(true); // refresh counts
      }
    }, 1500);
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function openDoc(id: string) {
    if (id.startsWith("optimistic-")) return; // don't try to load optimistic rows
    setSelectedId(id);
    setMobilePane("detail");
  }

  // ── Inline field save ──────────────────────────────────────────────────────
  async function patchField(field: string, value: unknown) {
    if (!selectedId || selectedId.startsWith("optimistic-")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/legal/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = (await res.json()) as DocFull;
        setSelected(prev => prev ? { ...prev, ...updated } : prev);
        setRows(prev => prev.map(r => r.id === selectedId ? { ...r, ...updated } : r));
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveDoc() {
    if (!selectedId) return;
    const res = await fetch(`/api/legal/${selectedId}`, { method: "DELETE" });
    if (res.ok) {
      setRows(prev => prev.filter(r => r.id !== selectedId));
      setSelectedId(null);
      setMobilePane("list");
      fetchList(true);
    }
  }

  async function reextract() {
    if (!selectedId) return;
    setExtracting(true);
    try {
      await fetch(`/api/legal/extract/${selectedId}`, { method: "POST" });
      setTimeout(async () => {
        const doc = await fetchDoc(selectedId);
        if (doc) {
          setSelected(doc);
          setRows(prev => prev.map(r => r.id === selectedId ? { ...r, ...doc } : r));
        }
        setExtracting(false);
      }, 3000);
    } catch {
      setExtracting(false);
    }
  }

  function copyShareLink() {
    if (!selectedId) return;
    const url = `${window.location.origin}/legal#${selectedId}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  // ── Hash sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && hash.length > 10) setSelectedId(hash);
  }, []);

  const expColor = selected ? expiresColor(selected.expires_at) : undefined;

  // ── Render ─────────────────────────────────────────────────────────────────
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
            <span style={{
              fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "-0.01em",
              color: "var(--text)",
            }}>
              legal vault.
            </span>
            {expiringSoon > 0 && (
              <span style={{
                background: "rgba(239,68,68,0.15)",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 7px",
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                letterSpacing: "0.04em",
              }}>
                {expiringSoon} expiring
              </span>
            )}
          </div>

          {/* Dynamic entity chips */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setEntityFilter("")}
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                letterSpacing: "0.04em",
                cursor: "pointer",
                border: !entityFilter ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
                background: !entityFilter ? "var(--accent-soft)" : "transparent",
                color: !entityFilter ? "var(--accent)" : "var(--text-dim)",
                transition: "all 0.15s",
              }}
            >
              All
            </button>
            {entities.map(e => {
              const color = entityColor(e.entity);
              const active = entityFilter === e.entity;
              return (
                <button
                  key={e.entity}
                  onClick={() => setEntityFilter(active ? "" : e.entity)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 20,
                    fontSize: 11,
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                    border: active ? `1px solid ${color}` : "1px solid var(--border-strong)",
                    background: active ? color + "22" : "transparent",
                    color: active ? color : "var(--text-dim)",
                    transition: "all 0.15s",
                  }}
                >
                  {formatEntity(e.entity)}
                  <span style={{ marginLeft: 4, opacity: 0.7 }}>{e.count}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <input
            type="search"
            placeholder="search title, description, text…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ flex: "1 1 200px", maxWidth: 280, padding: "7px 12px", fontSize: 12.5, height: 34, minHeight: "unset" }}
          />

          {/* Archived toggle */}
          <button
            onClick={() => setShowArchived(a => !a)}
            style={{
              background: showArchived ? "var(--accent-soft)" : "transparent",
              border: `1px solid ${showArchived ? "var(--accent)" : "var(--border-strong)"}`,
              borderRadius: 6,
              color: showArchived ? "var(--accent)" : "var(--text-dim)",
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              fontSize: 10.5,
              padding: "4px 10px",
              cursor: "pointer",
              height: 28,
            }}
          >
            {showArchived ? "archived" : "active"}
          </button>

          {/* Upload zone */}
          <div style={{ marginLeft: "auto" }}>
            <UploadZone onUpload={handleUpload} />
          </div>
        </div>

        {/* ── Three-pane body ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── Left pane: dynamic category list ── */}
          <div
            className="legal-cat-pane"
            style={{
              width: 180,
              minWidth: 0,
              borderRight: "1px solid var(--border)",
              overflowY: "auto",
              flexShrink: 0,
              padding: "8px 6px",
            }}
          >
            <div style={{ fontSize: 9, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-faint)", padding: "4px 6px 8px" }}>
              Categories
            </div>
            <button
              onClick={() => setCategoryFilter("")}
              style={{
                ...catBtnBase,
                background: !categoryFilter ? "var(--accent-soft)" : "transparent",
                color: !categoryFilter ? "var(--accent)" : "var(--text-dim)",
              }}
            >
              <span style={{ flex: 1 }}>All</span>
              <span style={catCountStyle}>{total}</span>
            </button>
            {categories.map(c => (
              <button
                key={c.category}
                onClick={() => setCategoryFilter(categoryFilter === c.category ? "" : c.category)}
                style={{
                  ...catBtnBase,
                  background: categoryFilter === c.category ? "var(--accent-soft)" : "transparent",
                  color: categoryFilter === c.category ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                <span style={{ flex: 1 }}>{formatCategory(c.category)}</span>
                {c.count > 0 && <span style={catCountStyle}>{c.count}</span>}
              </button>
            ))}
          </div>

          {/* ── Middle pane: doc list ── */}
          <div
            className="legal-list-pane"
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
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: 24, color: "var(--text-faint)", fontSize: 12.5 }}>loading…</div>
              ) : rows.length === 0 ? (
                <div style={{ padding: "20px 16px" }}>
                  <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                    {q || entityFilter || categoryFilter
                      ? "no documents match these filters."
                      : "no documents yet — drop a file to get started."}
                  </div>
                </div>
              ) : (
                rows.map(doc => (
                  <DocCell
                    key={doc.id}
                    doc={doc}
                    active={doc.id === selectedId}
                    onClick={() => openDoc(doc.id)}
                  />
                ))
              )}
              {!loading && rows.length > 0 && (
                <div style={{ padding: "12px 16px", color: "var(--text-faint)", fontSize: 11, textAlign: "center" }}>
                  {total} document{total !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>

          {/* ── Right pane: doc reader ── */}
          <div
            className="legal-reading-pane"
            style={{ flex: 1, overflowY: "auto", minWidth: 0 }}
          >
            {mobilePane === "detail" && (
              <button
                className="btn-ghost"
                onClick={() => { setMobilePane("list"); setSelectedId(null); }}
                style={{ margin: "12px 16px", fontSize: 11.5, padding: "6px 12px", minHeight: "unset", display: "none" }}
              >
                ← back
              </button>
            )}

            {!selectedId && rows.length === 0 && !loading && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                padding: "40px 32px",
              }}>
                <div style={{ width: "100%", maxWidth: 480 }}>
                  <UploadZone onUpload={handleUpload} large />
                </div>
              </div>
            )}

            {!selectedId && rows.length > 0 && (
              <div style={{ padding: "40px 32px" }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>select a document to view it.</div>
                <div style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.65, maxWidth: 360 }}>
                  arthur extracts entity, category, parties, dates, and amounts from every uploaded file. inline-edit any field to correct it.
                </div>
              </div>
            )}

            {selectedId && loadingDetail && (
              <div style={{ padding: 40, color: "var(--text-faint)", fontSize: 13 }}>loading…</div>
            )}

            {selected != null && !loadingDetail && (
              <div style={{ padding: "24px 28px", maxWidth: 900 }}>

                {/* Extraction in-progress banner */}
                {(selected.extraction_status === "pending" || selected.extraction_status === "extracting") && (
                  <div style={{
                    marginBottom: 20,
                    padding: "12px 16px",
                    background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.25)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 12.5,
                    color: "#818cf8",
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                  }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#818cf8", animation: "pulse 1.2s infinite" }} />
                    Pioneer is reading this document and determining entity, category, and details…
                  </div>
                )}

                {selected.extraction_status === "failed" && (
                  <div style={{
                    marginBottom: 20,
                    padding: "12px 16px",
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: "#ef4444",
                  }}>
                    Extraction failed. {selected.extraction_error && <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", fontSize: 11 }}>{selected.extraction_error}</span>}
                    <button
                      onClick={reextract}
                      disabled={extracting}
                      style={{ marginLeft: 12, background: "none", border: "1px solid #ef4444", borderRadius: 4, color: "#ef4444", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}
                    >
                      {extracting ? "retrying…" : "retry"}
                    </button>
                  </div>
                )}

                {/* Header */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                    {/* Inline-editable entity badge */}
                    <EntityBadge entity={selected.entity} />
                    {selected.category && (
                      <span style={{
                        fontSize: 9,
                        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        background: "var(--panel-elev)",
                        border: "1px solid var(--border-strong)",
                        color: "var(--text-dim)",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}>
                        {formatCategory(selected.category)}
                      </span>
                    )}
                    {selected.extraction_status === "complete" && (
                      <span style={{
                        fontSize: 9,
                        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                        letterSpacing: "0.06em",
                        background: "rgba(34,197,94,0.1)",
                        border: "1px solid rgba(34,197,94,0.3)",
                        color: "#22c55e",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}>
                        extracted
                      </span>
                    )}
                    {saving && (
                      <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>saving…</span>
                    )}
                  </div>

                  {/* Inline-editable title */}
                  <h2 style={{
                    fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: "-0.01em",
                    color: "var(--text)",
                    margin: "0 0 12px",
                  }}>
                    <InlineEdit
                      value={selected.title ?? selected.file_name ?? "Untitled"}
                      onSave={v => patchField("title", v)}
                      style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
                    />
                  </h2>

                  {/* Meta grid — all inline-editable */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <MetaRow label="entity" value={
                      <InlineEdit
                        value={selected.entity ?? ""}
                        onSave={v => patchField("entity", v)}
                        mono
                        style={{ fontSize: 12.5 }}
                      />
                    } />
                    <MetaRow label="category" value={
                      <InlineEdit
                        value={selected.category ?? ""}
                        onSave={v => patchField("category", v)}
                        mono
                        style={{ fontSize: 12.5 }}
                      />
                    } />
                    <MetaRow label="effective" value={
                      <InlineEdit
                        value={selected.effective_date ?? ""}
                        onSave={v => patchField("effective_date", v || null)}
                        mono
                        style={{ fontSize: 12.5 }}
                      />
                    } />
                    <MetaRow label="expires" value={
                      <span style={{ color: expColor ?? "inherit" }}>
                        <InlineEdit
                          value={selected.expires_at ?? ""}
                          onSave={v => patchField("expires_at", v || null)}
                          mono
                          style={{ fontSize: 12.5, color: expColor ?? "var(--text-dim)" }}
                        />
                        {expColor && selected.expires_at ? ` (${daysUntil(selected.expires_at)}d)` : ""}
                      </span>
                    } />
                    <MetaRow label="uploaded" value={relativeTime(selected.uploaded_at)} />
                    {!!selected.size_bytes && <MetaRow label="size" value={formatBytes(selected.size_bytes)} />}
                    <MetaRow label="file" value={selected.file_name} />
                  </div>

                  {/* Inline-editable description */}
                  {selected.description ? (
                    <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 10, lineHeight: 1.6, cursor: "text" }}
                       onClick={() => {/* could expand to textarea edit */}}>
                      {selected.description}
                    </p>
                  ) : null}
                </div>

                {/* Action row */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {selected.signed_url && (
                    <a
                      href={selected.signed_url}
                      download={selected.file_name}
                      className="btn-ghost"
                      style={{ fontSize: 11.5, padding: "6px 12px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                    >
                      ↓ download
                    </a>
                  )}
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset", color: "var(--text-faint)" }}
                    onClick={archiveDoc}
                  >
                    archive
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }}
                    onClick={reextract}
                    disabled={extracting}
                  >
                    {extracting ? "extracting…" : "re-extract"}
                  </button>
                  <button className="btn-ghost" style={{ fontSize: 11.5, padding: "6px 12px", minHeight: "unset" }} onClick={copyShareLink}>
                    copy link
                  </button>
                </div>

                {/* PDF preview */}
                {selected.signed_url && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>
                      preview
                    </div>
                    {selected.mime_type === "application/pdf" || selected.file_name?.endsWith(".pdf") ? (
                      <embed
                        src={selected.signed_url}
                        type="application/pdf"
                        style={{ width: "100%", height: 480, borderRadius: 8, border: "1px solid var(--border-strong)", background: "#fff" }}
                      />
                    ) : selected.mime_type?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selected.signed_url} alt={selected.title ?? ""} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--border-strong)" }} />
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                        preview not available for this file type —{" "}
                        <a href={selected.signed_url} download={selected.file_name} style={{ color: "var(--accent)" }}>download to view</a>
                      </div>
                    )}
                  </div>
                )}

                {/* Extracted metadata */}
                {(!!selected.parties?.length || !!selected.metadata?.summary) && (
                  <div style={{ marginBottom: 24, padding: 16, background: "var(--panel-elev)", borderRadius: 8, border: "1px solid var(--border-strong)" }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 10 }}>
                      extracted by pioneer
                    </div>

                    {!!selected.metadata?.summary && (
                      <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.65, marginBottom: 12 }}>
                        {String(selected.metadata.summary)}
                      </p>
                    )}

                    {selected.parties && selected.parties.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 5 }}>parties</div>
                        {selected.parties.map((p, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                            <span style={{ color: "var(--text-faint)" }}>{p.role}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!!(selected.metadata?.amounts) && Array.isArray(selected.metadata.amounts) && (selected.metadata.amounts as unknown[]).length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 5 }}>amounts</div>
                        {(selected.metadata.amounts as Array<{ value: number; currency: string; context: string }>).map((a, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 3 }}>
                            {a.currency} {a.value.toLocaleString()} — {a.context}
                          </div>
                        ))}
                      </div>
                    )}

                    {!!(selected.metadata?.key_dates) && Array.isArray(selected.metadata.key_dates) && (selected.metadata.key_dates as unknown[]).length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 5 }}>key dates</div>
                        {(selected.metadata.key_dates as Array<{ date: string; type: string; description: string }>).map((d, i) => (
                          <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 3 }}>
                            <span style={{ fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", marginRight: 8 }}>{d.date}</span>
                            {d.type} — {d.description}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Audit log */}
                {auditLog.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>
                      audit log
                    </div>
                    {auditLog.map(a => <AuditLogRow key={a.id} a={a} />)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @media (max-width: 900px) {
          .legal-cat-pane { display: none !important; }
        }
        @media (max-width: 700px) {
          .legal-list-pane {
            width: 100% !important;
            border-right: none !important;
            display: ${mobilePane === "detail" ? "none" : "flex"} !important;
          }
          .legal-reading-pane {
            display: ${mobilePane === "list" ? "none" : "block"} !important;
          }
          .legal-reading-pane button[style*="display: none"] {
            display: inline-flex !important;
          }
        }
      `}</style>

      <Footer />
    </>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

const catBtnBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  textAlign: "left",
  border: "none",
  borderRadius: 5,
  padding: "6px 8px",
  cursor: "pointer",
  fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
  fontSize: 10.5,
  letterSpacing: "0.04em",
  transition: "background 0.12s",
};

const catCountStyle: React.CSSProperties = {
  fontSize: 9,
  background: "var(--panel-elev)",
  borderRadius: 6,
  padding: "1px 5px",
  color: "var(--text-faint)",
  flexShrink: 0,
};

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{
        fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
        fontSize: 10,
        color: "var(--text-faint)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        minWidth: 60,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{value}</span>
    </div>
  );
}

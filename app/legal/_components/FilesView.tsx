'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { companies, type ChecklistItem } from '../../_data/compliance';

// ── Constants ─────────────────────────────────────────────────────────────────

const SERIF   = 'var(--font-lora, Lora, Georgia, serif)';
const INK     = '#1A1713';
const MUTE    = '#8A837A';
const FAINT   = '#BAB5AE';
const LINE    = '#E8E4DB';
const DIVIDER = '#F3F0EA';
const CANVAS  = '#FAF8F5';
const WHITE   = '#FFFFFF';
const TEAL    = '#0B504F';
const TEAL_T  = '#E5F0EF';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocRow {
  id: string;
  entity: string | null;
  category: string | null;
  title: string | null;
  description: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  effective_date: string | null;
  expires_at: string | null;
  uploaded_at: string;
}

interface DocFull extends DocRow {
  signed_url: string | null;
}

// ── Category → folder mapping ─────────────────────────────────────────────────
// Covers both coarse legacy categories AND fine classifier categories.

const CAT_FOLDER: Record<string, string> = {
  // Formation & Governance
  formation:            'Formation & Governance',
  operating_agreement:  'Formation & Governance',
  compliance_policy:    'Formation & Governance',
  // Annual Statements
  annual_report:        'Annual Statements',
  // Licenses & Permits
  license:              'Licenses & Permits',
  permit:               'Licenses & Permits',
  // Insurance
  insurance:            'Insurance',
  // Tax & Filings (fine + coarse)
  ein_tax:              'Tax & Filings',
  tax_return:           'Tax & Filings',
  payroll:              'Tax & Filings',
  // Banking (fine + coarse)
  banking:              'Banking',
  bank_statement:       'Banking',
  financial_statement:  'Banking',
  // Loans & Financing
  loan:                 'Loans & Financing',
  grant:                'Loans & Financing',
  // Real Estate & Lease
  lease:                'Real Estate & Lease',
  // Vendors & Equipment
  vendor_contract:      'Vendors & Equipment',
  equipment_contract:   'Vendors & Equipment',
  // Artists & Talent
  artist_contract:      'Artists & Talent',
  // Contracts (generic + IP)
  contract:             'Contracts',
  ip:                   'Contracts',
};

const FOLDERS = [
  'Formation & Governance',
  'Annual Statements',
  'Licenses & Permits',
  'Insurance',
  'Tax & Filings',
  'Banking',
  'Loans & Financing',
  'Real Estate & Lease',
  'Vendors & Equipment',
  'Artists & Talent',
  'Contracts',
];

const FOLDER_ICONS: Record<string, string> = {
  'Formation & Governance': '🏛',
  'Annual Statements':      '📋',
  'Licenses & Permits':     '🪪',
  'Insurance':              '🛡',
  'Tax & Filings':          '🗂',
  'Banking':                '🏦',
  'Loans & Financing':      '💰',
  'Real Estate & Lease':    '🏢',
  'Vendors & Equipment':    '🔧',
  'Artists & Talent':       '🎵',
  'Contracts':              '📝',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number | null): string {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseYear(doc: DocRow): number {
  if (doc.effective_date) {
    const y = new Date(doc.effective_date).getFullYear();
    if (y > 1900 && y < 2200) return y;
  }
  const m = (doc.title ?? doc.file_name ?? '').match(/\b(20\d{2})\b/);
  if (m) return parseInt(m[1], 10);
  return new Date(doc.uploaded_at).getFullYear();
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

interface ExpiryBadge { label: string; color: string; bg: string }
function expiryBadge(iso: string | null): ExpiryBadge | null {
  if (!iso) return null;
  const d = daysUntil(iso);
  const label = `${d < 0 ? 'Expired' : 'Expires'} ${fmtDate(iso)}`;
  if (d < 0)  return { label, color: '#B91C1C', bg: '#FEF2F2' };
  if (d < 60) return { label, color: '#B45309', bg: '#FFFBEB' };
  return { label, color: MUTE, bg: DIVIDER };
}

function mimeIcon(mime: string | null, fname: string): string {
  const f = (fname ?? '').toLowerCase();
  if (mime === 'application/pdf' || f.endsWith('.pdf')) return '📄';
  if (mime?.startsWith('image/') || /\.(png|jpg|jpeg|webp|heic)$/.test(f)) return '🖼';
  if (/\.(doc|docx)$/.test(f)) return '📝';
  if (/\.(xls|xlsx)$/.test(f)) return '📊';
  return '📎';
}

// Fine categories that satisfy a coarse checklist requirement (mirrors ComplianceChecklist).
const CATEGORY_EQUIVALENTS: Record<string, string> = {
  tax_return:          'ein_tax',
  payroll:             'ein_tax',
  bank_statement:      'banking',
  financial_statement: 'banking',
  vendor_contract:     'contract',
  equipment_contract:  'contract',
  artist_contract:     'contract',
  grant:               'contract',
  lease:               'contract',
};

function matchClaimed(item: ChecklistItem, rows: DocRow[], claimed: Set<string>): DocRow | undefined {
  const cands = rows.filter(r => {
    if (claimed.has(r.id)) return false;
    const cat = r.category ?? '';
    return cat === item.category || CATEGORY_EQUIVALENTS[cat] === item.category;
  });
  let hit: DocRow | undefined;
  if (item.matchKeywords?.length) {
    const kw = item.matchKeywords.map(k => k.toLowerCase());
    hit = cands.find(r => {
      const hay = `${r.title ?? ''} ${r.file_name ?? ''} ${r.description ?? ''}`.toLowerCase();
      return kw.some(k => hay.includes(k));
    });
  } else {
    hit = cands[0];
  }
  if (hit) claimed.add(hit.id);
  return hit;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const EYEBROW: React.CSSProperties = {
  fontSize: '10.5px', fontWeight: 600, letterSpacing: '.07em',
  textTransform: 'uppercase', color: FAINT,
};

function Breadcrumb({ crumbs, onNav }: { crumbs: string[]; onNav: (idx: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: FAINT, fontSize: 13 }}>›</span>}
          <button
            onClick={() => onNav(i)}
            style={{
              background: 'none', border: 'none', padding: '2px 4px',
              cursor: i < crumbs.length - 1 ? 'pointer' : 'default',
              fontSize: 13, fontWeight: i === crumbs.length - 1 ? 600 : 400,
              color: i < crumbs.length - 1 ? MUTE : INK,
              borderRadius: 4,
              transition: 'color 0.15s',
            }}
            onMouseOver={e => { if (i < crumbs.length - 1) e.currentTarget.style.color = TEAL; }}
            onMouseOut={e => { if (i < crumbs.length - 1) e.currentTarget.style.color = MUTE; }}
          >
            {c}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function GoodStandingBadge({ gs }: { gs: NonNullable<(typeof companies)[0]['goodStanding']> }) {
  const verified = gs.verified;
  const dot = verified ? '#16A34A' : '#B45309';
  const bg   = verified ? '#F0FDF4' : '#FFFBEB';
  const text = verified ? '#166534' : '#92400E';
  return (
    <span
      title={gs.note ?? gs.status}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 999,
        background: bg, fontSize: 11.5, fontWeight: 600, color: text,
        flexShrink: 0,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {gs.status}
    </span>
  );
}

function FolderCard({ icon, name, count, missing, onClick }: {
  icon: string; name: string; count: number; missing: number; onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseOver={() => setHov(true)}
      onMouseOut={() => setHov(false)}
      style={{
        background: WHITE,
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        padding: '20px 20px 18px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: hov
          ? '0 6px 20px rgba(11,80,79,0.10), 0 2px 6px rgba(26,23,19,0.06)'
          : '0 1px 3px rgba(26,23,19,0.05)',
        transform: hov ? 'translateY(-2px)' : 'none',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: TEAL_T,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.3 }}>{name}</div>
        <div style={{ fontSize: 12, color: MUTE, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
          {count} {count === 1 ? 'file' : 'files'}
          {missing > 0 && (
            <span style={{ color: '#B91C1C', fontWeight: 600, marginLeft: 6 }}>
              · {missing} missing
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function FileRow({ doc, onView }: { doc: DocRow; onView: () => void }) {
  const [hov, setHov] = useState(false);
  const [loading, setLoading] = useState(false);
  const expiry = expiryBadge(doc.expires_at);
  const displayDate = doc.effective_date ?? doc.uploaded_at;

  async function handleView() {
    setLoading(true);
    try {
      const res = await fetch(`/api/legal/${doc.id}`);
      if (!res.ok) return;
      const full = (await res.json()) as DocFull;
      if (full.signed_url) window.open(full.signed_url, '_blank');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onMouseOver={() => setHov(true)}
      onMouseOut={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 20px',
        background: hov ? CANVAS : WHITE,
        borderBottom: `1px solid ${DIVIDER}`,
        transition: 'background 0.15s',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{mimeIcon(doc.mime_type, doc.file_name)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {doc.title ?? doc.file_name}
        </div>
        <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>
          {doc.category?.replace(/_/g, ' ') ?? 'document'}
        </div>
      </div>
      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span style={{ fontSize: 12, color: MUTE, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(displayDate)}</span>
        <span style={{ fontSize: 11.5, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>{fmtBytes(doc.size_bytes)}</span>
      </div>
      {expiry && (
        <span style={{
          flexShrink: 0, fontSize: 11.5, fontWeight: 600, padding: '3px 8px',
          borderRadius: 999, background: expiry.bg, color: expiry.color,
          whiteSpace: 'nowrap',
        }}>
          {expiry.label}
        </span>
      )}
      <button
        onClick={handleView}
        disabled={loading}
        style={{
          flexShrink: 0,
          background: TEAL_T, border: 'none', borderRadius: 6,
          padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
          color: TEAL, cursor: loading ? 'default' : 'pointer',
          transition: 'background 0.15s',
          opacity: loading ? 0.7 : 1,
        }}
        onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#CAE0DE'; }}
        onMouseOut={e => { e.currentTarget.style.background = TEAL_T; }}
      >
        {loading ? '…' : 'View'}
      </button>
    </div>
  );
}

// ── Level 3: folder contents ──────────────────────────────────────────────────

function FolderContents({ docs, folderName, q }: { docs: DocRow[]; folderName: string; q: string }) {
  const filtered = useMemo(() => {
    if (!q) return docs;
    const ql = q.toLowerCase();
    return docs.filter(d =>
      (d.title ?? '').toLowerCase().includes(ql) ||
      (d.file_name ?? '').toLowerCase().includes(ql)
    );
  }, [docs, q]);

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '32px 20px', textAlign: 'center', color: MUTE, fontSize: 13.5 }}>
        {docs.length === 0
          ? <span style={{ color: '#B91C1C', fontWeight: 600 }}>Missing — not on file</span>
          : 'No files match your search.'}
      </div>
    );
  }

  if (folderName === 'Annual Statements') {
    const byYear = new Map<number, DocRow[]>();
    for (const d of filtered) {
      const y = parseYear(d);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(d);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => b - a);
    return (
      <div>
        {years.map(yr => (
          <div key={yr}>
            <div style={{ padding: '10px 20px 6px', borderBottom: `1px solid ${LINE}`, ...EYEBROW }}>
              {yr}
            </div>
            {byYear.get(yr)!.map(doc => (
              <FileRow key={doc.id} doc={doc} onView={() => {}} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {filtered.map(doc => (
        <FileRow key={doc.id} doc={doc} onView={() => {}} />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Level = 'companies' | 'company' | 'folder';

export default function FilesView() {
  const [docsByEntity, setDocsByEntity] = useState<Record<string, DocRow[]>>({});
  const [loading, setLoading] = useState(true);

  const [level, setLevel] = useState<Level>('companies');
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [q, setQ] = useState('');

  // Fetch all entities on mount
  useEffect(() => {
    let alive = true;
    (async () => {
      const results = await Promise.allSettled(
        companies.map(c =>
          fetch(`/api/legal?entity=${encodeURIComponent(c.entity)}&limit=1000`).then(r => r.ok ? r.json() : null)
        )
      );
      if (!alive) return;
      const map: Record<string, DocRow[]> = {};
      results.forEach((res, i) => {
        const slug = companies[i].entity;
        map[slug] = res.status === 'fulfilled' && res.value?.rows ? (res.value.rows as DocRow[]) : [];
      });
      setDocsByEntity(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Compliance mini-stats per entity
  const complianceStats = useCallback((entity: string) => {
    const co = companies.find(c => c.entity === entity);
    if (!co) return { met: 0, total: 0 };
    const rows = docsByEntity[entity] ?? [];
    const claimed = new Set<string>();
    const allRequired = co.sections.flatMap(s => s.items).filter(i => i.required);
    let met = 0;
    for (const item of allRequired) {
      if (matchClaimed(item, rows, claimed)) met++;
    }
    return { met, total: allRequired.length };
  }, [docsByEntity]);

  // Folder missing count
  const folderMissing = useCallback((entity: string, folderName: string): number => {
    const co = companies.find(c => c.entity === entity);
    if (!co) return 0;
    const rows = docsByEntity[entity] ?? [];
    const claimed = new Set<string>();
    // Collect all required items that map to this folder
    const allRequired = co.sections.flatMap(s => s.items).filter(i => {
      const mapped = CAT_FOLDER[i.category] ?? 'Contracts';
      return i.required && mapped === folderName;
    });
    let missing = 0;
    for (const item of allRequired) {
      if (!matchClaimed(item, rows, claimed)) missing++;
    }
    return missing;
  }, [docsByEntity]);

  // docs in a folder
  const docsInFolder = useCallback((entity: string, folderName: string): DocRow[] => {
    return (docsByEntity[entity] ?? []).filter(d => {
      const mapped = CAT_FOLDER[d.category ?? ''] ?? 'Contracts';
      return mapped === folderName;
    });
  }, [docsByEntity]);

  // Breadcrumb nav
  function handleBreadcrumb(idx: number) {
    if (idx === 0) { setLevel('companies'); setSelectedEntity(''); setSelectedFolder(''); setQ(''); }
    if (idx === 1 && level === 'folder') { setLevel('company'); setSelectedFolder(''); setQ(''); }
  }

  const crumbs: string[] = ['All Companies'];
  if (level === 'company' || level === 'folder') {
    crumbs.push(companies.find(c => c.entity === selectedEntity)?.name ?? selectedEntity);
  }
  if (level === 'folder') crumbs.push(selectedFolder);

  if (loading) {
    return (
      <div style={{ padding: '40px 0', color: MUTE, fontSize: 13.5 }}>Loading files…</div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Search bar */}
      {level !== 'companies' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16 }}>
          <Breadcrumb crumbs={crumbs} onNav={handleBreadcrumb} />
          <input
            type="search"
            aria-label="Search files"
            placeholder="Search files…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{
              background: '#F3F0EA', border: `1px solid ${LINE}`,
              borderRadius: 6, color: INK, padding: '7px 12px',
              fontSize: 13, width: 220, flexShrink: 0,
              outline: 'none',
            }}
          />
        </div>
      )}
      {level === 'companies' && (
        <Breadcrumb crumbs={crumbs} onNav={handleBreadcrumb} />
      )}

      {/* Level 1 — All Companies */}
      {level === 'companies' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {companies.map(co => {
            const rows = docsByEntity[co.entity] ?? [];
            const stats = complianceStats(co.entity);
            const gs = co.goodStanding;
            return (
              <button
                key={co.entity}
                onClick={() => { setSelectedEntity(co.entity); setLevel('company'); setQ(''); }}
                style={{
                  background: WHITE, border: `1px solid ${LINE}`,
                  borderRadius: 12, padding: '20px 22px',
                  textAlign: 'left', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 14,
                  boxShadow: '0 1px 3px rgba(26,23,19,0.05)',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(11,80,79,0.10), 0 2px 6px rgba(26,23,19,0.06)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(26,23,19,0.05)';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                {/* Folder glyph + name */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 10, background: TEAL_T,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, flexShrink: 0,
                  }}>
                    🗂
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: SERIF, fontSize: 16, fontWeight: 500, color: INK,
                      lineHeight: 1.3, marginBottom: 3,
                    }}>
                      {co.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: MUTE, lineHeight: 1.4 }}>
                      {co.kind} · {co.jurisdiction}
                    </div>
                  </div>
                </div>

                {/* Good standing + compliance */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {gs ? <GoodStandingBadge gs={gs} /> : <span />}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: stats.met === stats.total ? '#16A34A' : TEAL, fontVariantNumeric: 'tabular-nums' }}>
                      {stats.met}/{stats.total}
                    </div>
                    <div style={{ ...EYEBROW, fontSize: 10, marginTop: 1 }}>required on file</div>
                  </div>
                </div>

                {/* Total doc count */}
                <div style={{ fontSize: 12, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>
                  {rows.length} {rows.length === 1 ? 'document' : 'documents'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Level 2 — Company folders */}
      {level === 'company' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {FOLDERS.map(folder => {
            const count = docsInFolder(selectedEntity, folder).length;
            const missing = folderMissing(selectedEntity, folder);
            return (
              <FolderCard
                key={folder}
                icon={FOLDER_ICONS[folder] ?? '📁'}
                name={folder}
                count={count}
                missing={missing}
                onClick={() => { setSelectedFolder(folder); setLevel('folder'); setQ(''); }}
              />
            );
          })}
        </div>
      )}

      {/* Level 3 — Folder files */}
      {level === 'folder' && (() => {
        const docs = docsInFolder(selectedEntity, selectedFolder);
        return (
          <div style={{ background: WHITE, border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '13px 20px', borderBottom: `1px solid ${LINE}`,
              background: CANVAS,
            }}>
              <span style={{ fontSize: 18 }}>{FOLDER_ICONS[selectedFolder] ?? '📁'}</span>
              <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 500, color: INK }}>{selectedFolder}</span>
              <span style={{ fontSize: 11.5, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>
                {docs.length} {docs.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 160px 120px 140px 80px',
              padding: '8px 20px',
              borderBottom: `1px solid ${LINE}`,
              gap: 12,
            }}>
              {['Name', 'Date', 'Size', 'Expiry', ''].map(h => (
                <span key={h} style={EYEBROW}>{h}</span>
              ))}
            </div>

            <FolderContents docs={docs} folderName={selectedFolder} q={q} />
          </div>
        );
      })()}
    </div>
  );
}

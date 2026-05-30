'use client';

import { useState, useEffect, useCallback } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

interface DocRow {
  id: string;
  entity: string | null;
  category: string | null;
  title: string | null;
  effective_date: string | null;
  expires_at: string | null;
  storage_path: string;
  file_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  extraction_status?: string | null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiresColor(days: number | null): string {
  if (days === null) return S.textMuted;
  if (days < 0) return S.red;
  if (days < 90) return S.orange;
  return S.green;
}

const CATEGORY_TABS = ['ALL DOCS', 'EXPIRING SOON', 'LICENSES', 'INSURANCE', 'CONTRACTS', 'LOANS', 'FORMATION'];

export default function LegalPage() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ALL DOCS');
  const [selected, setSelected] = useState<DocRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/legal');
      if (res.ok) {
        const data = await res.json();
        setDocs(Array.isArray(data) ? data : (data.documents ?? []));
      }
    } catch { /* use empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const expiring = docs.filter(d => { const days = daysUntil(d.expires_at); return days !== null && days >= 0 && days <= 90; });
  const expired = docs.filter(d => { const days = daysUntil(d.expires_at); return days !== null && days < 0; });

  const displayed = tab === 'EXPIRING SOON' ? expiring
    : tab === 'ALL DOCS' ? docs
    : docs.filter(d => d.category?.toLowerCase() === tab.toLowerCase());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>LEGAL VAULT</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>
            {docs.length} ACTIVE DOCS · {expiring.length} EXPIRING WITHIN 90D · SUPABASE + DROPBOX
          </div>
        </div>
        <div style={{ display: 'flex', gap: '3px', marginLeft: '14px', flexWrap: 'wrap' }}>
          {CATEGORY_TABS.map(label => (
            <button key={label} onClick={() => setTab(label)} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: tab === label ? S.accent : label === 'EXPIRING SOON' && expiring.length > 0 ? 'rgba(249,115,22,0.1)' : S.bg3, color: tab === label ? S.bg : label === 'EXPIRING SOON' && expiring.length > 0 ? S.orange : S.textMuted, border: `1px solid ${tab === label ? S.accent : label === 'EXPIRING SOON' && expiring.length > 0 ? 'rgba(249,115,22,0.25)' : S.border2}`, cursor: 'pointer', fontWeight: 600 }}>
              {label}{label === 'EXPIRING SOON' && expiring.length > 0 ? ` ${expiring.length}` : ''}
            </button>
          ))}
        </div>
        <button style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: 'transparent', color: S.accent, border: `1px solid ${S.accent}44`, cursor: 'pointer', fontWeight: 600 }}>↑ UPLOAD</button>
      </div>

      {/* Expiring alert banner */}
      {expiring.length > 0 && (
        <div style={{ background: 'rgba(249,115,22,0.05)', borderBottom: `1px solid rgba(249,115,22,0.15)`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: S.mono, fontSize: '11px', flexShrink: 0 }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: S.orange, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ color: S.orange, fontWeight: 700 }}>{expiring.length} DOCUMENTS EXPIRING WITHIN 90 DAYS</span>
          <span style={{ color: S.textMuted }}>{expiring.map(d => `${d.title ?? d.file_name}`).join(' · ')}</span>
          <button style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: S.bg3, color: S.textMuted, border: `1px solid ${S.border2}`, cursor: 'pointer', fontWeight: 600 }}>SCHEDULE RENEWAL TASKS</button>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', background: S.bg, minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: '20px' }}>
            {[1,2,3,4,5].map(i => <div key={i} style={{ height: '44px', background: S.bg2, borderBottom: `1px solid ${S.border}` }} className="v2-shimmer" />)}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: S.bg2 }}>
                <th style={{ width: '24px', borderBottom: `1px solid ${S.border}` }} />
                {['DOCUMENT', 'CATEGORY', 'ENTITY', 'ISSUED', 'EXPIRES', 'DAYS LEFT', 'STORAGE', 'STATUS'].map(h => (
                  <th key={h} style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', color: S.textMuted, padding: '7px 14px', textAlign: h === 'DAYS LEFT' ? 'right' : 'left', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '40px 20px', textAlign: 'center', fontFamily: S.mono, fontSize: '11px', color: S.textMuted }}>
                    No documents found — upload one above
                  </td>
                </tr>
              ) : displayed.map(doc => {
                const days = daysUntil(doc.expires_at);
                const dayColor = expiresColor(days);
                return (
                  <tr
                    key={doc.id}
                    onClick={() => setSelected(doc)}
                    style={{ borderBottom: `1px solid ${S.border}`, cursor: 'pointer', background: selected?.id === doc.id ? `rgba(240,165,0,0.04)` : 'transparent' }}
                  >
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ width: '14px', height: '14px', border: `1px solid ${S.border2}`, borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', color: S.textMuted }}>◧</div>
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 500, color: S.textPrimary, padding: '9px 14px' }}>{doc.title ?? doc.file_name}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textSecondary, padding: '9px 14px' }}>{doc.category ?? '—'}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '9px 14px' }}>{doc.entity ?? '—'}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted, padding: '9px 14px' }}>{doc.effective_date ? new Date(doc.effective_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '10px', color: dayColor, padding: '9px 14px' }}>{doc.expires_at ? new Date(doc.expires_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : '—'}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: dayColor, padding: '9px 14px', textAlign: 'right' }}>
                      {days === null ? '—' : days < 0 ? `${Math.abs(days)}d AGO` : `${days}d`}
                    </td>
                    <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.blue, padding: '9px 14px' }}>{doc.storage_path?.includes('dropbox') ? '⬡ Dropbox' : '◈ Supabase'}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '2px', background: days !== null && days < 0 ? 'rgba(239,68,68,0.1)' : days !== null && days < 90 ? 'rgba(249,115,22,0.1)' : 'rgba(34,197,94,0.07)', color: days !== null && days < 0 ? S.red : days !== null && days < 90 ? S.orange : S.green, border: `1px solid ${days !== null && days < 0 ? 'rgba(239,68,68,0.25)' : days !== null && days < 90 ? 'rgba(249,115,22,0.25)' : 'rgba(34,197,94,0.25)'}` }}>
                        {days !== null && days < 0 ? 'EXPIRED' : days !== null && days < 90 ? 'EXPIRING' : 'ACTIVE'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";

interface FileEntry {
  name: string;
  relativePath: string;
  sizeBytes: number;
}

interface Category {
  name: string;
  files: FileEntry[];
}

interface Root {
  name: string;
  label: string;
  files: number;
  sizeBytes: number;
  categories: Category[];
}

interface BrainIndexData {
  totals: { files: number; sizeBytes: number };
  roots: Root[];
}

const LOBE_COLORS: Record<string, string> = {
  'knowledge':   '#ff4713',
  'memory':      '#f59e0b',
  'skills':      '#a78bfa',
  'agentic':     '#60a5fa',
  'upgrades':    '#4ade80',
  'data':        '#c084fc',
  'engineering': '#ff4713',
  'business':    '#f59e0b',
  'design':      '#a78bfa',
  'ai-research': '#60a5fa',
  'credit':      '#4ade80',
  'legal':       '#c084fc',
  'marketing':   '#fbbf24',
  'finance':     '#34d399',
  'operations':  '#38bdf8',
  'security':    '#f87171',
  'research':    '#818cf8',
  'algorithms':  '#2dd4bf',
  'mathematics': '#fb923c',
  'languages':   '#e879f9',
  'platforms':   '#a3e635',
  'email':       '#67e8f9',
  'essex':       '#fde68a',
  'sales':       '#86efac',
  'news':        '#cbd5e1',
  'restaurant':  '#fca5a5',
  'gliner':      '#c4b5fd',
  'unverified':  '#6b7280',
  'meta':        '#94a3b8',
  'xero-expert': '#f0abfc',
  'superbrain':  '#7dd3fc',
  'experiments-25x': '#86efac',
};

function lobeColor(name: string): string {
  if (LOBE_COLORS[name]) return LOBE_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 70%, 65%)`;
}

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

export default function BrainIndex({ data }: { data: BrainIndexData }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const q = query.toLowerCase().trim();

  const filteredRoots = data.roots.map(root => {
    if (!q) return { root, show: true, filteredCats: root.categories };
    const filteredCats = root.categories.map(cat => {
      const filteredFiles = cat.files.filter(f =>
        f.name.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q)
      );
      return { ...cat, files: filteredFiles };
    }).filter(c => c.files.length > 0);
    const show = filteredCats.length > 0 || root.name.toLowerCase().includes(q) || root.label.toLowerCase().includes(q);
    return { root, show, filteredCats };
  }).filter(r => r.show);

  function toggleExpand(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 40, flexWrap: 'wrap' }}>
        <div className="stat">
          <span className="sv">{data.totals.files.toLocaleString()}</span>
          <span className="sl">files</span>
        </div>
        <div className="stat">
          <span className="sv">{(data.totals.sizeBytes / 1024 / 1024).toFixed(1)}</span>
          <span className="sl">MB</span>
        </div>
        <div className="stat">
          <span className="sv">{data.roots.length}</span>
          <span className="sl">domains</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 28, position: 'relative', maxWidth: 400 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', fontSize: 13, pointerEvents: 'none' }}>⌕</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="filter files…"
          style={{ width: '100%', paddingLeft: 36 }}
        />
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {filteredRoots.map(({ root, filteredCats }) => {
          const color = lobeColor(root.name);
          const isOpen = expanded.has(root.name) || !!q;
          return (
            <div key={root.name} className="glass" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                onClick={() => !q && toggleExpand(root.name)}
                style={{
                  padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
                  cursor: q ? 'default' : 'pointer', borderBottom: isOpen ? '1px solid var(--border)' : undefined,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!q) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}60`, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-space-grotesk, "Space Grotesk", sans-serif)', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                    {root.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                    {root.label}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{root.files}</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 9.5, color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{fmtBytes(root.sizeBytes)}</div>
                </div>
                {!q && (
                  <span style={{ color: 'var(--text-faint)', fontSize: 11, marginLeft: 4, flexShrink: 0 }}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                )}
              </div>

              {isOpen && (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {filteredCats.map(cat => (
                    <div key={cat.name}>
                      {cat.name !== '_root' && (
                        <div style={{
                          padding: '7px 20px', fontFamily: 'var(--font-jetbrains, monospace)',
                          fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase',
                          color: 'var(--text-faint)', borderBottom: '1px solid var(--border)',
                          background: 'rgba(7,8,11,0.3)',
                        }}>
                          {cat.name}
                        </div>
                      )}
                      {cat.files.map(f => (
                        <div key={f.relativePath} style={{
                          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                          padding: '6px 20px', borderBottom: '1px solid var(--border)', gap: 8,
                        }}>
                          <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {f.name}
                          </span>
                          <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                            {fmtBytes(f.sizeBytes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

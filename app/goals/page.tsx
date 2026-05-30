'use client';

import { useState, useEffect, useCallback } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa', purple: '#a78bfa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

type GoalStatus = 'planning' | 'approved' | 'in_progress' | 'blocked' | 'done' | 'archived';

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  priority: number;
  due_iso: string | null;
  tags: string[] | null;
  entity?: string;
  step_count?: number;
  done_count?: number;
}

const STATUS_COLS: { key: GoalStatus; label: string; color: string }[] = [
  { key: 'planning', label: 'TODO', color: S.textMuted },
  { key: 'in_progress', label: 'IN PROGRESS', color: S.blue },
  { key: 'blocked', label: 'BLOCKED', color: S.red },
  { key: 'done', label: 'DONE', color: S.green },
];

function GoalCard({ goal }: { goal: Goal }) {
  const pct = goal.step_count ? Math.round(((goal.done_count ?? 0) / goal.step_count) * 100) : 0;
  const tagColor = (tag: string) => {
    const map: Record<string, string> = { dabney: '#f0a500', aspen: S.blue, loveleeday: S.purple, kronos: S.green };
    return map[tag.toLowerCase()] ?? S.textMuted;
  };
  return (
    <div style={{ background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px', padding: '11px 13px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: S.textPrimary, marginBottom: '7px', lineHeight: '1.4' }}>{goal.title}</div>
      {goal.tags && goal.tags.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {goal.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, padding: '1px 5px', borderRadius: '2px', border: `1px solid ${tagColor(tag)}44`, color: tagColor(tag), background: `${tagColor(tag)}11`, letterSpacing: '0.06em' }}>
              {tag.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      {goal.description && (
        <div style={{ fontSize: '11px', color: S.textMuted, marginBottom: '8px', lineHeight: '1.5' }}>{goal.description.slice(0, 80)}{goal.description.length > 80 ? '…' : ''}</div>
      )}
      {goal.step_count ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: S.mono, color: S.textMuted, marginBottom: '4px' }}>
            <span>{goal.done_count ?? 0}/{goal.step_count} steps</span>
            <span style={{ color: pct === 100 ? S.green : pct > 50 ? S.blue : S.textMuted }}>{pct}%</span>
          </div>
          <div style={{ height: '3px', background: S.bg4, borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? S.green : S.blue, borderRadius: '2px' }} />
          </div>
        </div>
      ) : null}
      {goal.due_iso && (
        <div style={{ marginTop: '8px', fontSize: '9px', fontFamily: S.mono, color: S.textMuted }}>
          DUE {new Date(goal.due_iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return <div style={{ height: '100px', background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px' }} className="v2-shimmer" />;
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityFilter, setEntityFilter] = useState('ALL ENTITIES');
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST'>('KANBAN');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/goals?limit=50');
      if (res.ok) {
        const data = await res.json();
        setGoals(Array.isArray(data) ? data : (data.goals ?? []));
      }
    } catch { /* fallback */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = goals.filter(g => g.status !== 'archived');
  const inProgress = goals.filter(g => g.status === 'in_progress');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>GOALS</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>
            {active.length} ACTIVE · {inProgress.length} IN PROGRESS
          </div>
        </div>
        <div style={{ display: 'flex', gap: '3px', marginLeft: '14px' }}>
          {['ALL ENTITIES', 'DABNEY', 'ASPEN', 'LOVELEEDAY'].map(label => (
            <button key={label} onClick={() => setEntityFilter(label)} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: entityFilter === label ? S.accent : S.bg3, color: entityFilter === label ? S.bg : S.textMuted, border: `1px solid ${entityFilter === label ? S.accent : S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '3px' }}>
          {(['KANBAN', 'LIST'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: viewMode === m ? S.accent : S.bg3, color: viewMode === m ? S.bg : S.textMuted, border: `1px solid ${viewMode === m ? S.accent : S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{m}</button>
          ))}
        </div>
        <button style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: 'transparent', color: S.accent, border: `1px solid ${S.accent}44`, cursor: 'pointer', fontWeight: 600 }}>+ NEW GOAL</button>
      </div>

      {/* Kanban board */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>
        {STATUS_COLS.map(col => {
          const colGoals = goals.filter(g => g.status === col.key);
          return (
            <div key={col.key} style={{ background: S.bg2, padding: '14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexShrink: 0 }}>
                <div style={{ fontFamily: S.mono, fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: col.color }}>{col.label}</div>
                <span style={{ fontFamily: S.mono, fontSize: '9px', padding: '1px 6px', border: `1px solid ${S.border2}`, borderRadius: '2px', color: S.textMuted }}>{loading ? '…' : colGoals.length}</span>
              </div>
              {loading ? [1,2].map(i => <SkeletonCard key={i} />) : colGoals.length === 0 ? (
                <div style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted, textAlign: 'center', marginTop: '20px' }}>empty</div>
              ) : colGoals.map(g => <GoalCard key={g.id} goal={g} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

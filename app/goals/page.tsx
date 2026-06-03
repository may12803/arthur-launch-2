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

interface GoalStep {
  id: string;
  status: string;
}

interface RawGoal {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  priority: number;
  due_iso: string | null;
  tags: string[] | null;
  entity?: string;
  arthur_goal_steps?: GoalStep[];
}

interface Goal extends RawGoal {
  step_count: number;
  done_count: number;
}

const STATUS_COLS: { key: GoalStatus; label: string; color: string }[] = [
  { key: 'planning', label: 'TODO', color: S.textMuted },
  { key: 'approved', label: 'APPROVED', color: S.orange },
  { key: 'in_progress', label: 'IN PROGRESS', color: S.blue },
  { key: 'blocked', label: 'BLOCKED', color: S.red },
  { key: 'done', label: 'DONE', color: S.green },
];

function tagColor(tag: string): string {
  const map: Record<string, string> = { dabney: '#f0a500', aspen: S.blue, loveleeday: S.purple, kronos: S.green };
  return map[tag.toLowerCase()] ?? S.textMuted;
}

function GoalCard({ goal }: { goal: Goal }) {
  const pct = goal.step_count > 0 ? Math.round((goal.done_count / goal.step_count) * 100) : 0;
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
      {goal.step_count > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: S.mono, color: S.textMuted, marginBottom: '4px' }}>
            <span>{goal.done_count}/{goal.step_count} steps</span>
            <span style={{ color: pct === 100 ? S.green : pct > 50 ? S.blue : S.textMuted }}>{pct}%</span>
          </div>
          <div style={{ height: '3px', background: S.bg4, borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? S.green : S.blue, borderRadius: '2px' }} />
          </div>
        </div>
      )}
      {goal.due_iso && (
        <div style={{ marginTop: '8px', fontSize: '9px', fontFamily: S.mono, color: S.textMuted }}>
          DUE {new Date(goal.due_iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ height: '100px', background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px', animation: 'shimmer 1.4s ease-in-out infinite' }} />
  );
}

function normalise(raw: RawGoal): Goal {
  const steps = raw.arthur_goal_steps ?? [];
  const done = steps.filter(s => s.status === 'done' || s.status === 'completed').length;
  return { ...raw, step_count: steps.length, done_count: done };
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityFilter, setEntityFilter] = useState('ALL ENTITIES');
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST'>('KANBAN');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/goals?limit=50');
      if (!res.ok) throw new Error(`goals API ${res.status}`);
      const data = await res.json() as RawGoal[] | { goals?: RawGoal[] };
      const raw: RawGoal[] = Array.isArray(data) ? data : (data.goals ?? []);
      setGoals(raw.map(normalise));
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = goals.filter(g => g.status !== 'archived');
  const inProgress = goals.filter(g => g.status === 'in_progress');

  const entityFiltered = entityFilter === 'ALL ENTITIES'
    ? active
    : active.filter(g => {
        const search = entityFilter.toLowerCase();
        return (g.entity ?? '').toLowerCase().includes(search)
          || (g.tags ?? []).some(t => t.toLowerCase().includes(search));
      });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>GOALS</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>
            {loading ? '…' : `${active.length} ACTIVE · ${inProgress.length} IN PROGRESS`}
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
        <button
          onClick={async () => {
            const title = typeof window !== 'undefined' ? window.prompt('Goal title:') : null;
            if (!title) return;
            await fetch('/api/goals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, status: 'planning', priority: 1 }),
            });
            load();
          }}
          style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: 'transparent', color: S.accent, border: `1px solid ${S.accent}44`, cursor: 'pointer', fontWeight: 600 }}
        >+ NEW GOAL</button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)', padding: '8px 20px', fontFamily: S.mono, fontSize: '11px', color: S.red, flexShrink: 0 }}>
          ⚠ {error} — <button onClick={load} style={{ background: 'none', border: 'none', color: S.red, cursor: 'pointer', fontFamily: S.mono, fontSize: '11px', textDecoration: 'underline' }}>retry</button>
        </div>
      )}

      {/* Kanban board */}
      {viewMode === 'KANBAN' && (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>
          {STATUS_COLS.map(col => {
            const colGoals = entityFiltered.filter(g => g.status === col.key);
            return (
              <div key={col.key} style={{ background: S.bg2, padding: '14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexShrink: 0 }}>
                  <div style={{ fontFamily: S.mono, fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: col.color }}>{col.label}</div>
                  <span style={{ fontFamily: S.mono, fontSize: '9px', padding: '1px 6px', border: `1px solid ${S.border2}`, borderRadius: '2px', color: S.textMuted }}>{loading ? '…' : colGoals.length}</span>
                </div>
                {loading
                  ? [1, 2].map(i => <SkeletonCard key={i} />)
                  : colGoals.length === 0
                    ? <div style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted, textAlign: 'center', marginTop: '20px', opacity: 0.5 }}>empty</div>
                    : colGoals.map(g => <GoalCard key={g.id} goal={g} />)
                }
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {viewMode === 'LIST' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {loading
            ? [1, 2, 3, 4].map(i => <div key={i} style={{ height: 56, background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px' }} />)
            : entityFiltered.length === 0
              ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10 }}>
                  <div style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted, letterSpacing: '0.08em' }}>NO GOALS</div>
                  <div style={{ fontSize: '11px', color: S.textMuted, opacity: 0.6 }}>Create a goal to get started.</div>
                </div>
              )
              : entityFiltered.map(g => (
                <div key={g.id} style={{ background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontFamily: S.mono, fontSize: '9px', padding: '2px 7px', borderRadius: '2px', background: S.bg4, color: S.textSecondary, border: `1px solid ${S.border2}`, flexShrink: 0 }}>{g.status.replace('_', ' ').toUpperCase()}</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: S.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</div>
                  {g.step_count > 0 && (
                    <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, flexShrink: 0 }}>{g.done_count}/{g.step_count}</div>
                  )}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

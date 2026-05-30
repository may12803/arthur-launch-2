'use client';

import React, { useState, useEffect, useCallback } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

type StepStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'skipped';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: StepStatus;
  arthur_action: string | null;
  estimated_minutes: number | null;
  completed_at: string | null;
  created_at: string;
  goal_title?: string;
  due_label?: string;
  due_color?: string;
  entity?: string;
  priority?: number;
}

type FilterTab = 'ALL' | 'OVERDUE' | 'TODAY' | 'THIS WEEK' | 'DONE';

function statusLabel(s: StepStatus) {
  return s === 'in_progress' ? 'IN PROGRESS' : s.toUpperCase();
}

const PILL_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  red:    { bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.3)',   color: S.red },
  orange: { bg: 'rgba(249,115,22,0.07)',  border: 'rgba(249,115,22,0.3)',  color: S.orange },
  blue:   { bg: 'rgba(96,165,250,0.07)',  border: 'rgba(96,165,250,0.3)',  color: S.blue },
  green:  { bg: 'rgba(34,197,94,0.07)',   border: 'rgba(34,197,94,0.3)',   color: S.green },
  muted:  { bg: S.bg3, border: S.border2, color: S.textSecondary },
};

function Pill({ colorKey, children }: { colorKey: string; children: React.ReactNode }) {
  const c = PILL_COLORS[colorKey] ?? PILL_COLORS.muted;
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, fontFamily: S.mono, letterSpacing: '0.06em', border: `1px solid ${c.border}`, background: c.bg, color: c.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{children}</span>;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('TODAY');
  const [quickAdd, setQuickAdd] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/goal-steps?limit=50');
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : (data.steps ?? data.data ?? []));
      }
    } catch {
      // fallback to empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const FILTER_TABS: FilterTab[] = ['ALL', 'OVERDUE', 'TODAY', 'THIS WEEK', 'DONE'];
  const overdue = tasks.filter(t => t.status !== 'done' && t.status !== 'skipped').length;
  const done = tasks.filter(t => t.status === 'done').length;

  // Group tasks for display
  const sections: { label: string; colorKey: string; rows: Task[] }[] = [
    {
      label: `OVERDUE · ${overdue}`,
      colorKey: 'red',
      rows: tasks.filter(t => t.status === 'blocked' || (t.status === 'pending' && t.due_label?.includes('OVERDUE'))),
    },
    {
      label: 'TODAY',
      colorKey: 'orange',
      rows: tasks.filter(t => t.status === 'in_progress'),
    },
    {
      label: 'PENDING',
      colorKey: 'muted',
      rows: tasks.filter(t => t.status === 'pending' && !t.due_label?.includes('OVERDUE')),
    },
    {
      label: `DONE · ${done}`,
      colorKey: 'green',
      rows: tasks.filter(t => t.status === 'done'),
    },
  ].filter(s => s.rows.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>TASKS</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>
            {tasks.length} OPEN · {overdue} OVERDUE · {done} DONE TODAY
          </div>
        </div>
        <div style={{ display: 'flex', gap: '3px', marginLeft: '14px' }}>
          {FILTER_TABS.map((tab) => (
            <button key={tab} onClick={() => setFilter(tab)} style={{
              padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px',
              background: filter === tab ? S.accent : tab === 'OVERDUE' && overdue > 0 ? 'rgba(239,68,68,0.1)' : S.bg3,
              color: filter === tab ? S.bg : tab === 'OVERDUE' && overdue > 0 ? S.red : S.textMuted,
              border: `1px solid ${filter === tab ? S.accent : tab === 'OVERDUE' && overdue > 0 ? 'rgba(239,68,68,0.25)' : S.border2}`,
              cursor: 'pointer', fontWeight: 600, letterSpacing: '0.04em',
            }}>
              {tab}{tab === 'OVERDUE' && overdue > 0 ? ` ${overdue}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Quick add bar */}
      <div style={{ background: S.bg3, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', gap: '12px', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: '14px', height: '14px', border: `1px solid ${S.border2}`, borderRadius: '2px', flexShrink: 0 }} />
        <input
          value={quickAdd}
          onChange={e => setQuickAdd(e.target.value)}
          placeholder="Add a task… (use @ for entity, # for goal, due:tomorrow, !p1)"
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '13px', color: S.textMuted, fontFamily: S.sans, outline: 'none' }}
        />
        <button style={{ background: S.accent, color: S.bg, border: 'none', borderRadius: '2px', padding: '4px 12px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: S.mono, letterSpacing: '0.06em' }}>+ ADD</button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, background: S.bg }}>
        {loading ? (
          <div style={{ padding: '24px 20px', fontFamily: S.mono, fontSize: '11px', color: S.textMuted }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ height: '40px', background: S.bg2, borderBottom: `1px solid ${S.border}`, marginBottom: '1px', opacity: 1 - i * 0.15 }} className="v2-shimmer" />
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: S.bg2 }}>
                <th style={{ width: '24px', borderBottom: `1px solid ${S.border}` }} />
                {['TASK', 'ENTITY', 'GOAL', 'DUE', 'STATUS'].map(h => (
                  <th key={h} style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', color: S.textMuted, padding: '7px 14px', textAlign: 'left', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', fontFamily: S.mono, fontSize: '11px', color: S.textMuted }}>
                    No tasks yet — add one above
                  </td>
                </tr>
              ) : sections.map(section => (
                <React.Fragment key={section.label}>
                  <tr style={{ background: PILL_COLORS[section.colorKey]?.bg ?? S.bg3 }}>
                    <td colSpan={6} style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, color: PILL_COLORS[section.colorKey]?.color ?? S.textMuted, padding: '6px 14px', letterSpacing: '0.1em' }}>{section.label}</td>
                  </tr>
                  {section.rows.map(task => (
                    <tr key={task.id} style={{ borderBottom: `1px solid ${S.border}` }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ width: '14px', height: '14px', border: `1px solid ${task.status === 'done' ? S.green : task.status === 'blocked' ? S.red : S.border2}`, borderRadius: '2px', background: task.status === 'done' ? 'rgba(34,197,94,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: S.green }}>
                          {task.status === 'done' && '✓'}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: task.status === 'done' ? S.textMuted : S.textPrimary, padding: '9px 14px', fontWeight: 500, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</td>
                      <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '9px 14px' }}>{task.entity ?? 'DABNEY'}</td>
                      <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textSecondary, padding: '9px 14px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.goal_title ?? task.arthur_action ?? '—'}</td>
                      <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '9px 14px', whiteSpace: 'nowrap' }}>
                        {task.completed_at ? new Date(task.completed_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <Pill colorKey={task.status === 'done' ? 'green' : task.status === 'blocked' ? 'red' : task.status === 'in_progress' ? 'blue' : 'muted'}>
                          {statusLabel(task.status)}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

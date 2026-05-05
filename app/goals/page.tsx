"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { Nav } from "../_components/Layout";

// ── Types ──────────────────────────────────────────────────────────────────────

type GoalStatus = "planning" | "approved" | "in_progress" | "blocked" | "done" | "archived";
type StepStatus = "pending" | "in_progress" | "blocked" | "done" | "skipped";

interface GoalStep {
  id: string;
  goal_id: string;
  seq: number;
  title: string;
  description: string | null;
  status: StepStatus;
  arthur_action: string | null;
  estimated_minutes: number | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  priority: number;
  due_iso: string | null;
  plan_md: string | null;
  plan_generated_at: string | null;
  approved_at: string | null;
  arthur_can_execute: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  arthur_goal_steps: GoalStep[];
}

// ── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<GoalStatus, { label: string; color: string }> = {
  planning:    { label: "Planning",    color: "var(--tint-amber)" },
  approved:    { label: "Approved",    color: "var(--tint-blue)" },
  in_progress: { label: "In Progress", color: "var(--accent-orange)" },
  blocked:     { label: "Blocked",     color: "var(--tint-red)" },
  done:        { label: "Done",        color: "var(--tint-emerald)" },
  archived:    { label: "Archived",    color: "var(--text-faint)" },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string; softColor: string }> = {
  1: { label: "Urgent",  color: "var(--tint-red)",    softColor: "var(--tint-red-soft)" },
  2: { label: "High",    color: "var(--tint-amber)",  softColor: "var(--tint-amber-soft)" },
  3: { label: "Normal",  color: "var(--tint-blue)",   softColor: "var(--tint-blue-soft)" },
  4: { label: "Low",     color: "var(--tint-violet)", softColor: "var(--tint-violet-soft)" },
  5: { label: "Someday", color: "var(--text-faint)",  softColor: "rgba(245, 246, 248, 0.05)" },
};

const KANBAN_ORDER: GoalStatus[] = ["planning", "approved", "in_progress", "blocked", "done"];

// ── Sort goals ────────────────────────────────────────────────────────────────

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.due_iso && b.due_iso) return a.due_iso < b.due_iso ? -1 : 1;
    if (a.due_iso) return -1;
    if (b.due_iso) return 1;
    return 0;
  });
}

// ── Markdown renderer ────────────────────────────────────────────────────────

function RenderMarkdown({ md }: { md: string }) {
  const lines = md.split("\n");
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-muted)" }}>
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
        if (line.startsWith("# ")) return <h2 key={i}>{line.slice(2)}</h2>;
        if (line.startsWith("- ") || line.startsWith("* ")) return (
          <div key={i} style={{ display: "flex", gap: 8, paddingLeft: 8, marginTop: 4 }}>
            <span style={{ color: "var(--accent-orange)", flexShrink: 0 }}>›</span>
            <span>{line.slice(2)}</span>
          </div>
        );
        if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({ goal, onSelect }: { goal: Goal; onSelect: (goal: Goal) => void; }) {
  const completedSteps = goal.arthur_goal_steps.filter(s => s.status === "done").length;
  const totalSteps = goal.arthur_goal_steps.length;
  const priority = PRIORITY_CONFIG[goal.priority] ?? PRIORITY_CONFIG[5];

  return (
    <div className="goal-card" onClick={() => onSelect(goal)}>
      <h4 className="goal-card-title">{goal.title}</h4>
      <div className="goal-card-meta">
        <div className="goal-card-chip" style={{ background: priority.softColor, color: priority.color }}>
          {priority.label}
        </div>
        {goal.due_iso && (
          <div className="goal-card-due">
            Due {new Date(goal.due_iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        )}
        {totalSteps > 0 && (
          <div className="goal-card-steps">
            {completedSteps}/{totalSteps} steps
          </div>
        )}
      </div>
    </div>
  );
}

// ── StepRow ────────────────────────────────────────────────────────────────────

function StepRow({ step, onToggle }: { step: GoalStep; onToggle: () => void; }) {
  const done = step.status === "done";
  return (
    <div className={`step-row ${done ? 'done' : ''}`}>
      <button onClick={onToggle} className="step-checkbox" title={done ? "Mark pending" : "Mark done"}>
        {done && <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 4L3.5 6L8.5 1" stroke="var(--bg-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
      <div className="step-content">
        <div className="step-title">
          <span>{step.seq}. {step.title}</span>
          {step.estimated_minutes && <span className="step-time">~{step.estimated_minutes}m</span>}
        </div>
        {step.description && <p className="step-description">{step.description}</p>}
      </div>
    </div>
  );
}

// ── GoalDetailPanel ──────────────────────────────────────────────────────────

function GoalDetailPanel({
  goal,
  onClose,
  onUpdate,
  onDelete,
  onApprove,
  onRegenerate,
  onStepToggle,
}: {
  goal: Goal | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Goal>) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onRegenerate: (id: string, feedback?: string) => void;
  onStepToggle: (stepId: string, goalId: string, newStatus: StepStatus) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => {
    if (goal) {
      setEditTitle(goal.title);
      setEditDesc(goal.description ?? "");
      setEditing(false);
    }
  }, [goal]);

  if (!goal) return null;

  async function saveEdit() {
    if (!goal) return;
    onUpdate(goal.id, { title: editTitle.trim(), description: editDesc.trim() || null });
    setEditing(false);
  }

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <div className="goal-detail-panel">
        <div className="panel-header">
          {editing ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="panel-title-input"
              autoFocus
            />
          ) : (
            <h2 className="panel-title">{goal.title}</h2>
          )}
          <button onClick={onClose} className="panel-close-btn">×</button>
        </div>

        <div className="panel-content">
          {editing ? (
            <textarea
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              className="panel-desc-textarea"
              placeholder="Description (optional)"
              rows={4}
            />
          ) : (
            goal.description && <p className="panel-description">{goal.description}</p>
          )}

          {editing && (
            <div className="panel-actions">
              <button onClick={saveEdit} className="btn-accent">Save Changes</button>
              <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
          )}

          {goal.plan_md && (
            <div className="panel-section">
              <h3 className="panel-section-title">Arthur's Game Plan</h3>
              <div className="panel-markdown-box">
                <RenderMarkdown md={goal.plan_md} />
              </div>
            </div>
          )}

          {goal.arthur_goal_steps.length > 0 && (
            <div className="panel-section">
              <h3 className="panel-section-title">Checklist</h3>
              <div className="panel-steps-container">
                {goal.arthur_goal_steps.map(step => (
                  <StepRow
                    key={step.id}
                    step={step}
                    onToggle={() => onStepToggle(step.id, goal.id, step.status === "done" ? "pending" : "done")}
                  />
                ))}
              </div>
            </div>
          )}

          {!editing && (
            <div className="panel-actions">
              {goal.status === "planning" && (
                <button onClick={() => onApprove(goal.id)} className="btn-accent">Approve & Start →</button>
              )}
              <button onClick={() => setEditing(true)} className="btn-ghost">Edit</button>
              <button onClick={() => onRegenerate(goal.id)} className="btn-ghost">Regenerate Plan</button>
              <button onClick={() => onDelete(goal.id)} className="btn-ghost btn-delete">Archive Goal</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingGoal, setIsAddingGoal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [activeFilter, setActiveFilter] = useState<GoalStatus | "all">("all");

  // Add Goal Form state
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState(3);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/goals");
      const data = await res.json() as Goal[];
      setGoals(sortGoals(data));
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  async function handleAdd() {
    if (!title.trim()) return;
    const optimistic: Goal = {
      id: `temp-${Date.now()}`, title: title.trim(), description: null, status: "planning",
      priority, due_iso: null, plan_md: null, plan_generated_at: null, approved_at: null,
      arthur_can_execute: false, tags: [], created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), arthur_goal_steps: [],
    };
    setGoals(prev => sortGoals([optimistic, ...prev]));
    setIsAddingGoal(false);
    setTitle(""); setPriority(3);

    try {
      const res = await fetch("/api/goals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), priority }),
      });
      const real = await res.json() as Goal;
      setGoals(prev => sortGoals(prev.map(g => g.id === optimistic.id ? real : g)));
    } catch {
      setGoals(prev => prev.filter(g => g.id !== optimistic.id));
    }
  }

  async function handleUpdate(id: string, patch: Partial<Goal>) {
    setGoals(prev => sortGoals(prev.map(g => g.id === id ? { ...g, ...patch } : g)));
    if (selectedGoal?.id === id) setSelectedGoal(g => g ? { ...g, ...patch } : null);
    await fetch(`/api/goals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  }

  async function handleDelete(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id));
    setSelectedGoal(null);
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/goals/${id}/approve`, { method: "POST" });
    const updated = await res.json() as Goal;
    setGoals(prev => sortGoals(prev.map(g => g.id === id ? updated : g)));
    setSelectedGoal(updated);
  }

  async function handleRegenerate(id: string, feedback?: string) {
    const res = await fetch(`/api/goals/${id}/regenerate-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feedback }) });
    const updated = await res.json() as Goal;
    setGoals(prev => sortGoals(prev.map(g => g.id === id ? updated : g)));
    setSelectedGoal(updated);
  }

  async function handleStepToggle(stepId: string, goalId: string, newStatus: StepStatus) {
    const updater = (g: Goal) => {
      if (g.id !== goalId) return g;
      return { ...g, arthur_goal_steps: g.arthur_goal_steps.map(s => s.id === stepId ? { ...s, status: newStatus } : s) };
    };
    setGoals(prev => prev.map(updater));
    setSelectedGoal(g => g ? updater(g) : null);
    await fetch(`/api/goal-steps/${stepId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
  }

  const filteredGoals = goals.filter(g => activeFilter === "all" || g.status === activeFilter);

  return (
    <>
      <Nav />
      <main className="goals-page-main">
        <header className="page-header">
          <h1>Goals</h1>
          <div className="filter-tabs">
            {(["all", ...KANBAN_ORDER] as const).map(status => {
              const count = status === 'all' ? goals.length : goals.filter(g => g.status === status).length;
              if (count === 0 && status !== 'all') return null;
              return (
                <button
                  key={status}
                  onClick={() => setActiveFilter(status)}
                  className={`filter-tab ${activeFilter === status ? 'active' : ''}`}
                >
                  {status.replace('_', ' ')} <span>{count}</span>
                </button>
              );
            })}
          </div>
        </header>

        {loading ? (
          <div className="kanban-board"><div className="skeleton-loader" /></div>
        ) : (
          <div className="kanban-board">
            {KANBAN_ORDER.map(status => {
              const columnGoals = filteredGoals.filter(g => g.status === status);
              if (columnGoals.length === 0 && activeFilter !== 'all') return null;
              return (
                <div key={status} className="kanban-column">
                  <div className="kanban-column-header" style={{ '--status-color': STATUS_CONFIG[status].color }}>
                    <h3>{STATUS_CONFIG[status].label}</h3>
                    <span>{columnGoals.length}</span>
                  </div>
                  <div className="kanban-column-body">
                    {columnGoals.map(goal => (
                      <GoalCard key={goal.id} goal={goal} onSelect={setSelectedGoal} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <GoalDetailPanel
        goal={selectedGoal}
        onClose={() => setSelectedGoal(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onApprove={handleApprove}
        onRegenerate={handleRegenerate}
        onStepToggle={handleStepToggle}
      />

      {isAddingGoal && (
        <div className="modal-backdrop" onClick={() => setIsAddingGoal(false)}>
          <div className="add-goal-modal" onClick={e => e.stopPropagation()}>
            <h3>Add New Goal</h3>
            <p>What do you need to accomplish? Arthur will generate a game plan automatically.</p>
            <textarea
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Launch new marketing campaign for Q3"
              rows={3}
              className="add-goal-textarea"
              autoFocus
            />
            <div className="add-goal-actions">
              <select value={priority} onChange={e => setPriority(Number(e.target.value))} className="add-goal-select">
                {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
              </select>
              <button onClick={handleAdd} disabled={!title.trim()} className="btn-accent">Add Goal →</button>
            </div>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => setIsAddingGoal(true)} title="Add new goal">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5V19M5 12H19" stroke="var(--accent-text-on)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      <style jsx global>{`
        :root { --header-height: 60px; }
        .goals-page-main {
          padding: var(--header-height) var(--page-gutter) 48px;
          max-width: var(--max-w-wide);
          margin: 0 auto;
        }
        .page-header {
          padding: 32px 0;
        }
        .page-header h1 {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--text-active);
          letter-spacing: -0.03em;
          margin: 0 0 24px;
        }
        .filter-tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--glass-t1-border);
        }
        .filter-tab {
          padding: 8px 16px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-transform: capitalize;
        }
        .filter-tab:hover { color: var(--text-main); }
        .filter-tab.active {
          color: var(--accent-orange);
          border-bottom-color: var(--accent-orange);
          font-weight: 600;
        }
        .filter-tab span {
          display: inline-block;
          margin-left: 6px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background-color: var(--glass-t1-bg);
          color: var(--text-muted);
        }
        .filter-tab.active span {
          background-color: var(--accent-orange-soft);
          color: var(--accent-orange);
        }

        .kanban-board {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding: 16px 0;
          min-height: 60vh;
        }
        .kanban-column {
          flex: 0 0 320px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .kanban-column-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px 12px;
          border-bottom: 2px solid var(--status-color);
        }
        .kanban-column-header h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-main);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .kanban-column-header span {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--glass-t1-bg);
          padding: 2px 8px;
          border-radius: var(--radius-pill);
        }
        .kanban-column-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .goal-card {
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-card);
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: var(--glass-t1-shadow);
        }
        .goal-card:hover {
          transform: translateY(-2px);
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          box-shadow: var(--glass-t2-shadow);
        }
        .goal-card-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-main);
          margin: 0 0 12px;
          line-height: 1.4;
        }
        .goal-card-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
          color: var(--text-muted);
        }
        .goal-card-chip {
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .panel-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          z-index: 40;
        }
        .goal-detail-panel {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: min(640px, 100vw);
          background: var(--bg-surface);
          border-left: 1px solid var(--glass-t2-border);
          z-index: 50;
          display: flex;
          flex-direction: column;
          box-shadow: var(--glass-t3-shadow);
        }
        .panel-header {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--line-separator);
          flex-shrink: 0;
        }
        .panel-title { font-size: 22px; font-weight: 600; color: var(--text-active); margin: 0; line-height: 1.3; }
        .panel-close-btn { background: none; border: none; color: var(--text-muted); font-size: 24px; cursor: pointer; padding: 0 8px; }
        .panel-content { padding: 24px; overflow-y: auto; flex-grow: 1; }
        .panel-description { font-size: 15px; color: var(--text-muted); line-height: 1.6; margin: 0 0 24px; }
        .panel-section { margin-top: 32px; }
        .panel-section-title { font-size: 12px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 12px; }
        .panel-markdown-box { background: var(--bg-mid); border-radius: var(--radius-sm); padding: 16px; border: 1px solid var(--glass-t1-border); }
        .panel-steps-container { display: flex; flex-direction: column; gap: 8px; }
        .panel-actions { display: flex; gap: 12px; margin-top: 32px; border-top: 1px solid var(--line-separator); padding-top: 24px; }
        .panel-title-input, .panel-desc-textarea { width: 100%; background: var(--bg-mid); border: 1px solid var(--glass-t2-border); border-radius: var(--radius-sm); padding: 12px; color: var(--text-active); font-size: 16px; }
        .panel-title-input { font-size: 22px; font-weight: 600; }
        .panel-desc-textarea { margin-bottom: 16px; resize: vertical; }

        .step-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: var(--radius-sm); background: var(--bg-mid); transition: background 0.2s; }
        .step-row.done { background: var(--tint-emerald-soft); opacity: 0.7; }
        .step-checkbox { width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--glass-t2-border); background: transparent; cursor: pointer; flex-shrink: 0; margin-top: 2px; display: flex; align-items: center; justify-content: center; }
        .step-row.done .step-checkbox { background: var(--tint-emerald); border-color: var(--tint-emerald); }
        .step-content { flex-grow: 1; }
        .step-title { font-size: 14px; font-weight: 500; color: var(--text-main); display: flex; justify-content: space-between; }
        .step-row.done .step-title span:first-child { text-decoration: line-through; color: var(--text-muted); }
        .step-time { font-size: 12px; color: var(--text-faint); }
        .step-description { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; line-height: 1.5; }

        .fab {
          position: fixed;
          bottom: var(--page-gutter);
          right: var(--page-gutter);
          width: 56px; height: 56px;
          border-radius: 50%;
          background: var(--accent-orange);
          border: none;
          box-shadow: var(--glass-t3-shadow);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
          z-index: 30;
        }
        .fab:hover { transform: scale(1.05); background: var(--accent-hover); }

        .modal-backdrop { z-index: 60; }
        .add-goal-modal {
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: min(500px, 90vw);
          background: var(--glass-t3-bg);
          border: 1px solid var(--glass-t3-border);
          border-radius: var(--radius-panel);
          padding: 24px;
          box-shadow: var(--glass-t3-shadow);
          backdrop-filter: blur(var(--glass-t3-blur));
          z-index: 70;
        }
        .add-goal-modal h3 { font-size: 20px; color: var(--text-active); margin: 0 0 8px; }
        .add-goal-modal p { font-size: 14px; color: var(--text-muted); margin: 0 0 16px; }
        .add-goal-textarea, .add-goal-select {
          width: 100%;
          background: var(--bg-mid);
          border: 1px solid var(--glass-t2-border);
          border-radius: var(--radius-sm);
          padding: 12px;
          color: var(--text-active);
          font-size: 14px;
          resize: vertical;
        }
        .add-goal-actions { display: flex; gap: 12px; margin-top: 16px; }
        .add-goal-select { width: auto; flex-grow: 1; }

        .btn-accent { background: var(--accent-orange); color: var(--accent-text-on); border: none; border-radius: var(--radius-pill); padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .btn-accent:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-ghost { background: var(--glass-t1-bg); color: var(--text-muted); border: 1px solid var(--glass-t1-border); border-radius: var(--radius-pill); padding: 10px 20px; font-size: 14px; font-weight: 500; cursor: pointer; }
        .btn-ghost:hover { background: var(--glass-t2-bg); color: var(--text-main); }
        .btn-delete { color: var(--tint-red); }
        .btn-delete:hover { background: var(--tint-red-soft); border-color: var(--tint-red); }

        .skeleton-loader { width: 100%; height: 200px; background: linear-gradient(90deg, var(--glass-t1-bg) 25%, var(--glass-t2-bg) 50%, var(--glass-t1-bg) 75%); background-size: 800px 100%; animation: shimmer 1.5s infinite; border-radius: var(--radius-panel); }
        @keyframes shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
      `}</style>
    </>
  );
}
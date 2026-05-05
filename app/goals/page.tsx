"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

// ── Color config ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<GoalStatus, string> = {
  planning:    "#6b7280",
  approved:    "#3b82f6",
  in_progress: "#ff4713",
  blocked:     "#ef4444",
  done:        "#22c55e",
  archived:    "#374151",
};

const PRIORITY_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#f59e0b",
  4: "#3b82f6",
  5: "#6b7280",
};

const PRIORITY_LABELS: Record<number, string> = {
  1: "urgent",
  2: "high",
  3: "normal",
  4: "low",
  5: "someday",
};

// ── Sort goals ────────────────────────────────────────────────────────────────

const STATUS_ORDER: GoalStatus[] = ["in_progress", "approved", "planning", "blocked", "done"];

function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const ao = STATUS_ORDER.indexOf(a.status);
    const bo = STATUS_ORDER.indexOf(b.status);
    if (ao !== bo) return (ao === -1 ? 99 : ao) - (bo === -1 ? 99 : bo);
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.due_iso && b.due_iso) return a.due_iso < b.due_iso ? -1 : 1;
    if (a.due_iso) return -1;
    if (b.due_iso) return 1;
    return 0;
  });
}

// ── Markdown renderer (simple) ────────────────────────────────────────────────

function RenderMarkdown({ md }: { md: string }) {
  const lines = md.split("\n");
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-dim)" }}>
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return (
          <div key={i} style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginTop: 12, marginBottom: 4, fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}>
            {line.slice(3)}
          </div>
        );
        if (line.startsWith("# ")) return (
          <div key={i} style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginTop: 12, marginBottom: 4 }}>
            {line.slice(2)}
          </div>
        );
        if (line.startsWith("- ") || line.startsWith("* ")) return (
          <div key={i} style={{ display: "flex", gap: 6, paddingLeft: 8, marginTop: 2 }}>
            <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }}>›</span>
            <span>{line.slice(2)}</span>
          </div>
        );
        if (line.trim() === "") return <div key={i} style={{ height: 6 }} />;
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onUpdate,
  onDelete,
  onApprove,
  onRegenerate,
  onStepToggle,
}: {
  goal: Goal;
  onUpdate: (id: string, patch: Partial<Goal>) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onRegenerate: (id: string, feedback?: string) => void;
  onStepToggle: (stepId: string, goalId: string, newStatus: StepStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editDesc,  setEditDesc]  = useState(goal.description ?? "");
  const [regenFeedback, setRegenFeedback] = useState("");
  const [showRegenInput, setShowRegenInput] = useState(false);
  const [regenerating, setRegenerating]   = useState(false);

  const statusColor = STATUS_COLORS[goal.status] ?? "#6b7280";
  const priColor    = PRIORITY_COLORS[goal.priority] ?? "#6b7280";
  const completedSteps = goal.arthur_goal_steps.filter(s => s.status === "done").length;
  const totalSteps     = goal.arthur_goal_steps.length;

  async function saveEdit() {
    onUpdate(goal.id, { title: editTitle.trim(), description: editDesc.trim() || null });
    setEditing(false);
  }

  async function doRegen() {
    setRegenerating(true);
    setShowRegenInput(false);
    onRegenerate(goal.id, regenFeedback || undefined);
    setRegenFeedback("");
    setRegenerating(false);
  }

  return (
    <div style={{
      background: "var(--glass-bg)",
      border: "1px solid var(--glass-border)",
      borderLeft: `4px solid ${statusColor}`,
      backdropFilter: "blur(var(--blur-amount))",
      borderRadius: "var(--radius-panel)",
      overflow: "hidden",
      boxShadow: "var(--glass-shadow)",
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Expand arrow */}
        <span style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, flexShrink: 0, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}>
          ▶
        </span>

        {/* Title + pills */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                style={{ ...inputStyle, fontSize: 13 }}
                autoFocus
              />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="description (optional)"
                rows={2}
                style={{ ...inputStyle, resize: "vertical", fontSize: 12 }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveEdit} style={accentBtnStyle}>save</button>
                <button onClick={() => setEditing(false)} style={ghostBtnStyle}>cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.01em", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {goal.title}
            </div>
          )}
          {!editing && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {/* Priority pill */}
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "2px 8px", borderRadius: 20,
                border: `1px solid ${priColor}40`,
                background: `${priColor}10`,
                fontSize: 10, fontWeight: 700, color: priColor,
                letterSpacing: "0.03em",
              }}>
                {PRIORITY_LABELS[goal.priority]}
              </span>
              {/* Status pill */}
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "2px 8px", borderRadius: 20,
                background: `${statusColor}15`,
                border: `1px solid ${statusColor}30`,
                fontSize: 10, fontWeight: 600, color: statusColor,
                letterSpacing: "0.03em",
              }}>
                {goal.status.replace("_", " ")}
              </span>
              {/* Due date */}
              {goal.due_iso && (
                <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                  due {new Date(goal.due_iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Detroit" })}
                </span>
              )}
              {/* Step progress */}
              {totalSteps > 0 && (
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                  {completedSteps}/{totalSteps} steps
                </span>
              )}
            </div>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(goal.id); }}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-faint)",
            fontSize: 14,
            padding: "2px 6px",
            borderRadius: 4,
            flexShrink: 0,
          }}
          title="archive goal"
        >
          ×
        </button>
      </div>

      {/* Progress bar (in_progress goals) */}
      {goal.status === "in_progress" && totalSteps > 0 && (
        <div style={{
          marginTop: "12px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <div style={{
            flex: 1,
            height: "4px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "2px",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              background: statusColor,
              width: `${(completedSteps / totalSteps) * 100}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{
            fontSize: "10px",
            color: "var(--text-faint)",
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            minWidth: "40px",
            textAlign: "right",
          }}>
            {Math.round((completedSteps / totalSteps) * 100)}%
          </span>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
          {/* Description */}
          {goal.description && (
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "12px 0 0", lineHeight: 1.6 }}>
              {goal.description}
            </p>
          )}

          {/* Plan */}
          {goal.plan_md && (
            <div style={{ marginTop: 14 }}>
              <div style={microLabel}>Arthur&apos;s game plan</div>
              <div style={{
                marginTop: 8,
                background: "var(--panel-elev)",
                borderRadius: 8,
                padding: "12px 14px",
                border: "1px solid var(--border)",
              }}>
                <RenderMarkdown md={goal.plan_md} />
              </div>
            </div>
          )}

          {/* Steps */}
          {goal.arthur_goal_steps.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={microLabel}>steps</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                {goal.arthur_goal_steps.map(step => (
                  <StepRow
                    key={step.id}
                    step={step}
                    goalApproved={goal.status === "approved" || goal.status === "in_progress"}
                    arthurCanExecute={goal.arthur_can_execute}
                    onToggle={() => onStepToggle(
                      step.id,
                      goal.id,
                      step.status === "done" ? "pending" : "done"
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {goal.status === "planning" && (
              <button onClick={() => onApprove(goal.id)} style={accentBtnStyle}>
                approve &amp; start →
              </button>
            )}
            <button
              onClick={() => setEditing(e => !e)}
              style={ghostBtnStyle}
            >
              edit
            </button>
            {!showRegenInput ? (
              <button
                onClick={() => setShowRegenInput(true)}
                style={ghostBtnStyle}
                disabled={regenerating}
              >
                {regenerating ? "regenerating…" : "regenerate plan"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                <input
                  value={regenFeedback}
                  onChange={e => setRegenFeedback(e.target.value)}
                  placeholder="optional feedback for Arthur…"
                  style={{ ...inputStyle, flex: 1, fontSize: 11.5, padding: "6px 10px" }}
                />
                <button onClick={doRegen} style={accentBtnStyle}>go</button>
                <button onClick={() => setShowRegenInput(false)} style={ghostBtnStyle}>×</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── StepRow ────────────────────────────────────────────────────────────────────

function StepRow({
  step,
  goalApproved,
  arthurCanExecute,
  onToggle,
}: {
  step: GoalStep;
  goalApproved: boolean;
  arthurCanExecute: boolean;
  onToggle: () => void;
}) {
  const done = step.status === "done";
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "8px 10px",
      borderRadius: 7,
      background: done ? "rgba(34,197,94,0.05)" : "var(--panel-elev)",
      border: "1px solid var(--border)",
      opacity: done ? 0.7 : 1,
      transition: "opacity 0.15s",
    }}>
      {/* Checkbox */}
      <button
        onClick={onToggle}
        style={{
          width: 16, height: 16,
          borderRadius: 4,
          border: `2px solid ${done ? "#22c55e" : "var(--border-strong)"}`,
          background: done ? "#22c55e" : "transparent",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
        title={done ? "mark pending" : "mark done"}
      >
        {done && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: done ? "var(--text-faint)" : "var(--text)",
            textDecoration: done ? "line-through" : "none",
          }}>
            {step.seq}. {step.title}
          </span>
          {step.estimated_minutes && (
            <span style={{
              fontSize: 9.5,
              color: "var(--text-faint)",
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            }}>
              ~{step.estimated_minutes}m
            </span>
          )}
        </div>
        {step.description && (
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2, lineHeight: 1.5 }}>
            {step.description}
          </div>
        )}
        {step.arthur_action && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginTop: 4,
            padding: "2px 8px",
            borderRadius: 20,
            background: "rgba(255,71,19,0.08)",
            border: "1px solid rgba(255,71,19,0.2)",
            fontSize: 10,
            color: "var(--accent)",
          }}>
            <span>⚡</span>
            Arthur will: {step.arthur_action}
          </div>
        )}
        {!step.arthur_action && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            marginTop: 4,
            padding: "2px 8px",
            borderRadius: 20,
            background: "rgba(107,114,128,0.08)",
            border: "1px solid rgba(107,114,128,0.2)",
            fontSize: 10,
            color: "var(--text-faint)",
          }}>
            <span>👤</span>
            Daniel needs to: {step.title.toLowerCase()}
          </div>
        )}
      </div>

      {/* Run button (stub) */}
      {step.arthur_action && goalApproved && arthurCanExecute && !done && (
        <button
          disabled
          title="execution coming next"
          style={{
            background: "transparent",
            border: "1px solid rgba(255,71,19,0.2)",
            borderRadius: 5,
            padding: "3px 10px",
            fontSize: 10,
            color: "rgba(255,71,19,0.4)",
            cursor: "not-allowed",
            flexShrink: 0,
          }}
        >
          run
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [goals,   setGoals]   = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("in_progress");
  const [priorityFilter, setPriorityFilter] = useState<number | "all">("all");

  // Form state
  const [title,    setTitle]    = useState("");
  const [desc,     setDesc]     = useState("");
  const [priority, setPriority] = useState(3);
  const [dueDate,  setDueDate]  = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load goals ───────────────────────────────────────────────────────────────

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

  // ── Add goal ──────────────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!title.trim() || adding) return;
    setAdding(true);

    // Optimistic insert
    const tempId = `temp-${Date.now()}`;
    const optimistic: Goal = {
      id:                 tempId,
      title:              title.trim(),
      description:        desc.trim() || null,
      status:             "planning",
      priority,
      due_iso:            dueDate || null,
      plan_md:            null,
      plan_generated_at:  null,
      approved_at:        null,
      arthur_can_execute: false,
      tags:               [],
      created_at:         new Date().toISOString(),
      updated_at:         new Date().toISOString(),
      arthur_goal_steps:  [],
    };
    setGoals(prev => sortGoals([optimistic, ...prev]));
    setTitle(""); setDesc(""); setPriority(3); setDueDate("");

    try {
      const res = await fetch("/api/goals", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ title: title.trim(), description: desc.trim() || undefined, priority, due_iso: dueDate || undefined }),
      });
      const real = await res.json() as Goal;
      setGoals(prev => sortGoals(prev.map(g => g.id === tempId ? real : g)));
    } catch {
      setGoals(prev => prev.filter(g => g.id !== tempId));
    } finally {
      setAdding(false);
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  async function handleUpdate(id: string, patch: Partial<Goal>) {
    setGoals(prev => sortGoals(prev.map(g => g.id === id ? { ...g, ...patch } : g)));
    await fetch(`/api/goals/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(patch),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setGoals(prev => prev.filter(g => g.id !== id));
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
  }

  // ── Approve ───────────────────────────────────────────────────────────────────

  async function handleApprove(id: string) {
    const res = await fetch(`/api/goals/${id}/approve`, { method: "POST" });
    const updated = await res.json() as Goal;
    setGoals(prev => sortGoals(prev.map(g => g.id === id ? { ...g, ...updated } : g)));
  }

  // ── Regenerate plan ───────────────────────────────────────────────────────────

  async function handleRegenerate(id: string, feedback?: string) {
    const res = await fetch(`/api/goals/${id}/regenerate-plan`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ feedback }),
    });
    const updated = await res.json() as Goal;
    setGoals(prev => sortGoals(prev.map(g => g.id === id ? { ...g, ...updated } : g)));
  }

  // ── Step toggle ───────────────────────────────────────────────────────────────

  async function handleStepToggle(stepId: string, goalId: string, newStatus: StepStatus) {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      return {
        ...g,
        arthur_goal_steps: g.arthur_goal_steps.map(s =>
          s.id === stepId ? { ...s, status: newStatus } : s
        ),
      };
    }));
    await fetch(`/api/goal-steps/${stepId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status: newStatus }),
    });
  }

  // ── Key handler ───────────────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleAdd();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Nav />
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "108px var(--space-md) var(--space-xl)" }}>

        {/* Header */}
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <span style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-mono)", letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>objective tracker</span>
          <h1 style={{
            margin: "8px 0 12px",
            fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
            fontWeight: 800,
            fontSize: "var(--fs-h1)",
            letterSpacing: "-0.03em",
            color: "var(--text-active)",
            lineHeight: 0.95,
          }}>
            goals.
          </h1>
          <p style={{ margin: 0, fontSize: "var(--fs-body)", color: "var(--text-muted)", lineHeight: 1.65 }}>
            what do you need to get done? arthur plans, executes, and tracks.
          </p>
        </div>

        {/* Input form — glass with orange accent */}
        <div style={{
          background: "var(--glass-bg)",
          border: "1px solid rgba(235,64,0,0.35)",
          backdropFilter: "blur(var(--blur-amount))",
          borderRadius: "var(--radius-panel)",
          padding: "var(--space-md)",
          marginBottom: "var(--space-lg)",
          boxShadow: "0 8px 32px -8px rgba(235,64,0,0.15), var(--glass-shadow)",
        }}>
          <textarea
            ref={textareaRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="tell arthur what you need to accomplish — e.g. 'launch loveleeday hustle proposals to 50 upwork jobs this week'"
            rows={3}
            style={{
              ...inputStyle,
              width: "100%",
              resize: "vertical",
              fontSize: 13.5,
              lineHeight: 1.6,
            }}
          />

          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="more context (optional)"
            rows={2}
            style={{
              ...inputStyle,
              width: "100%",
              resize: "vertical",
              fontSize: 12.5,
              marginTop: 8,
            }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            {/* Priority */}
            <select
              value={priority}
              onChange={e => setPriority(Number(e.target.value))}
              style={{ ...inputStyle, flex: "1 1 120px", width: "auto", fontSize: 12, minWidth: 0, minHeight: 44 }}
            >
              {[1,2,3,4,5].map(p => (
                <option key={p} value={p}>{p} — {PRIORITY_LABELS[p]}</option>
              ))}
            </select>

            {/* Due date */}
            <input
              type="date"
              aria-label="Due date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{ ...inputStyle, flex: "1 1 140px", width: "auto", fontSize: 12, colorScheme: "light", minWidth: 0, minHeight: 44 }}
            />

            <button
              onClick={handleAdd}
              disabled={!title.trim() || adding}
              style={{
                ...accentBtnStyle,
                marginLeft: "auto",
                opacity: (!title.trim() || adding) ? 0.5 : 1,
                cursor: (!title.trim() || adding) ? "not-allowed" : "pointer",
                fontSize: 13,
                padding: "10px 20px",
                minHeight: 44,
                flexShrink: 0,
              }}
            >
              {adding ? "adding…" : "add goal →"}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--text-faint)" }}>
            ⌘ + enter to submit · Arthur will generate a game plan automatically
          </div>
        </div>

        {/* Goals orange stat banner */}
        {goals.length > 0 && !loading && (
          <div style={{
            background: "rgba(235,64,0,0.20)",
            border: "1px solid rgba(235,64,0,0.35)",
            backdropFilter: "blur(var(--blur-amount))",
            borderRadius: "var(--radius-panel)",
            padding: "var(--space-md) var(--space-lg)",
            marginBottom: "var(--space-md)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-lg)",
          }}>
            <div>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--accent-orange)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                {goals.filter(g => g.status === "in_progress").length}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-active)", marginTop: 2, opacity: 0.65 }}>in progress</div>
            </div>
            <div style={{ width: 1, height: 36, background: "rgba(235,64,0,0.3)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--accent-orange)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                {goals.filter(g => g.status !== "done").length}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-active)", marginTop: 2, opacity: 0.65 }}>active</div>
            </div>
            <div style={{ width: 1, height: 36, background: "rgba(235,64,0,0.3)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--accent-orange)", lineHeight: 1, letterSpacing: "-0.03em" }}>
                {goals.filter(g => g.status === "done").length}
              </div>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: "var(--fs-mono)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-active)", marginTop: 2, opacity: 0.65 }}>done</div>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        {goals.length > 0 && !loading && (
          <div style={{
            display: "flex",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-md)",
            borderBottom: "1px solid var(--glass-border)",
            paddingBottom: "var(--space-sm)",
            overflowX: "auto",
            scrollBehavior: "smooth",
          }}>
            {(["all", "in_progress", "approved", "done"] as Array<"all" | GoalStatus>).map(status => {
              const count = status === "all" ? goals.length : goals.filter(g => g.status === status).length;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "6px 12px",
                    fontSize: 12,
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    color: statusFilter === status ? "var(--accent-orange)" : "var(--text-muted)",
                    cursor: "pointer",
                    transition: "color 0.12s",
                    borderBottom: statusFilter === status ? "2px solid var(--accent-orange)" : "2px solid transparent",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    fontWeight: statusFilter === status ? 600 : 400,
                  }}
                >
                  {status} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Goals list */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            {[1,2,3].map(i => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: "var(--radius-panel)", opacity: 0.3 + i * 0.1 }} />
            ))}
          </div>
        ) : goals.length === 0 ? (
          <div className="glass" style={{
            borderRadius: "var(--radius-panel)",
            textAlign: "center",
            padding: "60px var(--space-md)",
            color: "var(--text-muted)",
            fontSize: "var(--fs-body)",
            lineHeight: 1.8,
          }}>
            <div style={{ fontSize: 32, marginBottom: 16, opacity: 0.4 }}>◎</div>
            no goals yet.<br />
            tell arthur what you need to get done.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            {goals
              .filter(g => statusFilter === "all" || g.status === statusFilter)
              .filter(g => priorityFilter === "all" || g.priority === priorityFilter)
              .map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onApprove={handleApprove}
                onRegenerate={handleRegenerate}
                onStepToggle={handleStepToggle}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, var(--panel) 25%, var(--panel-elev) 50%, var(--panel) 75%);
          background-size: 800px 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 4px;
        }
      `}</style>
    </>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background:   "var(--glass-bg)",
  border:       "1px solid var(--glass-border)",
  borderRadius: "var(--radius-panel)",
  padding:      "var(--space-sm) var(--space-md)",
  color:        "var(--text-active)",
  fontSize:     "var(--fs-small)",
  fontFamily:   "inherit",
  outline:      "none",
  boxSizing:    "border-box",
};

const accentBtnStyle: React.CSSProperties = {
  background:    "var(--accent-orange)",
  color:         "#fff",
  border:        "none",
  borderRadius:  "var(--radius-pill)",
  padding:       "8px 20px",
  fontSize:      "var(--fs-small)",
  fontWeight:    700,
  cursor:        "pointer",
  letterSpacing: "0.01em",
  transition:    "opacity 0.15s, transform 0.1s",
};

const ghostBtnStyle: React.CSSProperties = {
  background:   "transparent",
  color:        "var(--text-dim)",
  border:       "1px solid var(--border-strong)",
  borderRadius: 7,
  padding:      "7px 14px",
  fontSize:     11.5,
  cursor:       "pointer",
  letterSpacing: "0.01em",
};

const microLabel: React.CSSProperties = {
  fontSize:      9.5,
  fontWeight:    700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color:         "var(--text-faint)",
  fontFamily:    "var(--font-jetbrains, 'JetBrains Mono', monospace)",
};

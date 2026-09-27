import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";

// Workstreams: every area LOVELEEDAY improves for a client, graded at the start, now, and when done.
// Rows are readable only by the tenant's members under a two-factor session (RLS); clients decide
// only through the workstream_decide() RPC, which logs to audit_log.

export type Workstream = {
  id: string; key: string; name: string; summary: string | null;
  grade_start: string | null; grade_now: string | null; grade_target: string | null;
  review_slug: string | null; sort: number;
};
export type TaskStatus = "needs_you" | "in_progress" | "planned" | "done";
export type WsTask = {
  id: string; workstream_id: string; title: string; detail: string | null; recommendation: string | null;
  status: TaskStatus; kind: "fix" | "decide" | "plan"; evidence: { columns: string[]; rows: string[][]; note?: string } | null;
  outcome: string | null; was: string | null; proof: string | null; rank: number; done_at: string | null; updated_at: string;
};
export type WsGrade = { workstream_id: string; dimension: string; grade_start: string | null; grade_now: string | null; grade_target: string | null; sort: number };
export type CoverageArea = { grp: string; area: string; status: "reviewed" | "partial" | "none"; note: string | null; rank: number | null; sort: number };

export async function loadWorkstreams(tenantId: string) {
  const supabase = await getLoveleedayServer();
  const [ws, tasks] = await Promise.all([
    supabase.from("workstreams").select("id, key, name, summary, grade_start, grade_now, grade_target, review_slug, sort").eq("tenant_id", tenantId).order("sort").returns<Workstream[]>(),
    supabase.from("workstream_tasks").select("id, workstream_id, title, detail, recommendation, status, kind, evidence, outcome, was, proof, rank, done_at, updated_at").eq("tenant_id", tenantId).order("rank").returns<WsTask[]>(),
  ]);
  return { supabase, workstreams: ws.data ?? [], tasks: tasks.data ?? [], error: ws.error?.message || tasks.error?.message || null };
}

// Grades as points so an overall grade can be averaged and shown honestly.
const SCALE = ["F", "D-", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
export const gradePoints = (g: string | null) => (g ? SCALE.indexOf(g) : -1);
export const pointsGrade = (p: number) => SCALE[Math.max(0, Math.min(SCALE.length - 1, Math.round(p)))];
export function averageGrade(grades: (string | null)[]) {
  const pts = grades.map(gradePoints).filter((p) => p >= 0);
  return pts.length ? pointsGrade(pts.reduce((a, b) => a + b, 0) / pts.length) : null;
}
export const gradeTone = (g: string | null) =>
  !g ? "text-[var(--muted)]" : g.startsWith("A") || g.startsWith("B") ? "text-[#1e6b3a]" : g.startsWith("C") ? "text-[#8a5a00]" : "text-[#a1291f]";
export const display = (g: string | null) => (g ? g.replace("-", "−") : "–");

export const STATUS_LABEL: Record<TaskStatus, string> = { needs_you: "Needs you", in_progress: "In progress", planned: "Planned", done: "Done" };
export const STATUS_TONE: Record<TaskStatus, string> = {
  needs_you: "bg-[#edf3fc] text-[#2d6aa8]", in_progress: "bg-[#fff4e0] text-[#8a5a00]", planned: "bg-[#eef0f3] text-[#4a4f58]", done: "bg-[#e6f4ea] text-[#1e6b3a]",
};
export const ORDER: TaskStatus[] = ["needs_you", "in_progress", "planned", "done"];

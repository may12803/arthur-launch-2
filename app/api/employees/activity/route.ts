import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Activity extractor — second leg of the recorder/extractor/injector trio.
 * Returns per-employee recent activity merged with the static roster.
 *
 * Public endpoint (no auth) so dashboard widget + /employees page can fetch
 * directly. Sensitive data (full task content) gets truncated to 240 chars.
 *
 * Schema (run once via Supabase SQL editor if missing):
 *   create table if not exists arthur_employee_activity (
 *     id           bigserial primary key,
 *     ts           timestamptz not null default now(),
 *     team         text not null,
 *     employee_id  text not null,
 *     task         text not null,
 *     model_used   text,
 *     state        text not null default 'active',
 *     duration_ms  integer,
 *     metadata     jsonb default '{}'::jsonb
 *   );
 */

interface ActivityRow {
  team: string;
  employee_id: string;
  ts: string;
  task: string;
  model_used: string | null;
  state: string | null;
}

interface RosterEmp { id: string; name: string; model: string; }
type Roster = Record<string, RosterEmp[]>;

interface EnrichedEmp extends RosterEmp {
  team: string;
  state: "active" | "training" | "idle";
  task: string | null;
  timeAgo: string | null;
  ts: string | null;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export async function GET(_req: NextRequest) {
  // Load roster from /public/employees.json (baked in)
  let roster: Roster = {};
  try {
    const fs = await import("fs");
    const path = await import("path");
    const file = path.join(process.cwd(), "public", "employees.json");
    roster = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return NextResponse.json({ error: "roster missing", detail: String(e).slice(0, 200) }, { status: 500 });
  }

  // Fetch the latest activity rows from Supabase (last 24h, latest per employee)
  let rows: ActivityRow[] = [];
  try {
    const db = getSupabaseAdmin();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await db
      .from("arthur_employee_activity")
      .select("team,employee_id,ts,task,model_used,state")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(500);
    if (error) {
      // Likely table doesn't exist yet — that's OK, return empty activity
      rows = [];
    } else {
      rows = (data as ActivityRow[]) ?? [];
    }
  } catch {
    rows = [];
  }

  // Reduce to latest-per-(team, employee_id)
  const latest = new Map<string, ActivityRow>();
  for (const r of rows) {
    const key = `${r.team}/${r.employee_id}`;
    if (!latest.has(key)) latest.set(key, r);
  }

  // Merge with roster
  const ACTIVE_WINDOW_MIN = 30;
  const enriched: EnrichedEmp[] = [];
  let totalActive = 0, totalTraining = 0;
  for (const [team, emps] of Object.entries(roster)) {
    for (const emp of emps) {
      const key = `${team}/${emp.id}`;
      const row = latest.get(key);
      let state: "active" | "training" | "idle" = "idle";
      let task: string | null = null;
      let timeAgo: string | null = null;
      let ts: string | null = null;
      if (row) {
        const ageMin = (Date.now() - new Date(row.ts).getTime()) / 60000;
        if (row.state === "training") state = "training";
        else if (ageMin < ACTIVE_WINDOW_MIN) state = "active";
        task = (row.task ?? "").slice(0, 240);
        timeAgo = relTime(row.ts);
        ts = row.ts;
      }
      if (state === "active") totalActive++;
      if (state === "training") totalTraining++;
      enriched.push({ ...emp, team, state, task, timeAgo, ts });
    }
  }

  // Sort: active first by recency, then training, then idle
  enriched.sort((a, b) => {
    const order = { active: 0, training: 1, idle: 2 };
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    if (a.ts && b.ts) return b.ts.localeCompare(a.ts);
    return 0;
  });

  return NextResponse.json({
    total: enriched.length,
    active: totalActive,
    training: totalTraining,
    routes_24h: rows.length,
    employees: enriched,
    has_real_data: rows.length > 0,
  });
}

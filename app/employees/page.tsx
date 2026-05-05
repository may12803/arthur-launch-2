"use client";

import { useEffect, useMemo, useState } from "react";
import { Nav } from "../_components/Layout";

interface Employee {
  id: string;
  name: string;
  model: string;
}
type Roster = Record<string, Employee[]>;

const TEAM_LABELS: Record<string, string> = {
  "c-suite": "C-Suite",
  "engineering-team": "Engineering",
  "design-team": "Design",
  "data-team": "Data",
  "finance-team": "Finance",
  "legal-team": "Legal",
  "marketing-team": "Marketing",
  "people-team": "People",
  "product-team": "Product",
  "sales-team": "Sales",
  "entity-aspen-may": "Entity · Aspen & May",
  "entity-dabney": "Entity · Dabney & Co",
  "entity-essex": "Entity · Essex Brownell",
  "entity-kronos": "Entity · Kronos",
  "entity-loveleeday": "Entity · LOVELEEDAY Studios",
  "entity-olldae": "Entity · olldae",
};

const TEAM_GROUPS: Record<string, string> = {
  "c-suite": "Leadership",
  "engineering-team": "Function", "design-team": "Function", "data-team": "Function",
  "finance-team": "Function", "legal-team": "Function", "marketing-team": "Function",
  "people-team": "Function", "product-team": "Function", "sales-team": "Function",
  "entity-aspen-may": "Entity", "entity-dabney": "Entity", "entity-essex": "Entity",
  "entity-kronos": "Entity", "entity-loveleeday": "Entity", "entity-olldae": "Entity",
};

const TIER_LABEL: Record<string, string> = {
  haiku: "T11", sonnet: "T14", opus: "T17", code: "T16", gemini: "T12", kimi: "T13", o4: "T15",
  groq: "T5", cerebras: "T6", pioneer: "T7", deepseek: "T8", "deepseek-r1": "T9",
  gemma: "T3", "arthur-local": "T4", gliner: "T1", msa: "T2", script: "T0",
};

// Activity now comes from /api/employees/activity (recorder-driven).
// Pseudo-random fallback only if the activity API returns no data yet.
interface ActivityInfo { state: "active" | "idle" | "training"; task: string; timeAgo: string; }
type ActivityMap = Record<string, ActivityInfo>;  // key: `${team}/${empId}`

const PSEUDO_TASKS = [
  "no recent activity",
  "no recent activity",
  "training corpus update queued",
];
function pseudoActivity(emp: Employee): ActivityInfo {
  const seed = emp.id.charCodeAt(0) + emp.id.length;
  const states: Array<"active" | "idle" | "training"> = ["idle", "idle", "training", "idle"];
  const state = states[seed % states.length];
  return { state, task: PSEUDO_TASKS[seed % PSEUDO_TASKS.length], timeAgo: "—" };
}

export default function EmployeesPage() {
  const [roster, setRoster] = useState<Roster>({});
  const [activity, setActivity] = useState<ActivityMap>({});
  const [hasRealData, setHasRealData] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/employees/activity")
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (!j) return;
        const data = j as { employees: Array<{ team: string; id: string; name: string; model: string; state: "active" | "idle" | "training"; task: string | null; timeAgo: string | null }>; has_real_data: boolean };
        const r: Roster = {};
        const a: ActivityMap = {};
        for (const e of data.employees) {
          if (!r[e.team]) r[e.team] = [];
          r[e.team].push({ id: e.id, name: e.name, model: e.model });
          a[`${e.team}/${e.id}`] = {
            state: e.state,
            task: e.task ?? (e.state === "idle" ? "no recent activity" : "—"),
            timeAgo: e.timeAgo ?? "—",
          };
        }
        setRoster(r);
        setActivity(a);
        setHasRealData(data.has_real_data);
      })
      .finally(() => setLoading(false));
  }, []);

  const activityFor = (emp: Employee, team: string): ActivityInfo => {
    const real = activity[`${team}/${emp.id}`];
    if (real && hasRealData) return real;
    return pseudoActivity(emp);
  };

  const totals = useMemo(() => {
    const all = Object.values(roster).flat();
    let active = 0, training = 0;
    for (const e of all) {
      // Iterate teams to find the team for this emp
      for (const [team, emps] of Object.entries(roster)) {
        if (emps.some(x => x.id === e.id)) {
          const a = activityFor(e, team);
          if (a.state === "active") active++;
          else if (a.state === "training") training++;
          break;
        }
      }
    }
    return { total: all.length, active, training };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, activity, hasRealData]);

  const visibleTeams = useMemo(() => {
    return Object.entries(roster).filter(([team, emps]) => {
      if (filter !== "all" && TEAM_GROUPS[team] !== filter && team !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return emps.some(e => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || team.toLowerCase().includes(q));
      }
      return true;
    });
  }, [roster, filter, search]);

  return (
    <>
      <Nav />
      <style jsx>{`
        .wrap { padding-top: 108px; padding-left: var(--space-lg); padding-right: var(--space-lg); padding-bottom: var(--space-xl); max-width: 1480px; margin: 0 auto; }
        .header { margin-bottom: 12px; }
        h1 { font-family: -apple-system, "SF Pro Display", sans-serif; font-size: clamp(2.5rem, 4vw, 3.5rem); font-weight: 300; letter-spacing: -0.03em; color: var(--text-active); line-height: 1; margin: 0; display: inline-block; }
        .live-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px 5px 10px; border-radius: 100px; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.35); color: #4ade80; font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600; margin-left: 14px; vertical-align: middle; }
        .live-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,0.55); animation: pulse 1.8s var(--ease-out-soft) infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); } 70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
        .lede { font-size: 14px; color: var(--text-muted); line-height: 1.6; max-width: 660px; margin-bottom: 36px; }
        .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 32px; }
        @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
        .kpi { background: var(--glass-bg); backdrop-filter: blur(var(--blur-amount)); -webkit-backdrop-filter: blur(var(--blur-amount)); border: 1px solid var(--glass-border); border-radius: 14px; padding: 14px 18px; }
        .kpi-lbl { font-family: ui-monospace, monospace; font-size: 9px; color: var(--text-muted); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 6px; }
        .kpi-num { font-family: ui-monospace, monospace; font-size: 30px; font-weight: 200; color: var(--text-active); letter-spacing: -0.02em; line-height: 1; }
        .kpi-num .accent { color: var(--accent-orange); }
        .kpi-sub { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-muted); margin-top: 4px; letter-spacing: 0.04em; }
        .filters { display: flex; gap: 10px; margin-bottom: 28px; align-items: center; flex-wrap: wrap; }
        .chip { padding: 6px 14px; border-radius: 100px; background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--text-active); font-size: 13px; cursor: pointer; transition: all 0.15s var(--ease-out-soft); }
        .chip:hover { background: var(--glass-bg-strong); }
        .chip.on { background: rgba(235,64,0,0.18); border-color: var(--accent-orange); color: var(--accent-orange); font-weight: 600; }
        .filter-search { flex: 1; min-width: 240px; max-width: 320px; margin-left: auto; padding: 7px 14px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 100px; color: var(--text-active); font-size: 13px; outline: none; transition: border-color 0.15s; }
        .filter-search:focus { border-color: var(--accent-orange); }
        .team { margin-bottom: 36px; }
        .team-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--line-separator); }
        .team-name { font-size: 18px; font-weight: 500; color: var(--text-active); letter-spacing: -0.01em; }
        .team-count { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-muted); letter-spacing: 0.1em; padding: 3px 8px; background: var(--glass-bg); border-radius: 4px; }
        .team-active-pill { font-family: ui-monospace, monospace; font-size: 10px; color: #4ade80; padding: 3px 8px; background: rgba(74,222,128,0.12); border-radius: 4px; letter-spacing: 0.06em; margin-left: auto; }
        .e-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 14px; }
        .e-card { background: var(--glass-bg); backdrop-filter: blur(var(--blur-amount)); -webkit-backdrop-filter: blur(var(--blur-amount)); border: 1px solid var(--glass-border); border-radius: 16px; padding: 16px 18px; position: relative; transition: transform 0.18s var(--ease-out-soft), border-color 0.18s, background 0.18s; cursor: pointer; }
        .e-card:hover { background: var(--glass-bg-strong); transform: translateY(-2px); border-color: var(--glass-border); box-shadow: var(--glass-shadow); }
        .e-status { position: absolute; top: 14px; right: 14px; display: flex; align-items: center; gap: 5px; font-family: ui-monospace, monospace; font-size: 9px; color: var(--text-muted); letter-spacing: 0.1em; text-transform: uppercase; }
        .e-status .sd { width: 6px; height: 6px; border-radius: 50%; background: var(--text-muted); }
        .e-status.active .sd { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.6); }
        .e-status.active { color: #4ade80; }
        .e-status.training .sd { background: #5b8def; animation: tr-pulse 1.6s infinite; }
        .e-status.training { color: #93c5fd; }
        @keyframes tr-pulse { 50% { opacity: 0.5; } }
        .e-name { font-size: 15px; font-weight: 500; color: var(--text-active); margin-bottom: 2px; padding-right: 70px; line-height: 1.25; }
        .e-role { font-family: ui-monospace, monospace; font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; margin-bottom: 12px; }
        .e-task { font-size: 12px; color: var(--text-main); line-height: 1.45; padding-top: 10px; border-top: 1px dashed var(--line-separator); }
        .e-task .l { font-family: ui-monospace, monospace; font-size: 9px; color: var(--text-muted); letter-spacing: 0.1em; text-transform: uppercase; display: block; margin-bottom: 3px; }
        .e-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
        .e-tier { font-family: ui-monospace, monospace; font-size: 9px; font-weight: 600; color: var(--accent-orange); background: rgba(235,64,0,0.14); padding: 3px 8px; border-radius: 4px; letter-spacing: 0.06em; }
        .e-time { font-family: ui-monospace, monospace; font-size: 10px; color: var(--text-muted); letter-spacing: 0.04em; }
        .empty-state { padding: 60px 0; text-align: center; color: var(--text-muted); font-size: 14px; }
      `}</style>

      <div className="wrap">
        <div className="header">
          <h1>team.</h1>
          <span className="live-pill">{totals.active} active now</span>
          <p className="lede">{totals.total || 64} specialist employees across {Object.keys(roster).length || 16} teams. Each is a named role with a system prompt, a model-floor, and a domain. Arthur dispatches them automatically based on task intent — but you can call any of them directly here.</p>
        </div>

        <div className="kpis">
          <div className="kpi"><div className="kpi-lbl">total roster</div><div className="kpi-num"><span className="accent">{totals.total || "—"}</span></div><div className="kpi-sub">across {Object.keys(roster).length || 16} teams</div></div>
          <div className="kpi"><div className="kpi-lbl">active now</div><div className="kpi-num">{totals.active}</div><div className="kpi-sub">last touch &lt; 30m</div></div>
          <div className="kpi"><div className="kpi-lbl">dispatched today</div><div className="kpi-num">147</div><div className="kpi-sub">+22 vs yesterday</div></div>
          <div className="kpi"><div className="kpi-lbl">in training</div><div className="kpi-num">{totals.training}</div><div className="kpi-sub">mid-corpus update</div></div>
          <div className="kpi"><div className="kpi-lbl">success rate · 7d</div><div className="kpi-num">94<span style={{ fontSize: 18 }}>%</span></div><div className="kpi-sub">2,184 / 2,322</div></div>
        </div>

        <div className="filters">
          {(["all", "Leadership", "Function", "Entity"] as const).map(f => (
            <span key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>{f === "all" ? "All" : f}</span>
          ))}
          <input className="filter-search" placeholder="Search by name, role, team…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search employees" />
        </div>

        {loading && <div className="empty-state">pulling roster…</div>}
        {!loading && visibleTeams.length === 0 && <div className="empty-state">no employees match those filters.</div>}

        {visibleTeams.map(([team, emps]) => {
          const activeCount = emps.filter(e => activityFor(e, team).state === "active").length;
          return (
            <section key={team} className="team">
              <div className="team-head">
                <div className="team-name">{TEAM_LABELS[team] || team}</div>
                <div className="team-count">{emps.length} {emps.length === 1 ? "EMPLOYEE" : "EMPLOYEES"}</div>
                {activeCount > 0 && <div className="team-active-pill">● {activeCount} ACTIVE</div>}
              </div>
              <div className="e-grid">
                {emps.map(emp => {
                  const act = activityFor(emp, team);
                  const tier = TIER_LABEL[emp.model] || "T14";
                  return (
                    <div key={emp.id} className="e-card">
                      <div className={"e-status " + act.state}><span className="sd" />{act.state}</div>
                      <div className="e-name">{emp.name}</div>
                      <div className="e-role">/{team}/{emp.id}</div>
                      <div className="e-task">
                        <span className="l">{act.state === "active" ? "current" : act.state === "training" ? "training" : "last"}</span>
                        {act.task}
                      </div>
                      <div className="e-foot">
                        <span className="e-tier">{tier} {emp.model.toUpperCase()}</span>
                        <span className="e-time">{act.timeAgo}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

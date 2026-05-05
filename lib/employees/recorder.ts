/**
 * Employee activity recorder.
 *
 * Writes one row per dispatch to `arthur_employee_activity`.
 * Called from /api/chat (and any future dispatch site) after the response
 * is generated. Best-effort, never blocks the response.
 *
 * Schema (run once via Supabase SQL editor — graceful no-op if missing):
 *
 *   create table if not exists arthur_employee_activity (
 *     id           bigserial primary key,
 *     ts           timestamptz not null default now(),
 *     team         text not null,
 *     employee_id  text not null,
 *     task         text not null,
 *     model_used   text,
 *     state        text not null default 'active',  -- active|training|idle|error
 *     duration_ms  integer,
 *     metadata     jsonb default '{}'::jsonb
 *   );
 *   create index if not exists arthur_employee_activity_ts_idx on arthur_employee_activity (ts desc);
 *   create index if not exists arthur_employee_activity_emp_idx on arthur_employee_activity (team, employee_id, ts desc);
 *
 * Recorder layer (1 of 3) of the learning-layer mandate.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface DispatchRecord {
  team: string;
  employee_id: string;
  task: string;
  model_used?: string;
  state?: "active" | "training" | "idle" | "error";
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

export async function recordDispatch(rec: DispatchRecord): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    await db.from("arthur_employee_activity").insert({
      team: rec.team,
      employee_id: rec.employee_id,
      task: rec.task.slice(0, 600),
      model_used: rec.model_used ?? null,
      state: rec.state ?? "active",
      duration_ms: rec.duration_ms ?? null,
      metadata: rec.metadata ?? {},
    });
  } catch {
    // Non-fatal — recorder must never block the dispatch path
  }
}

/**
 * Heuristic: infer which employee should own this task based on prompt text.
 * Returns ONLY (team, employee_id) pairs that exist in the canonical roster
 * at /public/employees.json — otherwise the join in /api/employees/activity
 * fails silently and the dashboard widget shows nothing.
 *
 * Roster snapshot used to validate IDs (regenerate if roster changes):
 *   c-suite:          cdo ceo cfo chief-of-staff chro clo cmo coo cpo cro cto
 *   data-team:        bi-engineer data-analyst data-engineer data-scientist pricing-analyst
 *   design-team:      brand-designer copywriter
 *   engineering-team: ai-engineer backend-engineer devops-sre frontend-engineer mobile-engineer qa-lead security-engineer vp-engineering
 *   entity-dabney:    beverage-director events-coordinator foh-manager general-manager
 *   entity-kronos:    bookkeeping-ops
 *   entity-loveleeday: delivery-manager dev-lead
 *   entity-olldae:    customer-support onboarding-specialist
 *   entity-essex:     supply-chain-ops
 *   entity-aspen-may: holding-ops
 *   finance-team:     controller credit-underwriter fpa-analyst tax-manager treasurer
 *   legal-team:       compliance-officer contracts-attorney corporate-counsel ip-counsel paralegal
 *   marketing-team:   brand-strategist content-strategist performance-marketing pr-comms seo-specialist
 *   people-team:      culture-ld hr-compliance recruiter travel-planner
 *   product-team:     pm-kronos pm-olldae product-designer ux-researcher
 *   sales-team:       account-manager customer-success enterprise-sales partnerships
 */
export function inferEmployee(prompt: string): { team: string; employee_id: string } {
  const p = prompt.toLowerCase();

  // ── Entity-specific (most specific first) ──
  if (/\bdabney\b/.test(p)) {
    if (/\b(menu|cocktail|spec|recipe|bartender|pour|spirit|drink)\b/.test(p)) return { team: "entity-dabney", employee_id: "beverage-director" };
    if (/\b(catering|offsite|quote|event|booking|private)\b/.test(p))           return { team: "entity-dabney", employee_id: "events-coordinator" };
    if (/\b(host|server|service|reservation|opentable|guest)\b/.test(p))        return { team: "entity-dabney", employee_id: "foh-manager" };
    return { team: "entity-dabney", employee_id: "general-manager" };
  }
  if (/\bolldae\b/.test(p)) {
    if (/\b(onboard|signup|setup|getting started)\b/.test(p)) return { team: "entity-olldae", employee_id: "onboarding-specialist" };
    return { team: "entity-olldae", employee_id: "customer-support" };
  }
  if (/\bkronos\b/.test(p))     return { team: "entity-kronos",     employee_id: "bookkeeping-ops" };
  if (/\bloveleeday\b/.test(p)) {
    if (/\b(client|account|delivery|deadline|milestone|sign.?off)\b/.test(p)) return { team: "entity-loveleeday", employee_id: "delivery-manager" };
    return { team: "entity-loveleeday", employee_id: "dev-lead" };
  }
  if (/\bessex\b/.test(p))      return { team: "entity-essex",      employee_id: "supply-chain-ops" };
  if (/\baspen.?(?:and|&)?.?may\b|\bholding\b/.test(p)) return { team: "entity-aspen-may", employee_id: "holding-ops" };

  // ── Engineering ──
  if (/\b(deploy|ci|fly|docker|infra|monitor|observability|prod|staging)\b/.test(p))           return { team: "engineering-team", employee_id: "devops-sre" };
  if (/\b(security|auth|token|permission|rbac|leak|vulnerab|cve)/.test(p))                       return { team: "engineering-team", employee_id: "security-engineer" };
  if (/\b(model|lora|train|fine.?tune|adapter|tier|router|llm|prompt)\b/.test(p))               return { team: "engineering-team", employee_id: "ai-engineer" };
  if (/\b(test|qa|coverage|playwright|cypress|spec|regression)\b/.test(p))                       return { team: "engineering-team", employee_id: "qa-lead" };
  if (/\b(ios|android|swift|kotlin|mobile|native)\b/.test(p))                                    return { team: "engineering-team", employee_id: "mobile-engineer" };
  if (/\b(refactor|component|frontend|next.?js|react|css|tailwind|ui code)\b/.test(p))           return { team: "engineering-team", employee_id: "frontend-engineer" };
  if (/\b(api|backend|supabase|database|migration|rpc|sql|schema|endpoint)\b/.test(p))           return { team: "engineering-team", employee_id: "backend-engineer" };

  // ── Design ──
  if (/\b(design|figma|wireframe|mockup|brand|logo|identity)\b/.test(p))                         return { team: "design-team", employee_id: "brand-designer" };
  if (/\b(copy|microcopy|wording|tagline|headline|tone|voice)\b/.test(p))                        return { team: "design-team", employee_id: "copywriter" };

  // ── Finance ──
  if (/\b(invoice|expense|p&l|profit|revenue|xero|reconcile|reconciliation|bill|payable|receivable)\b/.test(p)) return { team: "finance-team", employee_id: "controller" };
  if (/\b(tax|filing|1099|w2|deduction|return)\b/.test(p))                                       return { team: "finance-team", employee_id: "tax-manager" };
  if (/\b(forecast|budget|fp&a|projection|model)\b/.test(p))                                     return { team: "finance-team", employee_id: "fpa-analyst" };
  if (/\b(cash|treasury|wire|transfer|liquidity)\b/.test(p))                                     return { team: "finance-team", employee_id: "treasurer" };
  if (/\b(credit|underwrit|loan|debt|borrower)\b/.test(p))                                       return { team: "finance-team", employee_id: "credit-underwriter" };

  // ── Legal ──
  if (/\b(contract|nda|msa|sow|liability)\b/.test(p))                                            return { team: "legal-team", employee_id: "contracts-attorney" };
  if (/\b(ip|trademark|patent|copyright)\b/.test(p))                                             return { team: "legal-team", employee_id: "ip-counsel" };
  if (/\b(compliance|gdpr|ccpa|hipaa|privacy)\b/.test(p))                                        return { team: "legal-team", employee_id: "compliance-officer" };
  if (/\b(terms|tos|privacy policy|legal notice|disclaimer)\b/.test(p))                          return { team: "legal-team", employee_id: "corporate-counsel" };

  // ── Marketing ──
  if (/\b(seo|search|google|ranking|keyword|backlink)\b/.test(p))                                return { team: "marketing-team", employee_id: "seo-specialist" };
  if (/\b(ad|paid|meta|facebook|instagram|google ads|campaign|funnel|cac|roas)\b/.test(p))       return { team: "marketing-team", employee_id: "performance-marketing" };
  if (/\b(content|blog|article|newsletter|landing)\b/.test(p))                                   return { team: "marketing-team", employee_id: "content-strategist" };
  if (/\b(pr|press|announce|launch|outreach)\b/.test(p))                                         return { team: "marketing-team", employee_id: "pr-comms" };
  if (/\b(brand|positioning|messaging|narrative)\b/.test(p))                                     return { team: "marketing-team", employee_id: "brand-strategist" };

  // ── Sales ──
  if (/\b(enterprise|big deal|6.?fig|7.?fig|key account)\b/.test(p))                             return { team: "sales-team", employee_id: "enterprise-sales" };
  if (/\b(churn|renewal|expansion|csm|customer success)\b/.test(p))                              return { team: "sales-team", employee_id: "customer-success" };
  if (/\b(partner|reseller|integration deal|channel)\b/.test(p))                                 return { team: "sales-team", employee_id: "partnerships" };
  if (/\b(sales|deal|pipeline|prospect|lead|cold|outbound)\b/.test(p))                           return { team: "sales-team", employee_id: "account-manager" };

  // ── People ──
  if (/\b(travel|flight|hotel|trip|itinerary)\b/.test(p))                                        return { team: "people-team", employee_id: "travel-planner" };
  if (/\b(hire|hiring|recruit|candidate|interview)\b/.test(p))                                   return { team: "people-team", employee_id: "recruiter" };
  if (/\b(payroll|benefits|hr compliance|i9|i.?9)\b/.test(p))                                    return { team: "people-team", employee_id: "hr-compliance" };
  if (/\b(culture|onboard team|values|kristie)\b/.test(p))                                       return { team: "people-team", employee_id: "culture-ld" };

  // ── Product ──
  if (/\bkronos.+(spec|prd|feature|roadmap)\b|\b(spec|prd|feature|roadmap).+kronos\b/.test(p))   return { team: "product-team", employee_id: "pm-kronos" };
  if (/\bolldae.+(spec|prd|feature|roadmap)\b|\b(spec|prd|feature|roadmap).+olldae\b/.test(p))   return { team: "product-team", employee_id: "pm-olldae" };
  if (/\b(user research|usability|interview users|user test)\b/.test(p))                         return { team: "product-team", employee_id: "ux-researcher" };
  if (/\b(product design|prototype|ui spec|interaction)\b/.test(p))                              return { team: "product-team", employee_id: "product-designer" };

  // ── Data ──
  if (/\b(price|pricing|repricing|increase|cpi|markup)\b/.test(p))                               return { team: "data-team", employee_id: "pricing-analyst" };
  if (/\b(dashboard|chart|metric|kpi|bi|tableau|looker|hex)\b/.test(p))                          return { team: "data-team", employee_id: "bi-engineer" };
  if (/\b(model.+ml|xgboost|tensorflow|pytorch|prediction|inference)\b/.test(p))                 return { team: "data-team", employee_id: "data-scientist" };
  if (/\b(etl|pipeline data|warehouse|snowflake|airflow|dbt)\b/.test(p))                         return { team: "data-team", employee_id: "data-engineer" };
  if (/\b(analytics|funnel analysis|cohort|retention|telemetry)\b/.test(p))                      return { team: "data-team", employee_id: "data-analyst" };

  // ── C-suite escalations ──
  if (/\b(strategy|vision|pivot|raise|fundrais|pitch|investor|board)\b/.test(p))                 return { team: "c-suite", employee_id: "ceo" };
  if (/\b(architecture|stack|tech debt|infrastructure)\b/.test(p))                               return { team: "c-suite", employee_id: "cto" };
  if (/\b(brand voice|positioning|go.?to.?market|gtm)\b/.test(p))                                return { team: "c-suite", employee_id: "cmo" };
  if (/\b(financ|cfo|funding|burn|runway)\b/.test(p))                                            return { team: "c-suite", employee_id: "cfo" };
  if (/\b(operations|coo|process|workflow)\b/.test(p))                                            return { team: "c-suite", employee_id: "coo" };
  if (/\b(data strategy|cdo|data governance)\b/.test(p))                                          return { team: "c-suite", employee_id: "cdo" };

  // Default: dashboard chat is the chief-of-staff inbox
  return { team: "c-suite", employee_id: "chief-of-staff" };
}

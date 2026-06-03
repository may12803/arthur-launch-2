import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";
import { computeCosts } from "@/app/_data/stack";

export const runtime = "nodejs";

const DONE = ["completed", "done", "cancelled", "archived"];

// Aggregates the real numbers behind the dashboard "At a glance" rail.
// Every field is sourced or null — no fabricated values. Degrades gracefully:
// if Supabase is unreachable the DB-backed fields return null (UI shows "—"),
// never a 500. Chase has no in-app feed → always null → UI shows "connect".
export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let db: ReturnType<typeof getSupabaseAdmin> | null = null;
  try { db = getSupabaseAdmin(); } catch { db = null; }

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const noDb = Promise.resolve({ data: null, count: null, error: "no-db" as const });

  const [goalsR, unreadR, seriesR, spend] = await Promise.allSettled([
    db ? db.from("arthur_goals").select("status").neq("status", "archived") : noDb,
    db ? db.from("arthur_inbox_emails")
          .select("id", { count: "exact", head: true })
          .eq("direction", "inbound").eq("is_archived", false).eq("is_deleted", false) : noDb,
    db ? db.from("arthur_inbox_emails")
          .select("created_at")
          .eq("direction", "inbound").eq("is_archived", false).eq("is_deleted", false)
          .gte("created_at", since) : noDb,
    Promise.resolve(computeCosts()),
  ]);

  let goalsActive: number | null = null;
  if (goalsR.status === "fulfilled" && !(goalsR.value as { error?: unknown }).error) {
    goalsActive = ((goalsR.value.data ?? []) as { status?: string }[]).filter(
      (g) => !DONE.includes((g.status ?? "").toLowerCase())
    ).length;
  }

  let inboxUnread: number | null = null;
  if (unreadR.status === "fulfilled" && !(unreadR.value as { error?: unknown }).error) {
    inboxUnread = (unreadR.value as { count?: number }).count ?? 0;
  }

  let inboxSeries: number[] = [];
  if (seriesR.status === "fulfilled" && !(seriesR.value as { error?: unknown }).error) {
    const buckets = new Array(7).fill(0);
    for (const row of ((seriesR.value.data ?? []) as { created_at: string }[])) {
      const days = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000);
      buckets[6 - Math.min(6, Math.max(0, days))]++;
    }
    inboxSeries = buckets;
  }

  const costs = spend.status === "fulfilled" ? spend.value : { monthly: 0, daily: 0, hasData: false };

  return NextResponse.json({
    goals: { active: goalsActive },
    inbox: { unread: inboxUnread, series: inboxSeries },
    spend: { monthly: costs.monthly, daily: costs.daily, hasData: costs.hasData },
    chase: { balance: null, source: null },
    generated_at: new Date().toISOString(),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ToastRollupRow {
  month: string;
  net_sales: number | null;
  gross_sales: number | null;
  tax: number | null;
  tips: number | null;
  gratuity: number | null;
  transaction_count: number | null;
  days_included: number | null;
  by_payment: Record<string, number> | null;
  updated_at: string;
}

function loadToastRollupFromFile(month: string): ToastRollupRow | null {
  try {
    const p = path.join(
      process.env.HOME || "/Users/danielmay",
      ".arthur/data/dabney/toast-rollup/monthly",
      `${month}.json`
    );
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    const sub = (raw?.xero_entries as Array<Record<string, unknown>>)?.find((e) => e.type === "Deposits");
    const totals = sub?.subtotals as Record<string, number> | undefined;
    return {
      month,
      net_sales: totals?.net_sales ?? null,
      gross_sales: totals?.gross_sales ?? null,
      tax: totals?.tax ?? null,
      tips: totals?.tips ?? null,
      gratuity: totals?.gratuity ?? null,
      transaction_count: (raw?.transaction_count as number) ?? null,
      days_included: (raw?.days_included as number) ?? null,
      by_payment: (sub?.by_payment_type as Record<string, number>) ?? null,
      updated_at: (raw?.generated_at as string) ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function loadToastRollupFromSupabase(month: string): Promise<ToastRollupRow | null> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("arthur_toast_rollup")
      .select("*")
      .eq("month", month)
      .single();
    if (error || !data) return null;
    return data as ToastRollupRow;
  } catch {
    return null;
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "MTD";

  const month = currentMonth();

  // Try file first (local), then Supabase (Fly / any environment)
  let rollup = loadToastRollupFromFile(month);
  if (!rollup) {
    rollup = await loadToastRollupFromSupabase(month);
  }

  const grossRevenue = rollup?.net_sales ?? null;
  const taxCollected = rollup?.tax ?? null;
  const tips = rollup?.tips ?? null;
  const gratuity = rollup?.gratuity ?? null;
  const transactionCount = rollup?.transaction_count ?? null;
  const daysIncluded = rollup?.days_included ?? null;
  const byPayment = rollup?.by_payment ?? null;

  // Recent transactions from arthur_inbox_emails (payment notifications)
  let recentTransactions: Array<Record<string, unknown>> = [];
  let monthlySpend = 0;
  try {
    const db = getSupabaseAdmin();
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const { data: txRows } = await db
      .from("arthur_inbox_emails")
      .select("id,from_name,subject,received_at,amount_usd,category")
      .not("amount_usd", "is", null)
      .gte("received_at", since.toISOString())
      .order("received_at", { ascending: false })
      .limit(20);

    if (txRows && txRows.length > 0) {
      recentTransactions = txRows.map((r) => ({
        date: new Date(r.received_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" }),
        vendor: r.from_name || "Unknown",
        category: r.category || "Other",
        amount: (r.amount_usd ?? 0) > 0 ? `+$${r.amount_usd}` : `-$${Math.abs(r.amount_usd ?? 0)}`,
        rawAmount: r.amount_usd as number,
        entity: "DABNEY",
        color: (r.amount_usd ?? 0) > 0 ? "#22c55e" : "#f97316",
      }));
      monthlySpend = txRows
        .filter((r) => (r.amount_usd ?? 0) < 0)
        .reduce((sum, r) => sum + Math.abs(r.amount_usd ?? 0), 0);
    }
  } catch {
    // graceful degrade
  }

  return NextResponse.json({
    source: rollup ? "toast-sftp" : "no-data",
    month,
    range,
    revenue: {
      gross: grossRevenue,
      tax: taxCollected,
      tips,
      gratuity,
      transaction_count: transactionCount,
      days_included: daysIncluded,
      by_payment: byPayment,
    },
    spend: {
      monthly: monthlySpend,
    },
    transactions: recentTransactions,
    generated_at: new Date().toISOString(),
  });
}

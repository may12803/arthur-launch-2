import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

// GET /api/subs — list all subscriptions with monthly cost total
export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("arthur_subscriptions")
    .select("*")
    .order("status")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const active = (data ?? []).filter(s => s.status === "active");
  const monthlyTotal = active.reduce((sum, s) => {
    const monthly = s.billing_cycle === "yearly" ? s.amount_usd / 12 : s.amount_usd;
    return sum + monthly;
  }, 0);

  return NextResponse.json({ subscriptions: data ?? [], monthly_total_usd: monthlyTotal });
}

// POST /api/subs — add a subscription manually
export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { name, vendor, amount_usd, billing_cycle, next_charge_iso, notes } = body;

  if (!name || !vendor || amount_usd == null) {
    return NextResponse.json({ error: "name, vendor, amount_usd required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_subscriptions")
    .insert({
      name,
      vendor,
      amount_usd,
      billing_cycle:   billing_cycle ?? "monthly",
      next_charge_iso: next_charge_iso ?? null,
      notes:           notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscription: data });
}

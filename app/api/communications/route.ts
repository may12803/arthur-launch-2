/**
 * GET /api/communications — list arthur_communications with filters.
 * Mirrors /api/legal/route.ts pattern.
 * Public read from same-origin browser; mutations require Bearer.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const channel   = searchParams.get("channel") ?? "";
  const direction = searchParams.get("direction") ?? "";
  const entity    = searchParams.get("entity") ?? "";
  const category  = searchParams.get("category") ?? "";
  const q         = searchParams.get("q") ?? "";
  const period    = searchParams.get("period") ?? "all"; // today | 7d | 30d | all
  const limit     = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 500);
  const offset    = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const db = getSupabaseAdmin();

  // Compute date cutoff for period filter
  let since: string | null = null;
  const now = Date.now();
  if (period === "today") {
    since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  } else if (period === "7d") {
    since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (period === "30d") {
    since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Build query
  let query = db
    .from("arthur_communications")
    .select("*")
    .order("ts", { ascending: false })
    .range(offset, offset + limit - 1);

  if (channel)   query = query.eq("channel", channel);
  if (direction) query = query.eq("direction", direction);
  if (entity)    query = query.eq("entity", entity);
  if (category)  query = query.eq("category", category);
  if (since)     query = query.gte("ts", since);
  if (q) {
    const like = `%${q}%`;
    query = query.or(`from_address.ilike.${like},to_address.ilike.${like},subject.ilike.${like},body.ilike.${like}`);
  }

  // Count query (separate)
  let countQuery = db
    .from("arthur_communications")
    .select("id", { count: "exact", head: true });

  if (channel)   countQuery = countQuery.eq("channel", channel);
  if (direction) countQuery = countQuery.eq("direction", direction);
  if (entity)    countQuery = countQuery.eq("entity", entity);
  if (category)  countQuery = countQuery.eq("category", category);
  if (since)     countQuery = countQuery.gte("ts", since);
  if (q) {
    const like = `%${q}%`;
    countQuery = countQuery.or(`from_address.ilike.${like},to_address.ilike.${like},subject.ilike.${like},body.ilike.${like}`);
  }

  const [{ data: rows, error: rowsErr }, { count, error: countErr }] = await Promise.all([
    query,
    countQuery,
  ]);

  if (rowsErr)  return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  return NextResponse.json(
    { rows: rows ?? [], total: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}

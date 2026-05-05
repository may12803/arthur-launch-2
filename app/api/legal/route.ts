import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const entity          = searchParams.get("entity") ?? "";
  const category        = searchParams.get("category") ?? "";
  const q               = searchParams.get("q") ?? "";
  const expiringInDays  = searchParams.get("expiring_in_days");
  const archived        = searchParams.get("archived") === "true";
  const limit           = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset          = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const db = getSupabaseAdmin();

  // ── parallel counts — driven entirely by data, no hardcoded lists ────────────
  const [entityCountsRes, categoryCountsRes, expiringRes] = await Promise.all([
    db.rpc("legal_entity_counts"),
    db.rpc("legal_category_counts"),
    db.from("legal_documents")
      .select("id", { count: "exact", head: true })
      .eq("is_archived", false)
      .not("expires_at", "is", null)
      .lte("expires_at", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
  ]);

  // Fall back to in-memory aggregation if RPCs aren't available yet
  let entities: Array<{ entity: string; count: number }> = [];
  let categories: Array<{ category: string; count: number }> = [];

  if (entityCountsRes.error || !entityCountsRes.data) {
    // Fallback: fetch all entity values and aggregate
    const { data: eRows } = await db
      .from("legal_documents")
      .select("entity")
      .eq("is_archived", false)
      .not("entity", "is", null);
    const emap: Record<string, number> = {};
    for (const row of eRows ?? []) {
      if (row.entity) emap[row.entity] = (emap[row.entity] ?? 0) + 1;
    }
    entities = Object.entries(emap)
      .map(([entity, count]) => ({ entity, count }))
      .sort((a, b) => b.count - a.count);
  } else {
    entities = (entityCountsRes.data as Array<{ entity: string; count: number }>)
      .filter(r => r.entity);
  }

  if (categoryCountsRes.error || !categoryCountsRes.data) {
    const { data: cRows } = await db
      .from("legal_documents")
      .select("category")
      .eq("is_archived", false)
      .not("category", "is", null);
    const cmap: Record<string, number> = {};
    for (const row of cRows ?? []) {
      if (row.category) cmap[row.category] = (cmap[row.category] ?? 0) + 1;
    }
    categories = Object.entries(cmap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  } else {
    categories = (categoryCountsRes.data as Array<{ category: string; count: number }>)
      .filter(r => r.category);
  }

  // Legacy by_entity / by_category maps (keep for backward compat with existing UI reads)
  const byEntity: Record<string, number> = {};
  for (const e of entities) byEntity[e.entity] = e.count;
  const byCategory: Record<string, number> = {};
  for (const c of categories) byCategory[c.category] = c.count;

  // ── main query ───────────────────────────────────────────────────────────────
  let countQ = db
    .from("legal_documents")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", archived);

  let rowsQ = db
    .from("legal_documents")
    .select(
      "id,entity,category,title,description,storage_path,file_name,mime_type,size_bytes,effective_date,expires_at,parties,uploaded_at,uploaded_by,last_accessed_at,is_archived,metadata,extraction_status,extraction_error"
    )
    .eq("is_archived", archived)
    .order("uploaded_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (entity) {
    countQ = countQ.eq("entity", entity);
    rowsQ  = rowsQ.eq("entity", entity);
  }
  if (category) {
    countQ = countQ.eq("category", category);
    rowsQ  = rowsQ.eq("category", category);
  }
  if (expiringInDays) {
    const days = parseInt(expiringInDays, 10);
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    countQ = countQ.not("expires_at", "is", null).lte("expires_at", cutoff);
    rowsQ  = rowsQ.not("expires_at", "is", null).lte("expires_at", cutoff);
  }
  if (q) {
    const like = `%${q}%`;
    countQ = countQ.or(`title.ilike.${like},description.ilike.${like},full_text.ilike.${like}`);
    rowsQ  = rowsQ.or(`title.ilike.${like},description.ilike.${like},full_text.ilike.${like}`);
  }

  const [{ count, error: countErr }, { data, error: rowsErr }] = await Promise.all([
    countQ,
    rowsQ,
  ]);

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
  if (rowsErr)  return NextResponse.json({ error: rowsErr.message  }, { status: 500 });

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    entities,
    categories,
    counts: {
      by_entity: byEntity,
      by_category: byCategory,
      expiring_soon: expiringRes.count ?? 0,
    },
  });
}

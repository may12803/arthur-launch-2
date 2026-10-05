import { NextRequest, NextResponse } from "next/server";
import { getApiContext } from "@/lib/client-portal/api";
import { UPLOAD_TARGETS, neutralizeCell } from "@/lib/client-portal/connector-ui";
import { clip, dbFail, isMemberRole } from "@/lib/client-portal/connector-api";

export const runtime = "nodejs";

const MAX_ROWS = 50_000;
const MAX_BYTES = 20 * 1024 * 1024;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

function parseDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
  else if ((m = s.match(/^(\d{1,2})\s([A-Za-z]{3})[a-z]*\s(\d{4})$/))) { d = +m[1]; mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

function parseNumber(v: string): number | null {
  const s = v.trim().replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

// Receives a parsed, mapped file. The browser reads CSV/XLSX locally; this route re-validates every cell on the server
// (the client is never trusted), neutralizes formula-injection prefixes, and records the mapping and the clean rows
// through connection_upload_mapping. Rows that fail validation are reported with their row number and are not imported.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isMemberRole(ctx.role)) return NextResponse.json({ error: "Viewers cannot upload data." }, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) return NextResponse.json({ error: "That file is larger than 20 MB. Split it by month and upload each part." }, { status: 413 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "The upload could not be read." }, { status: 400 });
  const target = UPLOAD_TARGETS.find((t) => t.id === body.target_object);
  if (!target) return NextResponse.json({ error: "Choose what this file contains." }, { status: 400 });
  const columns: string[] = Array.isArray(body.columns) ? body.columns.map((c: unknown) => clip(c, 120)) : [];
  const rows: unknown[] = Array.isArray(body.rows) ? body.rows : [];
  const mapping: Record<string, string> = body.mapping && typeof body.mapping === "object" ? body.mapping : {};
  if (!columns.length || !rows.length) return NextResponse.json({ error: "The file has no rows to import." }, { status: 400 });
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Files are limited to ${MAX_ROWS.toLocaleString("en-US")} rows. Split this one and upload each part.` }, { status: 413 });

  const fieldIdx: { key: string; idx: number; type: string; required: boolean; label: string }[] = [];
  for (const f of target.fields) {
    const col = mapping[f.key];
    const idx = col == null ? -1 : columns.indexOf(col);
    if (idx < 0) {
      if (f.required) return NextResponse.json({ error: `Map a column to "${f.label}" before importing.` }, { status: 400 });
      continue;
    }
    fieldIdx.push({ key: f.key, idx, type: f.type, required: !!f.required, label: f.label });
  }

  const clean: Record<string, string | number | null>[] = [];
  const errors: { row: number; field: string; message: string }[] = [];
  let skipped = 0;
  rows.forEach((raw, i) => {
    const r = Array.isArray(raw) ? raw : [];
    const out: Record<string, string | number | null> = {};
    let bad = false;
    for (const f of fieldIdx) {
      const v = String(r[f.idx] ?? "").trim();
      if (!v) {
        if (f.required) { bad = true; if (errors.length < 200) errors.push({ row: i + 2, field: f.label, message: "Required and empty" }); }
        out[f.key] = null;
        continue;
      }
      if (f.type === "date") {
        const d = parseDate(v);
        if (!d) { bad = true; if (errors.length < 200) errors.push({ row: i + 2, field: f.label, message: `"${v.slice(0, 30)}" is not a valid date` }); }
        out[f.key] = d;
      } else if (f.type === "number") {
        const n = parseNumber(v);
        if (n == null) { bad = true; if (errors.length < 200) errors.push({ row: i + 2, field: f.label, message: `"${v.slice(0, 30)}" is not a number` }); }
        out[f.key] = n;
      } else out[f.key] = neutralizeCell(v.slice(0, 500));
    }
    if (bad) skipped++; else clean.push(out);
  });

  const { data, error } = await ctx.supabase.rpc("connection_upload_mapping", {
    p_tenant: ctx.tenantId,
    p_file_name: clip(body.file_name, 200) || "upload",
    p_target_object: target.id,
    p_mapping: mapping,
    p_row_count: clean.length,
    p_rows: clean,
    p_skipped: skipped,
  });
  if (error) return dbFail(error.message, "Could not import the file");
  return NextResponse.json({ ok: true, upload_id: data ?? null, row_count: rows.length, imported: clean.length, skipped, errors: errors.slice(0, 50), more_errors: Math.max(0, skipped - 50) });
}

import { NextRequest, NextResponse } from "next/server";
import { clientIp, getApiContext, MAX_DOCUMENT_BYTES } from "@/lib/client-portal/api";
import { loveleedayAnon } from "@/lib/client-portal/anon";
import { UPLOAD_TARGETS } from "@/lib/client-portal/connector-ui";
import { connectorsServerSecret, dbFail, isMemberRole } from "@/lib/client-portal/connector-api";
import { parseUpload, UploadError } from "@/lib/connectors/upload/parse";
import { applyMapping, fileSha256, type FieldType, type TargetField } from "@/lib/connectors/upload/map";

export const runtime = "nodejs";

const CHUNK = 5000; // ingest_records takes at most 5000 records per call
const FIELD_TYPE: Record<string, FieldType> = { date: "date", number: "number" };

// Receives the original file with its column mapping. The server is the authority: it re-parses the file with the
// connector library (formula-injection guard, size and row limits), re-validates every cell, then
//   1. seals the file as a document (document_upload),
//   2. records the mapping (connection_upload_mapping),
//   3. ingests the clean rows idempotently under a sync run on the tenant's csv-excel-upload connection, so the same
//      file uploaded twice adds nothing (ingest_records dedupes on connection, object, source_ref and content hash).
// Rows that fail validation are reported with their row number and are not ingested.
export async function POST(req: NextRequest) {
  const ctx = await getApiContext();
  if (ctx.error) return ctx.error;
  if (!isMemberRole(ctx.role)) return NextResponse.json({ error: "Viewers cannot upload data." }, { status: 403 });
  const secret = connectorsServerSecret();
  if (!secret) return NextResponse.json({ error: "Data import is not configured on the server yet." }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: "That file is larger than 20 MB. Split it by month and upload each part." }, { status: 413 });

  const target = UPLOAD_TARGETS.find((t) => t.id === form.get("target_object"));
  if (!target) return NextResponse.json({ error: "Choose what this file contains." }, { status: 400 });
  let byField: Record<string, string>;
  try { byField = JSON.parse(String(form.get("mapping") || "{}")); } catch { return NextResponse.json({ error: "The column mapping could not be read." }, { status: 400 }); }
  const mapping: Record<string, string> = {}; // header text -> target field, the shape the library wants
  for (const [field, column] of Object.entries(byField)) if (typeof column === "string" && target.fields.some((f) => f.key === field)) mapping[column] = field;
  const fields: TargetField[] = target.fields.map((f) => ({ name: f.key, type: FIELD_TYPE[f.type] ?? "string", required: !!f.required }));

  const bytes = Buffer.from(await file.arrayBuffer());
  let result;
  try {
    const table = parseUpload(bytes, file.name);
    result = applyMapping({ table, mapping, fields, targetObject: target.id, fileSha256: fileSha256(bytes), sourceSystem: "csv-excel-upload", rejectFormulas: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof UploadError ? e.message : "That file could not be read." }, { status: 400 });
  }
  if (result.mappingErrors.length) return NextResponse.json({ error: result.mappingErrors.join(". ") + "." }, { status: 400 });
  if (!result.records.length) return NextResponse.json({ error: "No row in the file passed validation, so nothing was imported.", errors: result.errors.slice(0, 50) }, { status: 400 });

  // The upload connection: one per company, created on first use.
  const findConn = () => ctx.supabase.from("tenant_connections").select("id").eq("tenant_id", ctx.tenantId).eq("connector_key", "csv-excel-upload").maybeSingle<{ id: string }>();
  let conn = await findConn();
  if (conn.error) return dbFail(conn.error.message, "Could not read the upload connection");
  if (!conn.data) {
    const made = await ctx.supabase.rpc("connection_request", { p_tenant: ctx.tenantId, p_connector: "csv-excel-upload", p_kind: "request" });
    if (made.error) return dbFail(made.error.message, "Could not prepare the upload connection");
    conn = await findConn();
    if (conn.error || !conn.data) return NextResponse.json({ error: "The upload connection could not be prepared." }, { status: 500 });
  }

  const doc = await ctx.supabase.rpc("document_upload", { p_tenant: ctx.tenantId, p_name: file.name.slice(0, 255), p_content_type: file.type || "application/octet-stream", p_data_b64: bytes.toString("base64"), p_ip: clientIp(req) });
  if (doc.error) return dbFail(doc.error.message, "Could not store the file");
  const map = await ctx.supabase.rpc("connection_upload_mapping", { p_tenant: ctx.tenantId, p_document: doc.data as string, p_target_object: target.id, p_mapping: mapping, p_row_count: result.records.length });
  if (map.error) return dbFail(map.error.message, "Could not save the mapping");

  const anon = loveleedayAnon();
  const run = await anon.rpc("sync_run_start", { p_secret: secret, p_connection: conn.data.id, p_object: target.id });
  if (run.error) return dbFail(run.error.message, "Could not open an import run");
  let created = 0;
  try {
    for (let i = 0; i < result.records.length; i += CHUNK) {
      const slice = result.records.slice(i, i + CHUNK).map((r) => ({ object: r.object, source_ref: r.source_ref, payload: r.payload, observed_at: r.observed_at }));
      const ing = await anon.rpc("ingest_records", { p_secret: secret, p_run: run.data as string, p_records: slice });
      if (ing.error) throw new Error(ing.error.message);
      created += Number(ing.data ?? 0);
    }
    await anon.rpc("sync_run_finish", { p_secret: secret, p_run: run.data as string, p_status: "succeeded", p_rows_read: result.records.length, p_rows_written: created, p_error: null, p_cursor_after: null });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "ingest failed";
    await anon.rpc("sync_run_finish", { p_secret: secret, p_run: run.data as string, p_status: "failed", p_rows_read: null, p_rows_written: null, p_error: message, p_cursor_after: null });
    return NextResponse.json({ error: `The rows were validated and the mapping saved, but importing them failed: ${message}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    upload_id: map.data ?? null,
    document_id: doc.data ?? null,
    row_count: result.rowsTotal,
    imported: created,
    unchanged: result.records.length - created,
    skipped: result.rowsTotal - result.records.length,
    warnings: result.warnings.length,
    errors: result.errors.slice(0, 50).map((e) => ({ row: e.row, field: e.field ?? "", message: e.message })),
    more_errors: Math.max(0, result.errors.length - 50),
  });
}

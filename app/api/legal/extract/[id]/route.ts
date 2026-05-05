import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

// Auth: Bearer ${AUTOMATION_SECRET}

const EXTRACTION_PROMPT = `Extract the following from this legal document. Reply with EXACTLY this JSON shape and nothing else — no markdown fences, no extra keys:
{
  "entity": "short snake_case identifier for the company this document belongs to (e.g. aspen_may, loveleeday, dabney_co, olldae, marqin, revene, backstaj, personal). Infer from party names, signatures, mailing addresses, company names in the document. If truly unclear use 'unknown'.",
  "category": "one of: formation | operating_agreement | ein | tax_filing | contract | sow | nda | license | liquor_license | insurance | banking | hr | correspondence | other",
  "title": "concise human-readable title, e.g. 'Aspen & May LLC — Operating Agreement' or 'LOVELEEDAY Studios — DE Certificate of Formation'",
  "description": "one paragraph plain-English summary of what this document is and what it does",
  "parties": [{"name": "...", "role": "..."}],
  "effective_date": "YYYY-MM-DD or null",
  "expires_at": "YYYY-MM-DD or null",
  "document_type": "same as category above",
  "amounts": [{"value": 0, "currency": "USD", "context": "..."}],
  "key_dates": [{"date": "YYYY-MM-DD", "type": "...", "description": "..."}],
  "summary": "one paragraph"
}`;

// ── Filename parsing ──────────────────────────────────────────────────────────
// Parses signals like: "04-20-26 - DE - Formation Document - Aspen & May Group LLC.pdf"

const CATEGORY_KEYWORD_MAP: Record<string, string> = {
  "formation document":        "formation",
  "certificate of formation":  "formation",
  "articles of incorporation": "formation",
  "articles of organization":  "formation",
  "operating agreement":       "operating_agreement",
  "bylaws":                    "operating_agreement",
  "ein":                       "ein",
  "employer identification":   "ein",
  "tax return":                "tax_filing",
  "tax filing":                "tax_filing",
  "1065":                      "tax_filing",
  "k-1":                       "tax_filing",
  "nda":                       "nda",
  "non-disclosure":            "nda",
  "non disclosure":            "nda",
  "lease":                     "contract",
  "contract":                  "contract",
  "agreement":                 "contract",
  "sow":                       "sow",
  "statement of work":         "sow",
  "invoice":                   "correspondence",
  "receipt":                   "correspondence",
  "license":                   "license",
  "liquor":                    "liquor_license",
  "insurance":                 "insurance",
  "banking":                   "banking",
};

const STATE_CODES = new Set(["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"]);

interface FilenameHints {
  entity?: string;
  category?: string;
  state?: string;
  effective_date?: string;
}

function parseFilename(fileName: string): FilenameHints {
  const hints: FilenameHints = {};
  // Strip extension
  const base = fileName.replace(/\.[^/.]+$/, "");
  const lower = base.toLowerCase();

  // Category: scan keyword map
  for (const [kw, cat] of Object.entries(CATEGORY_KEYWORD_MAP)) {
    if (lower.includes(kw)) {
      hints.category = cat;
      break;
    }
  }

  // Date: MM-DD-YY or MM-DD-YYYY at start e.g. "04-20-26" or "04-20-2026"
  const dateMatch = base.match(/^(\d{2})-(\d{2})-(\d{2,4})/);
  if (dateMatch) {
    const [, mm, dd, yy] = dateMatch;
    const year = yy.length === 2 ? `20${yy}` : yy;
    hints.effective_date = `${year}-${mm}-${dd}`;
  }

  // State: standalone 2-letter token between delimiters
  const tokens = base.split(/[\s\-–—_]+/);
  for (const tok of tokens) {
    const upper = tok.trim().toUpperCase();
    if (STATE_CODES.has(upper) && upper.length === 2) {
      hints.state = upper;
      break;
    }
  }

  // Entity: look for known entity patterns (anything with LLC/Inc/Corp/Group/Studios/Co)
  const entityMatch = base.match(/([A-Z][A-Za-z&\s]+(?:LLC|Inc|Corp|Group LLC|Studios|Co\.?|Group))/);
  if (entityMatch) {
    const raw = entityMatch[1].trim();
    hints.entity = raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_llc$|_inc$|_corp$|_co$/, "");
  }

  return hints;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth gate
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getSupabaseAdmin();

  // Mark as extracting
  await db.from("legal_documents").update({ extraction_status: "extracting" }).eq("id", id);

  // Fetch document row
  const { data: doc, error: docErr } = await db
    .from("legal_documents")
    .select("*")
    .eq("id", id)
    .single();

  if (docErr) {
    const status = docErr.code === "PGRST116" ? 404 : 500;
    await db.from("legal_documents").update({ extraction_status: "failed", extraction_error: docErr.message }).eq("id", id);
    return NextResponse.json({ error: docErr.message }, { status });
  }

  // Download file from bucket
  const { data: fileData, error: dlErr } = await db.storage
    .from("arthur-legal-vault")
    .download(doc.storage_path);

  if (dlErr || !fileData) {
    const msg = dlErr?.message ?? "could not download file from storage";
    console.error("[legal/extract] download error:", dlErr);
    await db.from("legal_documents").update({ extraction_status: "failed", extraction_error: msg }).eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Extract text
  let full_text = "";
  const mime = doc.mime_type ?? "";

  if (mime === "application/pdf" || doc.file_name?.endsWith(".pdf")) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const parsed = await pdfParse(buffer);
      full_text = parsed.text ?? "";
    } catch (e) {
      console.error("[legal/extract] pdf-parse error:", e);
      full_text = "";
    }
  } else if (
    mime === "text/plain" ||
    mime === "text/markdown" ||
    doc.file_name?.endsWith(".txt") ||
    doc.file_name?.endsWith(".md")
  ) {
    full_text = await fileData.text();
  } else {
    // TODO: add OCR for image types (png, jpeg, heic, webp) in v2 via tesseract or vision API
    console.log(`[legal/extract] skipping text extraction for mime type: ${mime}`);
  }

  // ── Parse filename for fallback signals ──────────────────────────────────────
  const filenameHints = parseFilename(doc.file_name ?? "");
  console.log("[legal/extract] filename hints:", filenameHints);

  // ── Call Anthropic Haiku for structured extraction ────────────────────────
  let extracted: {
    entity?: string;
    category?: string;
    title?: string;
    description?: string;
    parties?: Array<{ name: string; role: string }>;
    effective_date?: string | null;
    expires_at?: string | null;
    document_type?: string;
    amounts?: Array<{ value: number; currency: string; context: string }>;
    key_dates?: Array<{ date: string; type: string; description: string }>;
    summary?: string;
  } = {};

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const hasText = full_text.length > 0;

  if (anthropicKey && hasText) {
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const snippet = full_text.slice(0, 6000);
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        temperature: 0,
        system: EXTRACTION_PROMPT,
        messages: [
          {
            role: "user",
            content: `Document filename: ${doc.file_name ?? "unknown"}\n\nDocument text:\n\n${snippet}`,
          },
        ],
      });

      const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      try {
        extracted = JSON.parse(cleaned);
      } catch {
        console.error("[legal/extract] Haiku JSON parse error — raw:", raw.slice(0, 200));
      }
    } catch (e) {
      console.error("[legal/extract] Anthropic Haiku fetch error:", e);
    }
  } else if (anthropicKey && !hasText) {
    // No body text — try extraction from filename only via Haiku
    console.log("[legal/extract] no body text, using filename-only extraction via Haiku");
    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        temperature: 0,
        system: EXTRACTION_PROMPT,
        messages: [
          {
            role: "user",
            content: `Document filename: ${doc.file_name ?? "unknown"}\n\n(No body text available — infer from filename only.)`,
          },
        ],
      });
      const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      try {
        extracted = JSON.parse(cleaned);
      } catch {
        console.error("[legal/extract] Haiku (filename-only) JSON parse error — raw:", raw.slice(0, 200));
      }
    } catch (e) {
      console.error("[legal/extract] Haiku filename-only fetch error:", e);
    }
  } else if (!anthropicKey) {
    console.warn("[legal/extract] ANTHROPIC_API_KEY not set — using filename hints only");
  }

  // ── Merge: prefer Haiku output, fall back to filename hints ──────────────
  // Never store "unknown" or "other" if filename gave us something better
  const rawEntity = extracted.entity?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const mergedEntity =
    (rawEntity && rawEntity !== "unknown") ? rawEntity
    : (filenameHints.entity ?? null);

  const rawCategory = extracted.category;
  const mergedCategory =
    (rawCategory && rawCategory !== "other") ? rawCategory
    : (filenameHints.category ?? null);

  // If extraction gave us a date but filename gave us a better one, prefer whichever is non-null
  const mergedEffectiveDate = extracted.effective_date ?? filenameHints.effective_date ?? null;

  // Determine final entity/category/title with fallbacks
  const finalEntity   = mergedEntity || "unknown";
  const finalCategory = mergedCategory || "other";
  const finalTitle    = extracted.title || doc.file_name?.replace(/\.[^/.]+$/, "") || "Untitled Document";

  // Attach state to metadata if parsed from filename
  const stateFromFilename = filenameHints.state ?? null;

  // Build metadata update
  const metaUpdate: Record<string, unknown> = {};
  if (extracted.document_type) metaUpdate.document_type = extracted.document_type;
  if (extracted.amounts)       metaUpdate.amounts       = extracted.amounts;
  if (extracted.key_dates)     metaUpdate.key_dates     = extracted.key_dates;
  if (extracted.summary)       metaUpdate.summary       = extracted.summary;
  if (stateFromFilename)       metaUpdate.state         = stateFromFilename;

  const updatePayload: Record<string, unknown> = {
    entity:            finalEntity,
    category:          finalCategory,
    title:             finalTitle,
    description:       extracted.description || null,
    full_text:         full_text || null,
    metadata:          { ...(doc.metadata ?? {}), ...metaUpdate },
    extraction_status: "complete",
    extraction_error:  null,
  };

  if (extracted.parties && extracted.parties.length > 0) {
    updatePayload.parties = extracted.parties;
  }
  if (mergedEffectiveDate) {
    updatePayload.effective_date = mergedEffectiveDate;
  }
  if (extracted.expires_at) {
    updatePayload.expires_at = extracted.expires_at;
  }

  await db.from("legal_documents").update(updatePayload).eq("id", id);

  // Move file from _pending/<uuid>.ext → <entity>/<category>/<YYYY-MM-DD>-<slug>.ext
  const oldPath = doc.storage_path as string;
  if (oldPath.startsWith("_pending/")) {
    const ext = oldPath.includes(".") ? oldPath.split(".").pop()! : "";
    const now = new Date();
    const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const newPath = `${finalEntity}/${finalCategory}/${datePart}-${slugify(finalTitle)}${ext ? "." + ext : ""}`;

    try {
      const { error: copyErr } = await db.storage
        .from("arthur-legal-vault")
        .copy(oldPath, newPath);

      if (!copyErr) {
        // Delete old path only after successful copy
        await db.storage.from("arthur-legal-vault").remove([oldPath]);
        await db.from("legal_documents").update({ storage_path: newPath }).eq("id", id);
      } else {
        console.error("[legal/extract] storage copy error:", copyErr);
        // File stays at _pending/ — not fatal
      }
    } catch (e) {
      console.error("[legal/extract] storage move error:", e);
    }
  }

  // Audit
  void Promise.resolve(db.from("legal_document_actions").insert({
    document_id: id,
    action: "extract",
    actor: "system",
    metadata: {
      entity:            finalEntity,
      category:          finalCategory,
      parties_found:     extracted.parties?.length ?? 0,
      full_text_chars:   full_text.length,
      haiku_used:        !!anthropicKey,
      filename_hints:    filenameHints,
    },
  })).catch(() => {});

  return NextResponse.json({
    ok: true,
    entity:          finalEntity,
    category:        finalCategory,
    title:           finalTitle,
    parties:         extracted.parties?.length ?? 0,
    full_text_chars: full_text.length,
  });
}

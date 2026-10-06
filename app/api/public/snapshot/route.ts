import { NextRequest, NextResponse } from 'next/server';
import { sampleCsv } from '@/lib/snapshot/sample';
import { ApiError, PUBLIC_LIMITS, startRun } from '@/lib/snapshot/service';
import { runLimiter, uploadLimiter, withRunSlot } from '@/lib/snapshot/limits';
import { readFormWithin } from '@/lib/snapshot/body';
import { corsHeaders, deps, failure, limited, preflight } from '@/lib/snapshot/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Anonymous Free Snapshot upload. No sign-in. Form fields: file (CSV or XLSX) or sample=1 (the synthetic sample),
// optional mapping (JSON, field to column; when present the checks run now), optional as_of (YYYY-MM-DD).
// Without a mapping the response is the suggested mapping for the person to confirm: POST /api/public/snapshot/:id.
export async function POST(req: NextRequest) {
  const h = corsHeaders(req);
  try {
    const blocked = await limited(req, uploadLimiter);
    if (blocked) return blocked;
    const ctype = req.headers.get('content-type') ?? '';
    if (!ctype.includes('multipart/form-data')) throw new ApiError(415, 'Send the file as multipart/form-data.', 'unsupported_media');
    // Content-Length is required and the byte cap is enforced while reading, before any multipart parsing.
    const form = await readFormWithin(req, PUBLIC_LIMITS.maxBytes + 64 * 1024);
    const asOf = typeof form.get('as_of') === 'string' ? (form.get('as_of') as string) : undefined;
    let mapping: unknown;
    const rawMapping = form.get('mapping');
    if (typeof rawMapping === 'string' && rawMapping.trim()) {
      if (rawMapping.length > 20_000) throw new ApiError(413, 'Mapping is too large.', 'too_large');
      try { mapping = JSON.parse(rawMapping); } catch { throw new ApiError(400, 'mapping is not valid JSON.', 'bad_mapping'); }
    }
    let data: Buffer, filename: string, source: 'upload' | 'sample' = 'upload';
    if (form.get('sample') === '1') {
      const s = await sampleCsv();
      data = Buffer.from(s.text); filename = s.filename; source = 'sample';
    } else {
      const file = form.get('file');
      if (!(file instanceof File) || file.size === 0) throw new ApiError(400, 'Attach a CSV or XLSX file in the "file" field.', 'no_file');
      if (file.size > PUBLIC_LIMITS.maxBytes) throw new ApiError(413, 'That file is larger than 10 MB.', 'too_large');
      data = Buffer.from(await file.arrayBuffer());
      filename = file.name || 'upload.csv';
    }
    const body = await withRunSlot(async () => {
      if (mapping !== undefined) { const b = await limited(req, runLimiter); if (b) return b; }
      return startRun(deps(), { data, filename, source, asOf: source === 'sample' ? undefined : asOf, mapping });
    });
    if (body === 'busy') throw new ApiError(503, 'We are busy right now. Try again in a minute.', 'busy');
    if (body instanceof NextResponse) return body;
    return NextResponse.json(body, { status: 201, headers: h });
  } catch (e) {
    return failure(req, e);
  }
}

export const OPTIONS = preflight;

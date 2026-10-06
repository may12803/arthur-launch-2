// Bounded request-body read for the anonymous upload. The declared Content-Length is required (so a chunked or
// length-less body is refused up front) AND the byte cap is enforced while reading, so a false or understated length
// can never make the server buffer more than the cap. Only then is the body handed to the multipart parser.
import { ApiError } from './service.ts';

export async function readFormWithin(req: Request, maxBytes: number): Promise<FormData> {
  const raw = req.headers.get('content-length');
  if (raw === null || raw.trim() === '' || !/^\d+$/.test(raw.trim())) {
    throw new ApiError(411, 'Send the upload with a Content-Length.', 'length_required');
  }
  const declared = Number(raw);
  const tooBig = () => new ApiError(413, 'That file is larger than 10 MB.', 'too_large');
  if (declared > maxBytes) throw tooBig();
  if (!req.body) throw new ApiError(400, 'Attach a CSV or XLSX file in the "file" field.', 'no_file');

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      if (seen > maxBytes) { await reader.cancel().catch(() => {}); throw tooBig(); }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const buf = new Uint8Array(seen);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  try {
    return await new Request('http://snapshot.local/', { method: 'POST', headers: { 'content-type': req.headers.get('content-type') ?? '' }, body: buf }).formData();
  } catch {
    throw new ApiError(400, 'The upload could not be read. Send it as multipart/form-data.', 'bad_form');
  }
}

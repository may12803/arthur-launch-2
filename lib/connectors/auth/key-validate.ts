import { basicAuth } from '../http.ts';
import { HttpError } from '../types.ts';
import type { Adapter, Creds, FetchLike, ValidateResult } from '../types.ts';

/** Header for static credentials. api_key defaults to a bearer token; override with creds.header_name. */
export function staticAuthHeaders(creds: Creds, method: 'api_key' | 'basic'): Record<string, string> {
  if (method === 'basic') return { authorization: basicAuth(creds.username ?? '', creds.password ?? '') };
  if (creds.header_name) return { [creds.header_name]: creds.api_key };
  return { authorization: `Bearer ${creds.api_key}` };
}

/**
 * Per-system validation call for pasted credentials. Never stores anything, never echoes the credential:
 * failures return a status-level reason only.
 */
export async function validateCredentials(adapter: Adapter, creds: Creds, fetch: FetchLike): Promise<ValidateResult> {
  try {
    return await adapter.validate(creds, fetch);
  } catch (e) {
    if (e instanceof HttpError) {
      const why = e.status === 401 || e.status === 403 ? 'credentials rejected by the system' : e.status === 429 ? 'rate limited during validation' : `system returned HTTP ${e.status}`;
      return { ok: false, detail: why };
    }
    return { ok: false, detail: 'could not reach the system' };
  }
}

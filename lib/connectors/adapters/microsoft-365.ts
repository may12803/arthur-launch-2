import { requestJson } from '../http.ts';
import { HttpError } from '../types.ts';
import type { Adapter, Creds } from '../types.ts';
import { advance, decodeCursor, encodeCursor, entraToken, need } from './common.ts';

// Graph delta query with app-only (client credentials) tokens. Follow @odata.nextLink until @odata.deltaLink; the
// deltaLink is the cursor for the next pass. 410 Gone means the token expired: restart with a full pass.
// Graph throttling numbers are UNVERIFIED in the vendor JSON.
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'https://graph.microsoft.com/.default';

function initialUrl(object: string, creds: Creds): string {
  if (object === 'messages') {
    need(creds, 'user_id');
    return `${GRAPH}/users/${encodeURIComponent(creds.user_id)}/mailFolders/inbox/messages/delta`;
  }
  if (object === 'driveItems') {
    need(creds, 'drive_id');
    return `${GRAPH}/drives/${encodeURIComponent(creds.drive_id)}/root/delta`;
  }
  throw new Error(`microsoft-365: unknown object ${object}`);
}

export const microsoft365: Adapter = {
  key: 'microsoft-365',
  objects: ['messages', 'driveItems'],
  async validate(creds, fetch) {
    const token = await entraToken(creds, SCOPE, fetch);
    if (creds.user_id) await requestJson(fetch, `${GRAPH}/users/${encodeURIComponent(creds.user_id)}?$select=id`, { headers: { authorization: `Bearer ${token}` } });
    return { ok: true, detail: creds.user_id ? 'token issued and mailbox readable' : 'token issued (no user_id supplied to probe)', account: creds.tenant_id };
  },
  async pull(object, cursor, creds, fetch) {
    const state = decodeCursor(cursor);
    const url = state.pg ?? state.hw ?? initialUrl(object, creds);
    if (!url.startsWith(`${GRAPH}/`)) throw new Error('refusing to follow a delta link outside Microsoft Graph');
    const token = await entraToken(creds, SCOPE, fetch);
    let j: any;
    try {
      j = await requestJson(fetch, url, { headers: { authorization: `Bearer ${token}`, prefer: 'odata.maxpagesize=200' } });
    } catch (e) {
      if (e instanceof HttpError && e.status === 410) return { records: [], nextCursor: encodeCursor({}), hasMore: true };
      throw e;
    }
    const records = (j?.value ?? []).map((r: any) => ({ source_ref: String(r.id), payload: r }));
    const nextLink: string | undefined = j?.['@odata.nextLink'];
    const deltaLink: string | undefined = j?.['@odata.deltaLink'];
    return advance(state, records, deltaLink, nextLink);
  },
};

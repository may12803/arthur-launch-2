import type { FetchLike } from '../types.ts';

// Atlassian Personal Data Reporting API. Apps that store Atlassian account data must report the accountIds they hold
// on a cycle (no more than 15 days apart) and act on what comes back: "closed" = the person closed their account, delete
// everything held about them; "updated" = their profile changed, refresh or delete the stored copy.
// Spec: https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/
export const ATLASSIAN_REPORT_URL = 'https://api.atlassian.com/app/report-accounts/';
export const ATLASSIAN_REPORT_BATCH = 90; // the API accepts at most 90 accounts per request
export const ATLASSIAN_REPORT_EVERY_MS = 7 * 24 * 60 * 60 * 1000; // weekly, comfortably inside the 15-day limit

export interface AccountRow {
  connection_id: string;
  definition_key: string;
  account_id: string;
  updated_at: string | null;
}

export type AccountStatus = 'closed' | 'updated';

export interface ReportDeps {
  list(): Promise<AccountRow[]>;
  /** OAuth access token for the connection (already refreshed if it was stale), or null when none is stored. */
  tokenFor(connectionId: string): Promise<string | null>;
  /** Delete (closed) or drop-and-refetch (updated) every stored record about the account. */
  apply(accountId: string, status: AccountStatus): Promise<void>;
  fetch: FetchLike;
}

export interface ReportSummary {
  accounts: number;
  reported: number;
  closed: number;
  updated: number;
  failed: number;
  errors: string[];
}

export async function runAtlassianReport(d: ReportDeps): Promise<ReportSummary> {
  const out: ReportSummary = { accounts: 0, reported: 0, closed: 0, updated: 0, failed: 0, errors: [] };
  const rows = await d.list();
  const byConn = new Map<string, AccountRow[]>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.account_id) continue;
    const k = `${r.connection_id}\u0000${r.account_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    (byConn.get(r.connection_id) ?? byConn.set(r.connection_id, []).get(r.connection_id)!).push(r);
  }
  out.accounts = seen.size;

  for (const [conn, accts] of byConn) {
    let token: string | null;
    try {
      token = await d.tokenFor(conn);
    } catch (e) {
      token = null;
      out.errors.push(`token: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`);
    }
    if (!token) {
      out.failed += accts.length;
      out.errors.push(`no token for connection ${conn}`);
      continue;
    }
    for (let i = 0; i < accts.length; i += ATLASSIAN_REPORT_BATCH) {
      const batch = accts.slice(i, i + ATLASSIAN_REPORT_BATCH);
      const body = { accounts: batch.map((a) => ({ accountId: a.account_id, updatedAt: new Date(a.updated_at ?? 0).toISOString() })) };
      let res: Response;
      try {
        res = await d.fetch(ATLASSIAN_REPORT_URL, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (e) {
        out.failed += batch.length;
        out.errors.push(`request: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`);
        continue;
      }
      if (res.status === 204) {
        out.reported += batch.length;
        continue; // nothing closed or updated
      }
      if (!res.ok) {
        out.failed += batch.length;
        out.errors.push(`report-accounts ${res.status}`);
        continue;
      }
      let j: any;
      try {
        j = await res.json();
      } catch {
        out.failed += batch.length;
        out.errors.push('report-accounts: unreadable response');
        continue;
      }
      out.reported += batch.length;
      for (const a of Array.isArray(j?.accounts) ? j.accounts : []) {
        const status = a?.status as string;
        if ((status !== 'closed' && status !== 'updated') || typeof a?.accountId !== 'string') continue;
        try {
          await d.apply(a.accountId, status);
          if (status === 'closed') out.closed++;
          else out.updated++;
        } catch (e) {
          out.failed++;
          out.errors.push(`apply ${status}: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`);
        }
      }
    }
  }
  return out;
}

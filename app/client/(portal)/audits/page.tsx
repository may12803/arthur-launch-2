import Link from 'next/link';
import { requireClientPortal } from '@/lib/client-portal/session';
import { getLoveleedayServer } from '@/lib/supabase/loveleeday-server';
import { listAudits, type ReadClient } from '@/lib/audit/read';
import { Card, Eyebrow, PageTitle, Muted } from '@/components/client-portal/ui';

export const dynamic = 'force-dynamic';
export default async function AuditsPage() {
  const ctx = await requireClientPortal();
  const { rows, error } = await listAudits(await getLoveleedayServer() as unknown as ReadClient, ctx.tenantId);
  return <div><Eyebrow>{ctx.tenantName}</Eyebrow><PageTitle>Audits</PageTitle>
    <Muted className="mb-8">Audits of your data, each with a report that points every finding back to its source.</Muted>
    {error && <p role="alert">Could not load audits. Refresh to try again.</p>}
    {!error && rows.length === 0 && <Card className="p-6">No audits yet. When LOVELEEDAY runs an audit of your systems, its report and every source behind it appear here.</Card>}
    {rows.map((r) => <Card key={r.id} className="p-6 mb-4"><Link className="ll-text-link" href={`/client/audits/${r.id}`}>{r.headline || 'Audit'}</Link>
      <p className="text-sm mt-2">{r.status.replace('_', ' ')} · {r.created_at.slice(0, 10)}{r.source_filename ? ` · ${r.source_filename}` : ''}</p>
      {r.status_reason && <p className="text-sm mt-2">{r.status_reason}</p>}</Card>)}
  </div>;
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireClientPortal } from '@/lib/client-portal/session';
import { getLoveleedayServer } from '@/lib/supabase/loveleeday-server';
import { getAudit, validAuditId, type ReadClient } from '@/lib/audit/read';
import { MONEY_LABEL, usd } from '@/lib/audit/report';
import { Card, Eyebrow, PageTitle } from '@/components/client-portal/ui';
import './print.css';

export const dynamic = 'force-dynamic';
export default async function AuditDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validAuditId(id)) notFound();
  const ctx = await requireClientPortal();
  const { row, error } = await getAudit(await getLoveleedayServer() as unknown as ReadClient, ctx.tenantId, id);
  if (!row && !error) notFound();
  if (error || !row) return <p role="alert">Could not load this audit. Refresh to try again.</p>;
  const report = row.result;
  return <div className="audit-print"><div className="audit-actions mb-6 flex gap-5"><Link href="/client/audits" className="ll-text-link">All audits</Link>
    {report && <><a className="ll-text-link" href={`/api/client/audits/${id}/csv`}>Download flagged rows CSV</a><span>Use your browser’s Print command to save a PDF</span></>}</div>
    <Eyebrow>{ctx.tenantName} · LOVELEEDAY</Eyebrow><PageTitle>Pricing audit</PageTitle>
    {!report ? <Card className="p-6">{row.status.replace('_', ' ')}. {row.status_reason}</Card> : <>
      <p className="text-xl my-5">{report.brief.headline.text}</p>
      <Card className="p-6 mb-5"><h2>What we found and what to do</h2>{report.brief.paragraphs.map((p, i) => <p key={i} className="my-3">{p.text}</p>)}</Card>
      <Card className="p-6 mb-5"><h2>What this review could check</h2><p>{report.source.filename} · {report.source.rows_used} usable rows of {report.source.rows_total} · as of {report.as_of}</p>
        <p>Columns found: {Object.entries(report.columns_found).map(([field, value]) => `${value?.column} (${field})`).join(', ') || 'none'}</p>
        <p>Columns missing: {report.columns_missing.map((c) => c.label).join(', ') || 'none'}</p>
        {report.coverage.blocked.map((b) => <p key={b.id}>{b.how} This unlocks {b.title}: {b.unlocks}</p>)}
      </Card>
      <Card className="p-6 mb-5"><h2>How complete this file was: {report.score.score} / 100</h2>{report.score.lines.map((line) => <p key={line.rule}>{line.rule}: weight {line.weight}, share {line.saturationShare}; {report.score_weights.find((w) => w.rule === line.rule)?.basis}</p>)}</Card>
      {report.findings.map((f) => <Card key={f.rule} className="p-6 mb-5 audit-finding"><h2>{f.title}</h2><p>{f.count} {f.unit} need review out of {f.population} checked. {f.action} ({f.severity})</p>
        <p>{MONEY_LABEL[f.money.kind]}{f.money.kind === 'loss' && f.money.amount !== null ? `: ${usd(f.money.amount)}` : ''}</p><p>{f.money.basis}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Source row</th><th>Item</th><th>Customer</th><th>Gap per unit</th><th>Units sold</th><th>Row loss</th></tr></thead><tbody>
          {f.rows.map((r, i) => <tr key={`${r.id}-${i}`}><td>{String(r.id).replace(/^r/, '')}</td><td>{r.sku}</td><td>{r.customer_name ?? r.customer_id}</td><td>{typeof r.gap_per_unit === 'number' ? usd(r.gap_per_unit) : ''}</td><td>{f.money.kind === 'loss' ? r.units_t12m : ''}</td><td>{f.money.kind === 'loss' && typeof r.exposure === 'number' ? usd(r.exposure) : ''}</td></tr>)}
        </tbody></table></div></Card>)}
      {report.skipped.map((s) => <p key={s.rule}>We could not check {s.rule}: {s.reason}. Add the missing information before relying on this part of the review.</p>)}
    </>}
  </div>;
}

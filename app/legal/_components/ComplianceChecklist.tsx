'use client';

import { useEffect, useState } from 'react';
import { companies, type CompanyCompliance, type ChecklistItem } from '../../_data/compliance';

const SERIF = 'var(--font-lora, Lora, Georgia, serif)';
const INK = '#1A1713';
const MUTE = '#8A837A';
const FAINT = '#BAB5AE';
const LINE = '#E8E4DB';
const TEAL = '#0B504F';

type Doc = { id: string; entity: string | null; category: string | null; title: string | null; file_name: string; description: string | null; expires_at: string | null };

// Fine categories that satisfy a coarse checklist requirement category.
// A doc with category=key satisfies a requirement with category=value.
const CATEGORY_EQUIVALENTS: Record<string, string> = {
  tax_return:         'ein_tax',
  payroll:            'ein_tax',
  bank_statement:     'banking',
  financial_statement:'banking',
  vendor_contract:    'contract',
  equipment_contract: 'contract',
  artist_contract:    'contract',
  grant:              'contract',
  lease:              'contract',
};

function matchClaimed(item: ChecklistItem, rows: Doc[], claimed: Set<string>): Doc | undefined {
  // Accept both exact category match AND fine-category aliases that map to item.category
  const cands = rows.filter((r) => {
    if (claimed.has(r.id)) return false;
    const cat = r.category ?? '';
    return cat === item.category || CATEGORY_EQUIVALENTS[cat] === item.category;
  });
  let hit: Doc | undefined;
  if (item.matchKeywords?.length) {
    const kw = item.matchKeywords.map((k) => k.toLowerCase());
    hit = cands.find((r) => {
      const hay = `${r.title ?? ''} ${r.file_name ?? ''} ${r.description ?? ''}`.toLowerCase();
      return kw.some((k) => hay.includes(k));
    });
  } else {
    hit = cands[0];
  }
  if (hit) claimed.add(hit.id);
  return hit;
}

function expiryState(iso: string | null): { label: string; color: string } | null {
  if (!iso) return null;
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
  const d = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (days < 0) return { label: `Expired ${d}`, color: '#B91C1C' };
  if (days < 60) return { label: `Expires ${d}`, color: '#B45309' };
  return { label: `Expires ${d}`, color: MUTE };
}

function Row({ item, doc }: { item: ChecklistItem; doc?: Doc }) {
  // forceOutstanding overrides the "doc found" state — item counts as outstanding even if stored
  const isForced = !!item.forceOutstanding;
  const stored = !!doc && !isForced;
  const exp = (!!doc && !isForced) ? expiryState(doc!.expires_at) : null;

  let dot: string;
  let statusText: string;
  let statusColor: string;

  if (isForced) {
    // Hard override: always red regardless of stored doc
    dot = '#B91C1C';
    statusText = item.outstandingLabel ?? (item.expiredStatus ? 'EXPIRED' : 'OUTSTANDING');
    statusColor = '#B91C1C';
  } else if (stored) {
    dot = exp?.color === '#B91C1C' ? '#B91C1C' : exp?.color === '#B45309' ? '#B45309' : '#16A34A';
    statusText = exp ? exp.label : 'Stored';
    statusColor = exp ? exp.color : '#166534';
  } else {
    dot = item.required ? '#B91C1C' : FAINT;
    statusText = item.required ? 'Missing' : 'Recommended';
    statusColor = item.required ? '#B91C1C' : FAINT;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: `1px solid #F3F0EA` }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{item.label}{!item.required && <span style={{ fontSize: 11, color: FAINT, fontWeight: 400 }}> · optional</span>}</div>
        {item.note && <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.5, marginTop: 2 }}>{item.note}</div>}
        {!!doc && !isForced && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {doc!.file_name}</div>}
        {isForced && !!doc && <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>⚠ Stale copy on file: {doc!.file_name}</div>}
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: statusColor, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{statusText}</span>
    </div>
  );
}

function CompanyPanel({ company, rows }: { company: CompanyCompliance; rows: Doc[] }) {
  const claimed = new Set<string>();
  const resolved = company.sections.map((s) => ({
    title: s.title,
    items: s.items.map((item) => ({ item, doc: matchClaimed(item, rows, claimed) })),
  }));

  const requiredItems = company.sections.flatMap((s) => s.items).filter((i) => i.required);
  // forceOutstanding items count as unmet even if a doc was found
  const requiredMet = resolved.flatMap((s) => s.items).filter(
    (r) => r.item.required && r.doc && !r.item.forceOutstanding
  ).length;
  const pct = requiredItems.length ? Math.round((requiredMet / requiredItems.length) * 100) : 0;

  // Outstanding task list: required items that are missing OR forceOutstanding
  const outstandingTasks = resolved.flatMap((s) =>
    s.items
      .filter(({ item, doc }) => item.required && (!doc || item.forceOutstanding))
      .map(({ item }) => item)
  );

  const hasUrgent = outstandingTasks.some((i) => i.expiredStatus);

  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 14, padding: '22px 24px', marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 500, color: INK, margin: '0 0 3px', letterSpacing: '-.02em' }}>{company.name}</h2>
          <div style={{ fontSize: 12.5, color: MUTE }}>
            {company.legalName ? `${company.legalName} · ` : ''}{company.kind} · {company.jurisdiction}
            {(company as { ein?: string }).ein && (
              <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: FAINT }}>
                EIN {(company as { ein?: string }).ein}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: pct === 100 ? '#166534' : TEAL, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{requiredMet}/{requiredItems.length}</div>
          <div style={{ fontSize: 10.5, color: FAINT, textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 3 }}>required on file</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, borderRadius: 2, background: '#F3F0EA', marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: hasUrgent ? '#B91C1C' : pct === 100 ? '#16A34A' : TEAL, transition: 'width .4s ease' }} />
      </div>

      {/* Outstanding task strip — only shown when there are gaps */}
      {outstandingTasks.length > 0 && (
        <div style={{ background: hasUrgent ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${hasUrgent ? '#FCA5A5' : '#FCD34D'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: hasUrgent ? '#991B1B' : '#92400E', marginBottom: 8 }}>
            {outstandingTasks.length} Outstanding Action{outstandingTasks.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {outstandingTasks.map((item) => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: item.expiredStatus ? '#B91C1C' : '#B45309', marginTop: 1, flexShrink: 0 }}>
                  {item.expiredStatus ? '⚠' : '○'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: item.expiredStatus ? '#991B1B' : '#78350F' }}>{item.label}</span>
                  {item.outstandingLabel && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: item.expiredStatus ? '#B91C1C' : '#B45309', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                      [{item.outstandingLabel}]
                    </span>
                  )}
                  {item.note && <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 1, lineHeight: 1.4 }}>{item.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full checklist */}
      {resolved.map((s) => (
        <div key={s.title} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: FAINT, marginBottom: 4 }}>{s.title}</div>
          {s.items.map(({ item, doc }) => <Row key={item.key} item={item} doc={doc} />)}
        </div>
      ))}
    </div>
  );
}

export default function ComplianceChecklist() {
  const [docsByEntity, setDocsByEntity] = useState<Record<string, Doc[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const results = await Promise.allSettled(
        companies.map((c) => fetch(`/api/legal?entity=${encodeURIComponent(c.entity)}&limit=1000`).then((r) => (r.ok ? r.json() : null)))
      );
      if (!alive) return;
      const map: Record<string, Doc[]> = {};
      results.forEach((res, i) => {
        const slug = companies[i].entity;
        map[slug] = res.status === 'fulfilled' && res.value?.rows ? (res.value.rows as Doc[]) : [];
      });
      setDocsByEntity(map);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ width: '100%' }}>
      <p style={{ fontSize: 12.5, color: MUTE, margin: '0 0 18px', lineHeight: 1.6 }}>
        Required documents per company, matched to your stored files. {loading ? 'Loading…' : 'Red = missing, amber = expiring, green = on file.'} Upload from the Library tab; items match by category + filename.
      </p>
      {companies.map((c) => <CompanyPanel key={c.entity} company={c} rows={docsByEntity[c.entity] ?? []} />)}
    </div>
  );
}

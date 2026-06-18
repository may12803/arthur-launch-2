'use client';

import { useState, useEffect, useCallback } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

type RangeKey = '1M' | 'MTD' | '3M' | '6M' | '1Y';

interface FinanceData {
  source: string;
  month: string;
  range: string;
  revenue: {
    gross: number | null;
    tax: number | null;
    tips: number | null;
    gratuity: number | null;
    transaction_count: number | null;
    days_included: number | null;
    by_payment: Record<string, number> | null;
  };
  spend: { monthly: number };
  transactions: Array<{
    date: string;
    vendor: string;
    category: string;
    amount: string;
    rawAmount: number;
    entity: string;
    color: string;
  }>;
  generated_at: string;
}

function fmt(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function relativeAge(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatBlock({ label, value, delta, valueColor }: { label: string; value: string; delta?: string; valueColor?: string }) {
  return (
    <div style={{ padding: '10px 18px', borderRight: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.textMuted, fontFamily: S.mono }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: S.mono, letterSpacing: '-0.3px', color: valueColor || S.textPrimary }}>{value}</div>
      {delta && <div style={{ fontSize: '9px', fontFamily: S.mono, color: S.textMuted }}>{delta}</div>}
    </div>
  );
}

// Synthetic daily revenue rows from Toast rollup subtotals
function buildToastRows(data: FinanceData): Array<{ date: string; vendor: string; category: string; amount: string; entity: string; color: string }> {
  const rev = data.revenue;
  if (!rev.gross) return [];
  const days = rev.days_included || 1;
  const dailyAvg = rev.gross / days;
  const rows: Array<{ date: string; vendor: string; category: string; amount: string; entity: string; color: string }> = [];
  if (rev.gross) rows.push({ date: data.month, vendor: `TOAST POS — ${data.month} ROLLUP`, category: 'Revenue', amount: fmt(rev.gross), entity: 'DABNEY', color: S.green });
  if (rev.tips) rows.push({ date: data.month, vendor: 'TIPS (staff payable)', category: 'Tips', amount: fmt(rev.tips), entity: 'DABNEY', color: S.textSecondary });
  if (rev.gratuity) rows.push({ date: data.month, vendor: 'AUTO-GRATUITY', category: 'Gratuity', amount: fmt(rev.gratuity), entity: 'DABNEY', color: S.textSecondary });
  if (rev.tax) rows.push({ date: data.month, vendor: 'SALES TAX COLLECTED', category: 'Tax', amount: fmt(rev.tax), entity: 'DABNEY', color: S.textMuted });
  // Daily avg row
  rows.push({ date: `${days}d avg`, vendor: 'DAILY AVG (Toast SFTP)', category: 'Revenue', amount: fmt(dailyAvg), entity: 'DABNEY', color: S.blue });
  return rows;
}

export default function FinancePage() {
  const [range, setRange] = useState<RangeKey>('MTD');
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportMsg, setExportMsg] = useState('');

  const load = useCallback(async (r: RangeKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/overview?range=${r}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* degrade */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(range); }, [range, load]);

  const handleExport = () => {
    if (!data) return;
    const csv = [
      ['Date', 'Vendor', 'Category', 'Entity', 'Amount'],
      ...buildToastRows(data).map(r => [r.date, r.vendor, r.category, r.entity, r.amount]),
      ...data.transactions.map(r => [r.date, r.vendor, r.category, r.entity, r.amount]),
    ].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-${data.month}-${range}.csv`;
    a.click();
    setExportMsg('exported');
    setTimeout(() => setExportMsg(''), 2000);
  };

  const rev = data?.revenue;
  const grossRevenue = rev?.gross ?? null;
  const txCount = rev?.transaction_count ?? null;
  const daysIn = rev?.days_included ?? null;
  const byPayment = rev?.by_payment ?? {};
  const hasData = grossRevenue != null || txCount != null;

  const generatedTs = data?.generated_at ? new Date(data.generated_at).getTime() : NaN;
  const generatedValid = !Number.isNaN(generatedTs);
  const STALE_MS = 36 * 60 * 60 * 1000;
  const isStale = generatedValid && Date.now() - generatedTs > STALE_MS;

  const displayedRows = data
    ? [...buildToastRows(data), ...data.transactions]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>FINANCE</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>
            DABNEY · TOAST SFTP · {daysIn ? `${daysIn}d data` : '—'} · {txCount ? `${txCount} txns` : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px', alignItems: 'center' }}>
          {(['1M', 'MTD', '3M', '6M', '1Y'] as RangeKey[]).map((label) => (
            <button
              key={label}
              onClick={() => setRange(label)}
              style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: range === label ? S.accent : S.bg3, color: range === label ? S.bg : S.textMuted, border: `1px solid ${range === label ? S.accent : S.border2}`, cursor: 'pointer', fontWeight: 600 }}
            >{label}</button>
          ))}
          <div style={{ width: '1px', height: '16px', background: S.border2, margin: '0 4px' }} />
          <button
            onClick={() => window.open('https://go.stripefinancialconnections.com/', '_blank')}
            style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: S.bg3, color: S.textMuted, border: `1px solid ${S.border2}`, cursor: 'pointer', fontWeight: 600 }}
          >↗ STRIPE FC</button>
          <button
            onClick={handleExport}
            style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: exportMsg ? S.green : S.bg3, color: exportMsg ? S.bg : S.textMuted, border: `1px solid ${exportMsg ? S.green : S.border2}`, cursor: 'pointer', fontWeight: 600 }}
          >{exportMsg || '⊞ EXPORT'}</button>
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ background: S.bg3, borderBottom: `1px solid ${S.border}`, display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        {loading ? (
          <div style={{ padding: '18px 20px', fontFamily: S.mono, fontSize: '9px', color: S.textMuted }}>loading…</div>
        ) : (
          <>
            <StatBlock label={`GROSS REV · ${range}`} value={fmt(grossRevenue)} delta={txCount ? `${txCount} transactions` : undefined} valueColor={S.green} />
            <StatBlock label="CREDIT SALES" value={fmt(byPayment?.Credit ?? null)} delta={byPayment?.Credit && grossRevenue ? `${Math.round((byPayment.Credit / grossRevenue) * 100)}% of gross` : undefined} />
            <StatBlock label="CASH" value={fmt(byPayment?.Cash ?? null)} />
            <StatBlock label="TIPS COLLECTED" value={fmt(rev?.tips ?? null)} delta="staff payable" valueColor={S.textSecondary} />
            <StatBlock label="AUTO-GRATUITY" value={fmt(rev?.gratuity ?? null)} />
            <StatBlock label="SALES TAX" value={fmt(rev?.tax ?? null)} valueColor={S.orange} />
          </>
        )}
      </div>

      {/* 2-col layout */}
      <div className="os-split" style={{ flex: 1, gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>
        {/* Transactions table */}
        <div style={{ background: S.bg, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            <span>TRANSACTIONS · {range}</span>
            <span style={{ color: hasData ? S.green : S.orange }}>{hasData ? '● TOAST SFTP LIVE' : '● NO DATA — SYNC EMPTY'}</span>
          </div>
          {loading ? (
            <div style={{ padding: '20px', fontFamily: S.mono, fontSize: '10px', color: S.textMuted }}>fetching Toast data…</div>
          ) : displayedRows.length === 0 ? (
            <div style={{ padding: '20px', fontFamily: S.mono, fontSize: '10px', color: S.textMuted }}>no transactions for {range}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: S.bg2 }}>
                  {['DATE', 'VENDOR', 'CATEGORY', 'ENTITY', 'AMOUNT'].map(h => (
                    <th key={h} style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', color: S.textMuted, padding: '7px 16px', textAlign: 'left', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((tx, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${S.border}` }}>
                    <td style={{ fontFamily: S.mono, fontSize: '11px', color: S.textMuted, padding: '9px 16px', whiteSpace: 'nowrap' }}>{tx.date}</td>
                    <td style={{ fontSize: '12px', color: S.textPrimary, padding: '9px 16px', fontWeight: 500 }}>{tx.vendor}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '10px', color: S.textSecondary, padding: '9px 16px' }}>{tx.category}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '9px 16px' }}>{tx.entity}</td>
                    <td style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: tx.color, padding: '9px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>{tx.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right panel */}
        <div style={{ background: S.bg2, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {/* Payment breakdown */}
          <div style={{ padding: '14px' }}>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '12px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>PAYMENT MIX · {range}</div>
            {loading ? (
              <div style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted }}>—</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(byPayment).map(([type, amount]) => {
                  const pct = grossRevenue ? Math.round((amount / grossRevenue) * 100) : 0;
                  const colors: Record<string, string> = { Credit: S.blue, Cash: S.green, 'Gift Card': S.accent, Other: S.textMuted };
                  const c = colors[type] || S.textMuted;
                  return (
                    <div key={type}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: S.mono, marginBottom: '3px' }}>
                        <span style={{ color: S.textSecondary }}>{type}</span>
                        <span style={{ color: S.textPrimary }}>{fmt(amount)} <span style={{ color: S.textMuted }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height: '4px', background: S.bg3, borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: '2px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Revenue summary */}
          <div style={{ padding: '14px', borderTop: `1px solid ${S.border}` }}>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '8px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>DABNEY REV · {range}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: S.mono, color: S.green }}>{fmt(grossRevenue)}</div>
            <div style={{ fontSize: '10px', fontFamily: S.mono, color: S.textMuted, marginTop: '2px' }}>
              {daysIn ? `${daysIn} days of data · Toast SFTP rollup` : 'Toast SFTP source'}
            </div>
            {txCount && (
              <div style={{ marginTop: '6px', fontSize: '10px', fontFamily: S.mono, color: S.textMuted }}>
                {txCount} transactions · avg {fmt(grossRevenue && txCount ? grossRevenue / txCount : null)}/txn
              </div>
            )}
          </div>

          {/* Data source badge */}
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${S.border}`, background: hasData ? (isStale ? 'rgba(249,115,22,0.04)' : 'rgba(34,197,94,0.03)') : 'rgba(239,68,68,0.04)' }}>
            <div style={{ fontFamily: S.mono, fontSize: '9px', color: hasData ? (isStale ? S.orange : S.green) : S.red, fontWeight: 700, marginBottom: '4px' }}>
              {!hasData ? '● NO DATA — SYNC RETURNED EMPTY' : isStale ? '● STALE DATA' : '● LIVE DATA'}
            </div>
            <div style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted, lineHeight: 1.5 }}>
              Source: Toast SFTP rollup<br />
              Month: {data?.month || '—'}<br />
              Updated: {generatedValid ? `${new Date(generatedTs).toLocaleString()} · ${relativeAge(generatedTs)}${isStale ? ' (stale)' : ''}` : '—'}
            </div>
            <button
              onClick={() => load(range)}
              style={{ marginTop: '8px', fontFamily: S.mono, fontSize: '9px', color: S.accent, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            >↻ REFRESH</button>
          </div>
        </div>
      </div>
    </div>
  );
}

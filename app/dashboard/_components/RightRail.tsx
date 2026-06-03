'use client';

import { useEffect, useState } from 'react';

const SERIF = 'var(--font-lora, Lora, Georgia, serif)';
const SANS = 'var(--font-inter, Inter, system-ui, sans-serif)';
const TEAL = '#0B504F';
const INK = '#1A1713';
const MUTE = '#8A837A';
const FAINT = '#BAB5AE';
const LINE = '#E8E4DB';

type Glance = {
  goals: { active: number | null };
  inbox: { unread: number | null; series: number[] };
  spend: { monthly: number; daily: number; hasData: boolean };
  chase: { balance: number | null };
};

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0 || data.every((d) => d === 0)) return null;
  const max = Math.max(...data, 1);
  return (
    <div role="img" aria-label="Inbox activity sparkline" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, marginTop: 8 }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, height: `${Math.max(8, (v / max) * 100)}%`,
          background: i === data.length - 1 ? TEAL : 'rgba(11,80,79,.22)',
          borderRadius: 2, minWidth: 3,
        }} />
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, children, accent }: {
  label: string; value: string; sub?: string; children?: React.ReactNode; accent?: boolean;
}) {
  return (
    <div style={{
      background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 10,
      padding: '13px 15px', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: FAINT, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 500, color: accent ? TEAL : INK, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 5 }}>{sub}</div>}
      {children}
    </div>
  );
}

export default function RightRail() {
  const [g, setG] = useState<Glance | null>(null);
  const [events, setEvents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [gl, ev] = await Promise.allSettled([
        fetch('/api/dashboard/glance').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/calendar/today').then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!alive) return;
      if (gl.status === 'fulfilled' && gl.value) setG(gl.value);
      if (ev.status === 'fulfilled' && ev.value && typeof ev.value.count === 'number') setEvents(ev.value.count);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const num = (n: number | null | undefined) => (loading ? '—' : n == null ? '—' : String(n));
  const chaseUnset = !g || g.chase.balance == null;
  const spendStr = g?.spend.hasData ? `$${Math.round(g.spend.monthly)}` : '$0';

  return (
    <aside aria-label="Dashboard summary" style={{ width: 320, flexShrink: 0, padding: '24px 24px 24px 8px', fontFamily: SANS }}>
      {/* Chase — honest connect state (no in-app balance feed yet) */}
      <div style={{
        background: '#FFFFFF', border: `1px solid ${LINE}`, borderRadius: 12,
        padding: '15px 16px', marginBottom: 22,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: FAINT }}>
            Chase Business Checking
          </span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D9A441', flexShrink: 0 }} />
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 500, color: INK, marginBottom: 2 }}>
          Not connected
        </div>
        <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.5, marginBottom: 10 }}>
          Link the account to track balance, payroll runway, and low-cash alerts here.
        </div>
        <a href="/settings" style={{ fontSize: 12.5, fontWeight: 600, color: TEAL, textDecoration: 'none' }}>
          Connect →
        </a>
      </div>

      {/* At a glance */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: FAINT }}>
          At a glance
        </span>
        <span style={{ fontSize: 11.5, color: FAINT }}>Customize</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <StatCard label="Active Goals" value={num(g?.goals.active)} sub="in progress" />
        <StatCard label="Unread Inbox" value={num(g?.inbox.unread)} sub="in inbox">
          {g?.inbox.series && <Sparkline data={g.inbox.series} />}
        </StatCard>
        <StatCard label="Today's Events" value={num(events)} sub="scheduled" />
        <StatCard
          label="API & Subs Spend"
          value={spendStr}
          sub={g?.spend.hasData ? `$${g.spend.daily.toFixed(2)}/day` : 'set in Stack'}
          accent
        />
        <div style={{ gridColumn: '1 / 3' }}>
          <StatCard label="Chase Balance" value={chaseUnset ? '—' : `$${g!.chase.balance}`} sub={chaseUnset ? 'connect account to track' : 'available'} />
        </div>
      </div>
    </aside>
  );
}

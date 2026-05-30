import { DOMAINS, APIS, API_CATEGORIES } from '../_data/stack';
import { ApiLogo } from '../_components/ApiLogo';

export const metadata = {
  title: 'Stack',
};

// v2 dark design tokens
const BG = '#0c0e12';
const GLASS = 'rgba(255,255,255,0.04)';
const GLASS_BORDER = 'rgba(255,255,255,0.08)';
const GLASS_MID = 'rgba(255,255,255,0.07)';
const SEP = 'rgba(255,255,255,0.06)';
const TEXT = '#f5f6f8';
const TEXT_MUTED = 'rgba(245,246,248,0.50)';
const TEXT_FAINT = 'rgba(245,246,248,0.30)';
const ACCENT = '#d4ff3d';
const MONO = "'JetBrains Mono','GeistMono',monospace";

const BILLING_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  usage:        { bg: 'rgba(251,191,36,0.12)', color: 'rgba(251,191,36,0.90)', label: 'Usage' },
  subscription: { bg: 'rgba(212,255,61,0.12)', color: '#d4ff3d', label: 'Subscription' },
  free:         { bg: 'rgba(245,246,248,0.06)', color: TEXT_MUTED, label: 'Free' },
};

const TH = { fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: TEXT_FAINT };

export default function StackPage() {
  const categories = API_CATEGORIES;

  const costRows = [...APIS].sort((a, b) => {
    if (a.billing === 'subscription' && b.billing !== 'subscription') return -1;
    if (b.billing === 'subscription' && a.billing !== 'subscription') return 1;
    return a.name.localeCompare(b.name);
  });

  const totalMonthly = APIS.reduce((s, a) => s + (a.monthlyCost ?? 0), 0);
  const hasAny = APIS.some(a => a.monthlyCost !== null);

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '32px 40px', fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ ...TH, marginBottom: 8 }}>infrastructure</div>
          <h1 style={{ fontFamily: 'var(--font-lora, Lora, Georgia, serif)', fontSize: 28, fontWeight: 500, color: TEXT, letterSpacing: '-.025em', lineHeight: 1.2, margin: '0 0 6px' }}>
            Stack
          </h1>
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, lineHeight: 1.6, margin: 0 }}>
            Domains, APIs, and infrastructure powering Aspen &amp; May.
          </p>
        </div>

        {/* Domains */}
        <section style={{ marginBottom: 44 }}>
          <div style={{ ...TH, marginBottom: 14 }}>Domains</div>
          <div style={{ background: GLASS, border: `1px solid ${GLASS_BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.2fr 0.8fr', borderBottom: `1px solid ${SEP}`, padding: '10px 20px' }}>
              {['Domain', 'Entity', 'Registrar', 'Status'].map(h => (
                <span key={h} style={TH}>{h}</span>
              ))}
            </div>
            {DOMAINS.map((d, i) => (
              <div key={d.domain} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.2fr 0.8fr', padding: '13px 20px', alignItems: 'center', borderBottom: i < DOMAINS.length - 1 ? `1px solid ${SEP}` : 'none' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT, fontFamily: MONO }}>{d.domain}</span>
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>{d.entity}</span>
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>{d.registrar}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, color: 'rgba(52,211,153,0.85)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(52,211,153,0.85)', flexShrink: 0, display: 'inline-block' }} />
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* APIs by category */}
        <section style={{ marginBottom: 44 }}>
          <div style={{ ...TH, marginBottom: 14 }}>APIs &amp; Integrations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {categories.map(cat => {
              const items = APIS.filter(a => a.category === cat);
              return (
                <div key={cat} style={{ background: GLASS, border: `1px solid ${GLASS_BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px', borderBottom: `1px solid ${SEP}`, background: GLASS_MID }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT }}>{cat}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: TEXT_FAINT, fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>
                  </div>
                  {items.map((api, i) => {
                    const bs = BILLING_STYLE[api.billing];
                    return (
                      <div key={api.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 20px', borderBottom: i < items.length - 1 ? `1px solid ${SEP}` : 'none' }}>
                        <ApiLogo domain={api.logoDomain} name={api.name} size={28} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: TEXT, marginBottom: 1 }}>{api.name}</div>
                          <div style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{api.description}</div>
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: bs.bg, color: bs.color, whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.06em' }}>{bs.label}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        {/* Costs table */}
        <section style={{ marginBottom: 44 }}>
          <div style={{ ...TH, marginBottom: 14 }}>Subscriptions &amp; Costs</div>
          <div style={{ background: GLASS, border: `1px solid ${GLASS_BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr', borderBottom: `1px solid ${SEP}`, padding: '10px 20px' }}>
              {['Service', 'Billing', 'Monthly Cost'].map(h => (
                <span key={h} style={TH}>{h}</span>
              ))}
            </div>
            {costRows.map((api, i) => {
              const bs = BILLING_STYLE[api.billing];
              return (
                <div key={api.name} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr', padding: '12px 20px', alignItems: 'center', borderBottom: i < costRows.length - 1 ? `1px solid ${SEP}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ApiLogo domain={api.logoDomain} name={api.name} size={22} />
                    <span style={{ fontSize: 13, color: TEXT }}>{api.name}</span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: bs.bg, color: bs.color, width: 'fit-content', letterSpacing: '0.06em' }}>{bs.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: api.monthlyCost !== null ? TEXT : TEXT_FAINT, fontVariantNumeric: 'tabular-nums' }}>
                    {api.monthlyCost !== null ? `$${api.monthlyCost.toFixed(2)}` : '—'}
                  </span>
                </div>
              );
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr', padding: '13px 20px', background: GLASS_MID, borderTop: `1px solid ${SEP}` }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: TEXT, gridColumn: '1 / 3' }}>Total / month</span>
              <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color: hasAny ? ACCENT : TEXT_FAINT, fontVariantNumeric: 'tabular-nums' }}>
                {hasAny ? `$${totalMonthly.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

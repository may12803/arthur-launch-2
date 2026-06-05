'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; badge?: number; badgeType?: 'hot' | 'warn'; icon: string };

const NAV_COMMAND: NavItem[] = [
  { href: '/chat', label: 'Chat', icon: '◉' },
  { href: '/', label: 'Dashboard', badge: 4, badgeType: 'warn', icon: '⬛' },
  { href: '/finance', label: 'Finance', badge: 1, badgeType: 'hot', icon: '$' },
];

const NAV_PORTFOLIO: NavItem[] = [
  { href: '/goals', label: 'Goals', icon: '◎' },
  { href: '/tasks', label: 'Tasks', badgeType: 'warn', icon: '☑' },
  { href: '/inbox', label: 'Inbox', badgeType: 'hot', icon: '✉' },
  { href: '/calendar', label: 'Calendar', icon: '⊞' },
];

const NAV_OPERATIONS: NavItem[] = [
  { href: '/employees', label: 'Employees', icon: '◈' },
  { href: '/legal', label: 'Legal', badge: 2, badgeType: 'warn', icon: '◧' },
  { href: '/subscriptions', label: 'Subscriptions', icon: '▣' },
];

type NavCounts = { inbox: number; tasks: number; calendar: number; goals: number; employees: number };
const COUNT_KEY_BY_HREF: Record<string, keyof NavCounts> = {
  '/inbox': 'inbox',
  '/tasks': 'tasks',
  '/calendar': 'calendar',
  '/goals': 'goals',
  '/employees': 'employees',
};

const NAV_ARTHUR: NavItem[] = [
  { href: '/brain', label: 'Brain', icon: '◍' },
  { href: '/principles', label: 'Principles', icon: '◐' },
  { href: '/benchmarks', label: 'Benchmarks', icon: '◑' },
  { href: '/skills', label: 'Skills', icon: '⚡' },
  { href: '/stack', label: 'Stack', icon: '▤' },
  { href: '/graph', label: 'Graph', icon: '◈' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

const S = {
  bg: '#0a0a0a',
  bg2: '#111111',
  bg3: '#181818',
  bg4: '#1f1f1f',
  border: '#1f1f1f',
  border2: '#2a2a2a',
  textPrimary: '#e8e8e8',
  textSecondary: '#8a8a8a',
  textMuted: '#4a4a4a',
  accent: '#f0a500',
  green: '#22c55e',
  red: '#ef4444',
  orange: '#f97316',
  blue: '#60a5fa',
  mono: "var(--font-jetbrains, 'JetBrains Mono', 'GeistMono', monospace)",
  sans: "'Inter', sans-serif",
} as const;

function NavSection({ label, items, pathname, counts, onNavigate }: { label: string; items: NavItem[]; pathname: string; counts: NavCounts | null; onNavigate?: () => void }) {
  return (
    <div>
      <div style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: S.textMuted, padding: '14px 16px 5px' }}>
        {label}
      </div>
      {items.map(item => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        const countKey = COUNT_KEY_BY_HREF[item.href];
        // Live counts override the static badge for mapped routes; hide the
        // badge entirely while loading or when the live count is 0.
        const badgeValue = countKey ? counts?.[countKey] : item.badge;
        const showBadge = badgeValue != null && badgeValue > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 16px',
              fontSize: '12px', color: active ? S.accent : S.textSecondary,
              fontWeight: 500, textDecoration: 'none', cursor: 'pointer',
              borderLeft: `2px solid ${active ? S.accent : 'transparent'}`,
              background: active ? `rgba(240,165,0,0.04)` : 'transparent',
              transition: 'all 80ms ease',
            }}
          >
            <span style={{ fontFamily: S.mono, fontSize: '11px', width: '16px', textAlign: 'center', flexShrink: 0, color: active ? S.accent : S.textMuted }}>{item.icon}</span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {showBadge && (
              <span style={{
                fontFamily: S.mono, fontSize: '9px', fontWeight: 700, padding: '1px 5px',
                borderRadius: '2px',
                background: item.badgeType === 'hot' ? 'rgba(239,68,68,0.12)' : item.badgeType === 'warn' ? 'rgba(249,115,22,0.12)' : S.bg3,
                color: item.badgeType === 'hot' ? S.red : item.badgeType === 'warn' ? S.orange : S.textSecondary,
                border: `1px solid ${item.badgeType === 'hot' ? 'rgba(239,68,68,0.25)' : item.badgeType === 'warn' ? 'rgba(249,115,22,0.25)' : S.border2}`,
              }}>
                {badgeValue}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  onOpenVoice?: () => void;
  voiceActive?: boolean;
}

export function AppShell({ children, onOpenVoice, voiceActive }: AppShellProps) {
  const pathname = usePathname();
  const [now, setNow] = useState('');
  const [syncAge, setSyncAge] = useState('');
  const [syncedAt] = useState(() => Date.now());
  const [counts, setCounts] = useState<NavCounts | null>(null);
  // Mobile drawer. `mobile` stays false on the server + first client render so
  // SSR and hydration match (desktop layout); matchMedia flips it after mount.
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Close the drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/nav-counts')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (alive && d) setCounts(d as NavCounts); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
      const h = String(d.getHours()).padStart(2, '0');
      const m = String(d.getMinutes()).padStart(2, '0');
      return `${days[d.getDay()]} ${months[d.getMonth()]}/${String(d.getDate()).padStart(2,'0')}/${String(d.getFullYear()).slice(2)} ${h}:${m}`;
    };
    const fmtAge = () => {
      const secs = Math.floor((Date.now() - syncedAt) / 1000);
      if (secs < 60) return `${secs}S AGO`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}M AGO`;
      const hrs = Math.floor(mins / 60);
      return `${hrs}H AGO`;
    };
    setNow(fmt());
    setSyncAge(fmtAge());
    const t = setInterval(() => { setNow(fmt()); setSyncAge(fmtAge()); }, 30000);
    return () => clearInterval(t);
  }, [syncedAt]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: S.bg, color: S.textPrimary, fontFamily: S.sans, fontSize: '12px', lineHeight: '1.5', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '44px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '44px' }}>
          {/* Hamburger (mobile only) */}
          {mobile && (
            <button
              onClick={() => setDrawerOpen(o => !o)}
              aria-label="Toggle navigation"
              style={{ background: 'transparent', border: 'none', color: S.textPrimary, fontSize: '18px', lineHeight: 1, padding: '0 16px', height: '44px', cursor: 'pointer', flexShrink: 0 }}
            >
              ☰
            </button>
          )}
          {/* Logo block */}
          <div style={{ fontFamily: S.mono, fontSize: '13px', fontWeight: 700, color: S.accent, letterSpacing: '2px', padding: mobile ? '0 14px' : '0 20px', borderRight: `1px solid ${S.border}`, height: '44px', display: 'flex', alignItems: 'center', width: mobile ? 'auto' : '220px', flexShrink: 0 }}>
            ARTHUR//OS
          </div>
          {/* Entity tabs (desktop only) */}
          {!mobile && [
            { label: 'ALL ENTITIES', active: true },
            { label: 'DABNEY & CO.', active: false },
            { label: 'ASPEN & MAY', active: false, tag: 'HOLD' },
            { label: 'LOVELEEDAY', active: false, tag: 'EMPTY' },
          ].map((tab, i) => (
            <div key={i} style={{
              height: '44px', padding: '0 16px', fontSize: '11px', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: '6px',
              borderBottom: tab.active ? `2px solid ${S.accent}` : '2px solid transparent',
              color: tab.active ? S.accent : S.textSecondary,
              letterSpacing: '0.04em', fontFamily: S.mono, cursor: 'pointer',
            }}>
              {tab.label}
              {tab.tag && (
                <span style={{ fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px', letterSpacing: '0.08em', background: '#1a1a1a', color: S.textMuted, border: `1px solid ${S.border2}` }}>
                  {tab.tag}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? '10px' : '14px', padding: mobile ? '0 12px' : '0 20px', fontSize: '10px', color: S.textMuted, fontFamily: S.mono }}>
          {!mobile && (
            <div style={{ background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px', padding: '4px 10px', fontSize: '10px', color: S.textMuted, width: '200px' }}>
              ⌘K &nbsp; search everything…
            </div>
          )}
          <div style={{ background: S.red, color: 'white', fontSize: '8px', fontWeight: 700, fontFamily: S.mono, width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</div>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: S.green, display: 'inline-block', animation: 'pulse 2s infinite' }} />
          {!mobile && <span>LIVE · SYNC {syncAge}</span>}
          {!mobile && <span style={{ color: S.accent, cursor: 'pointer' }}>↻ FORCE</span>}
          {!mobile && <span style={{ color: S.border2 }}>|</span>}
          {!mobile && <span>{now}</span>}
          <button onClick={onOpenVoice} style={{ background: voiceActive ? 'rgba(240,165,0,0.12)' : S.accent, color: voiceActive ? S.accent : S.bg, border: 'none', borderRadius: '3px', padding: '4px 12px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: S.mono, letterSpacing: '0.08em' }}>
            {voiceActive ? '● END' : '+ TALK'}
          </button>
        </div>
      </div>

      {/* Body layout */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Backdrop (mobile drawer open only) */}
        {mobile && drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }}
          />
        )}
        {/* Sidebar — fixed column on desktop, off-canvas drawer on mobile */}
        <nav
          style={{
            width: '220px', background: S.bg2, borderRight: `1px solid ${S.border}`,
            flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto',
            ...(mobile
              ? {
                  position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 50,
                  transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
                  transition: 'transform 180ms ease', boxShadow: drawerOpen ? '2px 0 16px rgba(0,0,0,0.5)' : 'none',
                }
              : {}),
          }}
        >
          <div style={{ flex: 1 }}>
            <NavSection label="COMMAND" items={NAV_COMMAND} pathname={pathname} counts={counts} onNavigate={() => setDrawerOpen(false)} />
            <NavSection label="PORTFOLIO" items={NAV_PORTFOLIO} pathname={pathname} counts={counts} onNavigate={() => setDrawerOpen(false)} />
            <NavSection label="OPERATIONS" items={NAV_OPERATIONS} pathname={pathname} counts={counts} onNavigate={() => setDrawerOpen(false)} />
            <NavSection label="ARTHUR CORE" items={NAV_ARTHUR} pathname={pathname} counts={counts} onNavigate={() => setDrawerOpen(false)} />
          </div>
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px', color: S.textMuted, flexShrink: 0 }}>
            <div style={{ marginBottom: '3px' }}>arthur-online v2.0</div>
            <div style={{ color: S.textSecondary }}>daniel@aspenandmay.com</div>
          </div>
        </nav>

        {/* Main content */}
        <main id="main-content" style={{ flex: 1, minWidth: 0, background: S.bg, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {children}
        </main>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </div>
  );
}

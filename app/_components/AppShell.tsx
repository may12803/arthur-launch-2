'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  Inbox,
  Calendar,
  Brain,
  Users,
  Target,
  GitBranch,
  Zap,
  Radio,
  Settings,
  Menu,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Nav items — icons only in collapsed sidebar, expand on hover
// ─────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/',              icon: MessageSquare, label: 'Today',          shortcut: null },
  { href: '/inbox',         icon: Inbox,         label: 'Inbox',          shortcut: '⌘1' },
  { href: '/calendar',      icon: Calendar,      label: 'Calendar',       shortcut: '⌘2' },
  { href: '/brain',         icon: Brain,         label: 'Brain',          shortcut: '⌘3' },
  { href: '/employees',     icon: Users,         label: 'Employees',      shortcut: null },
  { href: '/goals',         icon: Target,        label: 'Goals',          shortcut: null },
  { href: '/graph',         icon: GitBranch,     label: 'Graph',          shortcut: null },
  { href: '/skills',        icon: Zap,           label: 'Skills',         shortcut: null },
  { href: '/communications',icon: Radio,         label: 'Comms',          shortcut: null },
  { href: '/settings',      icon: Settings,      label: 'Settings',       shortcut: null },
];

// ─────────────────────────────────────────────────────────────────────────────
// VoiceTalkButton — inline, used in topbar + chat input
// ─────────────────────────────────────────────────────────────────────────────
// VoiceOrb handles all Vapi state; topbar just opens it.

interface AppShellProps {
  children: React.ReactNode;
  onOpenVoice?: () => void;
  voiceActive?: boolean;
}

export function AppShell({ children, onOpenVoice, voiceActive }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const isChatHome = pathname === '/';

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault();
        window.location.href = '/inbox';
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault();
        window.location.href = '/calendar';
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault();
        window.location.href = '/brain';
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const expanded = sidebarHovered || sidebarOpen;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <header
        style={{
          height: '52px',
          minHeight: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px 0 0',
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 50,
          flexShrink: 0,
        }}
      >
        {/* Left: hamburger (mobile) + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle navigation"
            style={{
              display: 'none',
              width: '52px',
              height: '52px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className="mobile-hamburger-btn"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          {/* Sidebar width spacer on desktop — matches collapsed sidebar width */}
          <div
            className="sidebar-spacer"
            style={{
              width: expanded ? '200px' : '52px',
              transition: 'width 220ms cubic-bezier(0.32,0.72,0,1)',
              flexShrink: 0,
            }}
          />

          {/* Wordmark */}
          <div
            style={{
              paddingLeft: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              userSelect: 'none',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--text-active)',
              }}
            >
              ▍ arthur
            </span>
          </div>
        </div>

        {/* Center: ⌘K hint */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          className="cmd-k-hint"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              background: 'var(--glass-bg-faint)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              cursor: 'default',
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
              letterSpacing: '0.02em',
            }}
          >
            <span>⌘K</span>
            <span style={{ opacity: 0.5 }}>search</span>
          </div>
          {/* TODO: wire ⌘K to open a command palette / search dialog */}
        </div>

        {/* Right: talk button + avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={onOpenVoice}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              height: '32px',
              background: voiceActive
                ? 'var(--accent-orange-soft)'
                : 'var(--glass-bg-tier2)',
              border: `1px solid ${voiceActive ? 'var(--accent-orange)' : 'var(--glass-border-tier2)'}`,
              borderRadius: 'var(--radius-pill)',
              color: voiceActive ? 'var(--accent-orange)' : 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'all 180ms var(--ease-out-soft)',
              fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
              minWidth: 'unset',
              minHeight: 'unset',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: voiceActive ? 'var(--accent-orange)' : 'var(--text-muted)',
                animation: voiceActive ? 'breathe 1.5s ease-in-out infinite' : 'none',
                flexShrink: 0,
              }}
            />
            <span>{voiceActive ? 'end call' : 'talk'}</span>
          </button>

          {/* User avatar */}
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-orange) 0%, #a0cc00 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--accent-text-on)',
              flexShrink: 0,
            }}
          >
            D
          </div>
        </div>
      </header>

      {/* ── Body: sidebar + main ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* ── Sidebar (desktop: icons | hover expands) ──────────────────────── */}
        <nav
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
          style={{
            width: expanded ? '200px' : '52px',
            minWidth: expanded ? '200px' : '52px',
            transition: 'width 220ms cubic-bezier(0.32,0.72,0,1), min-width 220ms cubic-bezier(0.32,0.72,0,1)',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--glass-border)',
            background: 'var(--glass-bg-faint)',
            overflow: 'hidden',
            zIndex: 40,
            flexShrink: 0,
          }}
          className="desktop-sidebar"
        >
          <SidebarNav items={NAV_ITEMS} pathname={pathname} expanded={expanded} />
        </nav>

        {/* ── Mobile drawer ────────────────────────────────────────────────── */}
        {sidebarOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 60,
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setSidebarOpen(false)}
          >
            <nav
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: '220px',
                background: 'rgba(12,14,18,0.98)',
                border: 'none',
                borderRight: '1px solid var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                paddingTop: '52px',
              }}
              onClick={e => e.stopPropagation()}
            >
              <SidebarNav items={NAV_ITEMS} pathname={pathname} expanded={true} onNav={() => setSidebarOpen(false)} />
            </nav>
          </div>
        )}

        {/* ── Main content ────────────────────────────────────────────────── */}
        <main
          id="main-content"
          style={{
            flex: 1,
            overflow: isChatHome ? 'hidden' : 'auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </main>

        {/* TODO: slide-over tool pane (40% width from right) for inline inbox/calendar/brain
            surfaces when Arthur surfaces them mid-chat. Wire in a future iteration:
            - State: toolPaneRoute | null
            - Trigger: chat message contains a pane-open event from the backend
            - Animation: translate-x from 100% → 0 over 300ms
            - Routes: /inbox, /calendar, /brain rendered as iframe or RSC slot
        */}
      </div>

      {/* ── Mobile bottom nav ───────────────────────────────────────────────── */}
      <div className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner">
          {NAV_ITEMS.slice(0, 5).map(item => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-bottom-nav-item${active ? ' active' : ''}`}
              >
                <Icon size={20} className="mobile-bottom-nav-icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .sidebar-spacer { display: none !important; }
          .mobile-hamburger-btn { display: flex !important; }
          .cmd-k-hint { display: none !important; }
        }
        @media (min-width: 769px) {
          .mobile-hamburger-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SidebarNav — shared between desktop hover-expand and mobile drawer
// ─────────────────────────────────────────────────────────────────────────────

function SidebarNav({
  items,
  pathname,
  expanded,
  onNav,
}: {
  items: typeof NAV_ITEMS;
  pathname: string;
  expanded: boolean;
  onNav?: () => void;
}) {
  return (
    <ul style={{ listStyle: 'none', padding: '8px 0', margin: 0, flex: 1 }}>
      {items.map(item => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNav}
              title={!expanded ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                height: '40px',
                color: active ? 'var(--text-active)' : 'var(--text-muted)',
                textDecoration: 'none',
                borderRadius: '8px',
                margin: '1px 6px',
                background: active ? 'var(--glass-bg-tier2)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent-orange)' : '2px solid transparent',
                transition: 'all 150ms var(--ease-out-soft)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                minWidth: 0,
              }}
              onMouseEnter={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-active)';
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              <Icon
                size={18}
                strokeWidth={active ? 2 : 1.5}
                style={{ flexShrink: 0 }}
              />
              {expanded && (
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: active ? 500 : 400,
                    letterSpacing: '0.01em',
                    flex: 1,
                  }}
                >
                  {item.label}
                </span>
              )}
              {expanded && item.shortcut && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                    opacity: 0.6,
                    flexShrink: 0,
                  }}
                >
                  {item.shortcut}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

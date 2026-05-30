'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; badge?: number; icon: React.ReactNode };

const WORKSPACE: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".45"/>
      </svg>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    badge: 7,
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="4" cy="4" r="1.5" fill="currentColor"/>
        <rect x="7" y="3" width="7" height="2" rx="1" fill="currentColor" opacity=".6"/>
        <circle cx="4" cy="8" r="1.5" fill="currentColor"/>
        <rect x="7" y="7" width="7" height="2" rx="1" fill="currentColor" opacity=".6"/>
        <circle cx="4" cy="12" r="1.5" fill="currentColor"/>
        <rect x="7" y="11" width="5" height="2" rx="1" fill="currentColor" opacity=".6"/>
      </svg>
    ),
  },
  {
    href: '/goals',
    label: 'Goals',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5L10.2 6.2 15.5 6.8 11.5 10.5 12.7 15.8 8 12.8 3.3 15.8 4.5 10.5.5 6.8 5.8 6.2Z"
          stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
  },
  {
    href: '/inbox',
    label: 'Inbox',
    badge: 9,
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 14H11M8 11V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M1 6.5H15M5 1.5V4.5M11 1.5V4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const BUSINESS: NavItem[] = [
  {
    href: '/legal',
    label: 'Legal',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 6H11M5 9H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/employees',
    label: 'Employees',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="6" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M1 13.5C1 11.2 3.2 9.5 6 9.5C8.8 9.5 11 11.2 11 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="11.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M11.5 9.5C13 9.5 15 10.5 15 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/stack',
    label: 'Stack',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2" width="14" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="8" width="14" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity=".6"/>
      </svg>
    ),
  },
];

const ARTHUR_SECTION: NavItem[] = [
  {
    href: '/brain',
    label: 'Brain',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M3 8C3 5.24 5.24 3 8 3C10.76 3 13 5.24 13 8C13 10.76 10.76 13 8 13C5.24 13 3 10.76 3 8Z" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 5.5V8L9.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M8 1V2M8 14V15M1 8H2M14 8H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/skills',
    label: 'Skills',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <path d="M2 4H14M4 8H12M6 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M8 1V3M8 13V15M1 8H3M13 8H15M2.93 2.93L4.34 4.34M11.66 11.66L13.07 13.07M2.93 13.07L4.34 11.66M11.66 4.34L13.07 2.93" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: '/telemetry',
    label: 'Telemetry',
    icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <polyline points="1,12 5,8 8,10 11,5 14,7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <circle cx="14" cy="3.5" r="1.5" fill="currentColor"/>
        <line x1="14" y1="5" x2="14" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

function NavSection({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      <div style={{ fontSize:'10.5px', fontWeight:600, letterSpacing:'.08em', textTransform:'uppercase', color:'#BAB5AE', padding:'10px 10px 6px' }}>
        {label}
      </div>
      {items.map(item => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display:'flex', alignItems:'center', gap:'10px', padding:'8.5px 10px',
              borderRadius:'6px', cursor:'pointer',
              color: active ? '#0B504F' : '#4A4540',
              fontSize:'13.5px', fontWeight: active ? 500 : 400,
              letterSpacing:'-.01em', textDecoration:'none',
              background: active ? '#E5F0EF' : 'transparent',
              transition:'background 120ms ease, color 120ms ease',
              margin:'1px 0',
            }}
            onMouseEnter={e => { if(!active){ (e.currentTarget as HTMLElement).style.background='#F3F0EA'; (e.currentTarget as HTMLElement).style.color='#1A1713'; } }}
            onMouseLeave={e => { if(!active){ (e.currentTarget as HTMLElement).style.background='transparent'; (e.currentTarget as HTMLElement).style.color='#4A4540'; } }}
          >
            <span style={{ width:'15px', height:'15px', flexShrink:0, opacity: active ? 1 : 0.7, display:'flex', alignItems:'center' }}>
              {item.icon}
            </span>
            <span style={{ flex:1 }}>{item.label}</span>
            {item.badge != null && (
              <span style={{ marginLeft:'auto', background:'#0B504F', color:'#fff', fontSize:'10px', fontWeight:600, padding:'1px 6px', borderRadius:'100px' }}>
                {item.badge}
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const pageLabel = pathname === '/' ? 'Dashboard'
    : pathname.startsWith('/inbox') ? 'Inbox'
    : pathname.startsWith('/tasks') ? 'Tasks'
    : pathname.startsWith('/goals') ? 'Goals'
    : pathname.startsWith('/calendar') ? 'Calendar'
    : pathname.startsWith('/legal') ? 'Legal'
    : pathname.startsWith('/employees') ? 'Employees'
    : pathname.startsWith('/brain') ? 'Brain'
    : pathname.startsWith('/skills') ? 'Skills'
    : pathname.startsWith('/settings') ? 'Settings'
    : pathname.startsWith('/stack') ? 'Stack'
    : pathname.startsWith('/telemetry') ? 'Telemetry'
    : 'Arthur';

  const SidebarInner = () => (
    <>
      <div style={{ height:'56px', display:'flex', alignItems:'center', padding:'0 20px', borderBottom:'1px solid #E8E4DB', flexShrink:0 }}>
        <span style={{ fontFamily:'var(--font-lora,"Lora",Georgia,serif)', fontSize:'22px', fontWeight:600, letterSpacing:'-.03em', fontStyle:'italic', color:'#1A1713' }}>
          <em style={{ color:'#0B504F', fontStyle:'italic' }}>arthur</em>
        </span>
      </div>
      <div style={{ flex:1, padding:'12px 10px', overflowY:'auto', display:'flex', flexDirection:'column', gap:'2px' }}>
        <NavSection label="Workspace" items={WORKSPACE} pathname={pathname} />
        <div style={{ marginTop:'6px' }}><NavSection label="Business" items={BUSINESS} pathname={pathname} /></div>
        <div style={{ marginTop:'6px' }}><NavSection label="Arthur" items={ARTHUR_SECTION} pathname={pathname} /></div>
      </div>
      <div style={{ borderTop:'1px solid #E8E4DB', padding:'10px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 10px', borderRadius:'6px' }}>
          <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:'#0B504F', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'11px', fontWeight:600, flexShrink:0 }}>D</div>
          <div>
            <div style={{ fontSize:'12.5px', fontWeight:500, color:'#1A1713', lineHeight:1.2 }}>Daniel May</div>
            <div style={{ fontSize:'11px', color:'#BAB5AE', lineHeight:1.2 }}>Aspen &amp; May</div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', background:'#FAF8F5' }}>

      {/* Left nav — desktop */}
      <nav style={{ width:'220px', minWidth:'220px', background:'#ffffff', borderRight:'1px solid #E8E4DB', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:10, flexShrink:0 }} className="desktop-sidebar">
        <SidebarInner />
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:60, background:'rgba(26,23,19,0.35)', backdropFilter:'blur(4px)' }} onClick={() => setMobileOpen(false)}>
          <nav style={{ position:'absolute', top:0, left:0, bottom:0, width:'220px', background:'#ffffff', borderRight:'1px solid #E8E4DB', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
            <SidebarInner />
          </nav>
        </div>
      )}

      {/* Main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        {/* Topbar */}
        <header style={{ height:'56px', background:'#ffffff', borderBottom:'1px solid #E8E4DB', display:'flex', alignItems:'center', padding:'0 32px', gap:'14px', flexShrink:0, zIndex:9 }}>
          <button onClick={() => setMobileOpen(v => !v)} aria-label="Toggle navigation" className="mobile-hamburger-btn" style={{ display:'none', background:'none', border:'none', cursor:'pointer', color:'#8A837A', padding:'4px', marginLeft:'-8px', minWidth:'unset', minHeight:'unset' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 4H16M2 9H16M2 14H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          <span style={{ fontFamily:'var(--font-lora,"Lora",Georgia,serif)', fontSize:'15px', fontWeight:500, color:'#8A837A', letterSpacing:'-.01em', fontStyle:'italic' }}>arthur</span>
          <div style={{ width:'1px', height:'15px', background:'#E8E4DB' }} />
          <span style={{ fontSize:'14px', fontWeight:500, color:'#1A1713' }}>{pageLabel}</span>
          <div style={{ flex:1 }} />

          <div style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12.5px', color:'#8A837A', fontWeight:400 }}>
            <span style={{ display:'inline-block', width:'6px', height:'6px', background:'#16A34A', borderRadius:'50%', animation:'pulseDot 2.5s ease-in-out infinite', flexShrink:0 }} />
            {dateStr}
          </div>

          <button onClick={onOpenVoice} style={{ display:'flex', alignItems:'center', gap:'7px', background: voiceActive ? 'rgba(11,80,79,.12)' : '#0B504F', color: voiceActive ? '#0B504F' : '#fff', border:'none', borderRadius:'6px', padding:'7px 14px', fontSize:'13px', fontWeight:500, cursor:'pointer', fontFamily:'inherit', letterSpacing:'-.01em', transition:'background 120ms ease', minWidth:'unset', minHeight:'unset', height:'32px' }}>
            <svg viewBox="0 0 14 14" fill="none" style={{ width:'14px', height:'14px' }}>
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5 7C5 5.9 5.9 5 7 5C8.1 5 9 5.9 9 7C9 8.1 8.1 9 7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {voiceActive ? 'end call' : '+ Talk'}
          </button>

          <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#0B504F', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', fontWeight:600, cursor:'pointer', flexShrink:0, minWidth:'unset', minHeight:'unset' }}>D</div>
        </header>

        {/* Content */}
        <main id="main-content" style={{ flex:1, overflow:'auto', display:'flex', flexDirection:'column', minWidth:0 }}>
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav">
        <div className="mobile-bottom-nav-inner">
          {[...WORKSPACE.slice(0,4), ARTHUR_SECTION[2]].map(item => {
            const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`mobile-bottom-nav-item${active ? ' active' : ''}`}>
                <span className="mobile-bottom-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:1;}50%{opacity:.35;} }
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-hamburger-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-hamburger-btn { display: none !important; }
        }
      `}</style>
    </div>
  );
}

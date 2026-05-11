"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";

// App routes that should NOT show footer or "open dashboard" CTA
const APP_ROUTES = [
  "/inbox", "/calendar", "/goals", "/legal", "/dashboard", "/messenger",
  "/subscriptions", "/brain", "/graph", "/skills", "/benchmarks",
  "/principles", "/settings", "/superlearner", "/iphone",
];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
}

// ── Dropdown ─────────────────────────────────────────────────────────────────
// NOTE: This is a legacy component, preserved for compatibility.
function NavDropdown({
  label,
  links,
  pathname,
}: {
  label: string;
  links: { href: string; label: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = links.some(l => pathname === l.href || pathname.startsWith(l.href + "/"));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={isActive ? "nav-link-active" : undefined}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          font: "inherit",
          fontSize: 12.5,
          letterSpacing: "0.01em",
          color: isActive ? "var(--text-active)" : "var(--text-muted)",
          fontWeight: isActive ? 600 : 400,
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          transition: "color 0.15s",
        }}
      >
        {label}
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            background: "var(--glass-t3-bg)",
            border: "1px solid var(--glass-t3-border)",
            borderRadius: "var(--radius-card)",
            padding: 6,
            zIndex: 200,
            minWidth: 160,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            boxShadow: "var(--glass-t3-shadow)",
            backdropFilter: "blur(var(--glass-t3-blur))",
            WebkitBackdropFilter: "blur(var(--glass-t3-blur))",
          }}
        >
          {links.map(l => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "7px 12px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12.5,
                  color: active ? "var(--accent-orange)" : "var(--text-main)",
                  background: active ? "var(--accent-orange-soft)" : "transparent",
                  fontWeight: active ? 600 : 400,
                  transition: "background 0.12s, color 0.12s",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

const PRIMARY_LINKS = [
  { href: "/inbox",     label: "inbox" },
  { href: "/calendar",  label: "calendar" },
  { href: "/goals",     label: "goals" },
  { href: "/legal",     label: "legal" },
  { href: "/messenger", label: "messenger" },
];

const SETTINGS_LINKS = [
  { href: "/subscriptions",  label: "subscriptions" },
  { href: "/settings/email", label: "email accounts" },
];

const SYSTEM_LINKS = [
  { href: "/dashboard",    label: "dashboard" },
  { href: "/brain",        label: "brain" },
  { href: "/graph",        label: "graph" },
  { href: "/skills",       label: "skills" },
  { href: "/benchmarks",   label: "benchmarks" },
  { href: "/principles",   label: "principles" },
  { href: "/superlearner", label: "superlearner" },
  { href: "/iphone",       label: "iphone" },
];

// ── Mobile bottom nav icons (inline SVG to avoid icon library dependency) ────

const NAV_ICONS: Record<string, React.ReactNode> = {
  "/inbox": (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 13l3-7h10l3 7H2z"/><path d="M2 13v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>
      <path d="M7 13a3 3 0 006 0"/>
    </svg>
  ),
  "/calendar": (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="16" height="14" rx="2"/><path d="M14 2v4M6 2v4M2 9h16"/>
    </svg>
  ),
  "/goals": (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/><path d="M10 3V1M10 19v-2M3 10H1M19 10h-2"/>
    </svg>
  ),
  "/legal": (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z"/>
      <path d="M8 7h4M8 10h4M8 13h2"/>
    </svg>
  ),
  "/dashboard": (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/>
      <rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/>
    </svg>
  ),
};

const BOTTOM_NAV_ITEMS = [
  { href: "/inbox",     label: "inbox" },
  { href: "/calendar",  label: "cal" },
  { href: "/goals",     label: "goals" },
  { href: "/legal",     label: "legal" },
  { href: "/dashboard", label: "dash" },
];

function MobileBottomNav({ pathname }: { pathname: string }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      <div className="mobile-bottom-nav-inner">
        {BOTTOM_NAV_ITEMS.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-bottom-nav-icon">
                {NAV_ICONS[item.href]}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ── Live heartbeat badge ──────────────────────────────────────────────────────
// NOTE: This is a legacy component, preserved for compatibility.
function LiveBadge() {
  const [status, setStatus] = useState<"ok" | "err" | "unknown">("unknown");

  const check = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      setStatus(r.ok ? "ok" : "err");
    } catch {
      setStatus("err");
    }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [check]);

  return (
    <span
      className={`nav-live-badge ${status === "ok" ? "live-ok" : status === "err" ? "live-err" : ""}`}
      title={status === "ok" ? "Arthur is live" : status === "err" ? "Arthur offline" : "Checking..."}
    >
      <span className="live-dot" />
      v1
    </span>
  );
}

// ── Arthur OS Nav System ────────────────────────────────────────────────────

const ALL_ROUTES_GROUPED = [
  { group: "Workspace", links: [
    { href: "/dashboard",      label: "Dashboard" },
    { href: "/inbox",          label: "Mail" },
    { href: "/calendar",       label: "Calendar" },
    { href: "/messenger",      label: "Messenger" },
    { href: "/communications", label: "Communications" },
    { href: "/goals",          label: "Goals" },
    { href: "/legal",          label: "Legal Vault" },
    { href: "/employees",      label: "Team / Employees" },
    { href: "/iphone",         label: "iPhone" },
  ]},
  { group: "Brain", links: [
    { href: "/brain",        label: "Brain Map" },
    { href: "/graph",        label: "Knowledge Graph" },
    { href: "/skills",       label: "Skills" },
    { href: "/benchmarks",   label: "Benchmarks" },
    { href: "/principles",   label: "Principles" },
    { href: "/superlearner", label: "Superlearner" },
  ]},
  { group: "System", links: [
    { href: "/settings",      label: "Settings" },
    { href: "/subscriptions", label: "Subscriptions" },
    { href: "/lock",          label: "Lock Screen" },
  ]},
];

function ArthurOSNav({ pathname }: { pathname: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tasksCount, setTasksCount] = useState<number | "">("");
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/state").then(r => r.ok ? r.json() : null).then(d => {
      if (cancelled || !d) return;
      const n = (d as { pending_tasks?: number; tasks?: { length?: number } }).pending_tasks
        ?? (d as { tasks?: { length?: number } }).tasks?.length ?? "";
      setTasksCount(typeof n === "number" ? n : (n || ""));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const isCenterActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));

  const arthurActive = pathname === "/" || pathname === "/dashboard" || pathname.startsWith("/brain") || pathname.startsWith("/superlearner") || pathname.startsWith("/principles") || pathname.startsWith("/skills") || pathname.startsWith("/benchmarks") || pathname.startsWith("/graph");

  return (
    <>
      <style jsx global>{`
        .os-topbar {
          position: fixed;
          top: 16px;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          justify-content: center;
          padding: 0 var(--page-gutter);
        }
        .nav-island {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 4px;
          gap: 4px;
          background: var(--glass-t2-bg);
          border: 1px solid var(--glass-t2-border);
          box-shadow: var(--glass-t2-shadow);
          border-radius: var(--radius-pill);
          backdrop-filter: blur(var(--glass-t2-blur));
          -webkit-backdrop-filter: blur(var(--glass-t2-blur));
          transition: all 0.2s ease-in-out;
        }
        .nav-pill {
          display: flex;
          align-items: center;
          height: 40px;
          border-radius: var(--radius-pill);
          transition: background 0.15s ease-in-out;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-main);
          padding: 0;
        }
        .nav-pill.left { padding: 0 12px; }
        .nav-pill.left:hover { background: var(--glass-t1-bg); }
        .nav-pill.left[data-open="true"] { background: var(--glass-t3-bg); }
        .nav-pill.right { padding: 0 16px; gap: 8px; text-decoration: none; }
        .nav-pill.right:hover { background: var(--glass-t1-bg); }
        .nav-pill.center { gap: 4px; }
        .nav-link {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 40px;
          padding: 0 12px;
          border-radius: var(--radius-pill);
          text-decoration: none;
          color: var(--text-main);
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s ease-in-out;
        }
        .nav-link:hover { background: var(--glass-t1-bg); color: var(--text-active); }
        .nav-link.active { background: var(--glass-bg-faint); color: var(--text-active); }
        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background-color: var(--glass-t1-bg);
          background-image: url(/avatar.png);
          background-size: cover;
          margin-left: 4px;
        }
        .bag-count {
          background: var(--accent-orange);
          color: var(--accent-text-on);
          border-radius: var(--radius-pill);
          font-size: 12px;
          font-weight: 600;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          display: grid;
          place-items: center;
          transition: transform 0.2s ease, opacity 0.2s ease;
          opacity: 0;
          transform: scale(0.8);
        }
        .bag-count[data-active="true"] {
          opacity: 1;
          transform: scale(1);
        }
        .dots-icon { display: flex; gap: 3px; }
        .dots-icon span { width: 4px; height: 4px; background: currentColor; border-radius: 50%; }

        .mobile-bottom-nav { display: none; }

        @media (max-width: 768px) {
          .nav-link.hide-tablet { display: none; }
        }
        @media (max-width: 640px) {
          .nav-pill.center { display: none; }
          .mobile-bottom-nav {
            display: block;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 50;
            background: var(--glass-t2-bg);
            border-top: 1px solid var(--glass-t2-border);
            backdrop-filter: blur(var(--glass-t2-blur));
            -webkit-backdrop-filter: blur(var(--glass-t2-blur));
          }
          .mobile-bottom-nav-inner {
            display: flex;
            justify-content: space-around;
            max-width: var(--max-w-narrow);
            margin: 0 auto;
            padding: 8px var(--page-gutter) calc(8px + env(safe-area-inset-bottom));
          }
          .mobile-bottom-nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            color: var(--text-muted);
            text-decoration: none;
            flex: 1;
            padding: 4px 0;
          }
          .mobile-bottom-nav-item.active {
            color: var(--text-active);
          }
          .mobile-bottom-nav-icon {
            width: 24px;
            height: 24px;
            display: grid;
            place-items: center;
          }
        }
      `}</style>
      <header className="os-topbar">
        <div className="nav-island">
          <button
            type="button"
            className="nav-pill left"
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="Open all routes"
            data-open={drawerOpen}
          >
            <div className="dots-icon"><span /><span /><span /></div>
          </button>

          <div className="nav-pill center">
            <Link href="/dashboard" className={"nav-link" + (arthurActive ? " active" : "")}>
              Arthur
            </Link>
            <Link href="/inbox" className={"nav-link" + (isCenterActive("/inbox") ? " active" : "")}>
              Mail
            </Link>
            <Link href="/calendar" className={"nav-link" + (isCenterActive("/calendar") ? " active" : "")}>
              Cal
            </Link>
            <Link href="/legal" className={"nav-link hide-tablet" + (isCenterActive("/legal") ? " active" : "")}>
              Docs
            </Link>
            <Link href="/employees" className={"nav-link hide-tablet" + (isCenterActive("/employees") ? " active" : "")}>
              Team
            </Link>
            <Link href="/settings" className="user-avatar" aria-label="Settings" />
          </div>

          <Link href="/goals" className="nav-pill right">
            <span style={{ color: isCenterActive("/goals") ? "var(--text-active)" : "var(--text-main)", fontWeight: isCenterActive("/goals") ? 500 : 400, fontSize: 14 }}>
              Tasks
            </span>
            <span
              className="bag-count"
              data-active={typeof tasksCount === "number" && tasksCount > 0}
            >
              {tasksCount === "" ? "·" : tasksCount}
            </span>
          </Link>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 90,
              background: "rgba(0, 0, 0, 0.2)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          />
          <aside
            ref={drawerRef}
            style={{
              position: "fixed", top: 0, left: 0, bottom: 0,
              width: 300, zIndex: 95,
              background: "var(--glass-t3-bg)",
              backdropFilter: "blur(var(--glass-t3-blur))",
              WebkitBackdropFilter: "blur(var(--glass-t3-blur))",
              borderRight: "1px solid var(--glass-t3-border)",
              padding: "var(--page-gutter)",
              overflowY: "auto",
            }}
          >
            <div style={{ marginBottom: 24, padding: "0 12px" }}>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text-active)", marginBottom: 4 }}>Arthur OS</div>
              <div style={{ color: "var(--text-muted)", fontSize: 13 }}>All routes · Esc to close</div>
            </div>
            {ALL_ROUTES_GROUPED.map(g => (
              <div key={g.group} style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 8, padding: "0 12px", fontSize: 12, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{g.group}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {g.links.map(l => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setDrawerOpen(false)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        textDecoration: "none",
                        fontSize: 15,
                        color: isCenterActive(l.href) ? "var(--text-active)" : "var(--text-main)",
                        fontWeight: isCenterActive(l.href) ? 500 : 400,
                        background: isCenterActive(l.href) ? "var(--glass-t2-bg)" : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        </>
      )}
    </>
  );
}

export function Nav() {
  const pathname = usePathname();
  const onApp = isAppRoute(pathname);

  return (
    <>
      <ArthurOSNav pathname={pathname} />
      {onApp && <MobileBottomNav pathname={pathname} />}
    </>
  );
}

function _LegacyNav_unused() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [mobileSystemOpen, setMobileSystemOpen]     = useState(false);

  const onApp = isAppRoute(pathname);
  const isDashboard = pathname === "/dashboard";

  return (
    <>
      <nav className="nav">
        <div className="wrap nav-inner">
          <Link href="/" className="brand" onClick={() => setMobileOpen(false)}>
            <span className="brand-dot" />
            arthur.
          </Link>

          {/* Desktop links */}
          <div className="nav-links">
            {PRIMARY_LINKS.map(l => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={active ? "nav-link-active" : undefined}
                >
                  {l.label}
                </Link>
              );
            })}
            <NavDropdown label="settings" links={SETTINGS_LINKS} pathname={pathname} />
            <NavDropdown label="system"   links={SYSTEM_LINKS}   pathname={pathname} />
            <LiveBadge />
          </div>

          <div className="nav-right">
            {/* Dashboard CTA — hidden on mobile when bottom nav provides direct access */}
            {!isDashboard && (
              <Link
                href="/dashboard"
                className="cta-btn"
                style={{ fontSize: 12, padding: "8px 16px", minHeight: 36 }}
              >
                open dashboard →
              </Link>
            )}
            {/* Hamburger — only shown on mobile when NOT on app routes (app routes use bottom nav) */}
            {!onApp && (
              <button
                className="nav-hamburger"
                onClick={() => setMobileOpen(o => !o)}
                aria-label={mobileOpen ? "close menu" : "open menu"}
                aria-expanded={mobileOpen}
              >
                <span className={`ham-bar ${mobileOpen ? "ham-open" : ""}`} />
                <span className={`ham-bar ${mobileOpen ? "ham-open" : ""}`} />
                <span className={`ham-bar ${mobileOpen ? "ham-open" : ""}`} />
              </button>
            )}
            {/* On app routes mobile still needs a way to reach system/settings */}
            {onApp && (
              <button
                className="nav-hamburger"
                onClick={() => setMobileOpen(o => !o)}
                aria-label={mobileOpen ? "close menu" : "open menu"}
                aria-expanded={mobileOpen}
                style={{ display: undefined /* let CSS handle via media query */ }}
              >
                <span className={`ham-bar ${mobileOpen ? "ham-open" : ""}`} />
                <span className={`ham-bar ${mobileOpen ? "ham-open" : ""}`} />
                <span className={`ham-bar ${mobileOpen ? "ham-open" : ""}`} />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="mobile-drawer" onClick={() => setMobileOpen(false)}>
          <div className="mobile-drawer-inner" onClick={e => e.stopPropagation()}>
            {/* Primary */}
            {PRIMARY_LINKS.map(l => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`mobile-nav-link ${active ? "mobile-nav-link-active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                >
                  {l.label}
                </Link>
              );
            })}

            {/* Settings group */}
            <button
              onClick={() => setMobileSettingsOpen(o => !o)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: "none", border: "none", cursor: "pointer",
                padding: "11px 14px", borderRadius: 7, fontSize: 14,
                color: "var(--text-muted)", letterSpacing: "0.01em",
              }}
            >
              settings {mobileSettingsOpen ? "▲" : "▼"}
            </button>
            {mobileSettingsOpen && SETTINGS_LINKS.map(l => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`mobile-nav-link ${active ? "mobile-nav-link-active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                  style={{ paddingLeft: 28 }}
                >
                  {l.label}
                </Link>
              );
            })}

            {/* System group */}
            <button
              onClick={() => setMobileSystemOpen(o => !o)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: "none", border: "none", cursor: "pointer",
                padding: "11px 14px", borderRadius: 7, fontSize: 14,
                color: "var(--text-muted)", letterSpacing: "0.01em",
              }}
            >
              system {mobileSystemOpen ? "▲" : "▼"}
            </button>
            {mobileSystemOpen && SYSTEM_LINKS.map(l => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`mobile-nav-link ${active ? "mobile-nav-link-active" : ""}`}
                  onClick={() => setMobileOpen(false)}
                  style={{ paddingLeft: 28 }}
                >
                  {l.label}
                </Link>
              );
            })}

            {!isDashboard && (
              <Link
                href="/dashboard"
                className="cta-btn"
                style={{ marginTop: 16, justifyContent: "center" }}
                onClick={() => setMobileOpen(false)}
              >
                open dashboard →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Mobile bottom nav — shown on app routes only */}
      {onApp && <MobileBottomNav pathname={pathname} />}
    </>
  );
}

export function Footer() {
  const pathname = usePathname();
  if (isAppRoute(pathname)) return null;

  return (
    <footer className="site">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="brand-line">
              <span className="brand-dot" />
              arthur.
            </div>
            <p className="tagline">
              specialist beats generalist.<br />
              built for one operator, compounding nightly.
            </p>
          </div>

          <div>
            <h4>Product</h4>
            <ul>
              <li><Link href="/dashboard">dashboard</Link></li>
              <li><Link href="/brain">the brain</Link></li>
              <li><Link href="/graph">graph</Link></li>
              <li><Link href="/skills">skills</Link></li>
              <li><Link href="/benchmarks">benchmarks</Link></li>
              <li><Link href="/principles">principles</Link></li>
            </ul>
          </div>

          <div>
            <h4>Operator</h4>
            <ul>
              <li>Aspen &amp; May</li>
              <li>Dabney &amp; Co.</li>
              <li>LOVELEEDAY Studios</li>
              <li>olldae</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          Aspen &amp; May internal · 2026 · not for public distribution
        </div>
      </div>
    </footer>
  );
}
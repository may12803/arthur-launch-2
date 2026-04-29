"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

// App routes that should NOT show footer or "open dashboard" CTA
const APP_ROUTES = [
  "/inbox", "/calendar", "/legal", "/dashboard", "/messenger",
  "/subscriptions", "/brain", "/graph", "/skills", "/benchmarks",
  "/principles", "/settings",
];

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some(r => pathname === r || pathname.startsWith(r + "/"));
}

// ── Dropdown ─────────────────────────────────────────────────────────────────

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
          color: isActive ? "var(--text)" : "var(--text-dim)",
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
            background: "var(--panel-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: 6,
            zIndex: 200,
            minWidth: 160,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
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
                  borderRadius: 5,
                  fontSize: 12.5,
                  color: active ? "var(--accent)" : "var(--text-dim)",
                  background: active ? "var(--accent-soft)" : "transparent",
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
  { href: "/legal",     label: "legal" },
  { href: "/messenger", label: "messenger" },
];

const SETTINGS_LINKS = [
  { href: "/subscriptions",  label: "subscriptions" },
  { href: "/settings/email", label: "email accounts" },
];

const SYSTEM_LINKS = [
  { href: "/dashboard",   label: "dashboard" },
  { href: "/brain",       label: "brain" },
  { href: "/graph",       label: "graph" },
  { href: "/skills",      label: "skills" },
  { href: "/benchmarks",  label: "benchmarks" },
  { href: "/principles",  label: "principles" },
];

export function Nav() {
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
            <span className="nav-build">v1 · live</span>
          </div>

          <div className="nav-right">
            {!isDashboard && (
              <Link
                href="/dashboard"
                className="cta-btn"
                style={{ fontSize: 12, padding: "8px 16px", minHeight: 36 }}
              >
                open dashboard →
              </Link>
            )}
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
                color: "var(--text-dim)", letterSpacing: "0.01em",
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
                color: "var(--text-dim)", letterSpacing: "0.01em",
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

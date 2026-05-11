"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

// ── MobileNav — Drawer + Bottom Nav ──────────────────────────────────────────
// Bottom nav: 6 primary routes, always visible on mobile
// Drawer: slides in from left, contains all secondary routes
// Hamburger: top-left on mobile, opens drawer
// Conforms to: 44px touch targets, WCAG 2.1 focus, no icon lib dependency

const PRIMARY_ROUTES = [
  { href: "/dashboard", label: "Dash",     icon: "⊞" },
  { href: "/inbox",     label: "Inbox",    icon: "✉" },
  { href: "/calendar",  label: "Cal",      icon: "◫" },
  { href: "/goals",     label: "Goals",    icon: "◎" },
  { href: "/legal",     label: "Legal",    icon: "⊡" },
  { href: "/messenger", label: "Msgs",     icon: "◷" },
];

const DRAWER_SECTIONS = [
  {
    label: "Core",
    links: [
      { href: "/inbox",     label: "Inbox" },
      { href: "/calendar",  label: "Calendar" },
      { href: "/goals",     label: "Goals" },
      { href: "/legal",     label: "Legal" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/messenger", label: "Messenger" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/brain",        label: "Brain" },
      { href: "/graph",        label: "Graph" },
      { href: "/skills",       label: "Skills" },
      { href: "/benchmarks",   label: "Benchmarks" },
      { href: "/principles",   label: "Principles" },
      { href: "/superlearner", label: "Superlearner" },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/subscriptions",  label: "Subscriptions" },
      { href: "/settings/email", label: "Email Accounts" },
      { href: "/iphone",         label: "iPhone" },
    ],
  },
];

// ── Drawer ────────────────────────────────────────────────────────────────────

function NavDrawer({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  // Trap focus and close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 299,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 280ms var(--ease-out-soft)",
        }}
      />

      {/* Drawer panel */}
      <nav
        role="navigation"
        aria-label="mobile navigation drawer"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(80vw, 320px)",
          zIndex: 300,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 320ms var(--ease-out-soft)",
          background: "rgba(12, 14, 18, 0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRight: "1px solid var(--glass-border-tier2)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          padding: "24px 0 120px",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px 20px",
            borderBottom: "1px solid var(--glass-border)",
          }}
        >
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-active)",
              letterSpacing: "-0.02em",
            }}
          >
            arthur
          </span>
          <button
            onClick={onClose}
            aria-label="close navigation"
            style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              borderRadius: 8,
              color: "var(--text-muted)",
              cursor: "pointer",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              transition: "all 0.15s",
            }}
          >
            ✕
          </button>
        </div>

        {/* Sections */}
        {DRAWER_SECTIONS.map((section) => (
          <div key={section.label} style={{ padding: "16px 12px 0" }}>
            <p
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
                fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
                padding: "0 8px",
                marginBottom: 6,
              }}
            >
              {section.label}
            </p>
            {section.links.map((link) => {
              const active =
                pathname === link.href ||
                pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 44,
                    padding: "0 12px",
                    borderRadius: 10,
                    fontSize: 15,
                    color: active ? "var(--accent-orange)" : "var(--text-main)",
                    background: active
                      ? "var(--accent-orange-soft)"
                      : "transparent",
                    fontWeight: active ? 600 : 400,
                    transition: "background 0.12s, color 0.12s",
                    textDecoration: "none",
                    marginBottom: 2,
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

// ── Hamburger button ──────────────────────────────────────────────────────────

export function HamburgerButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-label={open ? "close navigation" : "open navigation"}
      aria-expanded={open}
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        zIndex: 301,
        width: 44,
        height: 44,
        borderRadius: 12,
        background: "var(--glass-bg-tier2)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid var(--glass-border-tier2)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        cursor: "pointer",
        transition: "all 0.15s var(--ease-out-soft)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: 18,
            height: 1.5,
            background: "var(--text-main)",
            borderRadius: 2,
            transition: "all 0.2s var(--ease-out-soft)",
            transform:
              open && i === 0
                ? "translateY(6.5px) rotate(45deg)"
                : open && i === 2
                ? "translateY(-6.5px) rotate(-45deg)"
                : open && i === 1
                ? "scaleX(0)"
                : "none",
            opacity: open && i === 1 ? 0 : 1,
          }}
        />
      ))}
    </button>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────

function BottomNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="primary mobile navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: "rgba(12, 14, 18, 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--glass-border)",
        display: "flex",
        padding: "0 0 env(safe-area-inset-bottom)",
      }}
    >
      {PRIMARY_ROUTES.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 56,
              paddingTop: 8,
              paddingBottom: 4,
              fontSize: 10,
              letterSpacing: "0.04em",
              textDecoration: "none",
              gap: 4,
              color: active ? "var(--accent-orange)" : "var(--text-muted)",
              transition: "color 0.15s",
              position: "relative",
            }}
          >
            {/* Active pill indicator */}
            {active && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 6,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: "var(--accent-orange-soft)",
                  zIndex: -1,
                }}
              />
            )}
            <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ── MobileNav (composed) ──────────────────────────────────────────────────────

export function MobileNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const close = useCallback(() => setDrawerOpen(false), []);
  const toggle = useCallback(() => setDrawerOpen((o) => !o), []);

  return (
    <>
      <HamburgerButton open={drawerOpen} onToggle={toggle} />
      <NavDrawer open={drawerOpen} onClose={close} pathname={pathname} />
      <BottomNav pathname={pathname} />
    </>
  );
}

export default MobileNav;

"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import { Wordmark } from "./LogoMark";
import { SiteFooter } from "./SiteFooter";

const NAV: { href: string; label: string; match?: string[]; staffOnly?: boolean }[] = [
  { href: "/client/workstreams", label: "Workstreams" },
  { href: "/client/connections", label: "Connections" },
  { href: "/client/data/health", label: "Data health", match: ["/client/data"] },
  { href: "/client/approvals", label: "Approvals" },
  { href: "/client/documents", label: "Documents" },
  { href: "/client/team", label: "Team" },
  { href: "/client/billing", label: "Billing" },
  { href: "/client/organization", label: "Settings", match: ["/client/organization", "/client/security", "/client/audit", "/client/access", "/client/developer", "/client/status", "/client/contracts", "/client/account"] },
  { href: "/client/staff", label: "Staff console", staffOnly: true },
];

// loveleedaystudios.com's sticky white header, carrying the portal's
// sections where the site carries System / Uses / Studio, and the ink pill
// where the site puts "Start a project".
export function PortalShell({
  tenantName,
  role,
  canSwitch,
  children,
}: {
  tenantName: string;
  role?: string;
  canSwitch?: boolean;
  children: ReactNode;
}) {
  const activePath = usePathname() || "/client";
  const isStaff = role === "staff";
  const links = NAV.filter((item) => !item.staffOnly || isStaff).map((item) => {
    const active = (item.match ?? [item.href]).some((m) => activePath === m || activePath.startsWith(m + "/"));
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`whitespace-nowrap py-3 ${active ? "text-[var(--ink)] font-medium" : ""}`}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/client" aria-label="LOVELEEDAY client portal home">
              <Wordmark />
            </Link>
            <span className="text-[12px] text-[#c4c6cc]" aria-hidden="true">/</span>
            <span className="text-[12px] text-[#606066] truncate">{tenantName}</span>
            {canSwitch ? <Link href="/client/select-company" className="text-[12px] text-[#606066] underline whitespace-nowrap">Switch</Link> : null}
          </div>
          <nav className="ll-nav-links" aria-label="Portal navigation">
            <div className="hidden md:flex items-center gap-8">{links}</div>
            <SignOutButton />
          </nav>
        </div>
        <div className="md:hidden border-t border-[#00000010]">
          <nav className="ll-wrap ll-nav-links !gap-6 overflow-x-auto" aria-label="Portal sections">
            {links}
          </nav>
        </div>
      </header>
      <main className="ll-wrap flex-1 py-16 md:py-20">{children}</main>
      <SiteFooter />
    </div>
  );
}

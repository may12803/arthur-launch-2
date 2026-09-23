"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

const NAV = [
  { href: "/client", label: "Dashboard" },
  { href: "/client/team", label: "Team" },
  { href: "/client/contracts", label: "Contracts" },
  { href: "/client/billing", label: "Billing" },
  { href: "/client/account", label: "Account" },
];

export function PortalShell({
  tenantName,
  children,
}: {
  tenantName: string;
  children: ReactNode;
}) {
  const activePath = usePathname() || "/client";
  return (
    <div className="min-h-screen bg-bg-base font-sans">
      <header className="border-b border-line-separator">
        <div className="mx-auto max-w-[1120px] px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-serif italic text-[19px] font-medium text-text-active whitespace-nowrap">
              loveleeday
            </div>
            <span className="text-line-separator">/</span>
            <div className="text-[13px] text-text-muted truncate">{tenantName}</div>
          </div>
          <SignOutButton />
        </div>
        <nav className="mx-auto max-w-[1120px] px-6 flex gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.href === "/client" ? activePath === "/client" : activePath.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3.5 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-accent-orange text-text-active"
                    : "border-transparent text-text-muted hover:text-text-main"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-[1120px] px-6 py-10">{children}</main>
    </div>
  );
}

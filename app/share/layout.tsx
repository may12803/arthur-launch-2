import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../client/portal-theme.css";

export const metadata: Metadata = {
  title: { absolute: "Shared document — LOVELEEDAY" },
  robots: { index: false, follow: false },
  icons: { icon: "/brand/favicon-32.png", apple: "/brand/apple-icon.png" },
  referrer: "no-referrer",
};

// Outside recipients have no portal account; they get the portal's look via
// the same scoped theme, and nothing else from /client.
export default function ShareLayout({ children }: { children: ReactNode }) {
  return <div className="ll-portal">{children}</div>;
}

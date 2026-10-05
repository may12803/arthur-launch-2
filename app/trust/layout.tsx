import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../client/portal-theme.css";
import "../client/cp-ui.css";

export const metadata: Metadata = {
  title: { absolute: "Trust center — LOVELEEDAY" },
  description: "What LOVELEEDAY does with your business data, the subprocessors involved, and where security work stands.",
  keywords: ["LOVELEEDAY", "trust center", "data security", "subprocessors"],
  applicationName: "LOVELEEDAY",
  openGraph: {
    type: "website", siteName: "LOVELEEDAY", title: "Trust center — LOVELEEDAY",
    description: "What LOVELEEDAY does with your business data, the subprocessors involved, and where security work stands.",
  },
  twitter: { card: "summary", title: "Trust center — LOVELEEDAY" },
  robots: { index: true, follow: true },
  icons: { icon: "/brand/favicon-32.png", apple: "/brand/apple-icon.png" },
};

// Public, no sign-in. Same tokens as the portal (.ll-portal), so it reads as the same product.
export default function TrustLayout({ children }: { children: ReactNode }) {
  return <div className="ll-portal">{children}</div>;
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./portal-theme.css";

export const metadata: Metadata = {
  title: { absolute: "Client portal — LOVELEEDAY" },
  description: "Deliverables, contracts and billing for LOVELEEDAY clients.",
  robots: { index: false, follow: false },
  icons: { icon: "/brand/favicon-32.png", apple: "/brand/apple-icon.png" },
};

// Scoped to the /client route group. The live loveleedaystudios.com uses the
// system font stack only, so no webfonts are loaded here; portal-theme.css
// carries the site's tokens under .ll-portal and never touches the admin app.
export default function ClientRouteGroupLayout({ children }: { children: ReactNode }) {
  return <div className="ll-portal">{children}</div>;
}

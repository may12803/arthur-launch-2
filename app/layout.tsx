import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { CommandBarProvider } from "./_components/CommandBar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  preload: true,  // used for all eyebrows, labels, code — worth preloading
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: "arthur — chief of staff for the multi-domain operator",
    template: "%s · arthur",
  },
  description:
    "Specialist AI chief of staff. 438 knowledge files, 6,293 authored links, 22 wired lobes. Defaults to free local Gemma. Compounding nightly via EvolveR principle distillation.",
  keywords: ["AI agent", "AI chief of staff", "personal AI", "multi-agent system", "self-improving AI", "Arthur", "Aspen May"],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Arthur",
    title: "arthur — chief of staff",
    description: "Specialist AI built for one operator. Compounding nightly. 438 knowledge files, 6,293 authored links.",
  },
  twitter: { card: "summary_large_image", title: "arthur — chief of staff" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        {/* Skip-to-content — keyboard / screen reader navigation */}
        <a href="#main-content" className="skip-link">
          skip to content
        </a>
        <CommandBarProvider>
          <div id="main-content">
            {children}
          </div>
        </CommandBarProvider>
      </body>
    </html>
  );
}

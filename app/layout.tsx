import type { Metadata } from "next";
import { Lora, Inter, JetBrains_Mono } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppShellWrapper } from "./_components/AppShellWrapper";

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-lora",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-jetbrains",
  display: "swap",
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
    <html lang="en" className={`${lora.variable} ${inter.variable} ${jetbrainsMono.variable} ${GeistMono.variable}`}>
      <body className="bg-bg-base text-text-main">
        <AppShellWrapper>{children}</AppShellWrapper>
      </body>
    </html>
  );
}

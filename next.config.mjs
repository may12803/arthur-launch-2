const REPORT_ONLY_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://api.stripe.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // Do not advertise the framework. Was `x-powered-by: Next.js` on every response
  // (flagged in the 2026-09-23 security assessment).
  poweredByHeader: false,

  // Baseline security headers, applied to every route. Deliberately NOT a full
  // restrictive Content-Security-Policy default-src: that needs iteration against the
  // live app to avoid breaking inline scripts/styles, and is tracked separately.
  // frame-ancestors 'none' + X-Frame-Options give clickjacking protection now.
  headers: async () => [
    // Every portal HTML response is per-visitor or session-dependent: never cached by the browser or an intermediary. Static
    // prerender (login, forgot, reset...) otherwise ships `s-maxage=31536000, stale-while-revalidate` (second route audit, minor 11).
    {
      source: "/client/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store" }],
    },
    {
      source: "/client",
      headers: [{ key: "Cache-Control", value: "private, no-store" }],
    },
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        // Report-only first: the full policy is observed against the live app (violations land in /api/csp-report and
        // the Fly logs) before any of it is enforced, so nothing breaks while it is tuned.
        { key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_CSP },
      ],
    },
  ],

  // xlsx is loaded by a dynamic import in lib/document/universal-converter.ts, and Next's
  // standalone file tracing did not follow it: a whole-image search of the deployed container
  // found no xlsx at all, so /api/chat threw MODULE_NOT_FOUND the moment anyone attached a
  // spreadsheet. The dynamic import was deliberate ("bundles xlsx only when needed") and is
  // exactly what the tracer misses, so the dependency has to be named explicitly.
  experimental: {
    // Next 14 ignores instrumentation.ts without this flag, so the in-process connector
    // scheduler (lib/connectors/scheduler.ts) was never started in production.
    instrumentationHook: true,
    outputFileTracingIncludes: {
      "/api/chat": ["./node_modules/xlsx/**"],
    },
  },
};

export default nextConfig;

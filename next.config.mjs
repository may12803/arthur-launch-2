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
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      ],
    },
  ],

  // xlsx is loaded by a dynamic import in lib/document/universal-converter.ts, and Next's
  // standalone file tracing did not follow it: a whole-image search of the deployed container
  // found no xlsx at all, so /api/chat threw MODULE_NOT_FOUND the moment anyone attached a
  // spreadsheet. The dynamic import was deliberate ("bundles xlsx only when needed") and is
  // exactly what the tracer misses, so the dependency has to be named explicitly.
  experimental: {
    outputFileTracingIncludes: {
      "/api/chat": ["./node_modules/xlsx/**"],
    },
  },
};

export default nextConfig;

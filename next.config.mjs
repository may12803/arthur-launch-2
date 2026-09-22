/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

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

// DEAD FILE ON NEXT 14 -- next.config.ts is only read from Next 15 onward, so NOTHING in
// this file takes effect. next.config.mjs is the config in force. The reactStrictMode and
// the /home -> / redirect below have never applied; /home returns 401 from the auth
// middleware, not a 308. Verified against the live site 2026-09-22. Kept, not deleted, so
// the intent survives for whoever does the Next 15 upgrade -- merge it into the .mjs then.
import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Required for the Dockerfile that copies .next/standalone into the runner stage.
  // Without this, the build doesn't emit /app/.next/standalone and the Fly image build fails.
  output: "standalone",
  redirects: async () => {
    return [
      {
        source: "/home",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default config;

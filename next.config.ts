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

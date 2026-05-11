/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbopack: {
      loaders: {
        // Here you can configure Turbopack loaders as needed.
        // For example, to handle .svg files:
        // "*.svg": ["@svgr/webpack"]
      },
      // Disable Turbopack for builds
      build: false,
    },
  },
};

export default nextConfig;

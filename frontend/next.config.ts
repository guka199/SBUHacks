import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
  // Optional separate build folder, so a second `next dev` (e.g. a test server on another port) can run alongside.
  ...(process.env.NEXT_DIST_DIR && { distDir: process.env.NEXT_DIST_DIR }),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["three"],
  experimental: { proxyTimeout: 600000, proxyClientMaxBodySize: "205mb" },
  async rewrites() {
    const backend = (process.env.API_URL ?? "http://127.0.0.1:8000").replace(
      /\/$/,
      "",
    );
    return [{ source: "/backend/:path*", destination: `${backend}/:path*` }];
  },
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
};
export default config;

import type { NextConfig } from "next";
const config: NextConfig = {
  devIndicators: false,
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
    rules: {
      "*.css": {
        // Preserve native CSS Module exports. Renaming modules through the
        // Tailwind loader makes imports resolve to an empty class-name map.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};
export default config;

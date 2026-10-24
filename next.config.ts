import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["three"],
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
};
export default config;

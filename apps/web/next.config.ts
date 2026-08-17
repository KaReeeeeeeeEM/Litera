import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      module: "./src/lib/browser-module-shim.ts",
    },
  },
};

export default nextConfig;

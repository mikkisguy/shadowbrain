import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  output: isProd ? "standalone" : undefined,
  // Keep sharp out of the server bundle so native bindings resolve at runtime.
  serverExternalPackages: ["sharp"],
  // Prefer pnpm store paths. Including top-level ./node_modules/sharp/** can
  // materialize sharp without its sibling deps (detect-libc) and break require().
  // NFT also tends to keep @img metadata while dropping libvips-cpp.so.*; the
  // Dockerfile overlays that native payload into standalone after build.
  outputFileTracingIncludes: {
    "/api/images": [
      "./node_modules/.pnpm/@img+sharp-libvips-linux-*/**/*",
      "./node_modules/.pnpm/@img+sharp-linux-*/**/*",
      "./node_modules/.pnpm/sharp@*/node_modules/**/*",
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Required so the app can be embedded / opened from preview hosts (e2b, codespaces, ...).
  allowedDevOrigins: [
    "*.e2b.app",
    "*.e2b.dev",
    "*.vercel.app",
    "localhost",
    "*.localhost",
  ],
  // Native / node-only modules must not be bundled by webpack.
  serverExternalPackages: [
    // Must stay external: PGlite loads WASM assets via `new URL(..., import.meta.url)`,
    // which webpack rewrites into a foreign-realm URL that Node's fs rejects.
    "@electric-sql/pglite",
    "pdf-parse",
    "pdf-parse/lib/pdf-parse.js",
    "pdf-lib",
    "mammoth",
    "docx",
    "bullmq",
    "ioredis",
    "@prisma/client",
    "prisma",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;

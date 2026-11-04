import type { NextConfig } from "next";

// PDF.js loads Canvas and its worker dynamically, beyond the static trace.
const pdfRuntimeFiles = [
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-*/package.json",
  "./node_modules/@napi-rs/canvas-*/*.node",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/photo-1470770841072-f978cf4d019e",
      },
    ],
  },
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./lib/rag/assets/voyage-4-tokenizer.json.gz"],
    "/api/knowledge": pdfRuntimeFiles,
    "/api/knowledge/\\[id\\]": pdfRuntimeFiles,
    "/api/knowledge/\\[id\\]/reindex": pdfRuntimeFiles,
    "/api/integrations/\\[id\\]/sync": pdfRuntimeFiles,
    "/api/integrations/worker": pdfRuntimeFiles,
  },
};

export default nextConfig;

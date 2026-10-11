import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/**/*": ["./lib/rag/assets/voyage-4-tokenizer.json.gz"],
  },
};

export default nextConfig;

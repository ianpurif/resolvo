import type { NextConfig } from "next";

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
  },
};

export default nextConfig;

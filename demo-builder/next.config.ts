import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // puppeteer is a heavy Node-only package; keep it out of the bundler so the
  // analyze route (Node runtime, local-only) can require it at runtime.
  serverExternalPackages: ["puppeteer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // pdf-parse (via pdfjs-dist) loads a worker script from a path that
  // doesn't exist once bundled by Next.js's server compiler ("Setting up
  // fake worker failed"). Keeping it external makes it load natively from
  // node_modules at runtime instead, where its worker resolution works.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;

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
  // @napi-rs/canvas must be external too - it's pdf-parse's Node DOMMatrix
  // polyfill (via CanvasFactory), and it ships a native binary that can't
  // be bundled; without this it fails to load on Vercel with "DOMMatrix is
  // not defined".
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
};

export default nextConfig;

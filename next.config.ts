import type { NextConfig } from "next";

// Built as a static site for GitHub Pages. The Pages workflow sets
// NEXT_PUBLIC_BASE_PATH to "/<repo>" because project sites are served from a subpath.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

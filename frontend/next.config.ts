import type { NextConfig } from "next";

// The browser always calls relative /api/* URLs. In dev Next proxies them to the FastAPI server
// (API_ORIGIN); in production Caddy routes /api to the api container. Same origin => the httpOnly
// session cookie works without CORS.
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8010";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

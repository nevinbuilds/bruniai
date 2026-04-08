const bruniaiRuntimeTraceGlobs = [
  "./node_modules/bruniai/dist/runtime/**/*",
  "./node_modules/playwright-core/.local-browsers/**/*",
  "./node_modules/playwright/.local-browsers/**/*",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true,
  },
  outputFileTracingIncludes: {
    "/api/mcp": bruniaiRuntimeTraceGlobs,
  },
  async rewrites() {
    return [
      {
        source: "/mcp",
        destination: "/api/mcp",
      },
      {
        source: "/healthz",
        destination: "/api/healthz",
      },
    ];
  },
};

export default nextConfig;

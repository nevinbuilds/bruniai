const bruniaiRuntimeTraceGlobs = [
  "./node_modules/bruniai/dist/runtime/**/*",
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

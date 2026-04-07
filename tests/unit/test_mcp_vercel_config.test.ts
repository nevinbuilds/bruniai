import { describe, expect, it } from "vitest";

describe("mcp vercel next config", () => {
  it("traces the bruniai runtime bundle for the MCP API route", async () => {
    const { default: nextConfig } = await import(
      "../../apps/mcp-vercel/next.config.mjs"
    );

    expect(nextConfig.outputFileTracingIncludes).toMatchObject({
      "/api/mcp": expect.arrayContaining([
        "./node_modules/bruniai/dist/runtime/**/*",
      ]),
    });
  });
});

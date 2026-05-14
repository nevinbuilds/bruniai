import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const registeredTools: Array<{
  name: string;
  config: any;
  handler: (args: any) => Promise<any>;
}> = [];

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    server = {};

    constructor(
      public readonly info: { name: string; version: string },
      public readonly capabilities: unknown,
    ) {}

    registerTool(
      name: string,
      config: unknown,
      handler: (args: any) => Promise<any>,
    ) {
      registeredTools.push({ name, config, handler });
    }

    connect = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class MockStdioServerTransport {},
}));

vi.mock("bruniai", () => ({
  compareUrls: vi.fn(),
  compareImageToUrl: vi.fn(),
  sendReport: vi.fn(),
}));

describe("MCP server", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalBruniToken = process.env.BRUNI_TOKEN;
  const originalBruniAppUrl = process.env.BRUNI_APP_URL;
  const originalMcpInternalSecret = process.env.BRUNI_MCP_INTERNAL_SECRET;

  beforeEach(() => {
    registeredTools.length = 0;
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.BRUNI_TOKEN;
    delete process.env.BRUNI_APP_URL;
    delete process.env.BRUNI_MCP_INTERNAL_SECRET;
  });

  afterEach(() => {
    if (originalOpenAiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalBruniToken) {
      process.env.BRUNI_TOKEN = originalBruniToken;
    } else {
      delete process.env.BRUNI_TOKEN;
    }
    if (originalBruniAppUrl) {
      process.env.BRUNI_APP_URL = originalBruniAppUrl;
    } else {
      delete process.env.BRUNI_APP_URL;
    }
    if (originalMcpInternalSecret) {
      process.env.BRUNI_MCP_INTERNAL_SECRET = originalMcpInternalSecret;
    } else {
      delete process.env.BRUNI_MCP_INTERNAL_SECRET;
    }
    vi.clearAllMocks();
  });

  it("registers compare_image_to_url alongside compare_urls", async () => {
    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );

    createServer();

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "compare_urls",
      "compare_image_to_url",
    ]);
  });

  it("routes compare_image_to_url to the bruniai compareImageToUrl API", async () => {
    const bruniai = await import("bruniai");
    vi.mocked(bruniai.compareImageToUrl).mockResolvedValue({
      status: "pass",
      visual_analysis: { status: "pass" },
      sections_analysis: "sections",
      images: {
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
      },
    } as any);

    const { setBruniaiModuleLoaderForTests } = await import(
      "../../packages/mcp-server/src/bruniai-service.ts"
    );
    setBruniaiModuleLoaderForTests(async () => bruniai as any);

    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareImageToUrlTool = registeredTools.find(
      (tool) => tool.name === "compare_image_to_url",
    );
    expect(compareImageToUrlTool).toBeDefined();

    const response = await compareImageToUrlTool!.handler({
      baseImageSource: "data:image/png;base64,abc",
      previewUrl: "https://example.com/preview",
      sectionExplanationMode: "off",
    });

    expect(bruniai.compareImageToUrl).toHaveBeenCalledWith({
      baseImageSource: "data:image/png;base64,abc",
      previewUrl: "https://example.com/preview",
      page: "/",
      sectionExplanationMode: "off",
      prNumber: undefined,
      repository: undefined,
    });
    expect(response.isError).toBeUndefined();
    setBruniaiModuleLoaderForTests(null);
  });

  it("registers sectionExplanationMode in both tool schemas", async () => {
    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );

    createServer();

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );
    const compareImageToUrlTool = registeredTools.find(
      (tool) => tool.name === "compare_image_to_url",
    );

    expect(compareUrlsTool?.config?.inputSchema?.sectionExplanationMode).toBeDefined();
    expect(
      compareImageToUrlTool?.config?.inputSchema?.sectionExplanationMode,
    ).toBeDefined();
  });

  it("registers prNumber and repository in both tool schemas", async () => {
    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );

    createServer();

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );
    const compareImageToUrlTool = registeredTools.find(
      (tool) => tool.name === "compare_image_to_url",
    );

    expect(compareUrlsTool?.config?.inputSchema?.prNumber).toBeDefined();
    expect(compareUrlsTool?.config?.inputSchema?.repository).toBeDefined();
    expect(compareImageToUrlTool?.config?.inputSchema?.prNumber).toBeDefined();
    expect(compareImageToUrlTool?.config?.inputSchema?.repository).toBeDefined();
  });

  it("returns an MCP error payload for invalid compare_image_to_url input", async () => {
    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareImageToUrlTool = registeredTools.find(
      (tool) => tool.name === "compare_image_to_url",
    );
    const response = await compareImageToUrlTool!.handler({
      baseImageSource: "",
      previewUrl: "https://example.com/preview",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain(
      "baseImageSource and previewUrl are required",
    );
  });

  it("returns a condensed text summary on success (pass status)", async () => {
    const bruniai = await import("bruniai");
    vi.mocked(bruniai.compareUrls).mockResolvedValue({
      status: "pass",
      visual_analysis: {
        status: "pass",
        critical_issues: { sections: [], summary: "All clear." },
        visual_changes: { diff_highlights: [], conclusion: "" },
        conclusion: { summary: "No issues detected.", recommendation: "pass" },
      },
      sections_analysis: "sections",
      images: {
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
      },
    } as any);

    const { setBruniaiModuleLoaderForTests } = await import(
      "../../packages/mcp-server/src/bruniai-service.ts"
    );
    setBruniaiModuleLoaderForTests(async () => bruniai as any);

    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );

    const response = await compareUrlsTool!.handler({
      baseUrl: "https://example.com",
      previewUrl: "https://preview.example.com",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("✅");
    expect(response.content[0].text).toContain("Status: Pass");
    expect(response.content[0].text).toContain("No issues found");
    expect(response.content[0].text).toContain("No issues detected.");
    setBruniaiModuleLoaderForTests(null);
  });

  it("returns a condensed text summary with top issues on warning status", async () => {
    const bruniai = await import("bruniai");
    vi.mocked(bruniai.compareUrls).mockResolvedValue({
      status: "warning",
      visual_analysis: {
        status: "warning",
        critical_issues: {
          sections: [
            {
              name: "Hero",
              status: "Missing",
              description: "Layout shift detected",
              section_id: "hero",
            },
            {
              name: "CTA",
              status: "Present",
              description: "Missing border style",
              section_id: "cta",
            },
          ],
          summary: "Issues found.",
        },
        visual_changes: { diff_highlights: [], conclusion: "" },
        conclusion: {
          summary: "Review recommended.",
          recommendation: "review_required",
        },
      },
      sections_analysis: "sections",
      images: {
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
      },
    } as any);

    const { setBruniaiModuleLoaderForTests } = await import(
      "../../packages/mcp-server/src/bruniai-service.ts"
    );
    setBruniaiModuleLoaderForTests(async () => bruniai as any);

    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );

    const response = await compareUrlsTool!.handler({
      baseUrl: "https://example.com",
      previewUrl: "https://preview.example.com",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain("⚠️");
    expect(response.content[0].text).toContain("Status: Warning");
    expect(response.content[0].text).toContain("Issues found: 2");
    expect(response.content[0].text).toContain("Hero");
    expect(response.content[0].text).toContain("CTA");
    expect(response.content[0].text).toContain("Review recommended.");
    setBruniaiModuleLoaderForTests(null);
  });

  it("includes report URL in summary when sendReport succeeds", async () => {
    process.env.BRUNI_TOKEN = "test-bruni-token";

    const bruniai = await import("bruniai");
    const mockResult = {
      status: "pass",
      visual_analysis: {
        status: "pass",
        critical_issues: { sections: [], summary: "" },
        visual_changes: { diff_highlights: [], conclusion: "" },
        conclusion: { summary: "All good.", recommendation: "pass" },
      },
      sections_analysis: "sections",
      images: {
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
      },
    };
    vi.mocked(bruniai.compareUrls).mockResolvedValue(mockResult as any);
    vi.mocked(bruniai.sendReport).mockResolvedValue(
      "https://app.brunivisual.com/test/abc123",
    );

    const { setBruniaiModuleLoaderForTests } = await import(
      "../../packages/mcp-server/src/bruniai-service.ts"
    );
    setBruniaiModuleLoaderForTests(async () => bruniai as any);

    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );

    const response = await compareUrlsTool!.handler({
      baseUrl: "https://example.com",
      previewUrl: "https://preview.example.com",
      prNumber: "42",
      repository: "owner/repo",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "→ Open visual report: https://app.brunivisual.com/test/abc123",
    );
    expect(bruniai.sendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        bruniToken: "test-bruni-token",
        baseUrl: "https://example.com",
        previewUrl: "https://preview.example.com",
        comparisonMode: "url-to-url",
        prNumber: "42",
        repository: "owner/repo",
      }),
    );
    setBruniaiModuleLoaderForTests(null);
  });

  it("omits report URL when BRUNI_TOKEN is not set", async () => {
    const bruniai = await import("bruniai");
    vi.mocked(bruniai.compareUrls).mockResolvedValue({
      status: "pass",
      visual_analysis: {
        status: "pass",
        critical_issues: { sections: [], summary: "" },
        visual_changes: { diff_highlights: [], conclusion: "" },
        conclusion: { summary: "", recommendation: "pass" },
      },
      sections_analysis: "sections",
      images: {
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
      },
    } as any);

    const { setBruniaiModuleLoaderForTests } = await import(
      "../../packages/mcp-server/src/bruniai-service.ts"
    );
    setBruniaiModuleLoaderForTests(async () => bruniai as any);

    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );

    const response = await compareUrlsTool!.handler({
      baseUrl: "https://example.com",
      previewUrl: "https://preview.example.com",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).not.toContain("Open visual report");
    expect(bruniai.sendReport).not.toHaveBeenCalled();
    setBruniaiModuleLoaderForTests(null);
  });

  it("sends reports with MCP auth context when configured", async () => {
    process.env.BRUNI_APP_URL = "https://app.brunivisual.com";
    process.env.BRUNI_MCP_INTERNAL_SECRET = "internal-secret";

    const bruniai = await import("bruniai");
    const mockResult = {
      status: "pass",
      visual_analysis: {
        status: "pass",
        critical_issues: { sections: [], summary: "" },
        visual_changes: { diff_highlights: [], conclusion: "" },
        conclusion: { summary: "All good.", recommendation: "pass" },
      },
      sections_analysis: "sections",
      images: {
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
      },
    };
    const authContext = {
      userId: "user-123",
      tokenId: "token-123",
      scopes: ["reports:create"],
      mcpToken: "bruni_mcp_test",
    };

    vi.mocked(bruniai.compareUrls).mockResolvedValue(mockResult as any);
    vi.mocked(bruniai.sendReport).mockResolvedValue(
      "https://app.brunivisual.com/test/mcp123",
    );

    const { createBruniMcpServer } = await import(
      "../../packages/mcp-server/src/server-factory.ts"
    );
    createBruniMcpServer(
      {
        compareUrls: bruniai.compareUrls as any,
        compareImageToUrl: bruniai.compareImageToUrl as any,
        sendReport: bruniai.sendReport as any,
      },
      authContext,
    );

    const compareUrlsTool = registeredTools.find(
      (tool) => tool.name === "compare_urls",
    );

    const response = await compareUrlsTool!.handler({
      baseUrl: "https://example.com",
      previewUrl: "https://preview.example.com",
    });

    expect(response.isError).toBeUndefined();
    expect(response.content[0].text).toContain(
      "→ Open visual report: https://app.brunivisual.com/test/mcp123",
    );
    expect(bruniai.sendReport).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpAuthContext: authContext,
        mcpToken: "bruni_mcp_test",
        mcpInternalSecret: "internal-secret",
        bruniApiUrl: "https://app.brunivisual.com/api/internal/mcp/tests",
      }),
    );
  });
});

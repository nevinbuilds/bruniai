import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const registeredTools: Array<{
  name: string;
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
      _config: unknown,
      handler: (args: any) => Promise<any>,
    ) {
      registeredTools.push({ name, handler });
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
}));

describe("MCP server", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    registeredTools.length = 0;
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalOpenAiKey) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
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
    });

    expect(bruniai.compareImageToUrl).toHaveBeenCalledWith({
      baseImageSource: "data:image/png;base64,abc",
      previewUrl: "https://example.com/preview",
      page: "/",
    });
    expect(response.isError).toBeUndefined();
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
});

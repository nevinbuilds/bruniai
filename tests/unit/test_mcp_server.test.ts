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
  compareImages: vi.fn(),
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

  it("registers compare_images alongside compare_urls", async () => {
    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );

    createServer();

    expect(registeredTools.map((tool) => tool.name)).toEqual([
      "compare_urls",
      "compare_images",
    ]);
  });

  it("routes compare_images to the bruniai compareImages API", async () => {
    const bruniai = await import("bruniai");
    vi.mocked(bruniai.compareImages).mockResolvedValue({
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

    const compareImagesTool = registeredTools.find(
      (tool) => tool.name === "compare_images",
    );
    expect(compareImagesTool).toBeDefined();

    const response = await compareImagesTool!.handler({
      baseImage: "data:image/png;base64,abc",
      previewImage: "https://example.com/preview.png",
    });

    expect(bruniai.compareImages).toHaveBeenCalledWith({
      baseImage: "data:image/png;base64,abc",
      previewImage: "https://example.com/preview.png",
    });
    expect(response.isError).toBeUndefined();
  });

  it("returns an MCP error payload for invalid compare_images input", async () => {
    const { createServer } = await import(
      "../../packages/mcp-server/src/mcp-server.ts"
    );
    createServer();

    const compareImagesTool = registeredTools.find(
      (tool) => tool.name === "compare_images",
    );
    const response = await compareImagesTool!.handler({
      baseImage: "",
      previewImage: "https://example.com/preview.png",
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("baseImage and previewImage are required");
  });
});

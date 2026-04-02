import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CompareImagesRequest, CompareUrlsRequest, ComparisonService } from "./types.js";

function buildSuccessResponse(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function buildErrorResponse(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            error: "Comparison failed",
            message: errorMessage,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

async function handleCompareUrls(
  comparisonService: ComparisonService,
  args: CompareUrlsRequest,
) {
  try {
    if (!args.baseUrl || !args.previewUrl) {
      throw new Error("baseUrl and previewUrl are required");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const result = await comparisonService.compareUrls({
      baseUrl: args.baseUrl,
      previewUrl: args.previewUrl,
      page: args.page || "/",
    });
    return buildSuccessResponse(result);
  } catch (error) {
    return buildErrorResponse(error);
  }
}

async function handleCompareImages(
  comparisonService: ComparisonService,
  args: CompareImagesRequest,
) {
  try {
    if (!args.baseImage || !args.previewImage) {
      throw new Error("baseImage and previewImage are required");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const result = await comparisonService.compareImages({
      baseImage: args.baseImage,
      previewImage: args.previewImage,
    });
    return buildSuccessResponse(result);
  } catch (error) {
    return buildErrorResponse(error);
  }
}

export function createBruniMcpServer(comparisonService: ComparisonService) {
  const server = new McpServer(
    {
      name: "bruniai",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.server.onerror = (error) => {
    console.error("[MCP Error]", error);
  };

  server.registerTool(
    "compare_urls",
    {
      description:
        "Compare two URLs visually and analyze differences. " +
        "Takes screenshots, generates diff images, analyzes sections, " +
        "and performs AI-powered visual analysis. Returns analysis " +
        "results with paths to generated images.",
      inputSchema: {
        baseUrl: z.string().describe("Base/reference URL to compare against"),
        previewUrl: z.string().describe("Preview/changed URL to analyze"),
        page: z
          .string()
          .default("/")
          .describe("Page path to compare (default: '/')")
          .optional(),
      },
    },
    async (args) => handleCompareUrls(comparisonService, args),
  );

  server.registerTool(
    "compare_images",
    {
      description:
        "Compare two images visually and analyze differences. " +
        "Normalizes the inputs, generates diff images, analyzes sections, " +
        "and performs AI-powered section explanation where available. " +
        "Returns analysis results with paths to generated images.",
      inputSchema: {
        baseImage: z
          .string()
          .describe("Base/reference image as an HTTP(S) URL or data:image/..."),
        previewImage: z
          .string()
          .describe("Preview/changed image as an HTTP(S) URL or data:image/..."),
      },
    },
    async (args) => handleCompareImages(comparisonService, args),
  );

  return server;
}

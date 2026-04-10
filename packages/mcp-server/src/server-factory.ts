import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  CompareImageToUrlRequest,
  CompareUrlsRequest,
  ComparisonService,
} from "./types.js";

const compareUrlsInputSchema = {
  baseUrl: z.string().describe("Base/reference URL to compare against"),
  previewUrl: z.string().describe("Preview/changed URL to analyze"),
  page: z
    .string()
    .default("/")
    .describe("Page path to compare (default: '/')")
    .optional(),
  sectionExplanationMode: z
    .enum(["fast", "detailed", "off"])
    .default("fast")
    .describe(
      "How to generate section explanations: fast explains only problematic matches, detailed explains all matched sections, and off skips LLM explanations.",
    )
    .optional(),
};

const compareImageToUrlInputSchema = {
  baseImageSource: z
    .string()
    .describe(
      "Base/reference image source as an HTTP(S) image URL or data:image/...",
    ),
  previewUrl: z.string().describe("Preview/changed webpage URL to analyze"),
  page: z
    .string()
    .default("/")
    .describe("Page path to compare on the preview URL (default: '/')")
    .optional(),
  sectionExplanationMode: z
    .enum(["fast", "detailed", "off"])
    .default("fast")
    .describe(
      "How to generate section explanations: fast explains only problematic matches, detailed explains all matched sections, and off skips LLM explanations.",
    )
    .optional(),
};

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
      sectionExplanationMode: args.sectionExplanationMode || "fast",
    });
    return buildSuccessResponse(result);
  } catch (error) {
    return buildErrorResponse(error);
  }
}

async function handleCompareImageToUrl(
  comparisonService: ComparisonService,
  args: CompareImageToUrlRequest,
) {
  try {
    if (!args.baseImageSource || !args.previewUrl) {
      throw new Error("baseImageSource and previewUrl are required");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const result = await comparisonService.compareImageToUrl({
      baseImageSource: args.baseImageSource,
      previewUrl: args.previewUrl,
      page: args.page || "/",
      sectionExplanationMode: args.sectionExplanationMode || "fast",
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

  const registerTool = server.registerTool.bind(server) as (
    name: string,
    config: {
      description: string;
      inputSchema: unknown;
    },
    cb: (args: unknown) => Promise<unknown>,
  ) => unknown;

  registerTool(
    "compare_urls",
    {
      description:
        "Compare two URLs visually and analyze differences. " +
        "Takes screenshots, generates diff images, analyzes sections, " +
        "and performs AI-powered visual analysis. Returns analysis " +
        "results with paths to generated images.",
      inputSchema: compareUrlsInputSchema,
    },
    async (args) =>
      handleCompareUrls(comparisonService, args as CompareUrlsRequest),
  );

  registerTool(
    "compare_image_to_url",
    {
      description:
        "Compare a base image source against a preview URL visually and analyze differences. " +
        "Captures the preview page, normalizes the base image source, generates diff images, " +
        "analyzes sections, and performs AI-powered section explanation where available. " +
        "Returns analysis results with paths to generated images.",
      inputSchema: compareImageToUrlInputSchema,
    },
    async (args) =>
      handleCompareImageToUrl(comparisonService, args as CompareImageToUrlRequest),
  );

  return server;
}

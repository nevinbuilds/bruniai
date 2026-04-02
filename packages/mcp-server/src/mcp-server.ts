#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  compareImages,
  compareUrls,
  type CompareImagesInput,
  type CompareUrlsInput,
} from "bruniai";
import { pathToFileURL } from "url";

/**
 * MCP Server for BruniAI visual comparison functionality.
 *
 * Exposes URL and image comparison tools for MCP clients.
 */
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

async function handleCompareUrls(args: {
  baseUrl: string;
  previewUrl: string;
  page?: string;
}) {
  try {
    const input: CompareUrlsInput = {
      baseUrl: args.baseUrl,
      previewUrl: args.previewUrl,
      page: args.page || "/",
    };

    if (!input.baseUrl || !input.previewUrl) {
      throw new Error("baseUrl and previewUrl are required");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const result = await compareUrls(input);
    return buildSuccessResponse(result);
  } catch (error) {
    return buildErrorResponse(error);
  }
}

async function handleCompareImages(args: {
  baseImage: string;
  previewImage: string;
}) {
  try {
    const input: CompareImagesInput = {
      baseImage: args.baseImage,
      previewImage: args.previewImage,
    };

    if (!input.baseImage || !input.previewImage) {
      throw new Error("baseImage and previewImage are required");
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const result = await compareImages(input);
    return buildSuccessResponse(result);
  } catch (error) {
    return buildErrorResponse(error);
  }
}

export function createServer() {
  const server = new McpServer(
    {
      name: "bruniai",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Set up error handling on underlying server.
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
    handleCompareUrls,
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
    handleCompareImages,
  );

  return server;
}

async function main() {
  const server = createServer();

  // Connect to stdio transport.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("BruniAI MCP server running on stdio");
}

const entrypointHref = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (entrypointHref && import.meta.url === entrypointHref) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

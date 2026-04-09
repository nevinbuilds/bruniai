import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
  CompareImageToUrlRequest,
  CompareUrlsRequest,
  ComparisonService,
} from "./types.js";

type VisualAnalysisOutput = {
  status?: string;
  critical_issues?: {
    sections?: Array<{ name: string; status: string; description: string }>;
    summary?: string;
  };
  visual_changes?: {
    diff_highlights?: string[];
    conclusion?: string;
  };
  conclusion?: {
    summary?: string;
    recommendation?: string;
  };
};

type ComparisonOutput = {
  status?: string;
  visual_analysis?: VisualAnalysisOutput;
  sections_analysis?: string;
};

function buildSummaryResponse(result: unknown, reportUrl: string | null) {
  const output = result as ComparisonOutput;
  const status =
    output?.status ?? output?.visual_analysis?.status ?? "unknown";

  const statusEmoji =
    status === "pass" ? "✅" : status === "warning" ? "⚠️" : "❌";
  const statusLabel =
    status === "pass"
      ? "Pass"
      : status === "warning"
        ? "Warning"
        : status === "fail"
          ? "Fail"
          : "Unknown";

  const criticalSections =
    output?.visual_analysis?.critical_issues?.sections ?? [];
  const diffHighlights =
    output?.visual_analysis?.visual_changes?.diff_highlights ?? [];
  const summary = output?.visual_analysis?.conclusion?.summary ?? "";

  let text = `${statusEmoji} Compared design vs implementation\n\n`;
  text += `Status: ${statusLabel}\n`;

  if (criticalSections.length > 0) {
    text += `Issues found: ${criticalSections.length}\n\n`;
    text += `Top issues:\n`;
    criticalSections.slice(0, 5).forEach((section, i) => {
      text += `${i + 1}. ${section.name} – ${section.description}\n`;
    });
  } else if (diffHighlights.length > 0) {
    text += `Visual changes detected: ${diffHighlights.length}\n\n`;
    text += `Changes:\n`;
    diffHighlights.slice(0, 3).forEach((highlight, i) => {
      text += `${i + 1}. ${highlight}\n`;
    });
  } else {
    text += `No issues found\n`;
  }

  if (summary) {
    text += `\nSummary: ${summary}\n`;
  }

  if (reportUrl) {
    text += `\n→ Open visual report: ${reportUrl}`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text,
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

async function tryGetReportUrl(
  comparisonService: ComparisonService,
  result: unknown,
  page: string,
  baseUrl: string,
  previewUrl: string,
  comparisonMode: "url-to-url" | "image-to-url" | "image-to-image",
  prNumber?: string,
  repository?: string,
): Promise<string | null> {
  const bruniToken = process.env.BRUNI_TOKEN;
  if (!bruniToken) {
    return null;
  }

  try {
    return await comparisonService.sendReport({
      result,
      page,
      baseUrl,
      previewUrl,
      bruniToken,
      bruniApiUrl: process.env.BRUNI_API_URL,
      comparisonMode,
      prNumber,
      repository,
    });
  } catch (error) {
    console.error("[MCP] Failed to send report:", error);
    return null;
  }
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

    const page = args.page ?? "/";

    const result = await comparisonService.compareUrls({
      baseUrl: args.baseUrl,
      previewUrl: args.previewUrl,
      page,
      sectionExplanationMode: args.sectionExplanationMode ?? "fast",
      prNumber: args.prNumber,
      repository: args.repository,
    });

    const reportUrl = await tryGetReportUrl(
      comparisonService,
      result,
      page,
      args.baseUrl,
      args.previewUrl,
      "url-to-url",
      args.prNumber,
      args.repository,
    );

    return buildSummaryResponse(result, reportUrl);
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

    const page = args.page ?? "/";

    const result = await comparisonService.compareImageToUrl({
      baseImageSource: args.baseImageSource,
      previewUrl: args.previewUrl,
      page,
      sectionExplanationMode: args.sectionExplanationMode ?? "fast",
      prNumber: args.prNumber,
      repository: args.repository,
    });

    const reportUrl = await tryGetReportUrl(
      comparisonService,
      result,
      page,
      args.baseImageSource,
      args.previewUrl,
      "image-to-url",
      args.prNumber,
      args.repository,
    );

    return buildSummaryResponse(result, reportUrl);
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
        "and performs AI-powered visual analysis. Returns a condensed summary " +
        "of issues found. When BRUNI_TOKEN is set the full report is uploaded " +
        "and a link is included in the response.",
      inputSchema: {
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
        prNumber: z
          .string()
          .describe("Optional PR number for report metadata")
          .optional(),
        repository: z
          .string()
          .describe("Optional repository name for report metadata")
          .optional(),
      },
    },
    async (args) => handleCompareUrls(comparisonService, args),
  );

  server.registerTool(
    "compare_image_to_url",
    {
      description:
        "Compare a base image source against a preview URL visually and analyze differences. " +
        "Captures the preview page, normalizes the base image source, generates diff images, " +
        "analyzes sections, and performs AI-powered section explanation where available. " +
        "Returns a condensed summary of issues found. When BRUNI_TOKEN is set the full report " +
        "is uploaded and a link is included in the response.",
      inputSchema: {
        baseImageSource: z
          .string()
          .describe(
            "Base/reference image source as an HTTP(S) image URL or data:image/...",
          ),
        previewUrl: z
          .string()
          .describe("Preview/changed webpage URL to analyze"),
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
        prNumber: z
          .string()
          .describe("Optional PR number for report metadata")
          .optional(),
        repository: z
          .string()
          .describe("Optional repository name for report metadata")
          .optional(),
      },
    },
    async (args) => handleCompareImageToUrl(comparisonService, args),
  );

  return server;
}

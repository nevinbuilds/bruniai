import type { CompareUrlsOutput } from "./types.js";

/** Comparison mode matching the reporter's ComparisonMode type. */
type ComparisonMode = "url-to-url" | "image-to-url" | "image-to-image";

type ReporterModule = typeof import("../../../dist/reporter/index.js");
type EncodeImageCompressed = ReporterModule["encodeImageCompressed"];
type SectionScreenshots = NonNullable<
  CompareUrlsOutput["images"]["section_screenshots"]
>;
type EncodedImageRefs = {
  base_screenshot: string;
  pr_screenshot: string;
  diff_image: string;
  section_screenshots?: Record<string, { base: string; pr: string }>;
};

async function importSourceModule<T>(relativePath: string): Promise<T> {
  return (await import(new URL(relativePath, import.meta.url).href)) as T;
}

async function loadReporterModule(): Promise<ReporterModule> {
  if (import.meta.url.includes("/packages/bruniai/src/")) {
    try {
      return await import("../../../dist/reporter/index.js");
    } catch {
      return await importSourceModule<ReporterModule>(
        "../../../src/reporter/index.ts",
      );
    }
  }

  return await import("./runtime/reporter/index.js");
}

export interface SendReportInput {
  result: CompareUrlsOutput;
  page: string;
  baseUrl: string;
  previewUrl: string;
  bruniToken?: string;
  mcpAuthContext?: {
    userId: string;
    tokenId: string;
    scopes: string[];
    teamId?: string;
    projectId?: string;
  };
  mcpInternalSecret?: string;
  bruniApiUrl?: string;
  comparisonMode?: ComparisonMode;
  prNumber?: string;
  repository?: string;
}

const DEFAULT_BRUNI_API_URL = "https://app.brunivisual.com/api/tests";

function getReportBaseUrl(bruniApiUrl: string): string {
  return bruniApiUrl
    .replace("/api/internal/mcp/tests", "")
    .replace("/api/tests", "")
    .replace(/\/$/, "");
}

async function sendInternalMcpReport(
  multiPageReport: unknown,
  bruniApiUrl: string,
  mcpInternalSecret: string,
  mcpAuthContext: NonNullable<SendReportInput["mcpAuthContext"]>,
): Promise<Array<Record<string, any>> | null> {
  const reportData = multiPageReport as {
    test_data: unknown;
    reports: unknown[];
  };
  const chunks: unknown[][] = [];
  const maxChunkSize = 1;

  for (let i = 0; i < reportData.reports.length; i += maxChunkSize) {
    chunks.push(reportData.reports.slice(i, i + maxChunkSize));
  }

  const responses: Array<Record<string, any>> = [];
  let testId: string | null = null;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const payload: Record<string, unknown> = {
      identity: mcpAuthContext,
      test_data: reportData.test_data,
      reports: chunks[chunkIndex],
      chunk_index: chunkIndex,
      total_chunks: chunks.length,
    };

    if (testId) {
      payload.test_id = testId;
    }

    const response = await fetch(bruniApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mcpInternalSecret}`,
      },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Failed to send MCP report: ${response.status} - ${responseText}`,
      );
    }

    const parsed = JSON.parse(responseText);
    responses.push(parsed);

    if (!testId && parsed?.test?.id) {
      testId = String(parsed.test.id);
    }
  }

  return responses;
}

async function encodeSectionScreenshots(
  sectionScreenshots: SectionScreenshots | undefined,
  encodeImageCompressed: EncodeImageCompressed,
): Promise<Record<string, { base: string; pr: string }> | undefined> {
  if (!sectionScreenshots || Object.keys(sectionScreenshots).length === 0) {
    return undefined;
  }

  const encodedEntries = await Promise.all(
    Object.entries(sectionScreenshots).map(async ([sectionId, screenshots]) => [
      sectionId,
      {
        base: await encodeImageCompressed(screenshots.base, "WEBP", 1000, 60),
        pr: await encodeImageCompressed(screenshots.preview, "WEBP", 1000, 60),
      },
    ] as const),
  );

  return Object.fromEntries(encodedEntries);
}

async function encodeSectionResults(
  sectionResults: CompareUrlsOutput["section_results"] | undefined,
  encodeImageCompressed: EncodeImageCompressed,
): Promise<CompareUrlsOutput["section_results"] | undefined> {
  if (!sectionResults || sectionResults.length === 0) {
    return sectionResults;
  }

  return Promise.all(
    sectionResults.map(async (section) => ({
      ...section,
      image_refs: section.image_refs
        ? {
            base: await encodeImageCompressed(
              section.image_refs.base,
              "WEBP",
              1000,
              60,
            ),
            preview: await encodeImageCompressed(
              section.image_refs.preview,
              "WEBP",
              1000,
              60,
            ),
            diff: await encodeImageCompressed(
              section.image_refs.diff,
              "WEBP",
              1000,
              70,
            ),
          }
        : null,
    })),
  );
}

/**
 * Send a comparison result to the Bruni reporting API and return the report URL.
 *
 * @param input - Report input containing the comparison result and metadata
 * @returns Report URL if the report was successfully sent, null otherwise
 */
export async function sendReport(
  input: SendReportInput,
): Promise<string | null> {
  const {
    result,
    page,
    baseUrl,
    previewUrl,
    bruniToken,
    mcpAuthContext,
    mcpInternalSecret,
    bruniApiUrl = DEFAULT_BRUNI_API_URL,
    comparisonMode = "url-to-url",
    prNumber = "",
    repository = "",
  } = input;

  const { BruniReporter, parseMultiPageAnalysisResults, encodeImageCompressed } =
    await loadReporterModule();

  const reporter = new BruniReporter(bruniToken || "", bruniApiUrl);

  const imageRefs: EncodedImageRefs = {
    base_screenshot: await encodeImageCompressed(
      result.images.base_screenshot,
      "WEBP",
      1200,
      60,
    ),
    pr_screenshot: await encodeImageCompressed(
      result.images.preview_screenshot,
      "WEBP",
      1200,
      60,
    ),
    diff_image: await encodeImageCompressed(
      result.images.diff_image,
      "WEBP",
      1200,
      70,
    ),
  };
  const sectionScreenshots = await encodeSectionScreenshots(
    result.images.section_screenshots,
    encodeImageCompressed,
  );
  if (sectionScreenshots) {
    imageRefs.section_screenshots = sectionScreenshots;
  }

  const sectionResults = await encodeSectionResults(
    result.section_results,
    encodeImageCompressed,
  );

  const pageResults = [
    {
      page_path: page,
      base_url: baseUrl,
      pr_url: previewUrl,
      visual_analysis: result.visual_analysis,
      sections_analysis: result.sections_analysis,
      image_refs: imageRefs,
      section_results: sectionResults,
    } as Parameters<typeof parseMultiPageAnalysisResults>[2][number] & {
      section_results?: CompareUrlsOutput["section_results"];
    },
  ];

  const multiPageReport = parseMultiPageAnalysisResults(
    prNumber,
    repository,
    pageResults,
    comparisonMode,
  );

  const apiResponse =
    mcpAuthContext && mcpInternalSecret
      ? await sendInternalMcpReport(
          multiPageReport,
          bruniApiUrl,
          mcpInternalSecret,
          mcpAuthContext,
        )
      : await reporter.sendMultiPageReport(multiPageReport);

  if (apiResponse && apiResponse.length > 0) {
    const firstResponse = apiResponse[0];
    if (firstResponse.test && typeof firstResponse.test === "object") {
      const testObj = firstResponse.test as Record<string, unknown>;
      const reportId = testObj.id;
      if (reportId) {
        const baseApiUrl = getReportBaseUrl(bruniApiUrl);
        return `${baseApiUrl}/test/${reportId}`;
      }
    }
  }

  return null;
}

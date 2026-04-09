import type { CompareUrlsOutput } from "./types.js";
import type { ComparisonMode } from "../../../dist/reporter/types.js";

type ReporterModule = typeof import("../../../dist/reporter/index.js");

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
  bruniToken: string;
  bruniApiUrl?: string;
  comparisonMode?: ComparisonMode;
  prNumber?: string;
  repository?: string;
}

const DEFAULT_BRUNI_API_URL = "https://bruniai-app.vercel.app/api/tests";

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
    bruniApiUrl = DEFAULT_BRUNI_API_URL,
    comparisonMode = "url-to-url",
    prNumber = "",
    repository = "",
  } = input;

  const { BruniReporter, parseMultiPageAnalysisResults, encodeImageCompressed } =
    await loadReporterModule();

  const reporter = new BruniReporter(bruniToken, bruniApiUrl);

  const imageRefs = {
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

  const multiPageReport = parseMultiPageAnalysisResults(
    prNumber,
    repository,
    [
      {
        page_path: page,
        base_url: baseUrl,
        pr_url: previewUrl,
        visual_analysis: result.visual_analysis,
        sections_analysis: result.sections_analysis,
        image_refs: imageRefs,
      },
    ],
    comparisonMode,
  );

  const apiResponse = await reporter.sendMultiPageReport(multiPageReport);

  if (apiResponse && apiResponse.length > 0) {
    const firstResponse = apiResponse[0];
    if (firstResponse.test && typeof firstResponse.test === "object") {
      const testObj = firstResponse.test as Record<string, unknown>;
      const reportId = testObj.id;
      if (reportId) {
        const baseApiUrl = bruniApiUrl
          .replace("/api/tests", "")
          .replace(/\/$/, "");
        return `${baseApiUrl}/test/${reportId}`;
      }
    }
  }

  return null;
}

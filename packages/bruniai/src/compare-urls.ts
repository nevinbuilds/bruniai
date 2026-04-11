import type { CompareUrlsInput, CompareUrlsOutput } from "./types.js";
import { createLocalStagehand } from "./stagehand.js";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";

type ComparisonCoreModule = typeof import("../../../dist/comparison/core.js");

async function importSourceModule<T>(relativePath: string): Promise<T> {
  return (await import(new URL(relativePath, import.meta.url).href)) as T;
}

async function loadComparisonCoreModule(): Promise<ComparisonCoreModule> {
  if (import.meta.url.includes("/packages/bruniai/src/")) {
    try {
      return await import("../../../dist/comparison/core.js");
    } catch {
      return await importSourceModule<ComparisonCoreModule>(
        "../../../src/comparison/core.ts",
      );
    }
  }

  return await import("./runtime/comparison/core.js");
}

/**
 * Compare two URLs visually and return analysis results.
 *
 * This function performs a complete visual comparison workflow:
 * - Creates a temporary directory for images
 * - Initializes and manages Stagehand browser automation
 * - Takes screenshots of both URLs
 * - Generates diff images
 * - Analyzes sections structure
 * - Performs AI-powered visual analysis
 * - Captures section screenshots
 *
 * @param input - Comparison input parameters
 * @returns Complete analysis results with image paths
 *
 * @example
 * ```typescript
 * const result = await compareUrls({
 *   baseUrl: "https://example.com",
 *   previewUrl: "https://preview.example.com",
 *   page: "/contact"
 * });
 * console.log(result.status); // "pass" | "fail" | "warning"
 * ```
 */
export async function compareUrls(
  input: CompareUrlsInput
): Promise<CompareUrlsOutput> {
  const {
    baseUrl,
    previewUrl,
    page = "/",
    sectionExplanationMode = "fast",
  } = input;
  const { performComparison } = await loadComparisonCoreModule();

  // Create temporary directory for images.
  const imagesDir = join(tmpdir(), `bruniai-${Date.now()}`);
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  // Initialize Stagehand.
  const stagehand = await createLocalStagehand();

  try {
    await stagehand.init();

    // Perform the core comparison.
    const result = await performComparison({
      stagehand,
      baseUrl,
      previewUrl,
      page,
      sectionExplanationMode,
      imagesDir,
      prNumber: input.prNumber,
      repository: input.repository,
    });

    // Build output structure.
    // Convert status from VisualAnalysisResult (which can be "none") to ReportStatus.
    const status: "pass" | "fail" | "warning" =
      result.visual_analysis.status === "none"
        ? "pass"
        : result.visual_analysis.status;

    const output: CompareUrlsOutput = {
      status,
      visual_analysis: result.visual_analysis,
      sections_analysis: result.sections_analysis,
      images: {
        base_screenshot: result.base_screenshot,
        preview_screenshot: result.preview_screenshot,
        diff_image: result.diff_image,
        section_screenshots:
          Object.keys(result.section_screenshots).length > 0
            ? Object.fromEntries(
                Object.entries(result.section_screenshots).map(
                  ([key, value]) => [
                    key,
                    { base: value.base, preview: value.preview },
                  ]
                )
              )
            : undefined,
      },
    };
    if (result.section_results) {
      output.section_results = result.section_results;
    }

    return output;
  } finally {
    await stagehand.close();
  }
}

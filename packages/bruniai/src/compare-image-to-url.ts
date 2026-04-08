import type {
  CompareImageToUrlInput,
  CompareImageToUrlOutput,
} from "./types.js";
import { createLocalStagehand } from "./stagehand.js";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";

type ImageToUrlComparisonCoreModule =
  typeof import("../../../dist/comparison/image-core.js");

async function importSourceModule<T>(relativePath: string): Promise<T> {
  return (await import(new URL(relativePath, import.meta.url).href)) as T;
}

async function loadImageToUrlComparisonModule(): Promise<ImageToUrlComparisonCoreModule> {
  if (import.meta.url.includes("/packages/bruniai/src/")) {
    try {
      return await import("../../../dist/comparison/image-core.js");
    } catch {
      return await importSourceModule<ImageToUrlComparisonCoreModule>(
        "../../../src/comparison/image-core.ts",
      );
    }
  }

  return await import("./runtime/comparison/image-core.js");
}

function isSupportedImageSource(input: string): boolean {
  if (!input) {
    return false;
  }

  if (input.startsWith("data:image/")) {
    return true;
  }

  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function assertSupportedImageSource(input: string, fieldName: string): void {
  if (!isSupportedImageSource(input)) {
    throw new Error(
      `${fieldName} must be an HTTP(S) image URL or data:image/... string`,
    );
  }
}

function assertSupportedPreviewUrl(input: string, fieldName: string): void {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`${fieldName} must be an HTTP(S) URL`);
  }
}

/**
 * Compare a base image source against a preview URL and return analysis results.
 *
 * This function performs a complete image-to-URL comparison workflow:
 * - Creates a temporary directory for images
 * - Captures the preview webpage with Stagehand
 * - Normalizes the design image and preview screenshot into comparable PNGs
 * - Generates diff images and matched section crops
 * - Produces structured analysis output
 *
 * @param input - Comparison input parameters
 * @returns Complete analysis results with image paths
 */
export async function compareImageToUrl(
  input: CompareImageToUrlInput,
): Promise<CompareImageToUrlOutput> {
  const {
    baseImageSource,
    previewUrl,
    page = "/",
    sectionExplanationMode = "fast",
    prNumber,
    repository,
  } = input;

  assertSupportedImageSource(baseImageSource, "baseImageSource");
  assertSupportedPreviewUrl(previewUrl, "previewUrl");

  const { performImageToUrlComparison } =
    await loadImageToUrlComparisonModule();

  const imagesDir = join(tmpdir(), `bruniai-${Date.now()}`);
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  const stagehand = await createLocalStagehand();

  try {
    await stagehand.init();

    const result = await performImageToUrlComparison({
      stagehand,
      baseImageSource,
      previewUrl,
      page,
      sectionExplanationMode,
      imagesDir,
      prNumber,
      repository,
    });

    const status: "pass" | "fail" | "warning" =
      result.visual_analysis.status === "none"
        ? "pass"
        : result.visual_analysis.status;

    return {
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
                Object.entries(result.section_screenshots).map(([key, value]) => [
                  key,
                  { base: value.base, preview: value.preview },
                ]),
              )
            : undefined,
      },
    };
  } finally {
    await stagehand.close();
  }
}

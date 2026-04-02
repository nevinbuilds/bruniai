import type {
  CompareImagesInput,
  CompareImagesOutput,
} from "./types.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";

type ImageToImageComparisonModule =
  typeof import("../../../dist/comparison/image-image-core.js");

async function importRuntimeModule<T>(relativePath: string): Promise<T> {
  const modulePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return (await import(modulePath)) as T;
}

async function loadImageToImageComparisonModule(): Promise<ImageToImageComparisonModule> {
  try {
    return await importRuntimeModule<ImageToImageComparisonModule>(
      "../../../dist/comparison/image-image-core.js",
    );
  } catch {
    return await importRuntimeModule<ImageToImageComparisonModule>(
      "../../../src/comparison/image-image-core.js",
    );
  }
}

function isSupportedImageInput(input: string): boolean {
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

function assertSupportedImageInput(input: string, fieldName: string): void {
  if (!isSupportedImageInput(input)) {
    throw new Error(
      `${fieldName} must be an HTTP(S) image URL or data:image/... string`,
    );
  }
}

/**
 * Compare two images visually and return analysis results.
 *
 * This function performs a complete image-native comparison workflow:
 * - Creates a temporary directory for images
 * - Normalizes both inputs into PNG images
 * - Trims margins and generates a diff image
 * - Matches sections deterministically
 * - Produces structured analysis output
 *
 * @param input - Comparison input parameters
 * @returns Complete analysis results with image paths
 */
export async function compareImages(
  input: CompareImagesInput,
): Promise<CompareImagesOutput> {
  const { baseImage, previewImage } = input;

  assertSupportedImageInput(baseImage, "baseImage");
  assertSupportedImageInput(previewImage, "previewImage");

  const { performImageToImageComparison } =
    await loadImageToImageComparisonModule();

  const imagesDir = join(tmpdir(), `bruniai-${Date.now()}`);
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  const result = await performImageToImageComparison({
    baseImageUrl: baseImage,
    previewImageUrl: previewImage,
    imagesDir,
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
}

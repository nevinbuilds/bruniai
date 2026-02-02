/**
 * Image-to-URL comparison core functionality.
 *
 * This compares a baseline image (downloaded from a URL) against a live URL.
 */

import type { Stagehand } from "@browserbasehq/stagehand";
import { generateDiffImage } from "../diff/diff.js";
import {
  downloadImageToPng,
  extractSectionsSequentially,
  formatSequentialSectionsAsAnalysis,
  takeSectionScreenshotsFromVisualBounds,
} from "../image/index.js";
import { analyzeImagesWithVisionImageMode } from "../vision/index.js";
import {
  ensureViewportSize,
  ensurePageFullyRendered,
} from "../utils/window.js";
import type { VisualAnalysisResult } from "../vision/types.js";
import { join } from "path";
import { writeFileSync } from "fs";
import sharp from "sharp";

export interface ImageComparisonOptions {
  stagehand: Stagehand;
  /** Baseline image URL. */
  baseImageUrl: string;
  /** Preview/live URL to compare against. */
  previewUrl: string;
  /** Page path for the comparison (used for file naming). */
  page: string;
  /** Directory where images should be saved. */
  imagesDir: string;
  /** Optional PR number for metadata. */
  prNumber?: string;
  /** Optional repository name for metadata. */
  repository?: string;
}

export interface ImageComparisonResult {
  visual_analysis: VisualAnalysisResult;
  sections_analysis: string;
  base_screenshot: string;
  preview_screenshot: string;
  diff_image: string;
  section_screenshots: Record<string, { base: string; preview: string }>;
  mode: "image-to-url";
}

export async function performImageComparison(
  options: ImageComparisonOptions,
): Promise<ImageComparisonResult> {
  const {
    stagehand,
    baseImageUrl,
    previewUrl,
    page,
    imagesDir,
    prNumber = "",
    repository = "",
  } = options;

  console.log(
    `\n${"=".repeat(50)}\n🖼️ Starting Image-to-URL Comparison\n${"=".repeat(50)}`,
  );
  console.log(`Base Image URL: ${baseImageUrl}`);
  console.log(`Preview URL: ${previewUrl}`);

  let pageSuffix = page.replace(/\//g, "_");
  pageSuffix = pageSuffix === "_" ? "home" : pageSuffix;

  // Step 1: Download base image and normalize to PNG.
  console.log("\n📥 Step 1: Downloading base image...");
  const baseScreenshotPath = join(
    imagesDir,
    `base_screenshot_${pageSuffix}.png`,
  );
  await downloadImageToPng(baseImageUrl, baseScreenshotPath);
  console.log(`Base image saved: ${baseScreenshotPath}`);

  // Get base image dimensions to match viewport width.
  const baseImageMeta = await sharp(baseScreenshotPath).metadata();
  const baseImageWidth = baseImageMeta.width || 1920;
  const baseImageHeight = baseImageMeta.height || 1080;
  console.log(`Base image dimensions: ${baseImageWidth}x${baseImageHeight}`);

  // Step 2: Screenshot preview URL at the same width as base image.
  console.log("\n📸 Step 2: Capturing preview URL screenshot...");
  const pageHandle = stagehand.context.pages()[0];
  // Set viewport to match base image width for accurate comparison.
  await ensureViewportSize(pageHandle, previewUrl, baseImageWidth, 1080);
  await ensurePageFullyRendered(pageHandle);
  const previewScreenshot = await pageHandle.screenshot({ fullPage: true });
  const previewScreenshotPath = join(
    imagesDir,
    `preview_screenshot_${pageSuffix}.png`,
  );
  writeFileSync(previewScreenshotPath, previewScreenshot);
  console.log(`Preview screenshot saved: ${previewScreenshotPath}`);

  const previewMeta = await sharp(previewScreenshotPath).metadata();
  const previewImageWidth = previewMeta.width || baseImageWidth;
  const previewImageHeight = previewMeta.height || baseImageHeight;
  console.log(
    `Preview image dimensions: ${previewImageWidth}x${previewImageHeight}`,
  );

  // Step 3: Generate diff image.
  console.log("\n🔍 Step 3: Generating diff image...");
  const diffImagePath = join(imagesDir, `diff_${pageSuffix}.png`);
  await generateDiffImage(
    baseScreenshotPath,
    previewScreenshotPath,
    diffImagePath,
  );
  console.log(`Diff image saved: ${diffImagePath}`);

  // Step 4: Extract visual sections from the base image using sequential approach.
  console.log(
    "\n🤖 Step 4: Extracting visual sections from BASE image (sequential)...",
  );
  // Important: sections must be derived from the BASE image only.
  // The sequential approach detects and crops sections one at a time,
  // ensuring contiguous boundaries without cutting through content.
  const baseSectionsResult = await extractSectionsSequentially(
    baseScreenshotPath,
    imagesDir,
  );
  const sectionsAnalysis = formatSequentialSectionsAsAnalysis(baseSectionsResult);
  console.log(
    `\n${"=".repeat(50)}\n🗺️ Visual Sections Analysis:\n${sectionsAnalysis}\n${"=".repeat(50)}`,
  );

  // Step 5: Capture preview section screenshots.
  console.log("\n📷 Step 5: Capturing preview section screenshots...");
  const sectionScreenshots: Record<string, { base: string; preview: string }> =
    {};

  // Capture preview section screenshots using the bounding boxes from sequential extraction.
  const previewSectionScreenshots =
    await takeSectionScreenshotsFromVisualBounds(
      stagehand,
      previewUrl,
      baseSectionsResult.sections,
      imagesDir,
      pageSuffix,
    );

  // Pair base section screenshots (already generated by sequential extraction)
  // with preview screenshots.
  for (const section of baseSectionsResult.sections) {
    const sectionId = section.sectionId;
    // Base section screenshot was already created by extractSectionsSequentially.
    const baseSectionPath = section.screenshotPath;

    const previewPath = previewSectionScreenshots[sectionId];
    if (previewPath) {
      sectionScreenshots[sectionId] = {
        base: baseSectionPath,
        preview: previewPath,
      };
    } else {
      sectionScreenshots[sectionId] = { base: baseSectionPath, preview: "" };
    }
  }

  console.log(
    `Captured ${Object.keys(sectionScreenshots).length} section screenshot pairs`,
  );

  // Step 6: Perform visual analysis (skip base URL navigation).
  console.log("\n🧠 Step 6: Performing visual analysis (image mode)...");
  const visualAnalysis = await analyzeImagesWithVisionImageMode(
    baseScreenshotPath,
    previewScreenshotPath,
    diffImagePath,
    baseImageUrl,
    previewUrl,
    prNumber,
    repository,
    sectionsAnalysis,
  );

  console.log(`Visual analysis completed: ${visualAnalysis.status}`);

  return {
    visual_analysis: visualAnalysis,
    sections_analysis: sectionsAnalysis,
    base_screenshot: baseScreenshotPath,
    preview_screenshot: previewScreenshotPath,
    diff_image: diffImagePath,
    section_screenshots: sectionScreenshots,
    mode: "image-to-url",
  };
}

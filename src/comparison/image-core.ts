/**
 * Image-to-URL comparison core functionality.
 *
 * This compares a baseline image (downloaded from a URL) against a live URL.
 */

import type { Stagehand } from "@browserbasehq/stagehand";
import { generateDiffImage } from "../diff/diff.js";
import {
  downloadImageToPng,
  extractVisualSections,
  refineVisualSectionSlices,
  formatVisualSectionsAsAnalysis,
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

async function cropSectionFromImage(
  imagePath: string,
  outputPath: string,
  boundingBox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): Promise<void> {
  const left = Math.max(0, Math.round(boundingBox.x));
  const top = Math.max(0, Math.round(boundingBox.y));
  const width = Math.max(1, Math.round(boundingBox.width));
  const height = Math.max(1, Math.round(boundingBox.height));

  const safeWidth = Math.min(width, Math.max(1, imageWidth - left));
  const safeHeight = Math.min(height, Math.max(1, imageHeight - top));

  const buffer = await sharp(imagePath)
    .extract({ left, top, width: safeWidth, height: safeHeight })
    .png()
    .toBuffer();
  writeFileSync(outputPath, buffer);
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

  // Step 4: Extract visual sections from the base image.
  console.log(
    "\n🤖 Step 4: Extracting visual sections from BASE image (LLM-first)...",
  );
  // Important: sections must be derived from the BASE image only.
  let baseSectionsResult = await extractVisualSections(baseScreenshotPath);
  const refinedSlices = await refineVisualSectionSlices(
    baseScreenshotPath,
    baseSectionsResult.sections,
  );
  if (refinedSlices) {
    baseSectionsResult = {
      sections: refinedSlices.sections,
      layoutDescription: refinedSlices.layoutDescription,
      imageDimensions: refinedSlices.imageDimensions,
    };
    console.log("Refined section slice boundaries from base image.");
  } else {
    console.log("Using initial visual sections (no slice refinement).");
  }

  const sectionsAnalysis = formatVisualSectionsAsAnalysis(baseSectionsResult);
  console.log(
    `\n${"=".repeat(50)}\n🗺️ Visual Sections Analysis:\n${sectionsAnalysis}\n${"=".repeat(50)}`,
  );

  // Step 5: Capture section screenshots.
  console.log("\n📷 Step 5: Capturing section screenshots...");
  const sectionScreenshots: Record<string, { base: string; preview: string }> =
    {};

  const sectionIndexById = new Map<string, number>();
  baseSectionsResult.sections.forEach((section, index) => {
    sectionIndexById.set(section.sectionId, index + 1);
  });

  // Capture preview section screenshots by using the bounding boxes from the base image.
  const previewSectionScreenshots =
    await takeSectionScreenshotsFromVisualBounds(
      stagehand,
      previewUrl,
      baseSectionsResult.sections,
      imagesDir,
      pageSuffix,
      sectionIndexById,
    );

  // Crop base sections from the base image and pair with preview screenshots (if available).
  for (const section of baseSectionsResult.sections) {
    const sectionId = section.sectionId;
    const index = sectionIndexById.get(sectionId);
    const indexPrefix = index ? `${String(index).padStart(2, "0")}_` : "";
    const baseSectionPath = join(
      imagesDir,
      `base_screenshot_${pageSuffix}_section_${indexPrefix}${sectionId}.png`,
    );
    try {
      await cropSectionFromImage(
        baseScreenshotPath,
        baseSectionPath,
        section.boundingBox,
        baseImageWidth,
        baseImageHeight,
      );

      const previewPath = previewSectionScreenshots[sectionId];
      if (previewPath) {
        sectionScreenshots[sectionId] = {
          base: baseSectionPath,
          preview: previewPath,
        };
      } else {
        sectionScreenshots[sectionId] = { base: baseSectionPath, preview: "" };
      }
    } catch (error) {
      console.warn(`Failed to crop base section ${sectionId}: ${error}`);
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

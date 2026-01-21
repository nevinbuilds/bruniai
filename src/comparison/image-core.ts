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
  formatVisualSectionsAsAnalysis,
  takeSectionScreenshotsFromVisualBounds,
} from "../image/index.js";
import { analyzeImagesWithVisionImageMode } from "../vision/index.js";
import { ensureViewportSize } from "../utils/window.js";
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
  options: ImageComparisonOptions
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
    `\n${"=".repeat(50)}\n🖼️ Starting Image-to-URL Comparison\n${"=".repeat(50)}`
  );
  console.log(`Base Image URL: ${baseImageUrl}`);
  console.log(`Preview URL: ${previewUrl}`);

  let pageSuffix = page.replace(/\//g, "_");
  pageSuffix = pageSuffix === "_" ? "home" : pageSuffix;

  // Step 1: Download base image and normalize to PNG.
  console.log("\n📥 Step 1: Downloading base image...");
  const baseScreenshotPath = join(imagesDir, `base_screenshot_${pageSuffix}.png`);
  await downloadImageToPng(baseImageUrl, baseScreenshotPath);
  console.log(`Base image saved: ${baseScreenshotPath}`);

  // Step 2: Screenshot preview URL.
  console.log("\n📸 Step 2: Capturing preview URL screenshot...");
  const pageHandle = stagehand.context.pages()[0];
  await ensureViewportSize(pageHandle, previewUrl);
  const previewScreenshot = await pageHandle.screenshot({ fullPage: true });
  const previewScreenshotPath = join(
    imagesDir,
    `preview_screenshot_${pageSuffix}.png`
  );
  writeFileSync(previewScreenshotPath, previewScreenshot);
  console.log(`Preview screenshot saved: ${previewScreenshotPath}`);

  // Step 3: Generate diff image.
  console.log("\n🔍 Step 3: Generating diff image...");
  const diffImagePath = join(imagesDir, `diff_${pageSuffix}.png`);
  await generateDiffImage(baseScreenshotPath, previewScreenshotPath, diffImagePath);
  console.log(`Diff image saved: ${diffImagePath}`);

  // Step 4: Extract visual sections from the base image.
  console.log("\n🤖 Step 4: Extracting visual sections using AI...");
  const visualSectionsResult = await extractVisualSections(
    stagehand,
    baseScreenshotPath
  );
  const sectionsAnalysis = formatVisualSectionsAsAnalysis(visualSectionsResult);
  console.log(
    `\n${"=".repeat(50)}\n🗺️ Visual Sections Analysis:\n${sectionsAnalysis}\n${"=".repeat(50)}`
  );

  // Step 5: Capture section screenshots.
  console.log("\n📷 Step 5: Capturing section screenshots...");
  const sectionScreenshots: Record<string, { base: string; preview: string }> = {};

  const previewSectionScreenshots = await takeSectionScreenshotsFromVisualBounds(
    stagehand,
    previewUrl,
    visualSectionsResult.sections,
    imagesDir,
    pageSuffix
  );

  // Crop base sections from the base image.
  for (const section of visualSectionsResult.sections) {
    const sectionId = section.sectionId;
    const baseSectionPath = join(
      imagesDir,
      `base_screenshot_${pageSuffix}_section_${sectionId}.png`
    );

    try {
      const baseSectionScreenshot = await sharp(baseScreenshotPath)
        .extract({
          left: Math.max(0, Math.round(section.boundingBox.x)),
          top: Math.max(0, Math.round(section.boundingBox.y)),
          width: Math.max(1, Math.round(section.boundingBox.width)),
          height: Math.max(1, Math.round(section.boundingBox.height)),
        })
        .png()
        .toBuffer();
      writeFileSync(baseSectionPath, baseSectionScreenshot);

      if (previewSectionScreenshots[sectionId]) {
        sectionScreenshots[sectionId] = {
          base: baseSectionPath,
          preview: previewSectionScreenshots[sectionId],
        };
      }
    } catch (error) {
      console.warn(`Failed to crop base section ${sectionId}: ${error}`);
    }
  }

  console.log(
    `Captured ${Object.keys(sectionScreenshots).length} section screenshot pairs`
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
    sectionsAnalysis
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


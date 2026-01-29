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
} from "../image/index.js";
import type { VisualSection } from "../image/index.js";
import { analyzeImagesWithVisionImageMode } from "../vision/index.js";
import { ensureViewportSize, ensurePageFullyRendered } from "../utils/window.js";
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

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenSet(value: string): Set<string> {
  const normalized = normalizeLabel(value);
  if (!normalized) return new Set();
  return new Set(normalized.split(" ").filter(Boolean));
}

function labelSimilarity(a: VisualSection, b: VisualSection): number {
  const aTokens = tokenSet(`${a.name} ${a.sectionId}`);
  const bTokens = tokenSet(`${b.name} ${b.sectionId}`);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }
  const union = aTokens.size + bTokens.size - intersection;
  return union ? intersection / union : 0;
}

function alignSectionsByLabel(
  baseSections: VisualSection[],
  previewSections: VisualSection[],
  baseHeight: number,
  previewHeight: number
): Array<{ base: VisualSection; preview: VisualSection | null }>{
  const sortedBase = [...baseSections].sort(
    (a, b) => a.boundingBox.y - b.boundingBox.y
  );
  const sortedPreview = [...previewSections].sort(
    (a, b) => a.boundingBox.y - b.boundingBox.y
  );

  const matches: Array<{ base: VisualSection; preview: VisualSection | null }> = [];
  let previewStartIndex = 0;

  for (const base of sortedBase) {
    let bestIndex = -1;
    let bestScore = 0;
    const baseMid =
      (base.boundingBox.y + base.boundingBox.height / 2) /
      Math.max(1, baseHeight);
    for (let i = previewStartIndex; i < sortedPreview.length; i++) {
      const preview = sortedPreview[i];
      const labelScore = labelSimilarity(base, preview);
      if (labelScore === 0) continue;
      const previewMid =
        (preview.boundingBox.y + preview.boundingBox.height / 2) /
        Math.max(1, previewHeight);
      const positionPenalty = Math.abs(baseMid - previewMid) * 0.25;
      const score = labelScore - positionPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestScore >= 0.2) {
      matches.push({ base, preview: sortedPreview[bestIndex] });
      previewStartIndex = bestIndex + 1;
      continue;
    }

    let closestIndex = -1;
    let closestDiff = 1;
    for (let i = previewStartIndex; i < sortedPreview.length; i++) {
      const preview = sortedPreview[i];
      const previewMid =
        (preview.boundingBox.y + preview.boundingBox.height / 2) /
        Math.max(1, previewHeight);
      const diff = Math.abs(baseMid - previewMid);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    if (closestIndex >= 0 && closestDiff <= 0.12) {
      matches.push({ base, preview: sortedPreview[closestIndex] });
      previewStartIndex = closestIndex + 1;
    } else {
      matches.push({ base, preview: null });
    }
  }

  return matches;
}

async function cropSectionFromImage(
  imagePath: string,
  outputPath: string,
  boundingBox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
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
    `preview_screenshot_${pageSuffix}.png`
  );
  writeFileSync(previewScreenshotPath, previewScreenshot);
  console.log(`Preview screenshot saved: ${previewScreenshotPath}`);

  const previewMeta = await sharp(previewScreenshotPath).metadata();
  const previewImageWidth = previewMeta.width || baseImageWidth;
  const previewImageHeight = previewMeta.height || baseImageHeight;
  console.log(
    `Preview image dimensions: ${previewImageWidth}x${previewImageHeight}`
  );

  // Step 3: Generate diff image.
  console.log("\n🔍 Step 3: Generating diff image...");
  const diffImagePath = join(imagesDir, `diff_${pageSuffix}.png`);
  await generateDiffImage(baseScreenshotPath, previewScreenshotPath, diffImagePath);
  console.log(`Diff image saved: ${diffImagePath}`);

  // Step 4: Extract visual sections from the base image.
  console.log("\n🤖 Step 4: Extracting visual sections (banding + labeling)...");
  const baseSectionsResult = await extractVisualSections(
    stagehand,
    baseScreenshotPath
  );
  const previewSectionsResult = await extractVisualSections(
    stagehand,
    previewScreenshotPath
  );
  const sectionsAnalysis = formatVisualSectionsAsAnalysis(baseSectionsResult);
  console.log(
    `\n${"=".repeat(50)}\n🗺️ Visual Sections Analysis:\n${sectionsAnalysis}\n${"=".repeat(50)}`
  );

  // Step 5: Capture section screenshots.
  console.log("\n📷 Step 5: Capturing section screenshots...");
  const sectionScreenshots: Record<string, { base: string; preview: string }> = {};

  const sectionMatches = alignSectionsByLabel(
    baseSectionsResult.sections,
    previewSectionsResult.sections,
    baseImageHeight,
    previewImageHeight
  );

  for (const match of sectionMatches) {
    const sectionId = match.base.sectionId;
    if (!match.preview) {
      console.warn(`No preview match for base section ${sectionId}`);
      continue;
    }

    const baseSectionPath = join(
      imagesDir,
      `base_screenshot_${pageSuffix}_section_${sectionId}.png`
    );
    const previewSectionPath = join(
      imagesDir,
      `preview_screenshot_${pageSuffix}_section_${sectionId}.png`
    );

    try {
      await cropSectionFromImage(
        baseScreenshotPath,
        baseSectionPath,
        match.base.boundingBox,
        baseImageWidth,
        baseImageHeight
      );
      await cropSectionFromImage(
        previewScreenshotPath,
        previewSectionPath,
        match.preview.boundingBox,
        previewImageWidth,
        previewImageHeight
      );

      sectionScreenshots[sectionId] = {
        base: baseSectionPath,
        preview: previewSectionPath,
      };
    } catch (error) {
      console.warn(`Failed to crop section ${sectionId}: ${error}`);
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

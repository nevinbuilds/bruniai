/**
 * Figma-to-URL comparison core functionality.
 *
 * This module provides the workflow for comparing Figma prototype
 * screenshots against live website URLs using visual AI-based section
 * detection.
 */

import type { Stagehand } from "@browserbasehq/stagehand";
import { generateDiffImage } from "../diff/diff.js";
import {
  screenshotFigmaPrototype,
  extractVisualSections,
  formatVisualSectionsAsAnalysis,
  takeSectionScreenshotsFromVisualBounds,
} from "../figma/index.js";
import { analyzeImagesWithVisionFigmaMode } from "../vision/index.js";
import { ensureViewportSize } from "../utils/window.js";
import type { VisualAnalysisResult } from "../vision/types.js";
import { join } from "path";
import { writeFileSync } from "fs";

/**
 * Options for performing a Figma-to-URL comparison.
 */
export interface FigmaComparisonOptions {
  /** Stagehand instance to use for browser automation. */
  stagehand: Stagehand;
  /** Figma prototype URL (base/reference). */
  figmaUrl: string;
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

/**
 * Result of a Figma-to-URL comparison.
 */
export interface FigmaComparisonResult {
  /** Visual analysis result from AI. */
  visual_analysis: VisualAnalysisResult;
  /** Formatted sections analysis text (AI-detected). */
  sections_analysis: string;
  /** Path to Figma screenshot (base). */
  base_screenshot: string;
  /** Path to preview URL screenshot. */
  preview_screenshot: string;
  /** Path to diff image. */
  diff_image: string;
  /** Section screenshots keyed by section ID. */
  section_screenshots: Record<string, { base: string; preview: string }>;
  /** Comparison mode indicator. */
  mode: "figma-to-url";
}

/**
 * Perform visual comparison between a Figma prototype and a live URL.
 *
 * This function performs the Figma-to-URL comparison workflow:
 * 1. Takes screenshot of Figma prototype (canvas only)
 * 2. Takes screenshot of preview URL
 * 3. Generates diff image
 * 4. Extracts visual sections using AI
 * 5. Captures section screenshots
 * 6. Performs visual analysis with AI
 *
 * @param options - Figma comparison options.
 * @returns Complete comparison results with image paths.
 */
export async function performFigmaComparison(
  options: FigmaComparisonOptions
): Promise<FigmaComparisonResult> {
  const {
    stagehand,
    figmaUrl,
    previewUrl,
    page,
    imagesDir,
    prNumber = "",
    repository = "",
  } = options;

  console.log(
    `\n${"=".repeat(50)}\n🎨 Starting Figma-to-URL Comparison\n${"=".repeat(50)}`
  );
  console.log(`Figma URL: ${figmaUrl}`);
  console.log(`Preview URL: ${previewUrl}`);

  // Generate page suffix for file naming.
  let pageSuffix = page.replace(/\//g, "_");
  pageSuffix = pageSuffix === "_" ? "home" : pageSuffix;

  // Step 1: Take screenshot of Figma prototype.
  console.log("\n📸 Step 1: Capturing Figma prototype screenshot...");
  const baseScreenshotPath = join(
    imagesDir,
    `base_screenshot_${pageSuffix}.png`
  );

  const figmaResult = await screenshotFigmaPrototype(
    stagehand,
    figmaUrl,
    baseScreenshotPath
  );

  if (!figmaResult.success) {
    throw new Error(
      `Failed to capture Figma screenshot: ${figmaResult.error || "Unknown error"}`
    );
  }

  console.log(`Figma screenshot saved: ${baseScreenshotPath}`);
  console.log(`Canvas bounds: ${JSON.stringify(figmaResult.canvasBounds)}`);

  // Step 2: Take screenshot of preview URL.
  console.log("\n📸 Step 2: Capturing preview URL screenshot...");
  const initialPage = stagehand.context.pages()[0];
  await ensureViewportSize(initialPage, previewUrl);

  const previewScreenshot = await initialPage.screenshot({
    fullPage: true,
  });

  const previewScreenshotPath = join(
    imagesDir,
    `preview_screenshot_${pageSuffix}.png`
  );
  writeFileSync(previewScreenshotPath, previewScreenshot);
  console.log(`Preview screenshot saved: ${previewScreenshotPath}`);

  // Step 3: Generate diff image.
  console.log("\n🔍 Step 3: Generating diff image...");
  const diffImagePath = join(imagesDir, `diff_${pageSuffix}.png`);
  await generateDiffImage(
    baseScreenshotPath,
    previewScreenshotPath,
    diffImagePath
  );
  console.log(`Diff image saved: ${diffImagePath}`);

  // Step 4: Extract visual sections from Figma screenshot using AI.
  console.log("\n🤖 Step 4: Extracting visual sections using AI...");
  const visualSectionsResult = await extractVisualSections(
    stagehand,
    baseScreenshotPath
  );

  // Format sections analysis for compatibility with existing workflow.
  const sectionsAnalysis = formatVisualSectionsAsAnalysis(visualSectionsResult);
  console.log(
    `\n${"=".repeat(50)}\n🗺️ Visual Sections Analysis:\n${sectionsAnalysis}\n${"=".repeat(50)}`
  );

  // Step 5: Capture section screenshots.
  console.log("\n📷 Step 5: Capturing section screenshots...");
  const sectionScreenshots: Record<string, { base: string; preview: string }> =
    {};

  // Take section screenshots from preview URL using visual bounds.
  const previewSectionScreenshots = await takeSectionScreenshotsFromVisualBounds(
    stagehand,
    previewUrl,
    visualSectionsResult.sections,
    imagesDir,
    pageSuffix
  );

  // For Figma sections, we use the visual bounds to clip from the base screenshot.
  for (const section of visualSectionsResult.sections) {
    const sectionId = section.sectionId;
    const baseSectionPath = join(
      imagesDir,
      `base_screenshot_${pageSuffix}_section_${sectionId}.png`
    );

    try {
      // Read the base screenshot and clip the section.
      // For now, we'll take a fresh screenshot with clip from the Figma canvas.
      // This ensures we get the exact bounds.
      const page = stagehand.context.pages()[0];
      await page.goto(figmaUrl, { waitUntil: "load", timeoutMs: 60000 });

      // Wait for canvas to be ready.
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Calculate clip coordinates relative to canvas.
      const clipX = figmaResult.canvasBounds.x + section.boundingBox.x;
      const clipY = figmaResult.canvasBounds.y + section.boundingBox.y;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const baseSectionScreenshot = await page.screenshot({
        clip: {
          x: clipX,
          y: clipY,
          width: section.boundingBox.width,
          height: section.boundingBox.height,
        },
      } as any);

      writeFileSync(baseSectionPath, baseSectionScreenshot);

      // Only add to result if both screenshots exist.
      if (previewSectionScreenshots[sectionId]) {
        sectionScreenshots[sectionId] = {
          base: baseSectionPath,
          preview: previewSectionScreenshots[sectionId],
        };
      }
    } catch (error) {
      console.warn(
        `Failed to capture Figma section ${sectionId}: ${error}`
      );
    }
  }

  console.log(
    `Captured ${Object.keys(sectionScreenshots).length} section screenshot pairs`
  );

  // Step 6: Perform visual analysis with AI (Figma mode - skips URL navigation).
  console.log("\n🧠 Step 6: Performing visual analysis (Figma mode)...");
  const visualAnalysis = await analyzeImagesWithVisionFigmaMode(
    baseScreenshotPath,
    previewScreenshotPath,
    diffImagePath,
    figmaUrl,
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
    mode: "figma-to-url",
  };
}

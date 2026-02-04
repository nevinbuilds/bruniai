import type { Stagehand } from "@browserbasehq/stagehand";
import { generateDiffImage } from "../diff/diff.js";
import { analyzeSectionsSideBySide } from "../sections/sections.js";
import {
  extractSectionBoundingBoxes,
  takeSectionScreenshot,
} from "../sections/sectionExtraction.js";
import { analyzeImagesWithVision } from "../vision/index.js";
import { ensureViewportSize, ensurePageFullyRendered } from "../utils/window.js";
import type { VisualAnalysisResult } from "../vision/types.js";
import { join } from "path";
import { writeFileSync } from "fs";

/**
 * Options for performing a visual comparison.
 */
export interface ComparisonOptions {
  /** Stagehand instance to use for browser automation. */
  stagehand: Stagehand;
  /** Base/reference URL. */
  baseUrl: string;
  /** Preview/changed URL. */
  previewUrl: string;
  /** Page path to compare (e.g., "/" or "/about"). */
  page: string;
  /** Directory where images should be saved. */
  imagesDir: string;
  /** Optional PR number for metadata. */
  prNumber?: string;
  /** Optional repository name for metadata. */
  repository?: string;
}

/**
 * Result of a visual comparison.
 */
export interface ComparisonResult {
  /** Visual analysis result from AI. */
  visual_analysis: VisualAnalysisResult;
  /** Formatted sections analysis text. */
  sections_analysis: string;
  /** Path to base screenshot. */
  base_screenshot: string;
  /** Path to preview screenshot. */
  preview_screenshot: string;
  /** Path to diff image. */
  diff_image: string;
  /** Section screenshots keyed by section ID. */
  section_screenshots: Record<string, { base: string; preview: string }>;
}

/**
 * Perform visual comparison between two URLs.
 *
 * This function performs the core comparison workflow:
 * 1. Takes screenshots of base and preview URLs
 * 2. Generates diff image
 * 3. Analyzes sections structure
 * 4. Performs visual analysis with AI
 * 5. Captures section screenshots
 *
 * @param options - Comparison options
 * @returns Complete comparison results with image paths
 */
export async function performComparison(
  options: ComparisonOptions
): Promise<ComparisonResult> {
  const {
    stagehand,
    baseUrl,
    previewUrl,
    page,
    imagesDir,
    prNumber = "",
    repository = "",
  } = options;

  // Construct full URLs for this page.
  const fullBaseUrl = baseUrl.replace(/\/$/, "") + page;
  const fullPreviewUrl = previewUrl.replace(/\/$/, "") + page;

  // Generate page suffix for file naming.
  let pageSuffix = page.replace(/\//g, "_");
  pageSuffix = pageSuffix === "_" ? "home" : pageSuffix;

  // Get the page and navigate to blank page first to ensure it's ready.
  const initialPage = stagehand.context.pages()[0];
  await ensureViewportSize(initialPage, "about:blank");

  // Ensure viewport is set correctly before navigating and taking screenshot.
  await ensureViewportSize(initialPage, fullBaseUrl);
  // Scroll through the page to trigger lazy loading and wait for images.
  await ensurePageFullyRendered(initialPage);

  const baseScreenshot = await initialPage.screenshot({
    fullPage: true,
  });

  const baseScreenshotPath = join(
    imagesDir,
    `base_screenshot_${pageSuffix}.png`
  );
  writeFileSync(baseScreenshotPath, baseScreenshot);

  // Ensure viewport is set correctly before navigating to preview URL and taking screenshot.
  await ensureViewportSize(initialPage, fullPreviewUrl);
  await ensurePageFullyRendered(initialPage);

  const previewScreenshot = await initialPage.screenshot({
    fullPage: true,
  });

  const previewScreenshotPath = join(
    imagesDir,
    `preview_screenshot_${pageSuffix}.png`
  );
  writeFileSync(previewScreenshotPath, previewScreenshot);

  const diffImagePath = join(imagesDir, `diff_${pageSuffix}.png`);
  await generateDiffImage(
    baseScreenshotPath,
    previewScreenshotPath,
    diffImagePath
  );

  // Analyze sections and get formatted analysis output.
  const sectionsAnalysis = await analyzeSectionsSideBySide(
    stagehand,
    fullBaseUrl,
    fullPreviewUrl
  );

  // Extract section bounding boxes with IDs from analysis.
  const sectionsWithIds = await extractSectionBoundingBoxes(
    stagehand,
    fullBaseUrl,
    sectionsAnalysis
  );

  // Capture section screenshots for both base and preview URLs.
  const sectionScreenshots: Record<string, { base: string; preview: string }> =
    {};
  for (const section of sectionsWithIds) {
    const sectionId = section.sectionId;

    // Define section screenshot paths.
    const baseSectionScreenshot = join(
      imagesDir,
      `base_screenshot_${pageSuffix}_section_${sectionId}.png`
    );
    const previewSectionScreenshot = join(
      imagesDir,
      `preview_screenshot_${pageSuffix}_section_${sectionId}.png`
    );

    // Take section screenshots using section IDs and analysis data.
    const baseSectionSuccess = await takeSectionScreenshot(
      stagehand,
      fullBaseUrl,
      baseSectionScreenshot,
      sectionId,
      sectionsAnalysis
    );
    const previewSectionSuccess = await takeSectionScreenshot(
      stagehand,
      fullPreviewUrl,
      previewSectionScreenshot,
      sectionId,
      sectionsAnalysis
    );

    if (baseSectionSuccess && previewSectionSuccess) {
      sectionScreenshots[sectionId] = {
        base: baseSectionScreenshot,
        preview: previewSectionScreenshot,
      };
    }
  }

  // Perform visual analysis with the sections information.
  const visualAnalysis = await analyzeImagesWithVision(
    baseScreenshotPath,
    previewScreenshotPath,
    diffImagePath,
    fullBaseUrl,
    fullPreviewUrl,
    prNumber,
    repository,
    sectionsAnalysis
  );

  return {
    visual_analysis: visualAnalysis,
    sections_analysis: sectionsAnalysis,
    base_screenshot: baseScreenshotPath,
    preview_screenshot: previewScreenshotPath,
    diff_image: diffImagePath,
    section_screenshots: sectionScreenshots,
  };
}

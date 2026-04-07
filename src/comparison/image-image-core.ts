/**
 * Deterministic image-to-image comparison workflow.
 *
 * Both inputs are normalized to PNG, trimmed, width-aligned, diffed, and then
 * compared section-by-section using the existing deterministic image matcher.
 */

import { generateDiffImage } from "../diff/diff.js";
import {
  downloadImageToPng,
  trimImageToContent,
  extractVisualSections,
  matchVisualSections,
  formatMatchedSectionsAsAnalysis,
  buildImageModeVisualAnalysis,
} from "../image/index.js";
import { analyzeSectionDiffExplanationsAgent } from "../vision/index.js";
import type { VisualAnalysisResult } from "../vision/types.js";
import type { SectionVisualResult } from "../reporter/types.js";
import { join } from "path";
import sharp from "sharp";

export interface ImageToImageComparisonOptions {
  baseImageUrl: string;
  previewImageUrl: string;
  imagesDir: string;
  prNumber?: string;
  repository?: string;
}

export interface ImageToImageComparisonResult {
  visual_analysis: VisualAnalysisResult;
  sections_analysis: string;
  base_screenshot: string;
  preview_screenshot: string;
  diff_image: string;
  section_screenshots: Record<string, { base: string; preview: string }>;
  section_results: SectionVisualResult[];
  mode: "image-to-image";
}

interface SectionArtifacts {
  base: string;
  preview: string;
  diff: string;
}

function buildLlmUnavailableExplanation(reason: string): string {
  return `${reason} Review the matched section crop and diff image directly for the exact visual change.`;
}

async function cropImageRegion(
  imagePath: string,
  outputPath: string,
  bounds: { left: number; top: number; width: number; height: number },
): Promise<void> {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width || 1;
  const imageHeight = metadata.height || 1;

  const left = Math.max(0, Math.round(bounds.left));
  const top = Math.max(0, Math.round(bounds.top));
  const width = Math.max(1, Math.min(Math.round(bounds.width), imageWidth - left));
  const height = Math.max(1, Math.min(Math.round(bounds.height), imageHeight - top));

  await sharp(imagePath)
    .extract({ left, top, width, height })
    .png()
    .toFile(outputPath);
}

async function resizeImageToWidth(
  inputPath: string,
  outputPath: string,
  width: number,
): Promise<{ width: number; height: number }> {
  await sharp(inputPath)
    .resize({ width, withoutEnlargement: false })
    .png()
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  return {
    width: metadata.width || width,
    height: metadata.height || 1,
  };
}

export async function performImageToImageComparison(
  options: ImageToImageComparisonOptions,
): Promise<ImageToImageComparisonResult> {
  const {
    baseImageUrl,
    previewImageUrl,
    imagesDir,
    prNumber = "",
    repository = "",
  } = options;

  const pageSuffix = "image";

  const baseOriginalPath = join(imagesDir, `base_original_${pageSuffix}.png`);
  const baseScreenshotPath = join(imagesDir, `base_screenshot_${pageSuffix}.png`);
  const previewOriginalPath = join(imagesDir, `preview_original_${pageSuffix}.png`);
  const previewScreenshotPath = join(
    imagesDir,
    `preview_screenshot_${pageSuffix}.png`,
  );
  const diffImagePath = join(imagesDir, `diff_${pageSuffix}.png`);

  console.log(
    `\n${"=".repeat(50)}\n🖼️ Starting deterministic image-to-image comparison\n${"=".repeat(50)}`,
  );

  console.log("\n📥 Step 1: Downloading baseline image...");
  await downloadImageToPng(baseImageUrl, baseOriginalPath);

  console.log("\n📥 Step 2: Downloading preview image...");
  await downloadImageToPng(previewImageUrl, previewOriginalPath);

  console.log("\n✂️ Step 3: Trimming baseline image margins...");
  const baseTrimResult = await trimImageToContent(baseOriginalPath, baseScreenshotPath);
  const baseWidth = baseTrimResult.trimmedDimensions.width;

  console.log("\n✂️ Step 4: Trimming preview image margins...");
  const previewTrimmedPath = join(imagesDir, `preview_trimmed_${pageSuffix}.png`);
  await trimImageToContent(previewOriginalPath, previewTrimmedPath);

  console.log("\n📏 Step 5: Normalizing preview image width...");
  await resizeImageToWidth(previewTrimmedPath, previewScreenshotPath, baseWidth);

  console.log("\n🔍 Step 6: Generating full-image diff...");
  await generateDiffImage(baseScreenshotPath, previewScreenshotPath, diffImagePath);

  console.log("\n🧩 Step 7: Detecting baseline sections...");
  const sectionsResult = await extractVisualSections(baseScreenshotPath);

  console.log("\n🧭 Step 8: Matching baseline sections inside preview image...");
  const sectionMatches = await matchVisualSections(
    baseScreenshotPath,
    previewScreenshotPath,
    sectionsResult.sections,
  );

  const sectionsAnalysis = formatMatchedSectionsAsAnalysis(
    sectionsResult,
    sectionMatches,
  );

  console.log("\n🖼️ Step 9: Cropping matched section screenshots...");
  const sectionScreenshots: Record<string, { base: string; preview: string }> = {};
  const sectionArtifacts = new Map<string, SectionArtifacts>();

  for (let index = 0; index < sectionMatches.length; index++) {
    const match = sectionMatches[index];
    const indexPrefix = `${String(index + 1).padStart(2, "0")}_`;
    const sectionHeight = match.designRange.endY - match.designRange.startY;
    const baseSectionPath = join(
      imagesDir,
      `base_screenshot_${pageSuffix}_section_${indexPrefix}${match.sectionId}.png`,
    );

    await cropImageRegion(baseScreenshotPath, baseSectionPath, {
      left: 0,
      top: match.designRange.startY,
      width: baseWidth,
      height: sectionHeight,
    });

    let previewSectionPath = "";
    let sectionDiffPath = "";
    if (match.matchedRange) {
      previewSectionPath = join(
        imagesDir,
        `preview_screenshot_${pageSuffix}_section_${indexPrefix}${match.sectionId}.png`,
      );
      await cropImageRegion(previewScreenshotPath, previewSectionPath, {
        left: 0,
        top: match.matchedRange.startY,
        width: baseWidth,
        height: match.matchedRange.endY - match.matchedRange.startY,
      });

      sectionDiffPath = join(
        imagesDir,
        `diff_${pageSuffix}_section_${indexPrefix}${match.sectionId}.png`,
      );
      await generateDiffImage(baseSectionPath, previewSectionPath, sectionDiffPath);
    }

    if (previewSectionPath) {
      sectionScreenshots[match.sectionId] = {
        base: baseSectionPath,
        preview: previewSectionPath,
      };
    }

    if (previewSectionPath && sectionDiffPath) {
      sectionArtifacts.set(match.sectionId, {
        base: baseSectionPath,
        preview: previewSectionPath,
        diff: sectionDiffPath,
      });
    }
  }

  console.log("\n🧠 Step 10: Explaining matched sections with vision...");
  if (process.env.OPENAI_API_KEY) {
    const explainableSections = sectionMatches
      .filter((match) => match.status !== "missing")
      .map((match) => {
        const artifacts = sectionArtifacts.get(match.sectionId);
        if (!artifacts) {
          return null;
        }

        return {
          section_id: match.sectionId,
          name: match.name,
          base_screenshot: artifacts.base,
          preview_screenshot: artifacts.preview,
          diff_image: artifacts.diff,
          match_score: match.matchScore,
          final_similarity_score: match.signals.finalSimilarityScore,
          pixel_difference: match.signals.pixelDifference,
          edge_difference: match.signals.edgeDifference,
          structural_similarity: match.signals.structuralSimilarity,
        };
      })
      .filter((section): section is NonNullable<typeof section> => section !== null);

    if (explainableSections.length > 0) {
      try {
        const explanations = await analyzeSectionDiffExplanationsAgent(
          explainableSections,
          baseImageUrl,
          previewImageUrl,
        );
        const explanationsById = new Map(
          explanations.map((explanation) => [explanation.section_id, explanation]),
        );
        let acceptedCount = 0;

        for (const match of sectionMatches) {
          const explanation = explanationsById.get(match.sectionId);
          if (!explanation) {
            continue;
          }

          match.humanDescription = explanation.explanation;
          match.explanationConfidence = explanation.explanation_confidence;
          match.explanationSource = "llm";
          acceptedCount += 1;
        }

        const degradedSections = explainableSections.filter(
          (section) => !explanationsById.has(section.section_id),
        );
        if (degradedSections.length > 0) {
          console.warn(
            `Section explanation agent returned ${acceptedCount}/${explainableSections.length} usable explanations. Falling back for: ${degradedSections
              .map((section) => section.section_id)
              .join(", ")}`,
          );
          for (const section of degradedSections) {
            const match = sectionMatches.find(
              (candidate) => candidate.sectionId === section.section_id,
            );
            if (!match) {
              continue;
            }
            match.humanDescription = buildLlmUnavailableExplanation(
              "The section was compared with the vision model, but it did not return a section-specific explanation.",
            );
            match.explanationConfidence = null;
            match.explanationSource = "fallback_generic";
          }
        }
      } catch (error) {
        console.warn(`Section explanation agent failed: ${error}`);
        for (const match of sectionMatches) {
          if (match.status === "missing") {
            continue;
          }
          match.humanDescription = buildLlmUnavailableExplanation(
            "The section was compared with the vision model, but the LLM explanation step failed.",
          );
          match.explanationConfidence = null;
          match.explanationSource = "fallback_error";
        }
      }
    }
  } else {
    console.log("Skipping section explanation agent because OPENAI_API_KEY is not set.");
    for (const match of sectionMatches) {
      if (match.status === "missing") {
        continue;
      }
      match.humanDescription = buildLlmUnavailableExplanation(
        "The section was compared with the vision model, but OPENAI_API_KEY is not set so no LLM explanation was generated.",
      );
      match.explanationConfidence = null;
      match.explanationSource = "fallback_no_key";
    }
  }

  const sectionResults: SectionVisualResult[] = sectionMatches.map((match) => {
    const artifacts = sectionArtifacts.get(match.sectionId);
    return {
      section_id: match.sectionId,
      name: match.name,
      status: match.status,
      design_range: {
        start_y: match.designRange.startY,
        end_y: match.designRange.endY,
      },
      matched_range: match.matchedRange
        ? {
            start_y: match.matchedRange.startY,
            end_y: match.matchedRange.endY,
          }
        : null,
      match_score: match.matchScore,
      similarity_score: match.similarityScore,
      signals: {
        pixel_difference: match.signals.pixelDifference,
        edge_difference: match.signals.edgeDifference,
        structural_similarity: match.signals.structuralSimilarity,
        final_similarity_score: match.signals.finalSimilarityScore,
      },
      description: match.humanDescription,
      explanation: match.humanDescription,
      explanation_confidence: match.explanationConfidence,
      explanation_source: match.explanationSource,
      image_refs: artifacts
        ? {
            base: artifacts.base,
            preview: artifacts.preview,
            diff: artifacts.diff,
          }
        : null,
    };
  });

  console.log("\n🧠 Step 11: Building deterministic report...");
  const visualAnalysis = buildImageModeVisualAnalysis({
    baseImageSource: baseImageUrl,
    previewUrl: previewImageUrl,
    prNumber,
    repository,
    sectionMatches,
  });

  return {
    visual_analysis: visualAnalysis,
    sections_analysis: sectionsAnalysis,
    base_screenshot: baseScreenshotPath,
    preview_screenshot: previewScreenshotPath,
    diff_image: diffImagePath,
    section_screenshots: sectionScreenshots,
    section_results: sectionResults,
    mode: "image-to-image",
  };
}

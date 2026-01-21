import { Stagehand } from "@browserbasehq/stagehand";
import { validateAndFixEnums, generateMetadata } from "./utils.js";
import type {
  VisualAnalysisResult,
  BaseUrlAnalysisResult,
} from "./types.js";
import {
  analyzeBaseUrlAgent,
  analyzePreviewUrlAgent,
  analyzeImagesAgent,
} from "./agents.js";
import { combineAgentResults } from "./combiner.js";

/**
 * Analyze screenshots using Stagehand agent to identify visual differences.
 *
 * This function replicates the Python analyze_images_with_vision functionality
 * using Stagehand's extract() method with structured output.
 *
 * Security considerations:
 * - PR title and description are sanitized to prevent prompt injection attacks
 * - Input is validated for suspicious patterns and logged if detected
 * - Unique delimiter markers are used per request to prevent delimiter confusion
 * - Prompt explicitly instructs the LLM to ignore any commands in PR metadata
 * - Visual analysis always takes priority over PR metadata claims
 *
 * @param base_screenshot - Path to the base screenshot
 * @param pr_screenshot - Path to the PR screenshot
 * @param diff_image - Path to the diff image highlighting differences
 * @param base_url - Base URL being tested
 * @param preview_url - Preview URL for the PR
 * @param pr_number - PR number
 * @param repository - Repository name
 * @param sections_analysis - Optional analysis of website sections
 * @param pr_title - Optional PR title for context (sanitized and truncated to MAX_TITLE_LENGTH)
 * @param pr_description - Optional PR description for context (sanitized and truncated to MAX_DESCRIPTION_LENGTH)
 * @param user_id - Optional user ID
 * @returns Complete structured report data matching the ReportData format
 */
export async function analyzeImagesWithVision(
  base_screenshot: string,
  pr_screenshot: string,
  diff_image: string,
  base_url: string,
  preview_url: string,
  pr_number: string,
  repository: string,
  sections_analysis?: string,
  user_id?: string
): Promise<VisualAnalysisResult> {
  console.log(
    `\n${"=".repeat(
      50
    )}\n🔍 Starting sequential agent-based analysis\n${"=".repeat(50)}`
  );

  // Initialize Stagehand (shared across all agents).
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: true,
    },
  });

  try {
    await stagehand.init();

    // Agent 1: Analyze base URL structure and sections.
    const baseAnalysis = await analyzeBaseUrlAgent(
      stagehand,
      base_url,
      sections_analysis
    );

    // Agent 2: Analyze preview URL and compare with base.
    const previewAnalysis = await analyzePreviewUrlAgent(
      stagehand,
      preview_url,
      baseAnalysis,
      sections_analysis
    );

    // Agent 3: Analyze screenshot images for visual differences.
    const imageAnalysis = await analyzeImagesAgent(
      stagehand,
      base_screenshot,
      pr_screenshot,
      diff_image,
      base_url,
      preview_url,
      sections_analysis
    );

    // Combine all agent results.
    const combinedResult = combineAgentResults(
      baseAnalysis,
      previewAnalysis,
      imageAnalysis
    );

    // Fill in metadata.
    const metadata = generateMetadata();
    combinedResult.id = metadata.id;
    combinedResult.url = base_url;
    combinedResult.preview_url = preview_url;
    combinedResult.pr_number = pr_number;
    combinedResult.repository = repository;
    combinedResult.timestamp = metadata.timestamp;
    combinedResult.created_at = metadata.created_at;
    combinedResult.user_id = user_id;

    // Ensure status field matches status_enum for backward compatibility.
    if (combinedResult.status_enum) {
      combinedResult.status = combinedResult.status_enum;
    }

    // Validate and fix enum values.
    const validatedData = validateAndFixEnums(combinedResult);

    console.log(
      `\n${"=".repeat(
        50
      )}\n🎨 Visual Analysis Results (JSON):\n${JSON.stringify(
        validatedData,
        null,
        2
      )}\n${"=".repeat(50)}`
    );

    return validatedData;
  } catch (error) {
    console.error(`Error during image analysis: ${error}`);
    throw error;
  } finally {
    await stagehand.close();
  }
}

/**
 * Analyze screenshots for image-baseline comparisons.
 *
 * This variant skips URL-based navigation for the base reference because
 * the base is a screenshot/image, not a browsable HTML page. It analyzes
 * the preview URL and performs image-based comparison.
 */
export async function analyzeImagesWithVisionImageMode(
  base_screenshot: string,
  pr_screenshot: string,
  diff_image: string,
  base_url: string,
  preview_url: string,
  pr_number: string,
  repository: string,
  sections_analysis?: string,
  user_id?: string
): Promise<VisualAnalysisResult> {
  console.log(
    `\n${"=".repeat(
      50
    )}\n🔍 Starting image-baseline visual analysis (image-based only)\n${"=".repeat(50)}`
  );

  // Initialize Stagehand for image and preview URL analysis.
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: true,
    },
  });

  try {
    await stagehand.init();

    // For image baseline mode, we create a synthetic base analysis from the
    // visual sections analysis instead of navigating to the base URL.
    console.log(
      `\n${"=".repeat(
        50
      )}\n🔍 Agent 1: Using visual sections analysis (image mode)\n${"=".repeat(50)}`
    );

    const baseAnalysis: BaseUrlAnalysisResult = createBaseAnalysisFromSections(
      sections_analysis || ""
    );

    // Agent 2: Analyze preview URL and compare with base.
    // This still works since preview URL is a normal website.
    const previewAnalysis = await analyzePreviewUrlAgent(
      stagehand,
      preview_url,
      baseAnalysis,
      sections_analysis
    );

    // Agent 3: Analyze screenshot images for visual differences.
    const imageAnalysis = await analyzeImagesAgent(
      stagehand,
      base_screenshot,
      pr_screenshot,
      diff_image,
      base_url,
      preview_url,
      sections_analysis
    );

    // Combine all agent results.
    const combinedResult = combineAgentResults(
      baseAnalysis,
      previewAnalysis,
      imageAnalysis
    );

    // Fill in metadata.
    const metadata = generateMetadata();
    combinedResult.id = metadata.id;
    combinedResult.url = base_url;
    combinedResult.preview_url = preview_url;
    combinedResult.pr_number = pr_number;
    combinedResult.repository = repository;
    combinedResult.timestamp = metadata.timestamp;
    combinedResult.created_at = metadata.created_at;
    combinedResult.user_id = user_id;

    // Ensure status field matches status_enum for backward compatibility.
    if (combinedResult.status_enum) {
      combinedResult.status = combinedResult.status_enum;
    }

    // Validate and fix enum values.
    const validatedData = validateAndFixEnums(combinedResult);

    console.log(
      `\n${"=".repeat(
        50
      )}\n🎨 Visual Analysis Results (JSON):\n${JSON.stringify(
        validatedData,
        null,
        2
      )}\n${"=".repeat(50)}`
    );

    return validatedData;
  } catch (error) {
    console.error(`Error during image-mode analysis: ${error}`);
    throw error;
  } finally {
    await stagehand.close();
  }
}

/**
 * Create a base analysis result from visual sections analysis.
 *
 * This parses the formatted sections analysis string and converts it into
 * the BaseUrlAnalysisResult structure expected by the combiner.
 *
 * @param sectionsAnalysis - Formatted sections analysis string.
 * @returns Base URL analysis result structure.
 */
function createBaseAnalysisFromSections(
  sectionsAnalysis: string
): BaseUrlAnalysisResult {
  const sections: Array<{
    name: string;
    section_id: string;
    description: string;
    position?: string;
  }> = [];

  // Parse sections from the analysis string.
  // Pattern matches: "1. Section Name\n   - Section ID: ...\n   - ..."
  const sectionPattern = /(\d+)\.\s*([^\n]+)\s*\n(.*?)(?=\d+\.|$)/gs;
  const matches = Array.from(sectionsAnalysis.matchAll(sectionPattern));

  for (const match of matches) {
    const sectionName = match[2]?.trim() || "";
    const sectionContent = match[3] || "";

    const sectionIdMatch = sectionContent.match(
      /Section ID:\s*([a-zA-Z0-9\-_]+)/
    );
    const positionMatch = sectionContent.match(/Position:\s*([^\n]+)/);
    const descriptionMatch = sectionContent.match(/Description:\s*([^\n]+)/);

    sections.push({
      name: sectionName,
      section_id: sectionIdMatch ? sectionIdMatch[1] : `section-${match[1]}`,
      description: descriptionMatch
        ? descriptionMatch[1].trim()
        : `Section: ${sectionName}`,
      position: positionMatch ? positionMatch[1].trim() : undefined,
    });
  }

  return {
    sections,
    structural_analysis: {
      section_order: "Sections analyzed from base screenshot",
      layout: "Visual layout extracted from base image",
      broken_layouts: "none",
    },
    layout_notes:
      "Analysis based on base screenshot visual sections (AI-detected)",
  };
}

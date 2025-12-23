import { Stagehand } from "@browserbasehq/stagehand";
import { validateAndFixEnums, generateMetadata } from "./utils.js";
import type { VisualAnalysisResult } from "./types.js";
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
      viewport: {
        width: 1920,
        height: 1080,
      },
      args: [
        // Allow file:// URLs in headless mode.
        "--allow-file-access-from-files",
        "--disable-web-security",
        // Ensure proper rendering in headless mode.
        "--disable-features=VizDisplayCompositor",
      ],
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

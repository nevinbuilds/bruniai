import type { VisualAnalysisResult } from "./types.js";
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
export declare function analyzeImagesWithVision(base_screenshot: string, pr_screenshot: string, diff_image: string, base_url: string, preview_url: string, pr_number: string, repository: string, sections_analysis?: string, user_id?: string): Promise<VisualAnalysisResult>;
/**
 * Analyze screenshots for image-baseline comparisons.
 *
 * This variant skips URL-based navigation for the base reference because
 * the base is a screenshot/image, not a browsable HTML page. It analyzes
 * the preview URL and performs image-based comparison.
 */
export declare function analyzeImagesWithVisionImageMode(base_screenshot: string, pr_screenshot: string, diff_image: string, base_url: string, preview_url: string, pr_number: string, repository: string, sections_analysis?: string, user_id?: string): Promise<VisualAnalysisResult>;
//# sourceMappingURL=vision.d.ts.map
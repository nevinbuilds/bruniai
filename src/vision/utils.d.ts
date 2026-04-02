import type { VisualAnalysisResult } from "./types.js";
export interface SectionDiffReviewCard {
    section_id: string;
    name: string;
    base_screenshot: string;
    preview_screenshot: string;
    diff_image: string;
    match_score: number;
    final_similarity_score: number;
    pixel_difference: number;
    edge_difference: number;
    structural_similarity: number;
}
/**
 * Maximum length for PR title input.
 */
export declare const MAX_TITLE_LENGTH = 200;
/**
 * Maximum length for PR description input.
 */
export declare const MAX_DESCRIPTION_LENGTH = 500;
/**
 * Detect suspicious patterns that may indicate prompt injection attempts.
 *
 * @param text - Text to analyze for suspicious patterns
 * @returns True if suspicious patterns are detected
 */
export declare function detectSuspiciousPatterns(text: string): boolean;
/**
 * Sanitize PR title or description input to prevent prompt injection attacks.
 *
 * This function implements multi-layer sanitization:
 * - Escapes curly braces to prevent template injection
 * - Escapes newlines to prevent prompt breakouts
 * - Escapes backticks to prevent code block injection
 * - Escapes delimiter markers to prevent delimiter confusion
 * - Normalizes whitespace
 * - Truncates to safe length limits
 * - Removes control characters
 *
 * Security considerations:
 * - All user input from PR metadata should be sanitized before use in prompts
 * - This function does not guarantee complete protection but significantly reduces risk
 * - Suspicious patterns are detected and logged but input is still sanitized
 *
 * @param text - Text to sanitize
 * @param maxLength - Maximum allowed length (defaults to MAX_DESCRIPTION_LENGTH)
 * @returns Sanitized text safe for use in prompts
 */
export declare function sanitizePrInput(text: string, maxLength?: number): string;
/**
 * Validate and fix enum values in the analysis result.
 */
export declare function validateAndFixEnums(data: Partial<VisualAnalysisResult>): VisualAnalysisResult;
/**
 * Generate metadata (UUID, timestamps).
 */
export declare function generateMetadata(): {
    id: string;
    timestamp: string;
    created_at: string;
};
/**
 * Create HTML page with base64-encoded images for analysis.
 *
 * This function reads screenshot images from disk, converts them to base64
 * data URLs, and generates an HTML page that displays them side-by-side for
 * visual comparison analysis by the image analysis agent.
 *
 * @param base_screenshot - Path to the base/reference screenshot
 * @param pr_screenshot - Path to the PR/changed screenshot
 * @param diff_image - Path to the diff image highlighting differences
 * @param base_url - Base URL being tested
 * @param preview_url - Preview URL for the PR
 * @returns Complete HTML string for the comparison page
 */
export declare function createImageComparisonHtml(base_screenshot: string, pr_screenshot: string, diff_image: string, base_url: string, preview_url: string): string;
export declare function createSectionDiffReviewHtml(cards: SectionDiffReviewCard[], base_url: string, preview_url: string): string;
//# sourceMappingURL=utils.d.ts.map
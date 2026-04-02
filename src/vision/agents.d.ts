import { Stagehand } from "@browserbasehq/stagehand";
import { type BaseUrlAnalysisResult, type PreviewUrlAnalysisResult, type ImageAnalysisResult, type SectionDiffExplanation } from "./types.js";
import { type SectionDiffReviewCard } from "./utils.js";
export interface AnalyzeSectionDiffExplanationsInput extends SectionDiffReviewCard {
    section_id: string;
}
/**
 * Analyze base URL structure, sections, and layout.
 *
 * This agent focuses on understanding the reference structure
 * of the base URL page.
 *
 * @param stagehand - Stagehand instance
 * @param base_url - Base URL to analyze
 * @param sections_analysis - Optional analysis of website sections
 * @returns Base URL analysis result
 */
export declare function analyzeBaseUrlAgent(stagehand: Stagehand, base_url: string, sections_analysis?: string): Promise<BaseUrlAnalysisResult>;
/**
 * Analyze preview URL structure, sections, and layout.
 *
 * This agent compares the preview URL against the base URL
 * structure to identify changes.
 *
 * @param stagehand - Stagehand instance
 * @param preview_url - Preview URL to analyze
 * @param base_analysis - Base URL analysis result for comparison
 * @param sections_analysis - Optional analysis of website sections
 * @returns Preview URL analysis result
 */
export declare function analyzePreviewUrlAgent(stagehand: Stagehand, preview_url: string, base_analysis: BaseUrlAnalysisResult, sections_analysis?: string): Promise<PreviewUrlAnalysisResult>;
/**
 * Analyze screenshot images to identify visual differences.
 *
 * This agent analyzes the three screenshot images (base, preview, diff)
 * to identify visual changes and missing sections.
 *
 * @param stagehand - Stagehand instance
 * @param base_screenshot - Path to the base screenshot
 * @param pr_screenshot - Path to the PR screenshot
 * @param diff_image - Path to the diff image
 * @param base_url - Base URL being tested
 * @param preview_url - Preview URL for the PR
 * @param sections_analysis - Optional analysis of website sections
 * @param pr_title - Optional PR title for context
 * @param pr_description - Optional PR description for context
 * @returns Image analysis result
 */
export declare function analyzeImagesAgent(stagehand: Stagehand, base_screenshot: string, pr_screenshot: string, diff_image: string, base_url: string, preview_url: string, sections_analysis?: string): Promise<ImageAnalysisResult>;
export declare function analyzeSectionDiffExplanationsAgent(cards: AnalyzeSectionDiffExplanationsInput[], base_url: string, preview_url: string): Promise<SectionDiffExplanation[]>;
//# sourceMappingURL=agents.d.ts.map
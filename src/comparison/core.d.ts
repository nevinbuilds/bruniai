import type { Stagehand } from "@browserbasehq/stagehand";
import type { VisualAnalysisResult } from "../vision/types.js";
import type { SectionVisualResult } from "../reporter/types.js";
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
    section_screenshots: Record<string, {
        base: string;
        preview: string;
    }>;
    /** Optional deterministic section-level diff data. */
    section_results?: SectionVisualResult[];
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
export declare function performComparison(options: ComparisonOptions): Promise<ComparisonResult>;
//# sourceMappingURL=core.d.ts.map
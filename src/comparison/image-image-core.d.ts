/**
 * Deterministic image-to-image comparison workflow.
 *
 * Both inputs are normalized to PNG, trimmed, width-aligned, diffed, and then
 * compared section-by-section using the existing deterministic image matcher.
 */
import type { VisualAnalysisResult } from "../vision/types.js";
import type { SectionVisualResult } from "../reporter/types.js";
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
    section_screenshots: Record<string, {
        base: string;
        preview: string;
    }>;
    section_results: SectionVisualResult[];
    mode: "image-to-image";
}
export declare function performImageToImageComparison(options: ImageToImageComparisonOptions): Promise<ImageToImageComparisonResult>;
//# sourceMappingURL=image-image-core.d.ts.map
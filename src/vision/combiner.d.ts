import type { VisualAnalysisResult, BaseUrlAnalysisResult, PreviewUrlAnalysisResult, ImageAnalysisResult } from "./types.js";
/**
 * Combine results from all agents into final VisualAnalysisResult.
 *
 * This function merges the analysis results from:
 * - Base URL agent (reference structure)
 * - Preview URL agent (structure comparison)
 * - Image analysis agent (visual differences)
 *
 * It prioritizes critical findings and ensures consistency across all sources.
 *
 * @param base_analysis - Base URL analysis result
 * @param preview_analysis - Preview URL analysis result
 * @param image_analysis - Image analysis result
 * @returns Complete VisualAnalysisResult (partial, metadata filled by caller)
 */
export declare function combineAgentResults(base_analysis: BaseUrlAnalysisResult, preview_analysis: PreviewUrlAnalysisResult, image_analysis: ImageAnalysisResult): Partial<VisualAnalysisResult>;
//# sourceMappingURL=combiner.d.ts.map
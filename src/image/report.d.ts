import type { VisualSectionMatch } from "./visual-sections.js";
import type { VisualAnalysisResult } from "../vision/types.js";
export interface BuildImageModeVisualAnalysisInput {
    baseUrl: string;
    previewUrl: string;
    prNumber: string;
    repository: string;
    sectionMatches: VisualSectionMatch[];
}
export declare function buildImageModeVisualAnalysis(input: BuildImageModeVisualAnalysisInput): VisualAnalysisResult;
//# sourceMappingURL=report.d.ts.map
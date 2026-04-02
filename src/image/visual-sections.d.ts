/**
 * Deterministic section detection and matching for image-to-URL comparisons.
 *
 * This module intentionally avoids LLM-based section extraction. It trims
 * uniform margins from the design image, segments the design into full-width
 * vertical sections, and matches each section against the normalized webpage
 * screenshot using structural similarity.
 */
export interface VisualSection {
    name: string;
    sectionId: string;
    description: string;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    position: "top" | "middle" | "bottom";
    visualPatterns: string;
}
export interface VisualSectionsResult {
    sections: VisualSection[];
    layoutDescription: string;
    imageDimensions: {
        width: number;
        height: number;
    };
}
export interface VisualSectionSlice {
    sectionId: string;
    name: string;
    yStart: number;
    yEnd: number;
}
export interface TrimResult {
    outputPath: string;
    originalDimensions: {
        width: number;
        height: number;
    };
    trimmedDimensions: {
        width: number;
        height: number;
    };
    trim: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    };
    backgroundColor: {
        r: number;
        g: number;
        b: number;
    };
}
export interface SectionRange {
    startY: number;
    endY: number;
}
export interface VisualSectionMatch {
    sectionId: string;
    name: string;
    description: string;
    designRange: SectionRange;
    matchedRange: SectionRange | null;
    matchScore: number;
    similarityScore: number;
    signals: VisualSectionSignals;
    humanDescription: string;
    explanationConfidence: number | null;
    explanationSource: "llm" | "deterministic_fallback" | "fallback_no_key" | "fallback_error" | "fallback_generic";
    status: "matched" | "problematic" | "missing";
}
export interface VisualSectionSignals {
    pixelDifference: number;
    edgeDifference: number;
    structuralSimilarity: number;
    finalSimilarityScore: number;
}
export declare function snapSliceBoundariesToWhitespace(imagePath: string, slices: VisualSectionSlice[], imageHeight: number): Promise<VisualSectionSlice[]>;
export declare function trimImageToContent(inputPath: string, outputPath: string): Promise<TrimResult>;
export declare function extractVisualSections(screenshotPath: string): Promise<VisualSectionsResult>;
export declare function refineVisualSectionSlices(screenshotPath: string, baseSections: VisualSection[]): Promise<{
    slices: VisualSectionSlice[];
    sections: VisualSection[];
    layoutDescription: string;
    imageDimensions: {
        width: number;
        height: number;
    };
} | null>;
export declare function matchVisualSections(designImagePath: string, previewImagePath: string, sections: VisualSection[], options?: {
    stepPx?: number;
    localBandPx?: number;
    missingThreshold?: number;
    lowConfidenceThreshold?: number;
    problematicThreshold?: number;
    matchingWidth?: number;
}): Promise<VisualSectionMatch[]>;
export declare function formatVisualSectionsAsAnalysis(result: VisualSectionsResult): string;
export declare function formatMatchedSectionsAsAnalysis(sectionsResult: VisualSectionsResult, matches: VisualSectionMatch[]): string;
export declare function buildSectionId(name: string, index: number): string;
//# sourceMappingURL=visual-sections.d.ts.map
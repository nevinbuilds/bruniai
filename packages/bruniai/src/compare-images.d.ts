import type { CompareImagesInput, CompareImagesOutput } from "./types.js";
/**
 * Compare two images visually and return analysis results.
 *
 * This function performs a complete image-native comparison workflow:
 * - Creates a temporary directory for images
 * - Normalizes both inputs into PNG images
 * - Trims margins and generates a diff image
 * - Matches sections deterministically
 * - Produces structured analysis output
 *
 * @param input - Comparison input parameters
 * @returns Complete analysis results with image paths
 */
export declare function compareImages(input: CompareImagesInput): Promise<CompareImagesOutput>;
//# sourceMappingURL=compare-images.d.ts.map
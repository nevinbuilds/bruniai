import type { CompareUrlsInput, CompareUrlsOutput } from "./types.js";
/**
 * Compare two URLs visually and return analysis results.
 *
 * This function performs a complete visual comparison workflow:
 * - Creates a temporary directory for images
 * - Initializes and manages Stagehand browser automation
 * - Takes screenshots of both URLs
 * - Generates diff images
 * - Analyzes sections structure
 * - Performs AI-powered visual analysis
 * - Captures section screenshots
 *
 * @param input - Comparison input parameters
 * @returns Complete analysis results with image paths
 *
 * @example
 * ```typescript
 * const result = await compareUrls({
 *   baseUrl: "https://example.com",
 *   previewUrl: "https://preview.example.com",
 *   page: "/contact"
 * });
 * console.log(result.status); // "pass" | "fail" | "warning"
 * ```
 */
export declare function compareUrls(input: CompareUrlsInput): Promise<CompareUrlsOutput>;
//# sourceMappingURL=compare-urls.d.ts.map
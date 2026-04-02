import type { VisualAnalysisResult } from "../../../dist/vision/types.js";
import type { ReportStatus } from "../../../dist/reporter/types.js";

/**
 * Input parameters for compareUrls function.
 */
export interface CompareUrlsInput {
  /** Base/reference URL to compare against. */
  baseUrl: string;
  /** Preview/changed URL to analyze. */
  previewUrl: string;
  /** Page path to compare (e.g., "/" or "/about"). Defaults to "/". */
  page?: string;
  /** Optional PR number for metadata. */
  prNumber?: string;
  /** Optional repository name for metadata. */
  repository?: string;
}

/**
 * Input parameters for compareImages function.
 */
export interface CompareImagesInput {
  /** Base/reference image to compare against. Accepts HTTP(S) URLs or data URLs. */
  baseImage: string;
  /** Preview/changed image to analyze. Accepts HTTP(S) URLs or data URLs. */
  previewImage: string;
}

/**
 * Image paths returned from comparison.
 */
export interface ComparisonImages {
  /** Path to base screenshot. */
  base_screenshot: string;
  /** Path to preview screenshot. */
  preview_screenshot: string;
  /** Path to diff image. */
  diff_image: string;
  /** Section screenshots keyed by section ID. */
  section_screenshots?: Record<string, { base: string; preview: string }>;
}

/**
 * Output structure for compareUrls function.
 */
export interface CompareUrlsOutput {
  /** Overall comparison status. */
  status: ReportStatus;
  /** Visual analysis result from AI. */
  visual_analysis: VisualAnalysisResult;
  /** Formatted sections analysis text. */
  sections_analysis: string;
  /** Generated images from comparison. */
  images: ComparisonImages;
}

/**
 * Output structure for compareImages function.
 */
export type CompareImagesOutput = CompareUrlsOutput;

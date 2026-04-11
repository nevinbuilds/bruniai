import type { VisualAnalysisResult } from "../../../dist/vision/types.js";
import type {
  ReportStatus,
  SectionVisualResult,
} from "../../../dist/reporter/types.js";

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
  /**
   * Controls vision-based section explanations in deterministic section diffing.
   * "fast" explains only problematic matched sections, "detailed" explains all
   * matched sections, and "off" skips the LLM explanation step.
   */
  sectionExplanationMode?: "fast" | "detailed" | "off";
  /** Optional PR number for metadata. */
  prNumber?: string;
  /** Optional repository name for metadata. */
  repository?: string;
}

/**
 * Input parameters for compareImageToUrl function.
 */
export interface CompareImageToUrlInput {
  /**
   * Base/reference image source to compare against.
   * Accepts HTTP(S) image URLs or data:image/... URLs.
   */
  baseImageSource: string;
  /** Preview/changed webpage URL to analyze. */
  previewUrl: string;
  /** Page path to compare (e.g., "/" or "/about"). Defaults to "/". */
  page?: string;
  /**
   * Controls vision-based section explanations in deterministic section diffing.
   * "fast" explains only problematic matched sections, "detailed" explains all
   * matched sections, and "off" skips the LLM explanation step.
   */
  sectionExplanationMode?: "fast" | "detailed" | "off";
  /** Optional PR number for metadata. */
  prNumber?: string;
  /** Optional repository name for metadata. */
  repository?: string;
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
  /** Optional deterministic section-level diff results. */
  section_results?: SectionVisualResult[];
}

/**
 * Output structure for compareImageToUrl function.
 */
export type CompareImageToUrlOutput = CompareUrlsOutput;

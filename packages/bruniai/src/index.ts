/**
 * BruniAI - AI-powered visual regression testing tool.
 *
 * Core comparison library for visual regression testing.
 * Provides a simple API to compare two URLs and analyze visual differences.
 */

export { compareUrls } from "./compare-urls.js";
export { compareImages } from "./compare-images.js";
export type {
  CompareImagesInput,
  CompareImagesOutput,
  CompareUrlsInput,
  CompareUrlsOutput,
  ComparisonImages,
} from "./types.js";

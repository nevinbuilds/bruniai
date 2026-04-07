/**
 * BruniAI - AI-powered visual regression testing tool.
 *
 * Core comparison library for visual regression testing.
 * Provides a simple API to compare two URLs and analyze visual differences.
 */

export { compareUrls } from "./compare-urls.js";
export { compareImageToUrl } from "./compare-image-to-url.js";
export type {
  CompareImageToUrlInput,
  CompareImageToUrlOutput,
  CompareUrlsInput,
  CompareUrlsOutput,
  ComparisonImages,
} from "./types.js";

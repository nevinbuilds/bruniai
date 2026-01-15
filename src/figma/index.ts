/**
 * Figma-to-URL comparison utilities.
 *
 * This module provides functionality for comparing Figma prototypes
 * against live website URLs.
 */

export { isFigmaPrototypeUrl, extractFigmaFileKey, extractFigmaNodeId } from "./detector.js";
export {
  screenshotFigmaPrototype,
  getFigmaPrototypeDimensions,
  type BoundingBox,
  type FigmaScreenshotResult,
} from "./screenshot.js";
export {
  extractVisualSections,
  formatVisualSectionsAsAnalysis,
  takeSectionScreenshotsFromVisualBounds,
  type VisualSection,
  type VisualSectionsResult,
} from "./visual-sections.js";

/**
 * Bruni Reporter module exports.
 */

export { BruniReporter } from "./reporter.js";
export {
  parseMultiPageAnalysisResults,
  determineStatusFromVisualAnalysis,
} from "./report-generator.js";
export { encodeImageCompressed } from "./image-compression.js";

export type {
  ReportStatus,
  CriticalIssuesStatus,
  VisualChangesStatus,
  RecommendationStatus,
  ComparisonMode,
  SectionInfo,
  CriticalIssues,
  StructuralAnalysis,
  VisualChanges,
  Conclusion,
  ImageReferences,
  TestData,
  PageReport,
  MultiPageReportData,
} from "./types.js";

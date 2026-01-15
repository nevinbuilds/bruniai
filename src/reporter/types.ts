/**
 * Type definitions for Bruni reporter matching Python implementation.
 */

export type ReportStatus = "pass" | "fail" | "warning";
export type CriticalIssuesStatus = "none" | "missing_sections" | "other_issues";
export type VisualChangesStatus = "none" | "minor" | "significant";
export type RecommendationStatus = "pass" | "review_required" | "reject";
export type ComparisonMode = "url-to-url" | "figma-to-url";

export interface SectionInfo {
  name: string;
  status: string;
  description: string;
  section_id: string;
}

export interface CriticalIssues {
  sections: SectionInfo[];
  summary: string;
}

export interface StructuralAnalysis {
  section_order: string;
  layout: string;
  broken_layouts: string;
}

export interface VisualChanges {
  diff_highlights: string[];
  animation_issues: string;
  conclusion: string;
}

export interface Conclusion {
  critical_issues: string;
  visual_changes: string;
  recommendation: string;
  summary: string;
}

export interface ImageReferences {
  base_screenshot?: string | null; // Base64 encoded image data
  pr_screenshot?: string | null; // Base64 encoded image data
  diff_image?: string | null; // Base64 encoded image data
  section_screenshots?: Record<string, { base: string; pr: string }> | null; // Section screenshots with structure: {section_id: {base: "base64", pr: "base64"}}
}

// Multi-page API types
export interface TestData {
  pr_number: string;
  repository: string;
  timestamp: string;
  comparison_mode?: ComparisonMode;
}

export interface PageReport {
  page_path: string;
  url: string;
  preview_url: string;
  status: ReportStatus; // Required and cannot be 'none'
  critical_issues: CriticalIssues;
  critical_issues_enum: CriticalIssuesStatus;
  structural_analysis: StructuralAnalysis;
  visual_changes: VisualChanges;
  visual_changes_enum: VisualChangesStatus;
  recommendation_enum: RecommendationStatus;
  conclusion: Conclusion;
  image_refs?: ImageReferences | null;
}

export interface MultiPageReportData {
  test_data: TestData;
  reports: PageReport[];
}

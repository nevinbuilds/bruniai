/**
 * Type definitions for Bruni reporter matching Python implementation.
 */
export type ReportStatus = "pass" | "fail" | "warning";
export type CriticalIssuesStatus = "none" | "missing_sections" | "other_issues";
export type VisualChangesStatus = "none" | "minor" | "significant";
export type RecommendationStatus = "pass" | "review_required" | "reject";
export type ComparisonMode = "url-to-url" | "image-to-url" | "image-to-image";
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
    base_screenshot?: string | null;
    pr_screenshot?: string | null;
    diff_image?: string | null;
    section_screenshots?: Record<string, {
        base: string;
        pr: string;
    }> | null;
}
export interface SectionRangeReport {
    start_y: number;
    end_y: number;
}
export interface SectionSignalsReport {
    pixel_difference: number;
    edge_difference: number;
    structural_similarity: number;
    final_similarity_score: number;
}
export interface SectionImageReferences {
    base: string;
    preview: string;
    diff: string;
}
export interface SectionVisualResult {
    section_id: string;
    name: string;
    status: "matched" | "problematic" | "missing";
    design_range: SectionRangeReport;
    matched_range: SectionRangeReport | null;
    match_score: number;
    similarity_score: number;
    signals: SectionSignalsReport;
    description: string;
    explanation: string;
    explanation_confidence: number | null;
    explanation_source: "llm" | "deterministic_fallback" | "fallback_no_key" | "fallback_error" | "fallback_generic";
    image_refs: SectionImageReferences | null;
}
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
    status: ReportStatus;
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
//# sourceMappingURL=types.d.ts.map
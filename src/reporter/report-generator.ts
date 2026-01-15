import type {
  MultiPageReportData,
  TestData,
  PageReport,
  ReportStatus,
  CriticalIssuesStatus,
  VisualChangesStatus,
  RecommendationStatus,
  ImageReferences,
  ComparisonMode,
} from "./types.js";
import type { VisualAnalysisResult } from "../vision/types.js";

/**
 * Determine status from visual analysis data.
 *
 * @param visualAnalysis - Visual analysis data (dict or string)
 * @returns Status string: 'pass', 'warning', 'fail', or 'none'
 */
export function determineStatusFromVisualAnalysis(
  visualAnalysis: VisualAnalysisResult | Record<string, any> | string | null
): ReportStatus | "none" {
  if (!visualAnalysis) {
    return "none";
  }

  if (
    typeof visualAnalysis === "string" ||
    !(visualAnalysis instanceof Object)
  ) {
    // Fallback for string-based analysis
    const analysisText = String(visualAnalysis).toLowerCase();
    if (
      analysisText.includes("missing sections") ||
      analysisText.includes("critical")
    ) {
      return "fail";
    } else if (
      (analysisText.includes("significant changes") &&
        !analysisText.includes("no significant changes")) ||
      analysisText.includes("review required")
    ) {
      return "warning";
    } else {
      return "pass";
    }
  }

  // Determine status based on visual analysis (original logic)
  let status: ReportStatus | "none" = "pass"; // Default to pass

  const analysis = visualAnalysis as Record<string, any>;

  // Check for critical issues
  const criticalIssuesEnum = analysis.critical_issues_enum || "none";
  if (criticalIssuesEnum !== "none") {
    status = "fail";
  } else {
    // Check for visual changes
    const visualChangesEnum = analysis.visual_changes_enum || "none";
    const recommendationEnum = analysis.recommendation_enum || "pass";

    if (
      visualChangesEnum === "significant" ||
      recommendationEnum === "review_required"
    ) {
      status = "warning";
    } else if (visualChangesEnum === "minor") {
      status = "warning";
    } else {
      status = "pass";
    }
  }

  return status;
}

/**
 * Parse multiple page analysis results and generate a structured multi-page report.
 *
 * @param prNumber - PR number.
 * @param repository - Repository name.
 * @param pageResults - List of page result objects containing:
 *   - page_path: string
 *   - base_url: string
 *   - pr_url: string
 *   - visual_analysis: VisualAnalysisResult or dict
 *   - sections_analysis: string
 *   - image_refs: Optional ImageReferences
 * @param comparisonMode - Optional comparison mode (url-to-url or figma-to-url).
 * @returns MultiPageReportData with test_data and reports.
 */
export function parseMultiPageAnalysisResults(
  prNumber: string,
  repository: string,
  pageResults: Array<{
    page_path: string;
    base_url: string;
    pr_url: string;
    visual_analysis: VisualAnalysisResult | Record<string, any>;
    sections_analysis: string;
    image_refs?: ImageReferences | null;
  }>,
  comparisonMode?: ComparisonMode
): MultiPageReportData {
  // Create test data.
  const testData: TestData = {
    pr_number: prNumber,
    repository: repository,
    timestamp: new Date().toISOString(),
    comparison_mode: comparisonMode || "url-to-url",
  };

  // Process each page result
  const reports: PageReport[] = [];

  for (const pageResult of pageResults) {
    const { page_path, base_url, pr_url, visual_analysis, image_refs } =
      pageResult;

    // Determine status using the general function
    console.log("visual_analysis API ------- ", visual_analysis);
    const statusResult = determineStatusFromVisualAnalysis(visual_analysis);
    // Ensure status is ReportStatus (not 'none')
    const status: ReportStatus =
      statusResult === "none" ? "pass" : statusResult;

    // Parse the visual analysis to extract structured data
    // (Assume visual_analysis is already structured for multi-page)
    let parsedReport: Record<string, any>;
    if (
      typeof visual_analysis === "object" &&
      visual_analysis !== null &&
      !Array.isArray(visual_analysis)
    ) {
      parsedReport = visual_analysis as Record<string, any>;
    } else {
      // Create default structured data for string-based analysis
      parsedReport = {
        critical_issues: { sections: [], summary: "" },
        structural_analysis: {
          section_order: "",
          layout: "",
          broken_layouts: "",
        },
        visual_changes: {
          diff_highlights: [],
          animation_issues: "",
          conclusion: "",
        },
        conclusion: {
          critical_issues: "",
          visual_changes: "",
          recommendation: "",
          summary: "",
        },
      };
    }

    // Extract enum values with fallbacks
    const analysisDict =
      typeof visual_analysis === "object" &&
      visual_analysis !== null &&
      !Array.isArray(visual_analysis)
        ? (visual_analysis as Record<string, any>)
        : {};

    const analysisText = String(visual_analysis).toLowerCase();

    // Determine critical_issues_enum
    let criticalIssuesEnum: CriticalIssuesStatus = "none";
    if (analysisDict.critical_issues_enum) {
      criticalIssuesEnum = analysisDict.critical_issues_enum;
    } else if (analysisText.includes("missing sections")) {
      criticalIssuesEnum = "missing_sections";
    } else if (analysisText.includes("critical")) {
      criticalIssuesEnum = "other_issues";
    }

    // Determine visual_changes_enum
    let visualChangesEnum: VisualChangesStatus = "none";
    if (analysisDict.visual_changes_enum) {
      visualChangesEnum = analysisDict.visual_changes_enum;
    } else if (
      analysisText.includes("significant changes") &&
      !analysisText.includes("no significant changes")
    ) {
      visualChangesEnum = "significant";
    } else if (analysisText.includes("minor")) {
      visualChangesEnum = "minor";
    }

    // Determine recommendation_enum
    let recommendationEnum: RecommendationStatus = "pass";
    if (analysisDict.recommendation_enum) {
      recommendationEnum = analysisDict.recommendation_enum;
    } else if (analysisText.includes("review required")) {
      recommendationEnum = "review_required";
    }

    // Create page report with guaranteed valid status
    const pageReport: PageReport = {
      page_path: page_path,
      url: base_url,
      preview_url: pr_url,
      status: status, // Use our determined status instead of parsed one
      critical_issues: parsedReport.critical_issues || {
        sections: [],
        summary: "",
      },
      critical_issues_enum: criticalIssuesEnum,
      structural_analysis: parsedReport.structural_analysis || {
        section_order: "",
        layout: "",
        broken_layouts: "",
      },
      visual_changes: parsedReport.visual_changes || {
        diff_highlights: [],
        animation_issues: "",
        conclusion: "",
      },
      visual_changes_enum: visualChangesEnum,
      recommendation_enum: recommendationEnum,
      conclusion: parsedReport.conclusion || {
        critical_issues: "",
        visual_changes: "",
        recommendation: "",
        summary: "",
      },
      image_refs: image_refs || null,
    };

    reports.push(pageReport);
  }

  return {
    test_data: testData,
    reports: reports,
  };
}

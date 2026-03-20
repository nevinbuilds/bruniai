import type { VisualSectionMatch } from "./visual-sections.js";
import type { VisualAnalysisResult } from "../vision/types.js";
import { generateMetadata, validateAndFixEnums } from "../vision/utils.js";

export interface BuildImageModeVisualAnalysisInput {
  baseUrl: string;
  previewUrl: string;
  prNumber: string;
  repository: string;
  sectionMatches: VisualSectionMatch[];
}

export function buildImageModeVisualAnalysis(
  input: BuildImageModeVisualAnalysisInput,
): VisualAnalysisResult {
  const { baseUrl, previewUrl, prNumber, repository, sectionMatches } = input;

  const missingSections = sectionMatches.filter((section) => section.status === "missing");
  const problematicSections = sectionMatches.filter(
    (section) => section.status === "problematic",
  );
  const meanSimilarity =
    sectionMatches.length === 0
      ? 0
      : sectionMatches.reduce((sum, section) => sum + section.similarityScore, 0) /
        sectionMatches.length;

  const status: VisualAnalysisResult["status"] =
    missingSections.length > 0
      ? "fail"
      : problematicSections.length > 0 || meanSimilarity < 0.85
        ? "warning"
        : "pass";

  const visualChangesEnum: VisualAnalysisResult["visual_changes_enum"] =
    problematicSections.length > 0
      ? "significant"
      : meanSimilarity < 0.85
        ? "minor"
        : "none";

  const recommendationEnum: VisualAnalysisResult["recommendation_enum"] =
    status === "fail"
      ? "reject"
      : status === "warning"
        ? "review_required"
        : "pass";

  const metadata = generateMetadata();

  return validateAndFixEnums({
    id: metadata.id,
    url: baseUrl,
    preview_url: previewUrl,
    repository,
    pr_number: prNumber,
    timestamp: metadata.timestamp,
    created_at: metadata.created_at,
    status,
    status_enum: status,
    critical_issues: {
      sections: missingSections.map((section) => ({
        name: section.name,
        status: "Missing",
        description: `${section.description} Match score: ${section.matchScore.toFixed(3)}.`,
        section_id: section.sectionId,
      })),
      summary:
        missingSections.length > 0
          ? `${missingSections.length} design sections could not be matched in the webpage screenshot.`
          : "No missing sections detected.",
    },
    critical_issues_enum:
      missingSections.length > 0 ? "missing_sections" : "none",
    structural_analysis: {
      section_order: `Matched ${sectionMatches.length - missingSections.length}/${sectionMatches.length} sections in page order.`,
      layout: `Mean section similarity score: ${meanSimilarity.toFixed(3)}.`,
      broken_layouts:
        missingSections.length > 0 || problematicSections.length > 0
          ? [...missingSections, ...problematicSections]
              .map((section) => section.name)
              .join(", ")
          : "none",
    },
    visual_changes: {
      diff_highlights: [...problematicSections, ...missingSections].map(
        (section) => `${section.name}: ${section.humanDescription}`,
      ),
      animation_issues: "No animation analysis in deterministic image mode.",
      conclusion:
        problematicSections.length > 0
          ? `${problematicSections.length} matched sections fell below the similarity threshold.`
          : meanSimilarity < 0.85
            ? "Overall similarity is below the review threshold."
            : "No significant deterministic visual changes detected.",
    },
    visual_changes_enum: visualChangesEnum,
    recommendation_enum: recommendationEnum,
    conclusion: {
      critical_issues:
        missingSections.length > 0
          ? "Some design sections could not be located in the webpage screenshot."
          : "No missing sections detected.",
      visual_changes:
        problematicSections.length > 0
          ? "Some matched sections differ materially from the design."
          : meanSimilarity < 0.85
            ? "Overall similarity requires review."
            : "Matched sections are visually close to the design.",
      recommendation: recommendationEnum,
      summary:
        status === "fail"
          ? "Deterministic section matching found missing sections."
          : status === "warning"
            ? "Deterministic section matching found review-worthy differences."
            : "Deterministic section matching passed.",
    },
  });
}

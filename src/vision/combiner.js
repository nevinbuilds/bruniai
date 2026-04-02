/**
 * Combine results from all agents into final VisualAnalysisResult.
 *
 * This function merges the analysis results from:
 * - Base URL agent (reference structure)
 * - Preview URL agent (structure comparison)
 * - Image analysis agent (visual differences)
 *
 * It prioritizes critical findings and ensures consistency across all sources.
 *
 * @param base_analysis - Base URL analysis result
 * @param preview_analysis - Preview URL analysis result
 * @param image_analysis - Image analysis result
 * @returns Complete VisualAnalysisResult (partial, metadata filled by caller)
 */
export function combineAgentResults(base_analysis, preview_analysis, image_analysis) {
    // Combine missing sections from both preview and image analysis.
    const missingSectionsMap = new Map();
    // Add missing sections from preview analysis.
    for (const section of preview_analysis.sections) {
        if (section.status === "Missing") {
            missingSectionsMap.set(section.section_id, {
                name: section.name,
                status: "Missing",
                description: section.description,
                section_id: section.section_id,
            });
        }
    }
    // Add missing sections from image analysis.
    for (const missingSection of image_analysis.missing_sections) {
        if (!missingSectionsMap.has(missingSection.section_id)) {
            missingSectionsMap.set(missingSection.section_id, {
                name: missingSection.name,
                status: "Missing",
                description: missingSection.description,
                section_id: missingSection.section_id,
            });
        }
    }
    // Combine all sections with their status.
    const allSections = [];
    const sectionStatusMap = new Map();
    // Initialize from base analysis (all should be present in base).
    for (const section of base_analysis.sections) {
        sectionStatusMap.set(section.section_id, "Present");
    }
    // Update status from preview analysis.
    for (const section of preview_analysis.sections) {
        sectionStatusMap.set(section.section_id, section.status);
    }
    // Update status from image analysis missing sections.
    for (const missingSection of image_analysis.missing_sections) {
        sectionStatusMap.set(missingSection.section_id, "Missing");
    }
    // Build final sections array.
    for (const section of base_analysis.sections) {
        const status = sectionStatusMap.get(section.section_id) || "Present";
        allSections.push({
            name: section.name,
            status,
            description: status === "Missing"
                ? missingSectionsMap.get(section.section_id)?.description ||
                    section.description
                : section.description,
            section_id: section.section_id,
        });
    }
    // Determine critical issues enum.
    const hasMissingSections = allSections.some((s) => s.status === "Missing");
    const hasOtherIssues = preview_analysis.structural_analysis.broken_layouts !== "none" ||
        image_analysis.critical_issues_enum === "other_issues";
    let critical_issues_enum;
    if (hasMissingSections) {
        critical_issues_enum = "missing_sections";
    }
    else if (hasOtherIssues) {
        critical_issues_enum = "other_issues";
    }
    else {
        critical_issues_enum = "none";
    }
    // Combine structural analysis.
    const structural_analysis = {
        section_order: preview_analysis.structural_analysis.section_order ||
            base_analysis.structural_analysis.section_order,
        layout: preview_analysis.structural_analysis.layout ||
            base_analysis.structural_analysis.layout,
        broken_layouts: preview_analysis.structural_analysis.broken_layouts !== "none"
            ? preview_analysis.structural_analysis.broken_layouts
            : base_analysis.structural_analysis.broken_layouts,
    };
    // Combine visual changes.
    const visual_changes = {
        diff_highlights: image_analysis.visual_changes.diff_highlights,
        animation_issues: image_analysis.visual_changes.animation_issues ||
            "No animation issues detected.",
        conclusion: image_analysis.visual_changes.conclusion ||
            "Visual comparison completed.",
    };
    // Determine status enum based on critical issues and visual changes.
    let status_enum;
    if (critical_issues_enum === "missing_sections") {
        status_enum = "fail";
    }
    else if (critical_issues_enum === "other_issues" ||
        image_analysis.visual_changes_enum === "significant") {
        status_enum = "warning";
    }
    else if (image_analysis.visual_changes_enum === "minor") {
        status_enum = "warning";
    }
    else {
        status_enum = "pass";
    }
    // Determine recommendation enum.
    let recommendation_enum;
    if (critical_issues_enum === "missing_sections") {
        recommendation_enum = "reject";
    }
    else if (critical_issues_enum === "other_issues" ||
        image_analysis.visual_changes_enum === "significant") {
        recommendation_enum = "review_required";
    }
    else {
        recommendation_enum = "pass";
    }
    // Build critical issues summary.
    const criticalIssuesSummary = hasMissingSections
        ? `Missing sections detected: ${Array.from(missingSectionsMap.values())
            .map((s) => s.name)
            .join(", ")}.`
        : hasOtherIssues
            ? "Structural issues detected in layout or components."
            : "No critical issues detected.";
    // Build conclusion.
    const conclusion = {
        critical_issues: criticalIssuesSummary,
        visual_changes: image_analysis.visual_changes_enum === "significant"
            ? "Significant visual changes detected that require review."
            : image_analysis.visual_changes_enum === "minor"
                ? "Minor visual changes detected."
                : "No significant visual changes detected.",
        recommendation: recommendation_enum,
        summary: `Analysis completed. ${hasMissingSections
            ? "Critical: Missing sections detected."
            : hasOtherIssues
                ? "Warning: Structural issues detected."
                : image_analysis.visual_changes_enum === "significant"
                    ? "Warning: Significant visual changes detected."
                    : "All checks passed."}`,
    };
    // Build final result.
    return {
        critical_issues: {
            sections: allSections,
            summary: criticalIssuesSummary,
        },
        critical_issues_enum,
        structural_analysis,
        visual_changes,
        visual_changes_enum: image_analysis.visual_changes_enum,
        conclusion,
        recommendation_enum,
        status: status_enum,
        status_enum,
    };
}
//# sourceMappingURL=combiner.js.map
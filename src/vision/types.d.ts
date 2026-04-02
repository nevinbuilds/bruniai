import { z } from "zod/v3";
export declare const AnalyzeImagesInputSchema: z.ZodObject<{
    base_screenshot: z.ZodString;
    pr_screenshot: z.ZodString;
    diff_image: z.ZodString;
    base_url: z.ZodString;
    preview_url: z.ZodString;
    pr_number: z.ZodString;
    repository: z.ZodString;
    sections_analysis: z.ZodOptional<z.ZodString>;
    pr_title: z.ZodOptional<z.ZodString>;
    pr_description: z.ZodOptional<z.ZodString>;
    user_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    preview_url: string;
    repository: string;
    pr_number: string;
    base_screenshot: string;
    diff_image: string;
    pr_screenshot: string;
    base_url: string;
    user_id?: string | undefined;
    sections_analysis?: string | undefined;
    pr_title?: string | undefined;
    pr_description?: string | undefined;
}, {
    preview_url: string;
    repository: string;
    pr_number: string;
    base_screenshot: string;
    diff_image: string;
    pr_screenshot: string;
    base_url: string;
    user_id?: string | undefined;
    sections_analysis?: string | undefined;
    pr_title?: string | undefined;
    pr_description?: string | undefined;
}>;
export type AnalyzeImagesInput = z.infer<typeof AnalyzeImagesInputSchema>;
export declare const StatusEnumSchema: z.ZodEnum<["pass", "fail", "warning", "none"]>;
export declare const CriticalIssuesEnumSchema: z.ZodEnum<["none", "missing_sections", "other_issues"]>;
export declare const VisualChangesEnumSchema: z.ZodEnum<["none", "minor", "significant"]>;
export declare const RecommendationEnumSchema: z.ZodEnum<["pass", "review_required", "reject"]>;
export declare const SectionStatusSchema: z.ZodEnum<["Present", "Missing"]>;
export declare const SectionInfoSchema: z.ZodObject<{
    name: z.ZodString;
    status: z.ZodEnum<["Present", "Missing"]>;
    description: z.ZodString;
    section_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "Present" | "Missing";
    name: string;
    description: string;
    section_id: string;
}, {
    status: "Present" | "Missing";
    name: string;
    description: string;
    section_id: string;
}>;
export type SectionInfo = z.infer<typeof SectionInfoSchema>;
export declare const CriticalIssuesSchema: z.ZodObject<{
    sections: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        status: z.ZodEnum<["Present", "Missing"]>;
        description: z.ZodString;
        section_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
    }, {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
    }>, "many">;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sections: {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
    }[];
    summary: string;
}, {
    sections: {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
    }[];
    summary: string;
}>;
export type CriticalIssues = z.infer<typeof CriticalIssuesSchema>;
export declare const StructuralAnalysisSchema: z.ZodObject<{
    section_order: z.ZodString;
    layout: z.ZodString;
    broken_layouts: z.ZodString;
}, "strip", z.ZodTypeAny, {
    section_order: string;
    layout: string;
    broken_layouts: string;
}, {
    section_order: string;
    layout: string;
    broken_layouts: string;
}>;
export type StructuralAnalysis = z.infer<typeof StructuralAnalysisSchema>;
export declare const VisualChangesSchema: z.ZodObject<{
    diff_highlights: z.ZodArray<z.ZodString, "many">;
    animation_issues: z.ZodString;
    conclusion: z.ZodString;
}, "strip", z.ZodTypeAny, {
    diff_highlights: string[];
    animation_issues: string;
    conclusion: string;
}, {
    diff_highlights: string[];
    animation_issues: string;
    conclusion: string;
}>;
export type VisualChanges = z.infer<typeof VisualChangesSchema>;
export declare const ConclusionSchema: z.ZodObject<{
    critical_issues: z.ZodString;
    visual_changes: z.ZodString;
    recommendation: z.ZodEnum<["pass", "review_required", "reject"]>;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    summary: string;
    critical_issues: string;
    visual_changes: string;
    recommendation: "pass" | "review_required" | "reject";
}, {
    summary: string;
    critical_issues: string;
    visual_changes: string;
    recommendation: "pass" | "review_required" | "reject";
}>;
export type Conclusion = z.infer<typeof ConclusionSchema>;
export declare const VisualAnalysisResultSchema: z.ZodObject<{
    id: z.ZodString;
    url: z.ZodString;
    preview_url: z.ZodString;
    repository: z.ZodString;
    pr_number: z.ZodString;
    timestamp: z.ZodString;
    status: z.ZodEnum<["pass", "fail", "warning", "none"]>;
    status_enum: z.ZodEnum<["pass", "fail", "warning", "none"]>;
    critical_issues: z.ZodObject<{
        sections: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            status: z.ZodEnum<["Present", "Missing"]>;
            description: z.ZodString;
            section_id: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }, {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }>, "many">;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    }, {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    }>;
    critical_issues_enum: z.ZodEnum<["none", "missing_sections", "other_issues"]>;
    structural_analysis: z.ZodObject<{
        section_order: z.ZodString;
        layout: z.ZodString;
        broken_layouts: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        section_order: string;
        layout: string;
        broken_layouts: string;
    }, {
        section_order: string;
        layout: string;
        broken_layouts: string;
    }>;
    visual_changes: z.ZodObject<{
        diff_highlights: z.ZodArray<z.ZodString, "many">;
        animation_issues: z.ZodString;
        conclusion: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    }, {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    }>;
    visual_changes_enum: z.ZodEnum<["none", "minor", "significant"]>;
    conclusion: z.ZodObject<{
        critical_issues: z.ZodString;
        visual_changes: z.ZodString;
        recommendation: z.ZodEnum<["pass", "review_required", "reject"]>;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        summary: string;
        critical_issues: string;
        visual_changes: string;
        recommendation: "pass" | "review_required" | "reject";
    }, {
        summary: string;
        critical_issues: string;
        visual_changes: string;
        recommendation: "pass" | "review_required" | "reject";
    }>;
    recommendation_enum: z.ZodEnum<["pass", "review_required", "reject"]>;
    created_at: z.ZodString;
    user_id: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    url: string;
    preview_url: string;
    repository: string;
    pr_number: string;
    timestamp: string;
    status: "pass" | "fail" | "warning" | "none";
    status_enum: "pass" | "fail" | "warning" | "none";
    critical_issues: {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    };
    critical_issues_enum: "none" | "missing_sections" | "other_issues";
    structural_analysis: {
        section_order: string;
        layout: string;
        broken_layouts: string;
    };
    conclusion: {
        summary: string;
        critical_issues: string;
        visual_changes: string;
        recommendation: "pass" | "review_required" | "reject";
    };
    visual_changes: {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    };
    visual_changes_enum: "none" | "minor" | "significant";
    recommendation_enum: "pass" | "review_required" | "reject";
    created_at: string;
    user_id?: string | undefined;
}, {
    id: string;
    url: string;
    preview_url: string;
    repository: string;
    pr_number: string;
    timestamp: string;
    status: "pass" | "fail" | "warning" | "none";
    status_enum: "pass" | "fail" | "warning" | "none";
    critical_issues: {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    };
    critical_issues_enum: "none" | "missing_sections" | "other_issues";
    structural_analysis: {
        section_order: string;
        layout: string;
        broken_layouts: string;
    };
    conclusion: {
        summary: string;
        critical_issues: string;
        visual_changes: string;
        recommendation: "pass" | "review_required" | "reject";
    };
    visual_changes: {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    };
    visual_changes_enum: "none" | "minor" | "significant";
    recommendation_enum: "pass" | "review_required" | "reject";
    created_at: string;
    user_id?: string | undefined;
}>;
export type VisualAnalysisResult = z.infer<typeof VisualAnalysisResultSchema>;
export declare const BaseUrlAnalysisResultSchema: z.ZodObject<{
    sections: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        section_id: z.ZodString;
        description: z.ZodString;
        position: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }, {
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }>, "many">;
    structural_analysis: z.ZodObject<{
        section_order: z.ZodString;
        layout: z.ZodString;
        broken_layouts: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        section_order: string;
        layout: string;
        broken_layouts: string;
    }, {
        section_order: string;
        layout: string;
        broken_layouts: string;
    }>;
    layout_notes: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sections: {
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }[];
    structural_analysis: {
        section_order: string;
        layout: string;
        broken_layouts: string;
    };
    layout_notes: string;
}, {
    sections: {
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }[];
    structural_analysis: {
        section_order: string;
        layout: string;
        broken_layouts: string;
    };
    layout_notes: string;
}>;
export type BaseUrlAnalysisResult = z.infer<typeof BaseUrlAnalysisResultSchema>;
export declare const PreviewUrlAnalysisResultSchema: z.ZodObject<{
    sections: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        section_id: z.ZodString;
        status: z.ZodEnum<["Present", "Missing"]>;
        description: z.ZodString;
        position: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }, {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }>, "many">;
    structural_analysis: z.ZodObject<{
        section_order: z.ZodString;
        layout: z.ZodString;
        broken_layouts: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        section_order: string;
        layout: string;
        broken_layouts: string;
    }, {
        section_order: string;
        layout: string;
        broken_layouts: string;
    }>;
    layout_notes: z.ZodString;
    missing_sections: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    sections: {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }[];
    missing_sections: string[];
    structural_analysis: {
        section_order: string;
        layout: string;
        broken_layouts: string;
    };
    layout_notes: string;
}, {
    sections: {
        status: "Present" | "Missing";
        name: string;
        description: string;
        section_id: string;
        position?: string | undefined;
    }[];
    missing_sections: string[];
    structural_analysis: {
        section_order: string;
        layout: string;
        broken_layouts: string;
    };
    layout_notes: string;
}>;
export type PreviewUrlAnalysisResult = z.infer<typeof PreviewUrlAnalysisResultSchema>;
export declare const ImageAnalysisResultSchema: z.ZodObject<{
    critical_issues: z.ZodObject<{
        sections: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            status: z.ZodEnum<["Present", "Missing"]>;
            description: z.ZodString;
            section_id: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }, {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }>, "many">;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    }, {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    }>;
    critical_issues_enum: z.ZodEnum<["none", "missing_sections", "other_issues"]>;
    visual_changes: z.ZodObject<{
        diff_highlights: z.ZodArray<z.ZodString, "many">;
        animation_issues: z.ZodString;
        conclusion: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    }, {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    }>;
    visual_changes_enum: z.ZodEnum<["none", "minor", "significant"]>;
    missing_sections: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        section_id: z.ZodString;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        section_id: string;
    }, {
        name: string;
        description: string;
        section_id: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    critical_issues: {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    };
    missing_sections: {
        name: string;
        description: string;
        section_id: string;
    }[];
    critical_issues_enum: "none" | "missing_sections" | "other_issues";
    visual_changes: {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    };
    visual_changes_enum: "none" | "minor" | "significant";
}, {
    critical_issues: {
        sections: {
            status: "Present" | "Missing";
            name: string;
            description: string;
            section_id: string;
        }[];
        summary: string;
    };
    missing_sections: {
        name: string;
        description: string;
        section_id: string;
    }[];
    critical_issues_enum: "none" | "missing_sections" | "other_issues";
    visual_changes: {
        diff_highlights: string[];
        animation_issues: string;
        conclusion: string;
    };
    visual_changes_enum: "none" | "minor" | "significant";
}>;
export type ImageAnalysisResult = z.infer<typeof ImageAnalysisResultSchema>;
export declare const SectionDiffExplanationSchema: z.ZodObject<{
    section_id: z.ZodString;
    explanation: z.ZodString;
    explanation_confidence: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    section_id: string;
    explanation: string;
    explanation_confidence: number;
}, {
    section_id: string;
    explanation: string;
    explanation_confidence: number;
}>;
export type SectionDiffExplanation = z.infer<typeof SectionDiffExplanationSchema>;
export declare const SectionDiffExplanationsSchema: z.ZodObject<{
    sections: z.ZodArray<z.ZodObject<{
        section_id: z.ZodString;
        explanation: z.ZodString;
        explanation_confidence: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        section_id: string;
        explanation: string;
        explanation_confidence: number;
    }, {
        section_id: string;
        explanation: string;
        explanation_confidence: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    sections: {
        section_id: string;
        explanation: string;
        explanation_confidence: number;
    }[];
}, {
    sections: {
        section_id: string;
        explanation: string;
        explanation_confidence: number;
    }[];
}>;
export type SectionDiffExplanations = z.infer<typeof SectionDiffExplanationsSchema>;
//# sourceMappingURL=types.d.ts.map
import { z } from "zod/v3";

// Input parameter schema
export const AnalyzeImagesInputSchema = z.object({
  base_screenshot: z.string(),
  pr_screenshot: z.string(),
  diff_image: z.string(),
  base_url: z.string(),
  preview_url: z.string(),
  pr_number: z.string(),
  repository: z.string(),
  sections_analysis: z.string().optional(),
  pr_title: z.string().optional(),
  pr_description: z.string().optional(),
  user_id: z.string().optional(),
});

export type AnalyzeImagesInput = z.infer<typeof AnalyzeImagesInputSchema>;

// Enum schemas
export const StatusEnumSchema = z.enum(["pass", "fail", "warning", "none"]);
export const CriticalIssuesEnumSchema = z.enum([
  "none",
  "missing_sections",
  "other_issues",
]);
export const VisualChangesEnumSchema = z.enum(["none", "minor", "significant"]);
export const RecommendationEnumSchema = z.enum([
  "pass",
  "review_required",
  "reject",
]);
export const SectionStatusSchema = z.enum(["Present", "Missing"]);

// Section info schema
export const SectionInfoSchema = z.object({
  name: z.string(),
  status: SectionStatusSchema,
  description: z.string(),
  section_id: z.string(),
});

export type SectionInfo = z.infer<typeof SectionInfoSchema>;

// Critical issues schema
export const CriticalIssuesSchema = z.object({
  sections: z.array(SectionInfoSchema),
  summary: z.string(),
});

export type CriticalIssues = z.infer<typeof CriticalIssuesSchema>;

// Structural analysis schema
export const StructuralAnalysisSchema = z.object({
  section_order: z.string(),
  layout: z.string(),
  broken_layouts: z.string(),
});

export type StructuralAnalysis = z.infer<typeof StructuralAnalysisSchema>;

// Visual changes schema
export const VisualChangesSchema = z.object({
  diff_highlights: z.array(z.string()),
  animation_issues: z.string(),
  conclusion: z.string(),
});

export type VisualChanges = z.infer<typeof VisualChangesSchema>;

// Conclusion schema
export const ConclusionSchema = z.object({
  critical_issues: z.string(),
  visual_changes: z.string(),
  recommendation: RecommendationEnumSchema,
  summary: z.string(),
});

export type Conclusion = z.infer<typeof ConclusionSchema>;

// Complete visual analysis result schema
export const VisualAnalysisResultSchema = z.object({
  id: z.string(),
  url: z.string(),
  preview_url: z.string(),
  repository: z.string(),
  pr_number: z.string(),
  timestamp: z.string(),
  status: StatusEnumSchema,
  status_enum: StatusEnumSchema,
  critical_issues: CriticalIssuesSchema,
  critical_issues_enum: CriticalIssuesEnumSchema,
  structural_analysis: StructuralAnalysisSchema,
  visual_changes: VisualChangesSchema,
  visual_changes_enum: VisualChangesEnumSchema,
  conclusion: ConclusionSchema,
  recommendation_enum: RecommendationEnumSchema,
  created_at: z.string(),
  user_id: z.string().optional(),
});

export type VisualAnalysisResult = z.infer<typeof VisualAnalysisResultSchema>;

// Intermediate agent result schemas
// Base URL analysis result schema
export const BaseUrlAnalysisResultSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string(),
      section_id: z.string(),
      description: z.string(),
      position: z.string().optional(),
    })
  ),
  structural_analysis: StructuralAnalysisSchema,
  layout_notes: z.string(),
});

export type BaseUrlAnalysisResult = z.infer<typeof BaseUrlAnalysisResultSchema>;

// Preview URL analysis result schema
export const PreviewUrlAnalysisResultSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string(),
      section_id: z.string(),
      status: SectionStatusSchema,
      description: z.string(),
      position: z.string().optional(),
    })
  ),
  structural_analysis: StructuralAnalysisSchema,
  layout_notes: z.string(),
  missing_sections: z.array(z.string()),
});

export type PreviewUrlAnalysisResult = z.infer<
  typeof PreviewUrlAnalysisResultSchema
>;

// Image comparison analysis result schema
export const ImageAnalysisResultSchema = z.object({
  critical_issues: CriticalIssuesSchema,
  critical_issues_enum: CriticalIssuesEnumSchema,
  visual_changes: VisualChangesSchema,
  visual_changes_enum: VisualChangesEnumSchema,
  missing_sections: z.array(
    z.object({
      name: z.string(),
      section_id: z.string(),
      description: z.string(),
    })
  ),
});

export type ImageAnalysisResult = z.infer<typeof ImageAnalysisResultSchema>;


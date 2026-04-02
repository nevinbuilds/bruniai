/**
 * Test suite for report data type definitions and validation.
 *
 * This module tests the TypeScript types used for reporting and analysis, ensuring:
 * 1. Only valid enum values are accepted for status fields
 * 2. Data structures (SectionInfo, CriticalIssues, etc.) have the correct required
 *    and optional fields
 *
 * The tests cover:
 * - Enum value validation for all status types
 * - Structure and field presence for all report-related types
 * - Optional and required field handling
 */

import { describe, it, expect } from "vitest";
import type {
  ReportStatus,
  CriticalIssuesStatus,
  VisualChangesStatus,
  RecommendationStatus,
  SectionInfo,
  CriticalIssues,
  StructuralAnalysis,
  VisualChanges,
  Conclusion,
  ImageReferences,
  ComparisonMode,
} from "../../src/reporter/types.js";

describe("Type definitions", () => {
  describe("ReportStatus", () => {
    it("should accept valid status values", () => {
      const validStatuses: ReportStatus[] = ["pass", "fail", "warning"];

      for (const status of validStatuses) {
        expect(typeof status).toBe("string");
        expect(["pass", "fail", "warning"]).toContain(status);
      }
    });
  });

  describe("CriticalIssuesStatus", () => {
    it("should accept valid status values", () => {
      const validStatuses: CriticalIssuesStatus[] = [
        "none",
        "missing_sections",
        "other_issues",
      ];

      for (const status of validStatuses) {
        expect(typeof status).toBe("string");
        expect(["none", "missing_sections", "other_issues"]).toContain(status);
      }
    });
  });

  describe("VisualChangesStatus", () => {
    it("should accept valid status values", () => {
      const validStatuses: VisualChangesStatus[] = [
        "none",
        "minor",
        "significant",
      ];

      for (const status of validStatuses) {
        expect(typeof status).toBe("string");
        expect(["none", "minor", "significant"]).toContain(status);
      }
    });
  });

  describe("RecommendationStatus", () => {
    it("should accept valid status values", () => {
      const validStatuses: RecommendationStatus[] = [
        "pass",
        "review_required",
        "reject",
      ];

      for (const status of validStatuses) {
        expect(typeof status).toBe("string");
        expect(["pass", "review_required", "reject"]).toContain(status);
      }
    });
  });

  describe("SectionInfo", () => {
    it("should have correct structure with all fields", () => {
      const section: SectionInfo = {
        name: "Test Section",
        status: "pass",
        description: "Test Description",
        section_id: "test-section-id",
      };

      expect(section.name).toBe("Test Section");
      expect(section.status).toBe("pass");
      expect(section.description).toBe("Test Description");
      expect(section.section_id).toBe("test-section-id");
    });
  });

  describe("CriticalIssues", () => {
    it("should have correct structure with all fields", () => {
      const issues: CriticalIssues = {
        sections: [
          {
            name: "Test Section",
            status: "pass",
            description: "Test Description",
            section_id: "test-section-id",
          },
        ],
        summary: "Test Summary",
      };

      expect(issues.sections).toHaveLength(1);
      expect(issues.summary).toBe("Test Summary");
      expect(issues.sections[0].section_id).toBe("test-section-id");
    });
  });

  describe("StructuralAnalysis", () => {
    it("should have correct structure", () => {
      const analysis: StructuralAnalysis = {
        section_order: "test order",
        layout: "test layout",
        broken_layouts: "test broken",
      };

      expect(analysis.section_order).toBe("test order");
      expect(analysis.layout).toBe("test layout");
      expect(analysis.broken_layouts).toBe("test broken");
    });
  });

  describe("VisualChanges", () => {
    it("should have correct structure", () => {
      const changes: VisualChanges = {
        diff_highlights: ["highlight1", "highlight2"],
        animation_issues: "test animation",
        conclusion: "test conclusion",
      };

      expect(changes.diff_highlights).toHaveLength(2);
      expect(changes.animation_issues).toBe("test animation");
      expect(changes.conclusion).toBe("test conclusion");
    });
  });

  describe("Conclusion", () => {
    it("should have correct structure", () => {
      const conclusion: Conclusion = {
        critical_issues: "test critical",
        visual_changes: "test visual",
        recommendation: "test recommendation",
        summary: "test summary",
      };

      expect(conclusion.critical_issues).toBe("test critical");
      expect(conclusion.visual_changes).toBe("test visual");
      expect(conclusion.recommendation).toBe("test recommendation");
      expect(conclusion.summary).toBe("test summary");
    });
  });

  describe("ImageReferences", () => {
    it("should have optional fields", () => {
      const refs: ImageReferences = {};

      expect(refs.base_screenshot).toBeUndefined();
      expect(refs.pr_screenshot).toBeUndefined();
      expect(refs.diff_image).toBeUndefined();
    });

    it("should accept all optional fields", () => {
      const refs: ImageReferences = {
        base_screenshot: "base64_encoded_image_1",
        pr_screenshot: "base64_encoded_image_2",
        diff_image: "base64_encoded_image_3",
      };

      expect(refs.base_screenshot).toBe("base64_encoded_image_1");
      expect(refs.pr_screenshot).toBe("base64_encoded_image_2");
      expect(refs.diff_image).toBe("base64_encoded_image_3");
    });
  });

  describe("ComparisonMode", () => {
    it("should accept valid comparison modes", () => {
      const validModes: ComparisonMode[] = [
        "url-to-url",
        "image-to-url",
        "image-to-image",
      ];

      for (const mode of validModes) {
        expect(typeof mode).toBe("string");
        expect([
          "url-to-url",
          "image-to-url",
          "image-to-image",
        ]).toContain(mode);
      }
    });
  });
});

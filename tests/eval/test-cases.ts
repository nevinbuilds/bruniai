/**
 * Test case definitions for visual comparison evaluation.
 *
 * Each test case defines a scenario to test, including:
 * - Expected behavior (should detect differences or not)
 * - URLs to compare
 * - Category for grouping similar tests
 */

export type TestCategory =
  | "identical"
  | "missing_sections"
  | "content_only"
  | "banner";

export type ExpectedStatus = "pass" | "fail" | "warning" | "none";

/**
 * Test case definition.
 */
export interface TestCase {
  /** Unique identifier for the test case. */
  id: string;
  /** Descriptive name of the test case. */
  name: string;
  /** Base/reference URL. */
  baseUrl: string;
  /** Preview/changed URL (or same as baseUrl for identical tests). */
  previewUrl: string;
  /** Expected status from visual analysis. */
  expectedStatus: ExpectedStatus;
  /** Whether differences should be detected. */
  expectedDifference: boolean;
  /** Test category for grouping. */
  category: TestCategory;
  /** Description of what this test validates. */
  description: string;
  /** Optional: Skip this test case. */
  skip?: boolean;
}

/**
 * Get all test cases for evaluation.
 *
 * Includes:
 * - Identical pages (should show no differences)
 * - Missing sections (should detect missing sections and fail)
 * - Content only changes (should pass - text changes only)
 * - Banner on top (should detect banner and show warning)
 */
export function getTestCases(): TestCase[] {
  return [
    // Identical pages - should show no differences
    {
      id: "identical-website1",
      name: "Website 1 - Identical",
      baseUrl: "http://localhost:8000/website1-base.html",
      previewUrl: "http://localhost:8000/website1-base.html",
      expectedStatus: "pass",
      expectedDifference: false,
      category: "identical",
      description:
        "Comparing website1-base.html to itself should result in no differences detected.",
    },
    {
      id: "identical-website2",
      name: "Website 2 - Identical",
      baseUrl: "http://localhost:8000/website2-base.html",
      previewUrl: "http://localhost:8000/website2-base.html",
      expectedStatus: "pass",
      expectedDifference: false,
      category: "identical",
      description:
        "Comparing website2-base.html to itself should result in no differences detected.",
    },

    // Missing sections - should detect missing sections and fail
    {
      id: "missing-section-website1",
      name: "Website 1 - Missing Section",
      baseUrl: "http://localhost:8000/website1-base.html",
      previewUrl: "http://localhost:8000/website1-missing-section.html",
      expectedStatus: "fail",
      expectedDifference: true,
      category: "missing_sections",
      description:
        "Website 1 with missing Features section should be detected and result in fail status.",
    },
    {
      id: "missing-section-website2",
      name: "Website 2 - Missing Section",
      baseUrl: "http://localhost:8000/website2-base.html",
      previewUrl: "http://localhost:8000/website2-missing-section.html",
      expectedStatus: "fail",
      expectedDifference: true,
      category: "missing_sections",
      description:
        "Website 2 with missing Recent Posts section should be detected and result in fail status.",
    },

    // Content only changes - should pass (text changes only, no layout changes)
    {
      id: "content-h1-change-website1",
      name: "Website 1 - H1 Content Change",
      baseUrl: "http://localhost:8000/website1-base.html",
      previewUrl: "http://localhost:8000/website1-h1-change.html",
      expectedStatus: "pass",
      expectedDifference: false,
      category: "content_only",
      description:
        "Website 1 with only h1 text changed should pass (content-only changes are acceptable).",
    },
    {
      id: "content-h1-change-website2",
      name: "Website 2 - H1 Content Change",
      baseUrl: "http://localhost:8000/website2-base.html",
      previewUrl: "http://localhost:8000/website2-h1-change.html",
      expectedStatus: "pass",
      expectedDifference: false,
      category: "content_only",
      description:
        "Website 2 with only h1 text changed should pass (content-only changes are acceptable).",
    },
    {
      id: "content-multiple-change-website1",
      name: "Website 1 - Multiple Content Changes",
      baseUrl: "http://localhost:8000/website1-base.html",
      previewUrl: "http://localhost:8000/website1-content-change.html",
      expectedStatus: "pass",
      expectedDifference: false,
      category: "content_only",
      description:
        "Website 1 with multiple content elements changed (paragraphs, lists) should pass (content-only changes are acceptable).",
    },
    {
      id: "content-multiple-change-website2",
      name: "Website 2 - Multiple Content Changes",
      baseUrl: "http://localhost:8000/website2-base.html",
      previewUrl: "http://localhost:8000/website2-content-change.html",
      expectedStatus: "pass",
      expectedDifference: false,
      category: "content_only",
      description:
        "Website 2 with multiple content elements changed should pass (content-only changes are acceptable).",
    },

    // Banner on top - should detect banner and show warning
    {
      id: "banner-website1",
      name: "Website 1 - Banner on Top",
      baseUrl: "http://localhost:8000/website1-base.html",
      previewUrl: "http://localhost:8000/website1-banner.html",
      expectedStatus: "warning",
      expectedDifference: true,
      category: "banner",
      description:
        "Website 1 with banner added on top should result in warning status and correctly identify that the large diff is only because of the top banner section.",
    },
    {
      id: "banner-website2",
      name: "Website 2 - Banner on Top",
      baseUrl: "http://localhost:8000/website2-base.html",
      previewUrl: "http://localhost:8000/website2-banner.html",
      expectedStatus: "warning",
      expectedDifference: true,
      category: "banner",
      description:
        "Website 2 with banner added on top should result in warning status and correctly identify that the large diff is only because of the top banner section.",
    },
  ];
}

/**
 * Get test cases filtered by category.
 */
export function getTestCasesByCategory(category: TestCategory): TestCase[] {
  return getTestCases().filter((tc) => tc.category === category);
}

/**
 * Get test cases that are not skipped.
 */
export function getActiveTestCases(): TestCase[] {
  return getTestCases().filter((tc) => !tc.skip);
}

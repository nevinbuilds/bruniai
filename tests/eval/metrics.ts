/**
 * Metrics calculation for evaluation results.
 *
 * Calculates false positives, false negatives, and accuracy
 * based on test results.
 */

import type { TestResult } from "./eval-runner.js";
import type { TestCategory } from "./test-cases.js";

/**
 * Metrics for a single category or overall.
 */
export interface Metrics {
  /** Total number of test cases. */
  total: number;
  /** Number of passed tests. */
  passed: number;
  /** Number of failed tests. */
  failed: number;
  /** Number of tests with errors. */
  errors: number;
  /** False positive count (identical pages flagged as different). */
  falsePositives: number;
  /** False negative count (different pages flagged as identical). */
  falseNegatives: number;
  /** True positive count (different pages correctly flagged). */
  truePositives: number;
  /** True negative count (identical pages correctly flagged as identical). */
  trueNegatives: number;
  /** Accuracy percentage (0-100). */
  accuracy: number;
  /** False positive rate (0-1). */
  falsePositiveRate: number;
  /** False negative rate (0-1). */
  falseNegativeRate: number;
}

/**
 * Calculate metrics from test results.
 */
export function calculateMetrics(results: TestResult[]): Metrics {
  const total = results.length;
  let passed = 0;
  let failed = 0;
  let errors = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let truePositives = 0;
  let trueNegatives = 0;

  for (const result of results) {
    if (result.error) {
      errors++;
      continue;
    }

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }

    // Calculate false positives: expected no difference but differences detected
    if (!result.expectedDifference && result.differencesDetected) {
      falsePositives++;
    }
    // Calculate false negatives: expected difference but no differences detected
    else if (result.expectedDifference && !result.differencesDetected) {
      falseNegatives++;
    }
    // Calculate true positives: expected difference and differences detected
    else if (result.expectedDifference && result.differencesDetected) {
      truePositives++;
    }
    // Calculate true negatives: expected no difference and no differences detected
    else if (!result.expectedDifference && !result.differencesDetected) {
      trueNegatives++;
    }
  }

  // Calculate rates
  const totalIdenticalTests =
    trueNegatives + falsePositives || 1; // Avoid division by zero
  const totalDifferentTests =
    truePositives + falseNegatives || 1; // Avoid division by zero

  const falsePositiveRate = falsePositives / totalIdenticalTests;
  const falseNegativeRate = falseNegatives / totalDifferentTests;
  const accuracy = ((passed / total) * 100) || 0;

  return {
    total,
    passed,
    failed,
    errors,
    falsePositives,
    falseNegatives,
    truePositives,
    trueNegatives,
    accuracy,
    falsePositiveRate,
    falseNegativeRate,
  };
}

/**
 * Calculate metrics per category.
 */
export function calculateMetricsByCategory(
  results: TestResult[]
): Record<TestCategory, Metrics> {
  const categories: TestCategory[] = ["identical", "known_diff", "edge_case"];
  const metricsByCategory: Partial<Record<TestCategory, Metrics>> = {};

  for (const category of categories) {
    const categoryResults = results.filter(
      (r) => r.testCase.category === category
    );
    metricsByCategory[category] = calculateMetrics(categoryResults);
  }

  return metricsByCategory as Record<TestCategory, Metrics>;
}

/**
 * Get summary statistics from metrics.
 */
export function getMetricsSummary(metrics: Metrics): string {
  const lines = [
    `Total Tests: ${metrics.total}`,
    `Passed: ${metrics.passed} (${metrics.accuracy.toFixed(2)}%)`,
    `Failed: ${metrics.failed}`,
    `Errors: ${metrics.errors}`,
    ``,
    `False Positives: ${metrics.falsePositives} (${(metrics.falsePositiveRate * 100).toFixed(2)}%)`,
    `False Negatives: ${metrics.falseNegatives} (${(metrics.falseNegativeRate * 100).toFixed(2)}%)`,
    `True Positives: ${metrics.truePositives}`,
    `True Negatives: ${metrics.trueNegatives}`,
  ];

  return lines.join("\n");
}

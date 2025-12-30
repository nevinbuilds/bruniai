/**
 * Report generator for evaluation results.
 *
 * Generates evaluation reports with statistics and visualizations.
 */

import type { TestResult } from "./eval-runner.js";
import type { Metrics } from "./metrics.js";
import { calculateMetrics, calculateMetricsByCategory, getMetricsSummary } from "./metrics.js";
import { writeFileSync } from "fs";
import { join } from "path";

/**
 * Options for report generation.
 */
export interface ReportOptions {
  /** Test results to include in report. */
  results: TestResult[];
  /** Output directory for report. */
  outputDir: string;
  /** Report filename (default: eval-report.md). */
  filename?: string;
}

/**
 * Generate markdown report from evaluation results.
 */
export function generateReport(options: ReportOptions): string {
  const { results, filename = "eval-report.md" } = options;
  const overallMetrics = calculateMetrics(results);
  const categoryMetrics = calculateMetricsByCategory(results);

  const lines: string[] = [];

  // Header
  lines.push("# Visual Comparison Evaluation Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Overall Summary
  lines.push("## Overall Summary");
  lines.push("");
  lines.push("```");
  lines.push(getMetricsSummary(overallMetrics));
  lines.push("```");
  lines.push("");

  // Metrics by Category
  lines.push("## Metrics by Category");
  lines.push("");

  for (const [category, metrics] of Object.entries(categoryMetrics)) {
    lines.push(`### ${category.charAt(0).toUpperCase() + category.slice(1)}`);
    lines.push("");
    lines.push("```");
    lines.push(getMetricsSummary(metrics));
    lines.push("```");
    lines.push("");
  }

  // Detailed Results
  lines.push("## Detailed Results");
  lines.push("");
  lines.push("| Test ID | Name | Category | Expected | Actual | Status | Duration |");
  lines.push("|---------|------|----------|----------|--------|--------|----------|");

  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    const duration = `${(result.duration / 1000).toFixed(2)}s`;
    const expected = `${result.expectedStatus} (diff: ${result.expectedDifference})`;
    const actual = result.error
      ? `ERROR: ${result.error.message}`
      : `${result.actualStatus} (diff: ${result.differencesDetected})`;

    lines.push(
      `| ${result.testCase.id} | ${result.testCase.name} | ${result.testCase.category} | ${expected} | ${actual} | ${status} | ${duration} |`
    );
  }

  lines.push("");

  // Failed Tests Details
  const failedTests = results.filter((r) => !r.passed && !r.error);
  if (failedTests.length > 0) {
    lines.push("## Failed Tests Details");
    lines.push("");

    for (const result of failedTests) {
      lines.push(`### ${result.testCase.name} (${result.testCase.id})`);
      lines.push("");
      lines.push(`**Description**: ${result.testCase.description}`);
      lines.push("");
      lines.push(`**Base URL**: ${result.testCase.baseUrl}`);
      lines.push(`**Preview URL**: ${result.testCase.previewUrl}`);
      lines.push("");
      lines.push(`**Expected**:`);
      lines.push(`- Status: ${result.expectedStatus}`);
      lines.push(`- Difference detected: ${result.expectedDifference}`);
      lines.push("");
      lines.push(`**Actual**:`);
      lines.push(`- Status: ${result.actualStatus}`);
      lines.push(`- Difference detected: ${result.differencesDetected}`);
      lines.push("");

      if (result.comparisonResult) {
        const analysis = result.comparisonResult.visual_analysis;
        lines.push(`**Visual Analysis**:`);
        lines.push(`- Critical Issues: ${analysis.critical_issues_enum}`);
        lines.push(`- Visual Changes: ${analysis.visual_changes_enum}`);
        lines.push(`- Recommendation: ${analysis.recommendation_enum}`);
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  // Error Details
  const errorTests = results.filter((r) => r.error);
  if (errorTests.length > 0) {
    lines.push("## Error Details");
    lines.push("");

    for (const result of errorTests) {
      lines.push(`### ${result.testCase.name} (${result.testCase.id})`);
      lines.push("");
      lines.push(`**Error**: ${result.error!.message}`);
      lines.push("");
      if (result.error!.stack) {
        lines.push("```");
        lines.push(result.error!.stack);
        lines.push("```");
        lines.push("");
      }
    }
  }

  // Recommendations
  lines.push("## Recommendations");
  lines.push("");

  if (overallMetrics.falsePositiveRate > 0.1) {
    lines.push(
      `⚠️ **High False Positive Rate**: ${(overallMetrics.falsePositiveRate * 100).toFixed(2)}% of identical pages are incorrectly flagged as different.`
    );
    lines.push("   Consider adjusting sensitivity thresholds.");
    lines.push("");
  }

  if (overallMetrics.falseNegativeRate > 0.1) {
    lines.push(
      `⚠️ **High False Negative Rate**: ${(overallMetrics.falseNegativeRate * 100).toFixed(2)}% of different pages are incorrectly flagged as identical.`
    );
    lines.push("   Consider improving difference detection algorithms.");
    lines.push("");
  }

  if (overallMetrics.errors > 0) {
    lines.push(
      `⚠️ **Errors**: ${overallMetrics.errors} test(s) failed with errors. Review error details above.`
    );
    lines.push("");
  }

  if (
    overallMetrics.falsePositiveRate <= 0.1 &&
    overallMetrics.falseNegativeRate <= 0.1 &&
    overallMetrics.errors === 0
  ) {
    lines.push("✅ **All metrics are within acceptable ranges.**");
    lines.push("");
  }

  const reportContent = lines.join("\n");

  // Write to file
  const reportPath = join(options.outputDir, filename);
  writeFileSync(reportPath, reportContent, "utf-8");

  return reportPath;
}

/**
 * Generate JSON report from evaluation results.
 */
export function generateJsonReport(
  results: TestResult[],
  outputDir: string,
  filename: string = "eval-report.json"
): string {
  const overallMetrics = calculateMetrics(results);
  const categoryMetrics = calculateMetricsByCategory(results);

  const report = {
    timestamp: new Date().toISOString(),
    overall: overallMetrics,
    byCategory: categoryMetrics,
    results: results.map((r) => ({
      testCase: {
        id: r.testCase.id,
        name: r.testCase.name,
        category: r.testCase.category,
        description: r.testCase.description,
      },
      passed: r.passed,
      actualStatus: r.actualStatus,
      expectedStatus: r.expectedStatus,
      differencesDetected: r.differencesDetected,
      expectedDifference: r.expectedDifference,
      duration: r.duration,
      error: r.error ? r.error.message : null,
    })),
  };

  const reportPath = join(outputDir, filename);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  return reportPath;
}

/**
 * Evaluation runner for visual comparison testing.
 *
 * Executes test cases using performComparison and collects results
 * for metrics calculation.
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { performComparison } from "../../src/comparison/core.js";
import type { ComparisonResult } from "../../src/comparison/core.js";
import type { TestCase } from "./test-cases.js";
import { mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Result of running a single test case.
 */
export interface TestResult {
  /** The test case that was run. */
  testCase: TestCase;
  /** Whether the test passed. */
  passed: boolean;
  /** Actual status from visual analysis. */
  actualStatus: string;
  /** Expected status. */
  expectedStatus: string;
  /** Whether differences were detected. */
  differencesDetected: boolean;
  /** Expected difference detection. */
  expectedDifference: boolean;
  /** Comparison result from performComparison. */
  comparisonResult?: ComparisonResult;
  /** Error if the test failed. */
  error?: Error;
  /** Duration in milliseconds. */
  duration: number;
}

/**
 * Options for running evaluation.
 */
export interface EvaluationOptions {
  /** Test cases to run. */
  testCases: TestCase[];
  /** Whether to continue on errors. */
  continueOnError?: boolean;
  /** Timeout per test case in milliseconds. */
  timeout?: number;
}

/**
 * Run a single test case.
 */
async function runTestCase(
  testCase: TestCase,
  stagehand: Stagehand,
  imagesDir: string,
  timeout: number = 180000
): Promise<TestResult> {
  const startTime = Date.now();
  let comparisonResult: ComparisonResult | undefined;
  let error: Error | undefined;

  try {
    // Run comparison with timeout
    // Use empty string for page parameter when comparing HTML files directly
    const comparisonPromise = performComparison({
      stagehand,
      baseUrl: testCase.baseUrl,
      previewUrl: testCase.previewUrl,
      page: "",
      imagesDir,
      prNumber: "eval-test",
      repository: "bruniai/eval",
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Test timeout")), timeout);
    });

    comparisonResult = await Promise.race([comparisonPromise, timeoutPromise]);

    const actualStatus = comparisonResult.visual_analysis.status_enum || "none";
    const differencesDetected =
      actualStatus !== "pass" && actualStatus !== "none";

    // Validate result
    const statusMatches = actualStatus === testCase.expectedStatus;
    const differenceMatches =
      differencesDetected === testCase.expectedDifference;

    const passed = statusMatches && differenceMatches;

    return {
      testCase,
      passed,
      actualStatus,
      expectedStatus: testCase.expectedStatus,
      differencesDetected,
      expectedDifference: testCase.expectedDifference,
      comparisonResult,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
    return {
      testCase,
      passed: false,
      actualStatus: "error",
      expectedStatus: testCase.expectedStatus,
      differencesDetected: false,
      expectedDifference: testCase.expectedDifference,
      error,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run evaluation on all test cases.
 */
export async function runEvaluation(
  options: EvaluationOptions
): Promise<TestResult[]> {
  const { testCases, continueOnError = true, timeout = 180000 } = options;

  // Create local directory for images
  const evalResultsDir = join(process.cwd(), "tests", "eval", ".eval-results");
  const timestamp = Date.now();
  const imagesDir = join(evalResultsDir, `images-${timestamp}`);

  if (!existsSync(evalResultsDir)) {
    await mkdir(evalResultsDir, { recursive: true });
  }
  await mkdir(imagesDir, { recursive: true });
  console.log(`Using images directory: ${imagesDir}`);

  // Initialize Stagehand once for all tests
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: true,
    },
  });

  try {
    await stagehand.init();
    console.log("Stagehand initialized");

    const results: TestResult[] = [];

    // Run each test case
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(
        `\n[${i + 1}/${testCases.length}] Running: ${testCase.name} (${
          testCase.id
        })`
      );
      console.log(`  Base URL: ${testCase.baseUrl}`);
      console.log(`  Preview URL: ${testCase.previewUrl}`);
      console.log(
        `  Expected: ${testCase.expectedStatus}, difference: ${testCase.expectedDifference}`
      );

      try {
        const result = await runTestCase(
          testCase,
          stagehand,
          imagesDir,
          timeout
        );
        results.push(result);

        if (result.passed) {
          console.log(`  ✅ PASSED (${result.duration}ms)`);
        } else {
          console.log(`  ❌ FAILED (${result.duration}ms)`);
          console.log(
            `     Expected: ${result.expectedStatus}, Got: ${result.actualStatus}`
          );
          console.log(
            `     Expected difference: ${result.expectedDifference}, Got: ${result.differencesDetected}`
          );
          if (result.error) {
            console.log(`     Error: ${result.error.message}`);
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error(`  ❌ ERROR: ${error.message}`);
        results.push({
          testCase,
          passed: false,
          actualStatus: "error",
          expectedStatus: testCase.expectedStatus,
          differencesDetected: false,
          expectedDifference: testCase.expectedDifference,
          error,
          duration: 0,
        });

        if (!continueOnError) {
          throw error;
        }
      }
    }

    return results;
  } finally {
    // Clean up
    await stagehand.close();
    console.log("\nCleaning up...");
    // Note: We keep imagesDir for now so results can be inspected
    // Uncomment to auto-clean:
    // await rm(imagesDir, { recursive: true, force: true });
    console.log(`Images saved in: ${imagesDir}`);
  }
}

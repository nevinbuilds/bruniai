#!/usr/bin/env tsx
/**
 * Main evaluation script.
 *
 * Runs visual comparison evaluation and generates reports.
 */

import "dotenv/config";
import { getActiveTestCases } from "./test-cases.js";
import { runEvaluation } from "./eval-runner.js";
import { generateReport, generateJsonReport } from "./report.js";
import {
  startLocalServer,
  stopLocalServer,
  needsLocalServer,
} from "./local-server.js";
import type { Server } from "http";
import { mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

async function main() {
  console.log("=".repeat(60));
  console.log("Visual Comparison Evaluation");
  console.log("=".repeat(60));
  console.log("");

  // Get active test cases
  const testCases = getActiveTestCases();
  console.log(`Found ${testCases.length} active test case(s)`);
  console.log("");

  if (testCases.length === 0) {
    console.error("No active test cases found. Exiting.");
    process.exit(1);
  }

  // Check if we need a local server and start it if needed
  let localServer: Server | null = null;
  if (needsLocalServer(testCases)) {
    console.log("Detected localhost URLs - starting local server...");
    const testWebsitesDir = join(
      process.cwd(),
      "tests",
      "eval",
      "test-websites"
    );
    try {
      localServer = await startLocalServer({
        port: 8000,
        directory: testWebsitesDir,
      });
      console.log("");
    } catch (error) {
      console.error("Failed to start local server:", error);
      console.error(
        "Make sure port 8000 is available or stop any existing server."
      );
      process.exit(1);
    }
  }

  // Create local output directory for reports
  const evalResultsDir = join(process.cwd(), "tests", "eval", ".eval-results");
  const timestamp = Date.now();
  const outputDir = join(evalResultsDir, `reports-${timestamp}`);

  if (!existsSync(evalResultsDir)) {
    await mkdir(evalResultsDir, { recursive: true });
  }
  await mkdir(outputDir, { recursive: true });
  console.log(`Reports will be saved to: ${outputDir}`);
  console.log("");

  // Run evaluation
  console.log("Starting evaluation...");
  let results;
  try {
    results = await runEvaluation({
      testCases,
      continueOnError: true,
      timeout: 180000, // 180 seconds (3 minutes) per test
    });
  } finally {
    // Stop local server if we started it
    if (localServer) {
      await stopLocalServer(localServer);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("Evaluation Complete");
  console.log("=".repeat(60));
  console.log("");

  // Generate reports
  console.log("Generating reports...");
  const markdownReport = generateReport({
    results,
    outputDir,
    filename: "eval-report.md",
  });
  console.log(`Markdown report: ${markdownReport}`);

  const jsonReport = generateJsonReport(results, outputDir, "eval-report.json");
  console.log(`JSON report: ${jsonReport}`);

  console.log("");
  console.log("Evaluation complete!");
  console.log(`Reports saved in: ${outputDir}`);
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});

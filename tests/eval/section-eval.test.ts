/**
 * Section extraction eval tests.
 *
 * Runs extractVisualSections on baseline images and compares extracted
 * sections to expected section names.
 *
 * The deterministic extractor in image mode no longer aims to produce
 * semantic section labels. This eval remains useful as an opt-in benchmark
 * for future tuning, but it should not gate the standard test suite.
 */
import "dotenv/config";

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { extractVisualSections } from "../../src/image/index.js";
import { sectionEvalCases } from "./section-eval-cases.js";
import { matchSections } from "./section-match.js";

const runSectionEval = process.env.RUN_SECTION_EVAL === "1";

describe("Section extraction eval", () => {
  for (const evalCase of sectionEvalCases) {
    it.skipIf(!runSectionEval)(
      `matches expected sections for: ${evalCase.name}`,
      async () => {
        const absolutePath = join(process.cwd(), evalCase.baseImagePath);
        if (!existsSync(absolutePath)) {
          throw new Error(
            `Eval image not found: ${absolutePath} (baseImagePath: ${evalCase.baseImagePath})`,
          );
        }

        const result = await extractVisualSections(absolutePath);
        if (!result.sections || result.sections.length === 0) {
          throw new Error(
            `Section extraction returned no sections for ${evalCase.name}`,
          );
        }

        const extracted = result.sections.map((s) => ({
          name: s.name,
          sectionId: s.sectionId,
        }));
        const match = matchSections(evalCase.expectedSections, extracted, {
          minScore: 0.6,
        });

        if (!match.pass) {
          console.log(
            `[${evalCase.name}] Expected ${evalCase.expectedSections.length}, ` +
              `matched ${match.matched.length}/${evalCase.expectedSections.length}`,
          );
          if (match.missing.length > 0) {
            console.log(`  Missing expected: ${match.missing.join(", ")}`);
          }
          if (match.extra.length > 0) {
            console.log(
              `  Extra extracted: ${match.extra.map((e) => e.name).join(", ")}`,
            );
          }
        }

        expect(
          match.pass,
          `Section match failed: ${match.matched.length}/${evalCase.expectedSections.length} matched. Missing: ${match.missing.join(", ")}`,
        ).toBe(true);
      },
      60_000,
    );
  }
});

/**
 * Section extraction eval tests.
 *
 * Runs extractVisualSections on baseline images and compares extracted
 * sections to expected section names. Requires OPENAI_API_KEY; skipped
 * when not set so CI without the key still passes.
 * OPENAI_API_KEY can be set in the environment or in a .env file at project root.
 */
import "dotenv/config";

import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { extractVisualSections } from "../../src/image/index.js";
import { sectionEvalCases } from "./section-eval-cases.js";
import { matchSections } from "./section-match.js";

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

describe("Section extraction eval", () => {
  for (const evalCase of sectionEvalCases) {
    it.skipIf(!hasApiKey)(
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

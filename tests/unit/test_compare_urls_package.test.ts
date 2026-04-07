import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath } from "url";

vi.mock("@browserbasehq/stagehand", () => ({
  Stagehand: class MockStagehand {
    init = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

const comparisonCoreModulePath = fileURLToPath(
  new URL("../../dist/comparison/core.js", import.meta.url),
);
const comparisonCoreSourceModuleUrl = new URL(
  "../../src/comparison/core.ts",
  import.meta.url,
).href;

describe("compareUrls package API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("forwards sectionExplanationMode to the comparison core", async () => {
    const performComparison = vi.fn();
    vi.doMock(comparisonCoreModulePath, () => ({
      performComparison,
    }));
    vi.doMock(comparisonCoreSourceModuleUrl, () => ({
      performComparison,
    }));

    performComparison.mockResolvedValue({
      visual_analysis: { status: "pass" },
      sections_analysis: "sections",
      base_screenshot: "/tmp/base.png",
      preview_screenshot: "/tmp/preview.png",
      diff_image: "/tmp/diff.png",
      section_screenshots: {},
    } as any);

    const { compareUrls } = await import(
      "../../packages/bruniai/src/compare-urls.ts"
    );

    await compareUrls({
      baseUrl: "https://example.com/base",
      previewUrl: "https://example.com/preview",
      sectionExplanationMode: "detailed",
    });

    expect(performComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionExplanationMode: "detailed",
      }),
    );
  });
});

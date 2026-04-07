import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath, pathToFileURL } from "url";
import { cpSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const imageCoreModulePath = fileURLToPath(
  new URL("../../dist/comparison/image-image-core.js", import.meta.url),
);

describe("compareImages package API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns the same top-level shape as compareUrls", async () => {
    vi.doMock(imageCoreModulePath, () => ({
      performImageToImageComparison: vi.fn(),
    }));

    const { performImageToImageComparison } = await import(imageCoreModulePath);
    vi.mocked(performImageToImageComparison).mockResolvedValue({
      visual_analysis: { status: "pass" },
      sections_analysis: "sections",
      base_screenshot: "/tmp/base.png",
      preview_screenshot: "/tmp/preview.png",
      diff_image: "/tmp/diff.png",
      section_screenshots: {
        hero: { base: "/tmp/hero-base.png", preview: "/tmp/hero-preview.png" },
      },
      section_results: [],
      mode: "image-to-image",
    } as any);

    const { compareImages } = await import(
      "../../packages/bruniai/src/compare-images.ts"
    );

    const result = await compareImages({
      baseImage: "data:image/png;base64,abc",
      previewImage: "https://example.com/preview-image",
    });

    expect(Object.keys(result)).toEqual([
      "status",
      "visual_analysis",
      "sections_analysis",
      "images",
    ]);
    expect(result.images).toEqual({
      base_screenshot: "/tmp/base.png",
      preview_screenshot: "/tmp/preview.png",
      diff_image: "/tmp/diff.png",
      section_screenshots: {
        hero: { base: "/tmp/hero-base.png", preview: "/tmp/hero-preview.png" },
      },
    });
  });

  it("rejects unsupported local file path inputs", async () => {
    vi.doMock(imageCoreModulePath, () => ({
      performImageToImageComparison: vi.fn(),
    }));

    const { compareImages } = await import(
      "../../packages/bruniai/src/compare-images.ts"
    );

    await expect(
      compareImages({
        baseImage: "/tmp/base.png",
        previewImage: "https://example.com/preview.png",
      }),
    ).rejects.toThrow(
      "baseImage must be an HTTP(S) image URL or data:image/... string",
    );
  });

  it("loads the packaged runtime from a standalone install layout", async () => {
    const isolatedPackageRoot = mkdtempSync(join(tmpdir(), "bruniai-package-"));
    const isolatedDistDir = join(isolatedPackageRoot, "dist");
    const isolatedCompareImagesPath = join(isolatedDistDir, "compare-images.js");
    const isolatedRuntimeModulePath = join(
      isolatedDistDir,
      "runtime",
      "comparison",
      "image-image-core.js",
    );

    cpSync(
      fileURLToPath(new URL("../../packages/bruniai/dist", import.meta.url)),
      isolatedDistDir,
      { recursive: true },
    );

    vi.doMock(isolatedRuntimeModulePath, () => ({
      performImageToImageComparison: vi.fn().mockResolvedValue({
        visual_analysis: { status: "pass" },
        sections_analysis: "standalone",
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
        section_screenshots: {},
        section_results: [],
        mode: "image-to-image",
      }),
    }));

    try {
      const { compareImages } = await import(
        pathToFileURL(isolatedCompareImagesPath).href
      );

      const result = await compareImages({
        baseImage: "https://example.com/base.png",
        previewImage: "https://example.com/preview.png",
      });

      expect(result.status).toBe("pass");
      expect(result.sections_analysis).toBe("standalone");
    } finally {
      rmSync(isolatedPackageRoot, { recursive: true, force: true });
    }
  });
});

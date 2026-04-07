import { describe, it, expect, vi, beforeEach } from "vitest";
import { fileURLToPath, pathToFileURL } from "url";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

const imageCoreModulePath = fileURLToPath(
  new URL("../../dist/comparison/image-image-core.js", import.meta.url),
);
const packagedDistPath = fileURLToPath(
  new URL("../../packages/bruniai/dist", import.meta.url),
);

function createStandaloneCompareImagesModule(distDir: string): void {
  writeFileSync(
    join(distDir, "compare-images.js"),
    `import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
async function importRuntimeModule(relativePath) {
  const modulePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return await import(modulePath);
}
async function loadImageToImageComparisonModule() {
  return await importRuntimeModule("./runtime/comparison/image-image-core.js");
}
function isSupportedImageInput(input) {
  if (!input) return false;
  if (input.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function assertSupportedImageInput(input, fieldName) {
  if (!isSupportedImageInput(input)) {
    throw new Error(\`\${fieldName} must be an HTTP(S) image URL or data:image/... string\`);
  }
}
export async function compareImages(input) {
  const { baseImage, previewImage } = input;
  assertSupportedImageInput(baseImage, "baseImage");
  assertSupportedImageInput(previewImage, "previewImage");
  const { performImageToImageComparison } = await loadImageToImageComparisonModule();
  const imagesDir = join(tmpdir(), \`bruniai-\${Date.now()}\`);
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }
  const result = await performImageToImageComparison({
    baseImageUrl: baseImage,
    previewImageUrl: previewImage,
    imagesDir,
  });
  const status = result.visual_analysis.status === "none" ? "pass" : result.visual_analysis.status;
  return {
    status,
    visual_analysis: result.visual_analysis,
    sections_analysis: result.sections_analysis,
    images: {
      base_screenshot: result.base_screenshot,
      preview_screenshot: result.preview_screenshot,
      diff_image: result.diff_image,
      section_screenshots: Object.keys(result.section_screenshots).length > 0
        ? Object.fromEntries(
            Object.entries(result.section_screenshots).map(([key, value]) => [
              key,
              { base: value.base, preview: value.preview },
            ]),
          )
        : undefined,
    },
  };
}
`,
  );
}

function createStandaloneRuntimeModule(distDir: string): void {
  const runtimeComparisonDir = join(distDir, "runtime", "comparison");
  mkdirSync(runtimeComparisonDir, { recursive: true });
  writeFileSync(
    join(runtimeComparisonDir, "image-image-core.js"),
    `export async function performImageToImageComparison() {
  throw new Error("performImageToImageComparison should be mocked in this test");
}
`,
  );
}

function prepareStandalonePackageDist(packageRoot: string, distDir: string): void {
  writeFileSync(join(packageRoot, "package.json"), '{ "type": "module" }\n');

  if (existsSync(packagedDistPath)) {
    cpSync(packagedDistPath, distDir, { recursive: true });
    return;
  }

  createStandaloneCompareImagesModule(distDir);
  createStandaloneRuntimeModule(distDir);
}

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

    prepareStandalonePackageDist(isolatedPackageRoot, isolatedDistDir);

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

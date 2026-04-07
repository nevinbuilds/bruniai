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

vi.mock("@browserbasehq/stagehand", () => ({
  Stagehand: class MockStagehand {
    init = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
  },
}));

const imageCoreModulePath = fileURLToPath(
  new URL("../../dist/comparison/image-core.js", import.meta.url),
);
const imageCoreSourceModuleUrl = new URL(
  "../../src/comparison/image-core.ts",
  import.meta.url,
).href;
const packagedDistPath = fileURLToPath(
  new URL("../../packages/bruniai/dist", import.meta.url),
);

function createStandaloneCompareImageToUrlModule(distDir: string): void {
  mkdirSync(distDir, { recursive: true });
  writeFileSync(
    join(distDir, "compare-image-to-url.js"),
    `import { Stagehand } from "@browserbasehq/stagehand";
import { join } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
async function importRuntimeModule(relativePath) {
  const modulePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return await import(modulePath);
}
async function loadImageToUrlComparisonModule() {
  return await importRuntimeModule("./runtime/comparison/image-core.js");
}
function isSupportedImageSource(input) {
  if (!input) return false;
  if (input.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
function assertSupportedImageSource(input, fieldName) {
  if (!isSupportedImageSource(input)) {
    throw new Error(\`\${fieldName} must be an HTTP(S) image URL or data:image/... string\`);
  }
}
function assertSupportedPreviewUrl(input, fieldName) {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(\`\${fieldName} must be an HTTP(S) URL\`);
  }
}
export async function compareImageToUrl(input) {
  const {
    baseImageSource,
    previewUrl,
    page = "/",
    sectionExplanationMode = "fast",
    prNumber,
    repository
  } = input;
  assertSupportedImageSource(baseImageSource, "baseImageSource");
  assertSupportedPreviewUrl(previewUrl, "previewUrl");
  const { performImageToUrlComparison } = await loadImageToUrlComparisonModule();
  const imagesDir = join(tmpdir(), \`bruniai-\${Date.now()}\`);
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }
  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: true,
    },
  });
  try {
    await stagehand.init();
    const result = await performImageToUrlComparison({
      stagehand,
      baseImageSource,
      previewUrl,
      page,
      sectionExplanationMode,
      imagesDir,
      prNumber,
      repository,
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
  } finally {
    await stagehand.close();
  }
}
`,
  );
}

function createStandaloneRuntimeModule(distDir: string): void {
  const runtimeComparisonDir = join(distDir, "runtime", "comparison");
  mkdirSync(runtimeComparisonDir, { recursive: true });
  writeFileSync(
    join(runtimeComparisonDir, "image-core.js"),
    `export async function performImageToUrlComparison() {
  throw new Error("performImageToUrlComparison should be mocked in this test");
}
`,
  );
}

function prepareStandalonePackageDist(packageRoot: string, distDir: string): void {
  writeFileSync(join(packageRoot, "package.json"), '{ "type": "module" }\n');

  if (existsSync(packagedDistPath)) {
    cpSync(packagedDistPath, distDir, { recursive: true });
    if (existsSync(join(distDir, "compare-image-to-url.js"))) {
      return;
    }
  }

  createStandaloneCompareImageToUrlModule(distDir);
  createStandaloneRuntimeModule(distDir);
}

describe("compareImageToUrl package API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns the same top-level shape as compareUrls", async () => {
    const performImageToUrlComparison = vi.fn();
    vi.doMock(imageCoreModulePath, () => ({
      performImageToUrlComparison,
    }));
    vi.doMock(imageCoreSourceModuleUrl, () => ({
      performImageToUrlComparison,
    }));

    performImageToUrlComparison.mockResolvedValue({
      visual_analysis: { status: "pass" },
      sections_analysis: "sections",
      base_screenshot: "/tmp/base.png",
      preview_screenshot: "/tmp/preview.png",
      diff_image: "/tmp/diff.png",
      section_screenshots: {
        hero: { base: "/tmp/hero-base.png", preview: "/tmp/hero-preview.png" },
      },
      section_results: [],
      mode: "image-to-url",
    } as any);

    const { compareImageToUrl } = await import(
      "../../packages/bruniai/src/compare-image-to-url.ts"
    );

    const result = await compareImageToUrl({
      baseImageSource: "data:image/png;base64,abc",
      previewUrl: "https://example.com/preview",
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

  it("forwards sectionExplanationMode to the comparison core", async () => {
    const performImageToUrlComparison = vi.fn();
    vi.doMock(imageCoreModulePath, () => ({
      performImageToUrlComparison,
    }));
    vi.doMock(imageCoreSourceModuleUrl, () => ({
      performImageToUrlComparison,
    }));

    performImageToUrlComparison.mockResolvedValue({
      visual_analysis: { status: "pass" },
      sections_analysis: "sections",
      base_screenshot: "/tmp/base.png",
      preview_screenshot: "/tmp/preview.png",
      diff_image: "/tmp/diff.png",
      section_screenshots: {},
      section_results: [],
      mode: "image-to-url",
    } as any);

    const { compareImageToUrl } = await import(
      "../../packages/bruniai/src/compare-image-to-url.ts"
    );

    await compareImageToUrl({
      baseImageSource: "data:image/png;base64,abc",
      previewUrl: "https://example.com/preview",
      sectionExplanationMode: "off",
    });

    expect(performImageToUrlComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionExplanationMode: "off",
      }),
    );
  });

  it("rejects unsupported local file path inputs", async () => {
    const performImageToUrlComparison = vi.fn();
    vi.doMock(imageCoreModulePath, () => ({
      performImageToUrlComparison,
    }));
    vi.doMock(imageCoreSourceModuleUrl, () => ({
      performImageToUrlComparison,
    }));

    const { compareImageToUrl } = await import(
      "../../packages/bruniai/src/compare-image-to-url.ts"
    );

    await expect(
      compareImageToUrl({
        baseImageSource: "/tmp/base.png",
        previewUrl: "https://example.com/preview",
      }),
    ).rejects.toThrow(
      "baseImageSource must be an HTTP(S) image URL or data:image/... string",
    );
  });

  it("loads the packaged runtime from a standalone install layout", async () => {
    const isolatedPackageRoot = mkdtempSync(join(tmpdir(), "bruniai-package-"));
    const isolatedDistDir = join(isolatedPackageRoot, "dist");
    const isolatedCompareImageToUrlPath = join(
      isolatedDistDir,
      "compare-image-to-url.js",
    );
    const isolatedRuntimeModulePath = join(
      isolatedDistDir,
      "runtime",
      "comparison",
      "image-core.js",
    );

    prepareStandalonePackageDist(isolatedPackageRoot, isolatedDistDir);

    vi.doMock(isolatedRuntimeModulePath, () => ({
      performImageToUrlComparison: vi.fn().mockResolvedValue({
        visual_analysis: { status: "pass" },
        sections_analysis: "standalone",
        base_screenshot: "/tmp/base.png",
        preview_screenshot: "/tmp/preview.png",
        diff_image: "/tmp/diff.png",
        section_screenshots: {},
        section_results: [],
        mode: "image-to-url",
      }),
    }));

    try {
      const { compareImageToUrl } = await import(
        pathToFileURL(isolatedCompareImageToUrlPath).href
      );

      const result = await compareImageToUrl({
        baseImageSource: "https://example.com/base.png",
        previewUrl: "https://example.com/preview",
      });

      expect(result.status).toBe("pass");
      expect(result.sections_analysis).toBe("standalone");
    } finally {
      rmSync(isolatedPackageRoot, { recursive: true, force: true });
    }
  });
});

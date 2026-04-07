import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { existsSync } from "fs";

import { performImageToImageComparison } from "../../src/comparison/image-image-core.js";

type Pattern = "checker" | "vertical" | "horizontal" | "diagonal";

interface StripeSpec {
  height: number;
  color: [number, number, number];
  pattern: Pattern;
}

async function buildStripedPage(
  outputPath: string,
  options: {
    width?: number;
    topMargin?: number;
    bottomMargin?: number;
    gap?: number;
    sections: StripeSpec[];
  },
): Promise<void> {
  const width = options.width ?? 240;
  const topMargin = options.topMargin ?? 0;
  const bottomMargin = options.bottomMargin ?? 0;
  const gap = options.gap ?? 0;
  const sectionsHeight = options.sections.reduce(
    (sum, section) => sum + section.height,
    0,
  );
  const totalGap = Math.max(0, options.sections.length - 1) * gap;
  const height = topMargin + sectionsHeight + totalGap + bottomMargin;
  const channels = 3;
  const data = new Uint8Array(width * height * channels);

  data.fill(255);

  const setPixel = (x: number, y: number, rgb: [number, number, number]) => {
    const index = (y * width + x) * channels;
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
  };

  const patternValue = (pattern: Pattern, x: number, y: number): number => {
    switch (pattern) {
      case "checker":
        return (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 22 : -22;
      case "vertical":
        return Math.floor(x / 6) % 2 === 0 ? 28 : -18;
      case "horizontal":
        return Math.floor(y / 6) % 2 === 0 ? 26 : -20;
      case "diagonal":
        return Math.floor((x + y) / 9) % 2 === 0 ? 24 : -24;
      default:
        return 0;
    }
  };

  let cursorY = topMargin;
  for (const section of options.sections) {
    for (let y = cursorY; y < cursorY + section.height; y++) {
      for (let x = 0; x < width; x++) {
        const delta = patternValue(section.pattern, x, y);
        setPixel(x, y, [
          Math.max(0, Math.min(255, section.color[0] + delta)),
          Math.max(0, Math.min(255, section.color[1] + delta)),
          Math.max(0, Math.min(255, section.color[2] + delta)),
        ]);
      }
    }
    cursorY += section.height + gap;
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);
}

async function fileToDataUrl(imagePath: string): Promise<string> {
  const buffer = await readFile(imagePath);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

describe("performImageToImageComparison", () => {
  let tempDir: string;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bruni-image-image-"));
    delete process.env.OPENAI_API_KEY;
    originalFetch = globalThis.fetch;
  });

  afterEach(async () => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
    }
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("produces a passing comparison for identical data URL images", async () => {
    const basePath = join(tempDir, "base-identical.png");
    const previewPath = join(tempDir, "preview-identical.png");

    await buildStripedPage(basePath, {
      topMargin: 20,
      bottomMargin: 20,
      gap: 24,
      sections: [
        { height: 180, color: [220, 70, 70], pattern: "checker" },
        { height: 190, color: [70, 190, 90], pattern: "vertical" },
      ],
    });
    await buildStripedPage(previewPath, {
      topMargin: 20,
      bottomMargin: 20,
      gap: 24,
      sections: [
        { height: 180, color: [220, 70, 70], pattern: "checker" },
        { height: 190, color: [70, 190, 90], pattern: "vertical" },
      ],
    });

    const result = await performImageToImageComparison({
      baseImageUrl: await fileToDataUrl(basePath),
      previewImageUrl: await fileToDataUrl(previewPath),
      imagesDir: tempDir,
    });

    expect(result.mode).toBe("image-to-image");
    expect(result.visual_analysis.status).toBe("pass");
    expect(result.section_results.length).toBeGreaterThan(0);
    expect(existsSync(result.base_screenshot)).toBe(true);
    expect(existsSync(result.preview_screenshot)).toBe(true);
    expect(existsSync(result.diff_image)).toBe(true);
  });

  it("normalizes a resized equivalent preview image fetched over HTTP", async () => {
    const basePath = join(tempDir, "base-remote.png");
    const previewPath = join(tempDir, "preview-remote.png");

    await buildStripedPage(basePath, {
      width: 240,
      topMargin: 30,
      bottomMargin: 24,
      gap: 18,
      sections: [
        { height: 160, color: [210, 75, 80], pattern: "checker" },
        { height: 170, color: [60, 170, 95], pattern: "vertical" },
        { height: 180, color: [80, 120, 220], pattern: "diagonal" },
      ],
    });
    await buildStripedPage(previewPath, {
      width: 360,
      topMargin: 45,
      bottomMargin: 36,
      gap: 27,
      sections: [
        { height: 240, color: [210, 75, 80], pattern: "checker" },
        { height: 255, color: [60, 170, 95], pattern: "vertical" },
        { height: 270, color: [80, 120, 220], pattern: "diagonal" },
      ],
    });

    const baseBuffer = await readFile(basePath);
    const previewBuffer = await readFile(previewPath);
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("base")) {
        return new Response(baseBuffer, { status: 200 });
      }
      return new Response(previewBuffer, { status: 200 });
    }) as typeof globalThis.fetch;

    const result = await performImageToImageComparison({
      baseImageUrl: "https://example.com/base",
      previewImageUrl: "https://example.com/preview",
      imagesDir: tempDir,
    });

    const baseMetadata = await sharp(result.base_screenshot).metadata();
    const previewMetadata = await sharp(result.preview_screenshot).metadata();

    expect(baseMetadata.width).toBe(previewMetadata.width);
    expect(["pass", "warning"]).toContain(result.visual_analysis.status);
    expect(
      result.section_results.every((section) => section.status !== "missing"),
    ).toBe(true);
  });

  it("flags materially different images for review", async () => {
    const basePath = join(tempDir, "base-different.png");
    const previewPath = join(tempDir, "preview-different.png");

    await buildStripedPage(basePath, {
      gap: 20,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
        { height: 190, color: [70, 110, 220], pattern: "diagonal" },
      ],
    });
    await buildStripedPage(previewPath, {
      gap: 20,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [245, 205, 80], pattern: "horizontal" },
        { height: 190, color: [40, 40, 40], pattern: "horizontal" },
      ],
    });

    const result = await performImageToImageComparison({
      baseImageUrl: await fileToDataUrl(basePath),
      previewImageUrl: await fileToDataUrl(previewPath),
      imagesDir: tempDir,
    });

    expect(["warning", "fail"]).toContain(result.visual_analysis.status);
    expect(
      result.section_results.some((section) => section.status !== "matched"),
    ).toBe(true);
  });

  it("surfaces remote image download failures", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("missing", { status: 404, statusText: "Not Found" }),
    ) as typeof globalThis.fetch;

    await expect(
      performImageToImageComparison({
        baseImageUrl: "https://example.com/base.png",
        previewImageUrl: "https://example.com/preview.png",
        imagesDir: tempDir,
      }),
    ).rejects.toThrow("Failed to download image: 404 Not Found");
  });

  it("rejects HTTP URLs that return HTML instead of an image", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("<html></html>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    ) as typeof globalThis.fetch;

    await expect(
      performImageToImageComparison({
        baseImageUrl: "https://example.com/base.png",
        previewImageUrl: "https://example.com/preview",
        imagesDir: tempDir,
      }),
    ).rejects.toThrow(
      "URL did not return an image: received text/html; charset=utf-8",
    );
  });
});

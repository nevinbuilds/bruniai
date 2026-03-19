import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

vi.mock("../../src/utils/window.js", () => ({
  ensureViewportSize: vi.fn().mockResolvedValue(undefined),
  ensurePageFullyRendered: vi.fn().mockResolvedValue(undefined),
}));

import {
  trimImageToContent,
  extractVisualSections,
  matchVisualSections,
  buildImageModeVisualAnalysis,
} from "../../src/image/index.js";
import { performImageComparison } from "../../src/comparison/image-core.js";

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
        return (Math.floor((x + y) / 9) % 2 === 0) ? 24 : -24;
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

async function averageTopSectionColor(imagePath: string): Promise<[number, number, number]> {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 1;
  const height = metadata.height || 1;
  const sampleHeight = Math.max(1, Math.min(height, 40));
  const { data, info } = await sharp(imagePath)
    .extract({ left: 0, top: 0, width, height: sampleHeight })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const pixelCount = info.width * info.height;

  for (let index = 0; index < data.length; index += info.channels) {
    rSum += data[index] || 0;
    gSum += data[index + 1] || 0;
    bSum += data[index + 2] || 0;
  }

  return [
    Math.round(rSum / Math.max(1, pixelCount)),
    Math.round(gSum / Math.max(1, pixelCount)),
    Math.round(bSum / Math.max(1, pixelCount)),
  ];
}

describe("deterministic image mode", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bruni-image-mode-"));
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("trims uniform design margins", async () => {
    const input = join(tempDir, "design-with-margins.png");
    const output = join(tempDir, "design-trimmed.png");

    await buildStripedPage(input, {
      topMargin: 40,
      bottomMargin: 30,
      sections: [
        { height: 170, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
      ],
      gap: 24,
    });

    const result = await trimImageToContent(input, output);

    expect(result.trim.top).toBeGreaterThanOrEqual(35);
    expect(result.trim.bottom).toBeGreaterThanOrEqual(25);
    expect(result.trimmedDimensions.height).toBeLessThan(
      result.originalDimensions.height,
    );
  });

  it("detects stable full-width sections and enforces minimum heights", async () => {
    const imagePath = join(tempDir, "segmentation.png");

    await buildStripedPage(imagePath, {
      sections: [
        { height: 180, color: [220, 70, 70], pattern: "checker" },
        { height: 60, color: [245, 205, 80], pattern: "horizontal" },
        { height: 190, color: [70, 190, 90], pattern: "vertical" },
      ],
      gap: 30,
    });

    const result = await extractVisualSections(imagePath);

    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    expect(
      result.sections.every((section) => section.boundingBox.height >= 120),
    ).toBe(true);
  });

  it("merges over-segmented layouts into fewer large sections", async () => {
    const imagePath = join(tempDir, "many-bands.png");

    await buildStripedPage(imagePath, {
      sections: Array.from({ length: 12 }, (_, index) => ({
        height: 90 + (index % 3) * 10,
        color:
          index % 3 === 0
            ? ([220, 70, 70] as [number, number, number])
            : index % 3 === 1
              ? ([70, 190, 90] as [number, number, number])
              : ([70, 110, 220] as [number, number, number]),
        pattern:
          index % 3 === 0
            ? "checker"
            : index % 3 === 1
              ? "vertical"
              : "diagonal",
      })),
      gap: 18,
    });

    const result = await extractVisualSections(imagePath);

    expect(result.sections.length).toBeLessThanOrEqual(6);
  });

  it("matches shifted sections by content instead of reusing design coordinates", async () => {
    const designPath = join(tempDir, "design.png");
    const previewPath = join(tempDir, "preview.png");

    await buildStripedPage(designPath, {
      sections: [
        { height: 160, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
        { height: 180, color: [70, 110, 220], pattern: "diagonal" },
      ],
      gap: 26,
    });

    await buildStripedPage(previewPath, {
      topMargin: 210,
      sections: [
        { height: 160, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
        { height: 180, color: [70, 110, 220], pattern: "diagonal" },
      ],
      gap: 26,
    });

    const sections = await extractVisualSections(designPath);
    const matches = await matchVisualSections(
      designPath,
      previewPath,
      sections.sections,
    );

    expect(matches[0]?.matchedRange?.startY).toBeGreaterThan(150);
    expect(matches.every((match) => match.status !== "missing")).toBe(true);
  });

  it("falls back to full-height scanning when the local search band misses", async () => {
    const designPath = join(tempDir, "design-fallback.png");
    const previewPath = join(tempDir, "preview-fallback.png");

    await buildStripedPage(designPath, {
      sections: [
        { height: 170, color: [220, 70, 70], pattern: "checker" },
        { height: 180, color: [70, 190, 90], pattern: "vertical" },
      ],
      gap: 24,
    });

    await buildStripedPage(previewPath, {
      topMargin: 520,
      sections: [
        { height: 170, color: [220, 70, 70], pattern: "checker" },
        { height: 180, color: [70, 190, 90], pattern: "vertical" },
      ],
      gap: 24,
    });

    const sections = await extractVisualSections(designPath);
    const matches = await matchVisualSections(
      designPath,
      previewPath,
      sections.sections,
    );

    expect(matches[0]?.matchedRange?.startY).toBeGreaterThan(400);
  });

  it("prefers the closer candidate when repeated regions score nearly the same", async () => {
    const designPath = join(tempDir, "design-repeat.png");
    const previewPath = join(tempDir, "preview-repeat.png");

    await buildStripedPage(designPath, {
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 160, color: [60, 110, 220], pattern: "diagonal" },
        { height: 150, color: [70, 190, 90], pattern: "vertical" },
      ],
      gap: 26,
    });

    await buildStripedPage(previewPath, {
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 160, color: [60, 110, 220], pattern: "diagonal" },
        { height: 150, color: [70, 190, 90], pattern: "vertical" },
        { height: 160, color: [60, 110, 220], pattern: "diagonal" },
      ],
      gap: 26,
    });

    const targetSection = [
      {
        name: "Target Section",
        sectionId: "target-section",
        description: "Repeated target section.",
        boundingBox: {
          x: 0,
          y: 176,
          width: 240,
          height: 160,
        },
        position: "middle" as const,
        visualPatterns: "mid-page layout chunk",
      },
    ];
    const matches = await matchVisualSections(designPath, previewPath, targetSection);

    expect(matches[0]?.matchedRange?.startY).toBe(176);
  });

  it("builds deterministic visual status from section scores", () => {
    const analysis = buildImageModeVisualAnalysis({
      baseUrl: "data:image/png;base64,abc",
      previewUrl: "https://preview.example.com",
      prNumber: "123",
      repository: "org/repo",
      sectionMatches: [
        {
          sectionId: "section-01",
          name: "Section 1",
          description: "First section.",
          designRange: { startY: 0, endY: 150 },
          matchedRange: null,
          matchScore: 0.42,
          similarityScore: 0,
          status: "missing",
        },
        {
          sectionId: "section-02",
          name: "Section 2",
          description: "Second section.",
          designRange: { startY: 150, endY: 320 },
          matchedRange: { startY: 150, endY: 320 },
          matchScore: 0.8,
          similarityScore: 0.72,
          status: "problematic",
        },
      ],
    });

    expect(analysis.status).toBe("fail");
    expect(analysis.critical_issues_enum).toBe("missing_sections");
    expect(analysis.recommendation_enum).toBe("reject");
  });

  it("runs image mode end-to-end without OPENAI_API_KEY and crops matched webpage regions", async () => {
    const designPath = join(tempDir, "design-end-to-end.png");
    const previewPath = join(tempDir, "preview-end-to-end.png");

    await buildStripedPage(designPath, {
      topMargin: 50,
      bottomMargin: 20,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 160, color: [70, 190, 90], pattern: "vertical" },
        { height: 170, color: [70, 110, 220], pattern: "diagonal" },
      ],
      gap: 28,
    });

    await buildStripedPage(previewPath, {
      topMargin: 220,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 160, color: [70, 190, 90], pattern: "vertical" },
        { height: 170, color: [70, 110, 220], pattern: "diagonal" },
      ],
      gap: 28,
    });

    const designBuffer = await sharp(designPath).png().toBuffer();
    const previewBuffer = await sharp(previewPath).png().toBuffer();
    const stagehand = {
      context: {
        pages: () => [
          {
            screenshot: vi.fn().mockResolvedValue(previewBuffer),
          },
        ],
      },
    } as never;

    const result = await performImageComparison({
      stagehand,
      baseImageUrl: `data:image/png;base64,${designBuffer.toString("base64")}`,
      previewUrl: "https://preview.example.com",
      page: "/",
      imagesDir: tempDir,
      prNumber: "123",
      repository: "org/repo",
    });

    expect(result.visual_analysis.status).toMatch(/pass|warning|fail/);
    expect(result.sections_analysis).toContain("Visual Section Matching");
    expect(Object.keys(result.section_screenshots).length).toBeGreaterThan(0);

    const firstPreviewSection =
      result.section_screenshots[Object.keys(result.section_screenshots)[0]]?.preview;
    expect(firstPreviewSection).toBeTruthy();

    const [avgR, avgG, avgB] = await averageTopSectionColor(firstPreviewSection!);
    expect(avgR).toBeGreaterThan(avgG);
    expect(avgR).toBeGreaterThan(avgB);
  });

  it("still writes preview crops for low-confidence missing sections", async () => {
    const designPath = join(tempDir, "design-missing-preview.png");
    const previewPath = join(tempDir, "preview-missing-preview.png");

    await buildStripedPage(designPath, {
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 160, color: [70, 190, 90], pattern: "vertical" },
      ],
      gap: 28,
    });

    await buildStripedPage(previewPath, {
      sections: [
        { height: 150, color: [40, 40, 40], pattern: "horizontal" },
        { height: 160, color: [30, 30, 30], pattern: "horizontal" },
      ],
      gap: 28,
    });

    const designBuffer = await sharp(designPath).png().toBuffer();
    const previewBuffer = await sharp(previewPath).png().toBuffer();
    const stagehand = {
      context: {
        pages: () => [
          {
            screenshot: vi.fn().mockResolvedValue(previewBuffer),
          },
        ],
      },
    } as never;

    const result = await performImageComparison({
      stagehand,
      baseImageUrl: `data:image/png;base64,${designBuffer.toString("base64")}`,
      previewUrl: "https://preview.example.com",
      page: "/",
      imagesDir: tempDir,
      prNumber: "123",
      repository: "org/repo",
    });

    const previews = Object.values(result.section_screenshots).map(
      (section) => section.preview,
    );
    expect(previews.every((value) => Boolean(value))).toBe(true);
  });
});

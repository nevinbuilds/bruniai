import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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

function createSectionMatches() {
  return [
    {
      sectionId: "section-01",
      name: "Section 1",
      description: "Matched section",
      designRange: { startY: 0, endY: 150 },
      matchedRange: { startY: 0, endY: 150 },
      matchScore: 0.96,
      similarityScore: 0.94,
      signals: {
        pixelDifference: 0.08,
        edgeDifference: 0.07,
        structuralSimilarity: 0.93,
        finalSimilarityScore: 0.94,
      },
      humanDescription: "Deterministic explanation 1.",
      explanationConfidence: null,
      explanationSource: "deterministic_fallback" as const,
      status: "matched" as const,
    },
    {
      sectionId: "section-02",
      name: "Section 2",
      description: "Problematic section",
      designRange: { startY: 150, endY: 320 },
      matchedRange: { startY: 150, endY: 320 },
      matchScore: 0.71,
      similarityScore: 0.62,
      signals: {
        pixelDifference: 0.31,
        edgeDifference: 0.28,
        structuralSimilarity: 0.61,
        finalSimilarityScore: 0.62,
      },
      humanDescription: "Deterministic explanation 2.",
      explanationConfidence: null,
      explanationSource: "deterministic_fallback" as const,
      status: "problematic" as const,
    },
    {
      sectionId: "section-03",
      name: "Section 3",
      description: "Missing section",
      designRange: { startY: 320, endY: 500 },
      matchedRange: null,
      matchScore: 0.22,
      similarityScore: 0,
      signals: {
        pixelDifference: 1,
        edgeDifference: 1,
        structuralSimilarity: 0,
        finalSimilarityScore: 0,
      },
      humanDescription: "Deterministic explanation 3.",
      explanationConfidence: null,
      explanationSource: "deterministic_fallback" as const,
      status: "missing" as const,
    },
  ];
}

function cloneSectionMatches(sectionMatches: ReturnType<typeof createSectionMatches>) {
  return JSON.parse(JSON.stringify(sectionMatches));
}

async function setupDeterministicMocks(sectionMatches: ReturnType<typeof createSectionMatches>) {
  const analyzeSectionDiffExplanationsAgent = vi.fn().mockResolvedValue([]);

  vi.doMock("../../src/utils/window.js", () => ({
    ensureViewportSize: vi.fn().mockResolvedValue(undefined),
    ensurePageFullyRendered: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock("../../src/vision/index.js", () => ({
    analyzeSectionDiffExplanationsAgent,
  }));

  vi.doMock("../../src/image/index.js", async () => {
    const actual = await vi.importActual<typeof import("../../src/image/index.js")>(
      "../../src/image/index.js",
    );

    return {
      ...actual,
      extractVisualSections: vi.fn().mockResolvedValue({
        sections: [],
        layoutDescription: "Mock layout",
      }),
      matchVisualSections: vi
        .fn()
        .mockResolvedValue(cloneSectionMatches(sectionMatches)),
      formatMatchedSectionsAsAnalysis: vi
        .fn()
        .mockReturnValue("### Visual Section Matching"),
    };
  });

  return { analyzeSectionDiffExplanationsAgent };
}

describe("section explanation mode selection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bruni-explanation-modes-"));
    process.env.OPENAI_API_KEY = "test-key";
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unmock("../../src/utils/window.js");
    vi.unmock("../../src/vision/index.js");
    vi.unmock("../../src/image/index.js");
  });

  afterEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await rm(tempDir, { recursive: true, force: true });
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("uses fast mode to explain only problematic image-to-url sections", async () => {
    const designPath = join(tempDir, "design-fast-url.png");
    const previewPath = join(tempDir, "preview-fast-url.png");
    await buildStripedPage(designPath, {
      gap: 0,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
        { height: 180, color: [70, 110, 220], pattern: "diagonal" },
      ],
    });
    await buildStripedPage(previewPath, {
      gap: 0,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [245, 205, 80], pattern: "horizontal" },
        { height: 180, color: [40, 40, 40], pattern: "horizontal" },
      ],
    });

    const previewBuffer = await readFile(previewPath);
    const { analyzeSectionDiffExplanationsAgent } = await setupDeterministicMocks(
      createSectionMatches(),
    );
    const { performImageToUrlComparison } = await import(
      "../../src/comparison/image-core.js"
    );

    await performImageToUrlComparison({
      stagehand: {
        context: {
          pages: () => [
            {
              screenshot: vi.fn().mockResolvedValue(previewBuffer),
            },
          ],
        },
      } as never,
      baseImageSource: await fileToDataUrl(designPath),
      previewUrl: "https://preview.example.com",
      page: "/",
      sectionExplanationMode: "fast",
      imagesDir: tempDir,
    });

    expect(analyzeSectionDiffExplanationsAgent).toHaveBeenCalledTimes(1);
    expect(
      analyzeSectionDiffExplanationsAgent.mock.calls[0]?.[0].map(
        (section: { section_id: string }) => section.section_id,
      ),
    ).toEqual(["section-02"]);
  });

  it("uses detailed mode to explain all non-missing image-to-url sections", async () => {
    const designPath = join(tempDir, "design-detailed-url.png");
    const previewPath = join(tempDir, "preview-detailed-url.png");
    await buildStripedPage(designPath, {
      gap: 0,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
        { height: 180, color: [70, 110, 220], pattern: "diagonal" },
      ],
    });
    await buildStripedPage(previewPath, {
      gap: 0,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [245, 205, 80], pattern: "horizontal" },
        { height: 180, color: [40, 40, 40], pattern: "horizontal" },
      ],
    });

    const previewBuffer = await readFile(previewPath);
    const { analyzeSectionDiffExplanationsAgent } = await setupDeterministicMocks(
      createSectionMatches(),
    );
    const { performImageToUrlComparison } = await import(
      "../../src/comparison/image-core.js"
    );

    await performImageToUrlComparison({
      stagehand: {
        context: {
          pages: () => [
            {
              screenshot: vi.fn().mockResolvedValue(previewBuffer),
            },
          ],
        },
      } as never,
      baseImageSource: await fileToDataUrl(designPath),
      previewUrl: "https://preview.example.com",
      page: "/",
      sectionExplanationMode: "detailed",
      imagesDir: tempDir,
    });

    expect(analyzeSectionDiffExplanationsAgent).toHaveBeenCalledTimes(1);
    expect(
      analyzeSectionDiffExplanationsAgent.mock.calls[0]?.[0].map(
        (section: { section_id: string }) => section.section_id,
      ),
    ).toEqual(["section-01", "section-02"]);
  });

  it("uses off mode to skip image-to-url section explanations", async () => {
    const designPath = join(tempDir, "design-off-url.png");
    const previewPath = join(tempDir, "preview-off-url.png");
    await buildStripedPage(designPath, {
      gap: 0,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [70, 190, 90], pattern: "vertical" },
        { height: 180, color: [70, 110, 220], pattern: "diagonal" },
      ],
    });
    await buildStripedPage(previewPath, {
      gap: 0,
      sections: [
        { height: 150, color: [220, 70, 70], pattern: "checker" },
        { height: 170, color: [245, 205, 80], pattern: "horizontal" },
        { height: 180, color: [40, 40, 40], pattern: "horizontal" },
      ],
    });

    const previewBuffer = await readFile(previewPath);
    const { analyzeSectionDiffExplanationsAgent } = await setupDeterministicMocks(
      createSectionMatches(),
    );
    const { performImageToUrlComparison } = await import(
      "../../src/comparison/image-core.js"
    );

    await performImageToUrlComparison({
      stagehand: {
        context: {
          pages: () => [
            {
              screenshot: vi.fn().mockResolvedValue(previewBuffer),
            },
          ],
        },
      } as never,
      baseImageSource: await fileToDataUrl(designPath),
      previewUrl: "https://preview.example.com",
      page: "/",
      sectionExplanationMode: "off",
      imagesDir: tempDir,
    });

    expect(analyzeSectionDiffExplanationsAgent).not.toHaveBeenCalled();
  });

  it("applies the shared explanation mode rules used by the image-to-image core", async () => {
    const { shouldExplainSection } = await import(
      "../../src/comparison/section-explanation-mode.js"
    );

    expect(shouldExplainSection("matched", "fast")).toBe(false);
    expect(shouldExplainSection("problematic", "fast")).toBe(true);
    expect(shouldExplainSection("matched", "detailed")).toBe(true);
    expect(shouldExplainSection("missing", "detailed")).toBe(false);
    expect(shouldExplainSection("matched", "off")).toBe(false);
    expect(shouldExplainSection("problematic", "off")).toBe(false);
  });
});

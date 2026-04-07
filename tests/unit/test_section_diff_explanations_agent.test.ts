import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const { mockResponsesCreate } = vi.hoisted(() => ({
  mockResponsesCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = {
      create: mockResponsesCreate,
    };
  },
}));

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF8cAAAAASUVORK5CYII=";

function createCard(tempDir: string, sectionId: string) {
  const basePath = join(tempDir, `${sectionId}-base.png`);
  const previewPath = join(tempDir, `${sectionId}-preview.png`);
  const diffPath = join(tempDir, `${sectionId}-diff.png`);

  return {
    section_id: sectionId,
    name: `Section ${sectionId}`,
    base_screenshot: basePath,
    preview_screenshot: previewPath,
    diff_image: diffPath,
    match_score: 0.8,
    final_similarity_score: 0.7,
    pixel_difference: 0.2,
    edge_difference: 0.25,
    structural_similarity: 0.75,
  };
}

async function writeCardImages(card: ReturnType<typeof createCard>) {
  const imageBuffer = Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64");
  await Promise.all([
    writeFile(card.base_screenshot, imageBuffer),
    writeFile(card.preview_screenshot, imageBuffer),
    writeFile(card.diff_image, imageBuffer),
  ]);
}

describe("analyzeSectionDiffExplanationsAgent", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bruni-agent4-"));
    mockResponsesCreate.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("processes section explanations with bounded parallelism and low-detail images", async () => {
    const cards = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => {
        const card = createCard(tempDir, `section-${index + 1}`);
        await writeCardImages(card);
        return card;
      }),
    );

    let inFlight = 0;
    let maxInFlight = 0;
    let issued = 0;
    mockResponsesCreate.mockImplementation(() => {
      const currentCard = cards[issued];
      issued += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return new Promise((resolve) => {
        setTimeout(() => {
          if (currentCard) {
            inFlight -= 1;
          }
          resolve({
            output_text: JSON.stringify({
              sections: [
                {
                  section_id: currentCard?.section_id,
                  explanation: `The heading and spacing differ in ${currentCard?.section_id}.`,
                  explanation_confidence: 0.82,
                },
              ],
            }),
          });
        }, 10);
      });
    });

    const { analyzeSectionDiffExplanationsAgent } = await import(
      "../../src/vision/agents.ts"
    );

    const promise = analyzeSectionDiffExplanationsAgent(
      cards,
      "https://example.com/base",
      "https://example.com/preview",
    );
    const result = await promise;

    expect(result).toHaveLength(6);
    expect(maxInFlight).toBe(4);
    expect(issued).toBe(6);

    const firstCall = mockResponsesCreate.mock.calls[0]?.[0] as {
      input: Array<{
        content: Array<{ type: string; detail?: string }>;
      }>;
    };
    const imageInputs = firstCall.input[1]?.content.filter(
      (item) => item.type === "input_image",
    );
    expect(imageInputs).toHaveLength(3);
    expect(imageInputs.every((item) => item.detail === "low")).toBe(true);
  });

  it("keeps successful explanations while tolerating failures and generic output", async () => {
    const cards = await Promise.all(
      ["section-a", "section-b", "section-c"].map(async (sectionId) => {
        const card = createCard(tempDir, sectionId);
        await writeCardImages(card);
        return card;
      }),
    );

    mockResponsesCreate
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          sections: [
            {
              section_id: "section-a",
              explanation: "The button alignment and card spacing visibly differ.",
              explanation_confidence: 0.9,
            },
          ],
        }),
      })
      .mockRejectedValueOnce(new Error("upstream timeout"))
      .mockResolvedValueOnce({
        output_text: JSON.stringify({
          sections: [
            {
              section_id: "section-c",
              explanation: "overall layout structure differs.",
              explanation_confidence: 0.6,
            },
          ],
        }),
      });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { analyzeSectionDiffExplanationsAgent } = await import(
      "../../src/vision/agents.ts"
    );

    const result = await analyzeSectionDiffExplanationsAgent(
      cards,
      "https://example.com/base",
      "https://example.com/preview",
    );

    expect(result).toEqual([
      {
        section_id: "section-a",
        explanation: "The button alignment and card spacing visibly differ.",
        explanation_confidence: 0.9,
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

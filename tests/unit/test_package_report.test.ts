import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fileURLToPath } from "url";

const reporterDistModulePath = fileURLToPath(
  new URL("../../dist/reporter/index.js", import.meta.url),
);
const reporterSourceModuleUrl = new URL(
  "../../src/reporter/index.ts",
  import.meta.url,
).href;

describe("bruniai package report API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes encoded section screenshots and section results in the report payload", async () => {
    const sendMultiPageReport = vi
      .fn()
      .mockResolvedValue([{ test: { id: "report-123" } }]);
    const parseMultiPageAnalysisResults = vi.fn(
      (
        prNumber: string,
        repository: string,
        pageResults: unknown[],
        comparisonMode: string,
      ) => ({
        test_data: {
          pr_number: prNumber,
          repository,
          timestamp: "2026-04-11T00:00:00.000Z",
          comparison_mode: comparisonMode,
        },
        reports: pageResults,
      }),
    );
    const encodeImageCompressed = vi.fn(
      async (
        imagePath: string,
        format: string,
        maxDim: number,
        quality: number,
      ) => `encoded:${imagePath}:${format}:${maxDim}:${quality}`,
    );

    vi.doMock(reporterDistModulePath, () => ({
      BruniReporter: class MockBruniReporter {
        sendMultiPageReport = sendMultiPageReport;
      },
      parseMultiPageAnalysisResults,
      encodeImageCompressed,
    }));
    vi.doMock(reporterSourceModuleUrl, () => ({
      BruniReporter: class MockBruniReporter {
        sendMultiPageReport = sendMultiPageReport;
      },
      parseMultiPageAnalysisResults,
      encodeImageCompressed,
    }));

    const { sendReport } = await import("../../packages/bruniai/src/report.ts");

    const reportUrl = await sendReport({
      result: {
        status: "warning",
        visual_analysis: { status: "warning" },
        sections_analysis: "sections",
        images: {
          base_screenshot: "/tmp/base.png",
          preview_screenshot: "/tmp/preview.png",
          diff_image: "/tmp/diff.png",
          section_screenshots: {
            hero: {
              base: "/tmp/hero-base.png",
              preview: "/tmp/hero-preview.png",
            },
          },
        },
        section_results: [
          {
            section_id: "hero",
            name: "Hero",
            status: "problematic",
            design_range: { start_y: 0, end_y: 120 },
            matched_range: { start_y: 10, end_y: 130 },
            match_score: 0.62,
            similarity_score: 0.62,
            signals: {
              pixel_difference: 0.38,
              edge_difference: 0.2,
              structural_similarity: 0.74,
              final_similarity_score: 0.62,
            },
            description: "Hero changed.",
            explanation: "Hero changed.",
            explanation_confidence: null,
            explanation_source: "llm",
            image_refs: {
              base: "/tmp/hero-base.png",
              preview: "/tmp/hero-preview.png",
              diff: "/tmp/hero-diff.png",
            },
          },
        ],
      },
      page: "/",
      baseUrl: "https://example.com/design.png",
      previewUrl: "https://example.com",
      bruniToken: "token",
      comparisonMode: "image-to-url",
      prNumber: "42",
      repository: "owner/repo",
    });

    expect(reportUrl).toBe("https://app.brunivisual.com/test/report-123");
    expect(parseMultiPageAnalysisResults).toHaveBeenCalledWith(
      "42",
      "owner/repo",
      [
        expect.objectContaining({
          image_refs: expect.objectContaining({
            section_screenshots: {
              hero: {
                base: "encoded:/tmp/hero-base.png:WEBP:1000:60",
                pr: "encoded:/tmp/hero-preview.png:WEBP:1000:60",
              },
            },
          }),
          section_results: [
            expect.objectContaining({
              section_id: "hero",
              image_refs: {
                base: "encoded:/tmp/hero-base.png:WEBP:1000:60",
                preview: "encoded:/tmp/hero-preview.png:WEBP:1000:60",
                diff: "encoded:/tmp/hero-diff.png:WEBP:1000:70",
              },
            }),
          ],
        }),
      ],
      "image-to-url",
    );
    expect(sendMultiPageReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reports: expect.any(Array),
      }),
    );
  });

  it("can send reports through the internal MCP report endpoint", async () => {
    const sendMultiPageReport = vi.fn();
    const parseMultiPageAnalysisResults = vi.fn(
      (
        prNumber: string,
        repository: string,
        pageResults: unknown[],
        comparisonMode: string,
      ) => ({
        test_data: {
          pr_number: prNumber,
          repository,
          timestamp: "2026-04-11T00:00:00.000Z",
          comparison_mode: comparisonMode,
        },
        reports: pageResults,
      }),
    );
    const encodeImageCompressed = vi.fn(
      async (imagePath: string) => `encoded:${imagePath}`,
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ test: { id: "mcp-report-123" } }),
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.doMock(reporterDistModulePath, () => ({
      BruniReporter: class MockBruniReporter {
        sendMultiPageReport = sendMultiPageReport;
      },
      parseMultiPageAnalysisResults,
      encodeImageCompressed,
    }));
    vi.doMock(reporterSourceModuleUrl, () => ({
      BruniReporter: class MockBruniReporter {
        sendMultiPageReport = sendMultiPageReport;
      },
      parseMultiPageAnalysisResults,
      encodeImageCompressed,
    }));

    const { sendReport } = await import("../../packages/bruniai/src/report.ts");

    const reportUrl = await sendReport({
      result: {
        status: "pass",
        visual_analysis: { status: "pass" },
        sections_analysis: "sections",
        images: {
          base_screenshot: "/tmp/base.png",
          preview_screenshot: "/tmp/preview.png",
          diff_image: "/tmp/diff.png",
        },
      } as any,
      page: "/",
      baseUrl: "https://example.com",
      previewUrl: "https://preview.example.com",
      bruniApiUrl: "https://app.brunivisual.com/api/internal/mcp/tests",
      mcpToken: "bruni_mcp_test",
      mcpInternalSecret: "internal-secret",
      mcpAuthContext: {
        userId: "user-123",
        tokenId: "token-123",
        scopes: ["reports:create"],
      },
      comparisonMode: "url-to-url",
      prNumber: "42",
      repository: "owner/repo",
    });

    expect(reportUrl).toBe("https://app.brunivisual.com/test/mcp-report-123");
    expect(sendMultiPageReport).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.brunivisual.com/api/internal/mcp/tests",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer bruni_mcp_test",
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty(
      "identity",
    );
  });
});

/**
 * Test suite for BruniReporter class.
 *
 * This module tests the BruniReporter.sendMultiPageReport method, ensuring:
 * 1. Proper chunking of large reports
 * 2. Multiple API calls for chunks
 * 3. Correct handling of responses from each chunk
 * 4. Error handling for failed requests
 * 5. Token validation
 * 6. Response parsing (JSON and text fallback)
 *
 * The tests cover:
 * - Single chunk scenarios
 * - Multiple chunk scenarios with large datasets
 * - Error handling for network issues
 * - Response parsing for different content types
 * - Token validation
 * - Edge cases with empty or invalid data
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { BruniReporter } from "../../src/reporter/reporter.js";
import type {
  MultiPageReportData,
  PageReport,
} from "../../src/reporter/types.js";

// Mock fetch globally
global.fetch = vi.fn();

function createSamplePageReport(
  pagePath: string = "/",
  status: "pass" | "fail" | "warning" = "pass"
): PageReport {
  return {
    page_path: pagePath,
    url: `https://example.com${pagePath}`,
    preview_url: `https://preview.example.com${pagePath}`,
    status: status,
    critical_issues: {
      sections: [],
      summary: "",
    },
    critical_issues_enum: "none",
    structural_analysis: {
      section_order: "",
      layout: "",
      broken_layouts: "",
    },
    visual_changes: {
      diff_highlights: [],
      animation_issues: "",
      conclusion: "",
    },
    visual_changes_enum: "none",
    recommendation_enum: "pass",
    conclusion: {
      critical_issues: "",
      visual_changes: "",
      recommendation: "",
      summary: "",
    },
    image_refs: null,
  };
}

function createMultiPageReportData(
  numReports: number = 1
): MultiPageReportData {
  return {
    test_data: {
      pr_number: "123",
      repository: "test/repo",
      timestamp: new Date().toISOString(),
    },
    reports: Array.from({ length: numReports }, (_, i) =>
      createSamplePageReport(`/page${i}`)
    ),
  };
}

describe("BruniReporter.sendMultiPageReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should include all required fields in API payload", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(3); // 3 reports = 3 chunks

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const capturedPayloads: any[] = [];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            status: "success",
            chunk: 1,
            test: { id: "test-123" },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: 3 }),
      });

    // Intercept fetch calls to capture payloads
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async (url, options) => {
      if (options?.body) {
        capturedPayloads.push(JSON.parse(options.body as string));
      }
      return originalFetch(url, options);
    });

    const result = await reporter.sendMultiPageReport(reportData);

    // Verify we got 3 responses
    expect(result).toHaveLength(3);

    // Verify we captured 3 payloads
    expect(capturedPayloads).toHaveLength(3);

    // Verify each payload has the correct format
    for (let i = 0; i < capturedPayloads.length; i++) {
      const payload = capturedPayloads[i];
      expect(payload).toHaveProperty("test_data");
      expect(payload).toHaveProperty("reports");
      expect(payload).toHaveProperty("chunk_index");
      expect(payload).toHaveProperty("total_chunks");

      expect(payload.chunk_index).toBe(i);
      expect(payload.total_chunks).toBe(3);
      expect(payload.reports).toHaveLength(1); // 1 report per chunk
      expect(payload.test_data).toEqual(reportData.test_data);

      // First chunk should not have test_id, subsequent chunks should
      if (i === 0) {
        expect(payload).not.toHaveProperty("test_id");
      } else {
        expect(payload).toHaveProperty("test_id");
      }
    }

    global.fetch = originalFetch;
  });

  it("should send single chunk report", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(1); // 1 report = 1 chunk

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ status: "success", message: "Report received" }),
    });

    const result = await reporter.sendMultiPageReport(reportData);

    expect(result).toEqual([{ status: "success", message: "Report received" }]);
  });

  it("should send multiple chunks", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );

    const largeReportData = createMultiPageReportData(3);

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: 2 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: 3 }),
      });

    const result = await reporter.sendMultiPageReport(largeReportData);

    expect(result).toEqual([
      { status: "success", chunk: 1 },
      { status: "success", chunk: 2 },
      { status: "success", chunk: 3 },
    ]);
  });

  it("should return null when no token is provided", async () => {
    const reporter = new BruniReporter("", "https://api.bruni.com/reports");
    const reportData = createMultiPageReportData(1);

    const result = await reporter.sendMultiPageReport(reportData);

    expect(result).toBeNull();
  });

  it("should handle API errors", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(1);

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(reporter.sendMultiPageReport(reportData)).rejects.toThrow(
      "Failed to send multi-page report: 500 - Internal Server Error"
    );
  });

  it("omits section_results from the API payload", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(1);
    reportData.reports[0].section_results = [];

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "success",
          test: { id: "report-123" },
        }),
    });

    const result = await reporter.sendMultiPageReport(reportData);

    expect(result).toEqual([
      { status: "success", test: { id: "report-123" } },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(payload.reports[0]).not.toHaveProperty("section_results");
  });

  it("should handle network errors", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(1);

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockRejectedValue(new Error("Connection failed"));

    await expect(reporter.sendMultiPageReport(reportData)).rejects.toThrow(
      "Connection failed"
    );
  });

  it("should handle non-JSON responses", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(1);

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "Success message",
    });

    const result = await reporter.sendMultiPageReport(reportData);

    expect(result).toEqual([{ message: "Success message" }]);
  });

  it("should handle errors in multi-chunk scenarios", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );

    const largeReportData = createMultiPageReportData(3);

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: 1 }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Server Error",
      });

    await expect(reporter.sendMultiPageReport(largeReportData)).rejects.toThrow(
      "Failed to send multi-page report: 500 - Server Error"
    );
  });

  it("should handle empty reports list", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );
    const reportData = createMultiPageReportData(0); // Empty reports list

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ status: "success", message: "No reports to process" }),
    });

    const result = await reporter.sendMultiPageReport(reportData);

    expect(result).toEqual([]);
  });

  it("should handle very large datasets", async () => {
    const reporter = new BruniReporter(
      "test-token",
      "https://api.bruni.com/reports"
    );

    const largeDataset = createMultiPageReportData(5);

    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const responses: any[] = [];
    for (let i = 0; i < 5; i++) {
      responses.push({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: "success", chunk: i + 1 }),
      });
    }
    mockFetch.mockImplementation(async () => {
      return responses.shift()!;
    });

    const result = await reporter.sendMultiPageReport(largeDataset);

    const expectedResults = [
      { status: "success", chunk: 1 },
      { status: "success", chunk: 2 },
      { status: "success", chunk: 3 },
      { status: "success", chunk: 4 },
      { status: "success", chunk: 5 },
    ];
    expect(result).toEqual(expectedResults);
  });
});

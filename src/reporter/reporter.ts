import type { MultiPageReportData } from "./types.js";

function summarizeToken(token: string) {
  const trimmed = token.trim();
  const normalized = trimmed.replace(/^Bearer\s+/i, "");

  return {
    present: token.length > 0,
    length: token.length,
    trimmedLength: trimmed.length,
    hasLeadingOrTrailingWhitespace: token !== trimmed,
    startsWithBearerPrefix: /^Bearer\s+/i.test(trimmed),
    normalizedLength: normalized.length,
    jwtSegmentCount: normalized ? normalized.split(".").length : 0,
    prefix: normalized ? normalized.slice(0, 8) : "",
    suffix: normalized ? normalized.slice(-6) : "",
  };
}

/**
 * BruniReporter class for sending multi-page reports to the Bruni API.
 */
export class BruniReporter {
  private token: string;
  private apiUrl: string;

  /**
   * Initialize BruniReporter.
   *
   * @param token - API authentication token
   * @param apiUrl - API endpoint URL
   */
  constructor(token: string, apiUrl: string) {
    this.token = token;
    this.apiUrl = apiUrl;
    console.log(`Bruni reporter initialized with endpoint: ${apiUrl}`);
    console.log("[BruniReporter] Token diagnostics:", summarizeToken(token));
  }

  /**
   * Send a multi-page report to the Bruni API using fetch.
   *
   * @param multiPageReport - The multi-page report data to send
   * @returns The API response data array if successful, null otherwise
   * @throws Error if there's an error making the request or if response status is not successful
   */
  async sendMultiPageReport(
    multiPageReport: MultiPageReportData
  ): Promise<Array<Record<string, any>> | null> {
    if (!this.token) {
      console.log(
        "No Bruni token provided, skipping multi-page report submission"
      );
      return null;
    }

    // Split the reports into smaller chunks if necessary
    const maxChunkSize = 1; // 1 report per chunk to avoid large payloads
    const reports = multiPageReport.reports;
    const chunks: (typeof reports)[] = [];
    for (let i = 0; i < reports.length; i += maxChunkSize) {
      chunks.push(reports.slice(i, i + maxChunkSize));
    }

    const allResponses: Array<Record<string, any>> = [];
    let testId: string | null = null; // Will be set after first chunk

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(
        `Sending chunk ${chunkIndex + 1}/${chunks.length} with ${
          chunk.length
        } pages to Bruni API...`
      );

      // Prepare payload
      const payload: Record<string, any> = {
        reports: chunk,
        test_data: multiPageReport.test_data,
        chunk_index: chunkIndex,
        total_chunks: chunks.length,
      };

      // Add test_id for subsequent chunks
      if (testId !== null) {
        payload.test_id = testId;
      }

      try {
        console.log(
          `[BruniReporter] POST ${this.apiUrl} chunk ${chunkIndex + 1}/${
            chunks.length
          } auth diagnostics:`,
          {
            authorizationMode: "Bearer <token>",
            token: summarizeToken(this.token),
          }
        );

        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(payload),
        });

        // Read response text once
        const responseText = await response.text();

        if (!response.ok) {
          console.error(`API Error: ${response.status} - ${responseText}`);
          console.error("[BruniReporter] Failed auth diagnostics:", {
            status: response.status,
            token: summarizeToken(this.token),
          });
          throw new Error(
            `Failed to send multi-page report: ${response.status} - ${responseText}`
          );
        }

        // Try to parse the response as JSON first
        try {
          const responseData = JSON.parse(responseText);
          console.log(`API Response (${response.status}):`, responseData);
          allResponses.push(responseData);

          // Extract test_id from first chunk response
          if (chunkIndex === 0 && testId === null) {
            const testObj = responseData.test;
            if (testObj && typeof testObj === "object" && testObj !== null) {
              const extractedTestId = (testObj as Record<string, any>).id;
              if (extractedTestId) {
                testId = String(extractedTestId);
                console.log(`Extracted test_id: ${testId}`);
              }
            }
          }
        } catch {
          // If response is not JSON, fall back to text
          console.log(`API Response (${response.status}): ${responseText}`);
          allResponses.push({ message: responseText });
        }
      } catch (error) {
        console.error(`Error sending multi-page report to Bruni API: ${error}`);
        throw error;
      }
    }

    return allResponses;
  }
}

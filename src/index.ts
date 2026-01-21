import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { fetchPrMetadata } from "./github/pr-metadata.js";
import {
  getPrNumberFromEvent,
  formatVisualAnalysisToMarkdown,
  postPrComment,
} from "./github/pr-comments.js";
import { parseArgs } from "./args.js";
import { performComparison } from "./comparison/core.js";
import { performImageComparison } from "./comparison/image-core.js";
import { isImageSourceUrl } from "./image/index.js";
import {
  BruniReporter,
  parseMultiPageAnalysisResults,
  encodeImageCompressed,
} from "./reporter/index.js";
import type { ComparisonMode } from "./reporter/index.js";
import { ensureViewportSize } from "./utils/window.js";
import type { VisualAnalysisResult } from "./vision/types.js";

async function main() {
  // Parse command-line arguments
  const args = parseArgs();

  if (!args.baseUrl || !args.prUrl) {
    console.error("Error: --base-url and --pr-url are required");
    process.exit(1);
  }

  // Example: Collect PR metadata similar to Python implementation
  const { title, description } = await fetchPrMetadata();
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumberEnv = process.env.PR_NUMBER;
  let prNumber: number | null = null;

  // Parse pages argument (comma-separated format: "/,/contact")
  let pages: string[] = ["/"]; // Default to homepage
  if (args.pages) {
    pages = args.pages
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);
  }
  console.log("Pages:", pages);

  if (prNumberEnv) {
    const parsed = parseInt(prNumberEnv, 10);
    prNumber = isNaN(parsed) ? null : parsed;
  } else {
    prNumber = await getPrNumberFromEvent();
  }

  // Detect if base URL is an image URL (image-to-url mode).
  const isImageMode = isImageSourceUrl(args.baseUrl);
  const comparisonMode = isImageMode ? "image-to-url" : "url-to-url";

  console.log("Base URL:", args.baseUrl);
  console.log("PR URL:", args.prUrl);
  console.log("Comparison Mode:", comparisonMode);
  console.log("PR Title:", title);
  console.log("PR Description:", description);
  console.log("Repository:", repo);
  console.log("PR Number:", prNumber);

  const stagehand = new Stagehand({
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: true,
    },
  });

  const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE || process.cwd();
  const path = await import("path");
  const fs = await import("fs");
  const imagesDir = path.join(GITHUB_WORKSPACE, "images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // Initialize Bruni reporter if token is available
  const bruniToken = process.env.BRUNI_TOKEN || args.bruniToken || null;
  const bruniApiUrl =
    process.env.BRUNI_API_URL ||
    args.bruniApiUrl ||
    "https://bruniai-app.vercel.app/api/tests";

  let bruniReporter: BruniReporter | null = null;
  if (bruniToken) {
    bruniReporter = new BruniReporter(bruniToken, bruniApiUrl);
    console.log("Bruni reporter initialized");
  } else {
    console.log(
      "No Bruni token provided (neither in .env nor as argument), reporting will be skipped"
    );
  }

  // Initialize stagehand once before processing pages.
  await stagehand.init();

  // Get the page and navigate to blank page first to ensure it's ready.
  const initialPage = stagehand.context.pages()[0];
  await ensureViewportSize(initialPage, "about:blank");

  // Store all analyses and page results for final summary and reporting
  const allAnalyses: Array<{
    page_path: string;
    visual_analysis: VisualAnalysisResult;
    sections_analysis: string;
  }> = [];

  const allResults: Array<{
    page_path: string;
    base_url: string;
    pr_url: string;
    base_screenshot: string;
    pr_screenshot: string;
    diff_output_path: string;
    section_screenshots: Record<string, { base: string; pr: string }>;
  }> = [];

  // Process each page sequentially to avoid race conditions.
  // For image mode, we only process a single baseline image (no page paths).
  const pagesToProcess = isImageMode ? ["/"] : pages;

  for (const page of pagesToProcess) {
    console.log("Processing page ------ ", page);

    // Construct full URLs for this page.
    // For image mode, use the URLs directly without appending page path.
    const baseUrl = isImageMode
      ? args.baseUrl!
      : args.baseUrl!.replace(/\/$/, "") + page;
    const prUrl = isImageMode ? args.prUrl! : args.prUrl!.replace(/\/$/, "") + page;

    console.log(`Base URL: ${baseUrl}`);
    console.log(`PR URL: ${prUrl}`);

    // Perform the comparison using the appropriate function based on mode.
    let result;
    if (isImageMode) {
      // Use image-to-URL comparison.
      result = await performImageComparison({
        stagehand,
        baseImageUrl: args.baseUrl!,
        previewUrl: args.prUrl!,
        page,
        imagesDir,
        prNumber: prNumber?.toString(),
        repository: repo || undefined,
      });
    } else {
      // Use standard URL-to-URL comparison.
      result = await performComparison({
        stagehand,
        baseUrl: args.baseUrl!,
        previewUrl: args.prUrl!,
        page,
        imagesDir,
        prNumber: prNumber?.toString(),
        repository: repo || undefined,
      });
    }

    console.log("Visual analysis completed:", result.visual_analysis.status);

    // Store the analysis results.
    allAnalyses.push({
      page_path: page,
      visual_analysis: result.visual_analysis,
      sections_analysis: result.sections_analysis,
    });

    // Convert section screenshots format from {base, preview} to {base, pr} for compatibility.
    const sectionScreenshots: Record<string, { base: string; pr: string }> = {};
    for (const [sectionId, screenshots] of Object.entries(
      result.section_screenshots
    )) {
      sectionScreenshots[sectionId] = {
        base: screenshots.base,
        pr: screenshots.preview,
      };
    }

    // Store page results for Bruni reporting.
    allResults.push({
      page_path: page,
      base_url: baseUrl,
      pr_url: prUrl,
      base_screenshot: result.base_screenshot,
      pr_screenshot: result.preview_screenshot,
      diff_output_path: result.diff_image,
      section_screenshots: sectionScreenshots,
    });
  }

  // Close stagehand after all pages are processed.
  await stagehand.close();

  // Combine all analyses into a comprehensive report
  let finalSummary =
    "Information about visual testing analysis provided by [bruniai](https://www.brunivisual.com/)\n\n" +
    `**Testing Summary**: ${allAnalyses.length} page${
      allAnalyses.length !== 1 ? "s" : ""
    } analyzed\n\n`;

  for (let i = 0; i < allAnalyses.length; i++) {
    const pageAnalysis = allAnalyses[i];
    const pagePath = pageAnalysis.page_path;
    const visualAnalysis = pageAnalysis.visual_analysis;
    const sectionsAnalysis = pageAnalysis.sections_analysis;

    // Format the visual analysis for this page
    const formattedVisualAnalysis =
      formatVisualAnalysisToMarkdown(visualAnalysis);

    // Add page-specific section
    const pageSummary =
      `<details>\n` +
      `<summary>Page ${i + 1}: ${pagePath}</summary>\n\n` +
      `<details>\n` +
      `<summary>Structural Analysis</summary>\n\n` +
      `${sectionsAnalysis}\n` +
      `</details>\n\n` +
      `${formattedVisualAnalysis}\n` +
      `</details>\n\n`;

    finalSummary += pageSummary;
  }

  // Send report to Bruni API if configured and get the report URL
  let reportUrl: string | null = null;
  if (bruniReporter) {
    try {
      // Prepare page results with image references.
      const pageResults: Array<{
        page_path: string;
        base_url: string;
        pr_url: string;
        visual_analysis: VisualAnalysisResult;
        sections_analysis: string;
        image_refs: {
          base_screenshot?: string | null;
          pr_screenshot?: string | null;
          diff_image?: string | null;
          section_screenshots?: Record<
            string,
            { base: string; pr: string }
          > | null;
        };
      }> = [];
      const maxSectionScreenshots = parseInt(
        process.env.BRUNI_MAX_SECTION_SCREENSHOTS || "6",
        10
      );

      for (let i = 0; i < allAnalyses.length; i++) {
        const pageAnalysis = allAnalyses[i];
        const pageResult = allResults[i];

        // Create image references with compressed base64 data.
        const imageRefs: {
          base_screenshot?: string | null;
          pr_screenshot?: string | null;
          diff_image?: string | null;
          section_screenshots?: Record<
            string,
            { base: string; pr: string }
          > | null;
        } = {
          base_screenshot: await encodeImageCompressed(
            pageResult.base_screenshot,
            "WEBP",
            1200,
            60
          ),
          pr_screenshot: await encodeImageCompressed(
            pageResult.pr_screenshot,
            "WEBP",
            1200,
            60
          ),
          diff_image: await encodeImageCompressed(
            pageResult.diff_output_path,
            "WEBP",
            1200,
            70
          ),
        };

        // Add section screenshots if available.
        // Limit the number to prevent payload from becoming too large.
        if (
          pageResult.section_screenshots &&
          Object.keys(pageResult.section_screenshots).length > 0
        ) {
          const sectionScreenshotsEncoded: Record<
            string,
            { base: string; pr: string }
          > = {};
          let idx = 0;
          for (const [sectionId, screenshots] of Object.entries(
            pageResult.section_screenshots
          )) {
            if (idx >= maxSectionScreenshots) {
              console.log(
                `Limiting section screenshots to ${maxSectionScreenshots} to reduce payload size.`
              );
              break;
            }

            sectionScreenshotsEncoded[sectionId] = {
              base: await encodeImageCompressed(
                screenshots.base,
                "WEBP",
                1000,
                60
              ),
              pr: await encodeImageCompressed(screenshots.pr, "WEBP", 1000, 60),
            };
            idx++;
          }
          imageRefs.section_screenshots = sectionScreenshotsEncoded;
        }

        // Create page result with all necessary data
        pageResults.push({
          page_path: pageResult.page_path,
          base_url: pageResult.base_url,
          pr_url: pageResult.pr_url,
          visual_analysis: pageAnalysis.visual_analysis,
          sections_analysis: pageAnalysis.sections_analysis,
          image_refs: imageRefs,
        });
      }

      // Create multi-page report.
      const multiPageReport = parseMultiPageAnalysisResults(
        prNumber?.toString() || "",
        repo || "",
        pageResults,
        comparisonMode as ComparisonMode
      );

      // Send multi-page report
      const apiResponse = await bruniReporter.sendMultiPageReport(
        multiPageReport
      );

      // Extract report ID from API response and construct URL
      if (apiResponse && apiResponse.length > 0) {
        const firstResponse = apiResponse[0];
        if (firstResponse.test && typeof firstResponse.test === "object") {
          const testObj = firstResponse.test as Record<string, any>;
          const reportId = testObj.id;
          if (reportId) {
            // Remove the /api/tests part and add /test/{id}
            const baseApiUrl = bruniApiUrl
              .replace("/api/tests", "")
              .replace(/\/$/, "");
            reportUrl = `${baseApiUrl}/test/${reportId}`;
            console.log(`Report available at: ${reportUrl}`);
          }
        }
        if (!reportUrl) {
          console.warn(
            `No report ID found in API response: ${JSON.stringify(apiResponse)}`
          );
          console.debug(`Full API response: ${JSON.stringify(apiResponse)}`);
        }
      }
    } catch (error) {
      console.error(`Failed to send report to Bruni API: ${error}`);
    }
  }

  // Add report URL to the summary if available
  if (reportUrl) {
    finalSummary += `\n\n📊 **Complete Report**: [View detailed analysis](${reportUrl})`;
  }

  // Post to GitHub
  await postPrComment(finalSummary);
  console.log("Complete analysis has been logged above.");
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

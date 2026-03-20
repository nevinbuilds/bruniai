import { v4 as uuidv4 } from "uuid";
import { readFileSync } from "fs";
import type { VisualAnalysisResult } from "./types.js";

export interface SectionDiffReviewCard {
  section_id: string;
  name: string;
  base_screenshot: string;
  preview_screenshot: string;
  diff_image: string;
  match_score: number;
  final_similarity_score: number;
  pixel_difference: number;
  edge_difference: number;
  structural_similarity: number;
}

/**
 * Maximum length for PR title input.
 */
export const MAX_TITLE_LENGTH = 200;

/**
 * Maximum length for PR description input.
 */
export const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Detect suspicious patterns that may indicate prompt injection attempts.
 *
 * @param text - Text to analyze for suspicious patterns
 * @returns True if suspicious patterns are detected
 */
export function detectSuspiciousPatterns(text: string): boolean {
  if (!text) return false;

  const suspiciousPatterns = [
    /\bignore\s+(all\s+)?(previous|prior|above|below)\s+instructions?\b/i,
    /\boverride\s+(all\s+)?(previous|prior|above|below)\s+instructions?\b/i,
    /\bsystem\s*:\s*/i,
    /\bSYSTEM\s*:\s*/i,
    /\bassistant\s*:\s*/i,
    /\bASSISTANT\s*:\s*/i,
    /\buser\s*:\s*/i,
    /\bUSER\s*:\s*/i,
    /\bforget\s+(all\s+)?(previous|prior|above|below)\s+instructions?\b/i,
    /\bdisregard\s+(all\s+)?(previous|prior|above|below)\s+instructions?\b/i,
    /\bnew\s+instructions?\s*:\s*/i,
    /\bNEW\s+INSTRUCTIONS?\s*:\s*/i,
    /\bexecute\s+(the\s+)?following\s+commands?\b/i,
    /\bdo\s+not\s+follow\s+(the\s+)?(previous|prior|above|below)\s+instructions?\b/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitize PR title or description input to prevent prompt injection attacks.
 *
 * This function implements multi-layer sanitization:
 * - Escapes curly braces to prevent template injection
 * - Escapes newlines to prevent prompt breakouts
 * - Escapes backticks to prevent code block injection
 * - Escapes delimiter markers to prevent delimiter confusion
 * - Normalizes whitespace
 * - Truncates to safe length limits
 * - Removes control characters
 *
 * Security considerations:
 * - All user input from PR metadata should be sanitized before use in prompts
 * - This function does not guarantee complete protection but significantly reduces risk
 * - Suspicious patterns are detected and logged but input is still sanitized
 *
 * @param text - Text to sanitize
 * @param maxLength - Maximum allowed length (defaults to MAX_DESCRIPTION_LENGTH)
 * @returns Sanitized text safe for use in prompts
 */
export function sanitizePrInput(
  text: string,
  maxLength: number = MAX_DESCRIPTION_LENGTH
): string {
  if (!text) {
    return "";
  }

  // Detect and log suspicious patterns
  if (detectSuspiciousPatterns(text)) {
    console.warn(
      "Suspicious pattern detected in PR input. Sanitizing and proceeding."
    );
  }

  let sanitized = text;

  // Remove control characters (except newlines which we'll handle separately)
  sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

  // Escape newlines to prevent prompt breakouts
  sanitized = sanitized
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");

  // Escape backticks to prevent code block injection
  sanitized = sanitized.replace(/`/g, "\\`");

  // Escape curly braces to prevent template injection
  sanitized = sanitized.replace(/{/g, "{{").replace(/}/g, "}}");

  // Escape delimiter markers to prevent delimiter confusion
  // Escape old delimiter pattern
  sanitized = sanitized.replace(/!!!/g, "\\!\\!\\!");
  // Escape new bracket-based delimiter patterns
  sanitized = sanitized.replace(/\[PR_TITLE_START\]/g, "\\[PR_TITLE_START\\]");
  sanitized = sanitized.replace(/\[PR_TITLE_END\]/g, "\\[PR_TITLE_END\\]");
  sanitized = sanitized.replace(/\[PR_DESC_START\]/g, "\\[PR_DESC_START\\]");
  sanitized = sanitized.replace(/\[PR_DESC_END\]/g, "\\[PR_DESC_END\\]");

  // Normalize whitespace: collapse multiple spaces/tabs into single space
  sanitized = sanitized.replace(/[ \t]+/g, " ");

  // Trim leading and trailing whitespace
  sanitized = sanitized.trim();

  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength - 3) + "...";
  }

  return sanitized;
}

/**
 * Validate and fix enum values in the analysis result.
 */
export function validateAndFixEnums(
  data: Partial<VisualAnalysisResult>
): VisualAnalysisResult {
  const validStatusEnum = ["pass", "fail", "warning", "none"] as const;
  const validCriticalIssuesEnum = [
    "none",
    "missing_sections",
    "other_issues",
  ] as const;
  const validVisualChangesEnum = ["none", "minor", "significant"] as const;
  const validRecommendationEnum = [
    "pass",
    "review_required",
    "reject",
  ] as const;
  const validSectionStatus = ["Present", "Missing"] as const;

  // Validate and fix status_enum
  if (!data.status_enum || !validStatusEnum.includes(data.status_enum as any)) {
    console.warn(
      `Invalid status_enum: ${data.status_enum}, defaulting to 'warning'`
    );
    data.status_enum = "warning";
    data.status = "warning";
  } else {
    // Ensure status matches status_enum
    data.status = data.status_enum;
  }

  // Validate and fix critical_issues_enum
  if (
    !data.critical_issues_enum ||
    !validCriticalIssuesEnum.includes(data.critical_issues_enum as any)
  ) {
    console.warn(
      `Invalid critical_issues_enum: ${data.critical_issues_enum}, defaulting to 'other_issues'`
    );
    data.critical_issues_enum = "other_issues";
  }

  // Validate and fix visual_changes_enum
  if (
    !data.visual_changes_enum ||
    !validVisualChangesEnum.includes(data.visual_changes_enum as any)
  ) {
    console.warn(
      `Invalid visual_changes_enum: ${data.visual_changes_enum}, defaulting to 'minor'`
    );
    data.visual_changes_enum = "minor";
  }

  // Validate and fix recommendation_enum
  if (
    !data.recommendation_enum ||
    !validRecommendationEnum.includes(data.recommendation_enum as any)
  ) {
    console.warn(
      `Invalid recommendation_enum: ${data.recommendation_enum}, defaulting to 'review_required'`
    );
    data.recommendation_enum = "review_required";
  }

  // Validate section status values
  if (data.critical_issues?.sections) {
    for (const section of data.critical_issues.sections) {
      if (
        !section.status ||
        !validSectionStatus.includes(section.status as any)
      ) {
        console.warn(
          `Invalid section status: ${section.status}, defaulting to 'Present'`
        );
        section.status = "Present";
      }
    }
  }

  return data as VisualAnalysisResult;
}

/**
 * Generate metadata (UUID, timestamps).
 */
export function generateMetadata(): {
  id: string;
  timestamp: string;
  created_at: string;
} {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    timestamp: now,
    created_at: now,
  };
}

/**
 * Determine MIME type from image file extension.
 *
 * @param path - File path to analyze
 * @returns MIME type string (image/png or image/jpeg)
 */
function getImageMimeType(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  return ext === "png" ? "image/png" : "image/jpeg";
}

/**
 * Create HTML page with base64-encoded images for analysis.
 *
 * This function reads screenshot images from disk, converts them to base64
 * data URLs, and generates an HTML page that displays them side-by-side for
 * visual comparison analysis by the image analysis agent.
 *
 * @param base_screenshot - Path to the base/reference screenshot
 * @param pr_screenshot - Path to the PR/changed screenshot
 * @param diff_image - Path to the diff image highlighting differences
 * @param base_url - Base URL being tested
 * @param preview_url - Preview URL for the PR
 * @returns Complete HTML string for the comparison page
 */
export function createImageComparisonHtml(
  base_screenshot: string,
  pr_screenshot: string,
  diff_image: string,
  base_url: string,
  preview_url: string
): string {
  // Read image files and convert to base64 data URLs.
  const baseImageData = readFileSync(base_screenshot);
  const prImageData = readFileSync(pr_screenshot);
  const diffImageData = readFileSync(diff_image);

  const base64Base = baseImageData.toString("base64");
  const base64Pr = prImageData.toString("base64");
  const base64Diff = diffImageData.toString("base64");

  // Determine image format from file extension.
  const baseMimeType = getImageMimeType(base_screenshot);
  const prMimeType = getImageMimeType(pr_screenshot);
  const diffMimeType = getImageMimeType(diff_image);

  // Create HTML comparison page with the images.
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Visual Comparison</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: Arial, sans-serif;
            background: #f5f5f5;
        }
        .container {
            max-width: 100%;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .comparison-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 20px;
        }
        .image-panel {
            background: white;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .image-panel h3 {
            margin-top: 0;
            text-align: center;
            color: #333;
        }
        .image-panel img {
            width: 100%;
            height: auto;
            display: block;
            border: 1px solid #ddd;
        }
        @media (max-width: 1200px) {
            .comparison-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Visual Comparison Analysis</h1>
            <p><strong>Base URL:</strong> ${base_url}</p>
            <p><strong>Preview URL:</strong> ${preview_url}</p>
        </div>
        <div class="comparison-grid">
            <div class="image-panel base-image">
                <h3>Base Screenshot</h3>
                <img src="data:${baseMimeType};base64,${base64Base}" alt="Base Screenshot" />
            </div>
            <div class="image-panel pr-image">
                <h3>PR Screenshot</h3>
                <img src="data:${prMimeType};base64,${base64Pr}" alt="PR Screenshot" />
            </div>
            <div class="image-panel diff-image">
                <h3>Diff Image</h3>
                <img src="data:${diffMimeType};base64,${base64Diff}" alt="Diff Image" />
            </div>
        </div>
    </div>
</body>
</html>`;
}

export function createSectionDiffReviewHtml(
  cards: SectionDiffReviewCard[],
  base_url: string,
  preview_url: string,
): string {
  const cardHtml = cards
    .map((card) => {
      const baseImageData = readFileSync(card.base_screenshot);
      const previewImageData = readFileSync(card.preview_screenshot);
      const diffImageData = readFileSync(card.diff_image);

      const baseMimeType = getImageMimeType(card.base_screenshot);
      const previewMimeType = getImageMimeType(card.preview_screenshot);
      const diffMimeType = getImageMimeType(card.diff_image);

      return `
        <section class="section-card" data-section-id="${card.section_id}">
          <header class="section-header">
            <h2>${card.name}</h2>
            <p class="section-id">Section ID: ${card.section_id}</p>
          </header>
          <div class="metrics">
            <span>Match: ${card.match_score.toFixed(3)}</span>
            <span>Similarity: ${card.final_similarity_score.toFixed(3)}</span>
            <span>Pixel diff: ${card.pixel_difference.toFixed(3)}</span>
            <span>Edge diff: ${card.edge_difference.toFixed(3)}</span>
            <span>SSIM: ${card.structural_similarity.toFixed(3)}</span>
          </div>
          <div class="comparison-grid">
            <div class="image-panel">
              <h3>Design Section</h3>
              <img src="data:${baseMimeType};base64,${baseImageData.toString("base64")}" alt="Design section ${card.name}" />
            </div>
            <div class="image-panel">
              <h3>Webpage Section</h3>
              <img src="data:${previewMimeType};base64,${previewImageData.toString("base64")}" alt="Webpage section ${card.name}" />
            </div>
            <div class="image-panel">
              <h3>Section Diff</h3>
              <img src="data:${diffMimeType};base64,${diffImageData.toString("base64")}" alt="Diff image ${card.name}" />
            </div>
          </div>
        </section>
      `;
    })
    .join("\n");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Section Diff Review</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: Arial, sans-serif;
      background: #f5f5f5;
      color: #111827;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    .header {
      margin-bottom: 24px;
    }
    .section-card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
    }
    .section-header h2 {
      margin: 0 0 4px;
      font-size: 24px;
    }
    .section-id {
      margin: 0;
      color: #6b7280;
    }
    .metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 16px 0 12px;
      font-size: 14px;
      color: #374151;
    }
    .fallback {
      margin: 0 0 16px;
      color: #4b5563;
    }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .image-panel {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 10px;
    }
    .image-panel h3 {
      margin: 0 0 8px;
      font-size: 16px;
    }
    .image-panel img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    @media (max-width: 1000px) {
      .comparison-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Section Diff Review</h1>
      <p><strong>Base:</strong> ${base_url}</p>
      <p><strong>Preview:</strong> ${preview_url}</p>
    </div>
    ${cardHtml}
  </div>
</body>
</html>`;
}

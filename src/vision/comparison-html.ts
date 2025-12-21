import { readFileSync } from "fs";

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
 * Create HTML comparison page with base64-encoded images.
 *
 * This function reads screenshot images from disk, converts them to base64
 * data URLs, and generates an HTML page that displays them side-by-side for
 * visual comparison analysis.
 *
 * @param base_screenshot - Path to the base/reference screenshot
 * @param pr_screenshot - Path to the PR/changed screenshot
 * @param diff_image - Path to the diff image highlighting differences
 * @param base_url - Base URL being tested
 * @param preview_url - Preview URL for the PR
 * @returns Complete HTML string for the comparison page
 */
export function createComparisonHtml(
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

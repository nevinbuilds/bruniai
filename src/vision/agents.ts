import { Stagehand } from "@browserbasehq/stagehand";
import {
  BaseUrlAnalysisResultSchema,
  PreviewUrlAnalysisResultSchema,
  ImageAnalysisResultSchema,
  type BaseUrlAnalysisResult,
  type PreviewUrlAnalysisResult,
  type ImageAnalysisResult,
} from "./types.js";
import { createImageComparisonHtml } from "./utils.js";
import { writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Analyze base URL structure, sections, and layout.
 *
 * This agent focuses on understanding the reference structure
 * of the base URL page.
 *
 * @param stagehand - Stagehand instance
 * @param base_url - Base URL to analyze
 * @param sections_analysis - Optional analysis of website sections
 * @returns Base URL analysis result
 */
export async function analyzeBaseUrlAgent(
  stagehand: Stagehand,
  base_url: string,
  sections_analysis?: string
): Promise<BaseUrlAnalysisResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 1: Analyzing Base URL\n${"=".repeat(50)}`
  );

  // Create a fresh page for this analysis to ensure complete isolation.
  const page = await stagehand.context.newPage();
  await page.goto(base_url, {
    waitUntil: "networkidle",
    timeoutMs: 60000,
  });

  const systemPrompt = `
    You are analyzing the BASE URL (reference/expected version) of a website.

    Your task is to:
    1. Identify all major sections on this page
    2. Document the structural layout and organization
    3. Note the visual hierarchy and element positioning
    4. Identify any potential layout issues or broken structures

    ${
      sections_analysis
        ? `\n\nHere is the structural analysis of the website's sections that you should use to guide your analysis:\n\n${sections_analysis}\n\n`
        : ""
    }

    **IMPORTANT: You must respond with valid JSON only, following this exact structure:**

    {
        "sections": [
            {
                "name": "Section Name",
                "section_id": "section_id_from_analysis",
                "description": "Description of the section and its content",
                "position": "Description of section position (e.g., 'top', 'middle', 'bottom')"
            }
            ...
        ],
        "structural_analysis": {
            "section_order": "Analysis of section ordering",
            "layout": "Analysis of layout structure",
            "broken_layouts": "Description of any broken layouts found (or 'none' if none)"
        },
        "layout_notes": "Additional notes about the layout structure and visual hierarchy"
    }

    Focus on documenting the reference structure that will be used to compare against the preview URL.
  `;

  const result = await stagehand.extract(
    systemPrompt,
    BaseUrlAnalysisResultSchema,
    { page }
  );

  // Close the page to prevent context leakage.
  await page.close();

  return result;
}

/**
 * Analyze preview URL structure, sections, and layout.
 *
 * This agent compares the preview URL against the base URL
 * structure to identify changes.
 *
 * @param stagehand - Stagehand instance
 * @param preview_url - Preview URL to analyze
 * @param base_analysis - Base URL analysis result for comparison
 * @param sections_analysis - Optional analysis of website sections
 * @returns Preview URL analysis result
 */
export async function analyzePreviewUrlAgent(
  stagehand: Stagehand,
  preview_url: string,
  base_analysis: BaseUrlAnalysisResult,
  sections_analysis?: string
): Promise<PreviewUrlAnalysisResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 2: Analyzing Preview URL\n${"=".repeat(50)}`
  );

  // Create a fresh page for this analysis to ensure complete isolation.
  const page = await stagehand.context.newPage();
  await page.goto(preview_url, {
    waitUntil: "networkidle",
    timeoutMs: 60000,
  });

  const baseSectionsList = base_analysis.sections
    .map((s) => `- ${s.name} (ID: ${s.section_id}): ${s.description}`)
    .join("\n");

  const systemPrompt = `
    You are analyzing the PREVIEW URL (changed/new version) of a website.

    Your task is to:
    1. Check if each section from the base URL is present in this preview URL
    2. Identify any missing sections (CRITICAL issue)
    3. Document structural changes compared to the base URL
    4. Note layout changes and element repositioning
    5. Identify any broken layouts

    Reference sections from BASE URL:
    ${baseSectionsList}

    ${
      sections_analysis
        ? `\n\nHere is the structural analysis of the website's sections:\n\n${sections_analysis}\n\n`
        : ""
    }

    **IMPORTANT: You must respond with valid JSON only, following this exact structure:**

    {
        "sections": [
            {
                "name": "Section Name",
                "section_id": "section_id_from_analysis",
                "status": "Present" | "Missing",
                "description": "Description of the section and its content or why it's missing",
                "position": "Description of section position (e.g., 'top', 'middle', 'bottom')"
            }
            ...
        ],
        "structural_analysis": {
            "section_order": "Analysis of section ordering changes compared to base",
            "layout": "Analysis of layout structure changes",
            "broken_layouts": "Description of any broken layouts found (or 'none' if none)"
        },
        "layout_notes": "Additional notes about layout changes compared to base URL",
        "missing_sections": ["List of section names that are missing"]
    }

    **CRITICAL**: For each section from the base URL, explicitly check if it is present or missing.
    Missing sections are CRITICAL issues and must be reported.
  `;

  const result = await stagehand.extract(
    systemPrompt,
    PreviewUrlAnalysisResultSchema,
    { page }
  );

  // Close the page to prevent context leakage.
  await page.close();

  return result;
}

/**
 * Analyze screenshot images to identify visual differences.
 *
 * This agent analyzes the three screenshot images (base, preview, diff)
 * to identify visual changes and missing sections.
 *
 * @param stagehand - Stagehand instance
 * @param base_screenshot - Path to the base screenshot
 * @param pr_screenshot - Path to the PR screenshot
 * @param diff_image - Path to the diff image
 * @param base_url - Base URL being tested
 * @param preview_url - Preview URL for the PR
 * @param sections_analysis - Optional analysis of website sections
 * @param pr_title - Optional PR title for context
 * @param pr_description - Optional PR description for context
 * @returns Image analysis result
 */
export async function analyzeImagesAgent(
  stagehand: Stagehand,
  base_screenshot: string,
  pr_screenshot: string,
  diff_image: string,
  base_url: string,
  preview_url: string,
  sections_analysis?: string
): Promise<ImageAnalysisResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 3: Analyzing Images\n${"=".repeat(50)}`
  );

  // Create HTML page with images.
  const comparisonHtml = createImageComparisonHtml(
    base_screenshot,
    pr_screenshot,
    diff_image,
    base_url,
    preview_url
  );

  // Create a temporary HTML file and navigate to it.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const tempHtmlPath = join(
    __dirname,
    "..",
    "..",
    "temp-images-comparison.html"
  );

  writeFileSync(tempHtmlPath, comparisonHtml, "utf-8");

  try {
    // Create a fresh page for this analysis to ensure complete isolation.
    const page = await stagehand.context.newPage();
    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: "networkidle",
      timeoutMs: 30000,
    });

    const systemPrompt = `
      You are analyzing three screenshot images displayed side-by-side on this page:

      1. BASE_SCREENSHOT (left panel) - The reference/expected version from ${base_url}
         - CSS selector: .image-panel.base-image
         - Position: Leftmost panel

      2. PR_SCREENSHOT (middle panel) - The changed/new version from ${preview_url}
         - CSS selector: .image-panel.pr-image
         - Position: Middle panel

      3. DIFF_IMAGE (right panel) - This image shows differences highlighted in RED
         - CSS selector: .image-panel.diff-image
         - Position: Rightmost panel
         - **CRITICAL**: This image uses RED pixels/areas to highlight ONLY the actual differences
         - If this image shows NO red pixels anywhere, there are NO visual differences, if it shows red pixels, then there are visual differences (not necessarily critical, but there are changes).

      **MOST IMPORTANT RULE**:
      Before reporting ANY visual differences, you MUST first check the DIFF IMAGE (right panel) for RED pixels.
      - If you see RED pixels/areas → describe what those red areas show
      - If you see NO RED pixels → diff_highlights MUST be [] (empty) and visual_changes_enum MUST be "none", but you must report that there are visual differences (not necessarily critical, but there are changes).

      Your task is to perform a section per section analysis using the 3 images on the page (BASE_SCREENSHOT, PR_SCREENSHOT, DIFF_IMAGE) as the reference and the section analysis provided.
      The criteria and basis for the analysis are described below:

      1. Critical Issues :

      1.1 For each section described in the section analysis, explicitly check if that section is visually present in the {PR_SCREENSHOT} and if its missing that is critical.
      1.2 Identify missing sections (CRITICAL issue) and report them in the critical_issues section.

      2. Visual Changes :

      **CRITICAL VERIFICATION STEP - READ THIS FIRST:**
      Before reporting ANY visual differences, you MUST:
      1. Look at the DIFF IMAGE (right panel, .image-panel.diff-image)
      2. Visually scan the entire DIFF IMAGE for ANY red pixels, red areas, or red highlights
      3. If you see NO red pixels/areas anywhere in the DIFF IMAGE, then there are NO visual differences
      4. If there is NO red visible, the diff_highlights array MUST be empty: []

      2.1 ONLY if red pixels/areas are visible in the {DIFF_IMAGE}, identify what those red areas represent and report them in the visual_changes section.
      2.2 If NO red is visible in the DIFF IMAGE, you MUST report an empty diff_highlights array: []
      2.5 Note any animation-related findings and ignore them never flag something that is animating as a visual change.
      2.6 Focus on structural and layout changes, not only minor text/styling changes or font rendering issues.
      2.7 If the DIFF IMAGE shows no red pixels, there are NO visual changes - report "none" for visual_changes_enum and empty array for diff_highlights.
      2.8 If the DIFF IMAGE has red pixels and areas, use your own judgement to determine what the visual differences are and report them in the visual_changes section.

      3. Missing Sections :

      3.1 Identify missing sections (CRITICAL issue) and report them in the missing_sections section.

      ${
        sections_analysis
          ? `\n\nHere is the structural analysis of the website's sections:\n\n${sections_analysis}\n\n**For each section listed above, explicitly check if it is present in the PR SCREENSHOT (middle panel). If any section is missing, list it by name and describe its expected location and content.**\n`
          : ""
      }

      **IMPORTANT: You must respond with valid JSON only, following this exact structure:**

      {
          "critical_issues": {
              "sections": [
                  {
                      "name": "Section Name",
                      "status": "Present" | "Missing",
                      "description": "Description of the section and its expected location/content if missing",
                      "section_id": "section_id_will_be_filled"
                  }
                  ...
              ],
              "summary": "Summary of all critical issues found"
          },
          "critical_issues_enum": "none" | "missing_sections" | "other_issues",
          "visual_changes": {
              "diff_highlights": ["List any visual differences between the BASE SCREENSHOT and the PR SCREENSHOT. If NO red is visible anywhere in the DIFF IMAGE, this array MUST be empty: []."],
              "animation_issues": "Description of any animation-related findings",
              "conclusion": "Overall conclusion about visual changes. If no red is visible in DIFF IMAGE, state 'No visual differences detected - diff image shows no red highlights'"
          },
          "visual_changes_enum": "none" | "minor" | "significant",
          "missing_sections": [
              {
                  "name": "Section Name",
                  "section_id": "section_id",
                  "description": "Description of missing section"
              }
          ]
      }

      Combine your capabilities of analyzing visual differences to combine the analysis provided by the section analysis and the visual differences provided by the 3 images on the page in order to detect as accurately as posisble
      what happened to the website in the PR. Do not make assumptions, only report what you can see in the images but use your good judgement to analyze the changes and report them in the visual_changes section.
      Always keep in mind that differences in top sections can affect the entire diff image, so you must analyze the entire diff image to determine what the visual differences are.
      Use all 3 of the images and the section analysis to determine what the visual differences are and which ones are relevant to report.

      **CRITICAL RULES - FOLLOW STRICTLY:**
      - FIRST: Look at the DIFF IMAGE (right panel) - do you see ANY red pixels or red areas?
      - If NO red is visible anywhere in the DIFF IMAGE → diff_highlights MUST be [] (empty array) and visual_changes_enum MUST be "none", but you must report that there are visual differences (not necessarily critical, but there are changes).
      - If YES red is visible → ONLY then describe what those red areas show in the diff_highlights section.
      - Missing sections are CRITICAL issues (check PR_SCREENSHOT for missing sections)
      - Ignore small rendering differences in fonts and colors
      - If a section animates or moves, note it but don't flag as visual regression
      - If the DIFF IMAGE is completely black/white/gray with NO red, there are NO visual changes to report
    `;

    const result = await stagehand.extract(
      systemPrompt,
      ImageAnalysisResultSchema,
      { page }
    );

    // Close the page to prevent context leakage.
    await page.close();

    return result;
  } finally {
    // Clean up temporary HTML file.
    try {
      unlinkSync(tempHtmlPath);
    } catch (cleanupError) {
      console.warn(`Warning: Could not delete temporary file: ${cleanupError}`);
    }
  }
}

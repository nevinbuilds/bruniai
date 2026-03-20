import { Stagehand } from "@browserbasehq/stagehand";
import {
  BaseUrlAnalysisResultSchema,
  PreviewUrlAnalysisResultSchema,
  ImageAnalysisResultSchema,
  SectionDiffExplanationsSchema,
  type BaseUrlAnalysisResult,
  type PreviewUrlAnalysisResult,
  type ImageAnalysisResult,
  type SectionDiffExplanation,
} from "./types.js";
import {
  createImageComparisonHtml,
  createSectionDiffReviewHtml,
  type SectionDiffReviewCard,
} from "./utils.js";
import { extractJsonFromResponse } from "../utils/json.js";
import { writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

export interface AnalyzeSectionDiffExplanationsInput
  extends SectionDiffReviewCard {
  section_id: string;
}

function isUnusableSectionExplanation(explanation: string): boolean {
  const normalized = explanation.trim().toLowerCase();
  return (
    normalized.length < 24 ||
    normalized === "overall layout structure differs." ||
    normalized === "the section differs materially from the design." ||
    normalized === "a corresponding webpage region was found." ||
    normalized === "visible differences are present." ||
    normalized === "layout is different."
  );
}

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
  sections_analysis?: string,
): Promise<BaseUrlAnalysisResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 1: Analyzing Base URL\n${"=".repeat(50)}`,
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
    { page },
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
  sections_analysis?: string,
): Promise<PreviewUrlAnalysisResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 2: Analyzing Preview URL\n${"=".repeat(50)}`,
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
    You are analyzing the PREVIEW URL (changed/new version) of a website and comparing it against the BASE URL structure.

    You are currently viewing the live preview URL page. You have been provided with a list of sections that are present in the base URL, and you should use this information to analyze the structure and identify any differences or missing sections in the current preview URL page.

    The structure of the webpage should follow the structure given in the section analysis.

    Your task is to:
    1. Check if each section from the base URL is present in this preview URL page
    2. Identify any missing sections (CRITICAL issue)
    3. Document structural changes compared to the base URL
    4. Note layout changes and element repositioning
    5. Identify any broken layouts
    6. Avoid small differences and especially differences that are just a result of differences from sections above. Try as much as possible to analyze each section independently

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
    { page },
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
  sections_analysis?: string,
): Promise<ImageAnalysisResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 3: Analyzing Images\n${"=".repeat(50)}`,
  );

  // Create HTML page with images.
  const comparisonHtml = createImageComparisonHtml(
    base_screenshot,
    pr_screenshot,
    diff_image,
    base_url,
    preview_url,
  );

  // Create a temporary HTML file with unique filename to avoid conflicts
  // when multiple processes run concurrently.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const uniqueId = uuidv4();
  const tempHtmlPath = join(
    __dirname,
    "..",
    "..",
    `temp-images-comparison-${uniqueId}.html`,
  );

  writeFileSync(tempHtmlPath, comparisonHtml, "utf-8");

  try {
    // Create a fresh page for this analysis to ensure complete isolation.
    const page = await stagehand.context.newPage();
    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: "networkidle",
      timeoutMs: 30000,
    });

    // Create a Computer Use Agent for visual understanding.
    const agent = stagehand.agent(({
      model: "openai/gpt-5-mini",
      // Stagehand defaults temperature for agent calls; null disables that for reasoning models.
      temperature: null,
      systemPrompt: `You are an expert visual analysis assistant specializing in comparing website screenshots and identifying visual differences, missing sections, and layout issues. You must respond with valid JSON only.`,
    } as unknown) as Parameters<typeof stagehand.agent>[0]);

    // Use the agent to visually analyze the images and return structured JSON.
    const agentInstruction = `
      Analyze the three screenshot images displayed side-by-side on this page:

      1. BASE_SCREENSHOT (left panel, .image-panel.base-image) - The reference/expected version from ${base_url}
      2. PR_SCREENSHOT (middle panel, .image-panel.pr-image) - The changed/new version from ${preview_url}
      3. DIFF_IMAGE (right panel, .image-panel.diff-image) - Shows differences highlighted in RED pixels

      **CRITICAL VERIFICATION STEPS:**
      1. First, visually examine the DIFF IMAGE (right panel) for ANY red pixels or red areas
      2. Check each section from the analysis to see if it's present in the PR_SCREENSHOT
      3. Identify any missing sections (CRITICAL issue)
      4. Analyze visual differences only if red pixels are visible in the DIFF IMAGE

      ${
        sections_analysis
          ? `\n\nHere is the structural analysis of the website's sections:\n\n${sections_analysis}\n\n**For each section listed above, explicitly check if it is present in the PR SCREENSHOT (middle panel). If any section is missing, list it by name and describe its expected location and content.**\n`
          : ""
      }

      **MOST IMPORTANT RULE:**
      Before reporting ANY visual differences, you MUST first check the DIFF IMAGE (right panel) for RED pixels.
      - If you see RED pixels/areas → describe what those red areas show and diff_highlights must have at least one item in the array.
      - If you see NO RED pixels → diff_highlights MUST be [] (empty) and visual_changes_enum MUST be "none"

      **CRITICAL RULES - FOLLOW STRICTLY:**
      - FIRST: Look at the DIFF IMAGE (right panel) - do you see ANY red pixels or red areas?
      - If NO red is visible anywhere in the DIFF IMAGE → diff_highlights MUST be [] (empty array) and visual_changes_enum MUST be "none"
      - If YES red is visible → ONLY then describe what those red areas show in the diff_highlights section
      - Missing sections are CRITICAL issues (check PR_SCREENSHOT for missing sections)
      - Ignore small rendering differences in fonts and colors
      - If a section animates or moves, note it but don't flag as visual regression
      - Focus on structural and layout changes, not minor text/styling changes or font rendering issues

      **IMPORTANT: You must respond with valid JSON only, following this exact structure. Return ONLY the JSON object, no additional text or markdown:**

      {
          "critical_issues": {
              "sections": [
                  {
                      "name": "Section Name",
                      "status": "Present" | "Missing",
                      "description": "Description of the section and its expected location/content if missing",
                      "section_id": "section_id_will_be_filled"
                  }
              ],
              "summary": "Summary of all critical issues found"
          },
          "critical_issues_enum": "none" | "missing_sections" | "other_issues",
          "visual_changes": {
              "diff_highlights": ["List any visual differences between the BASE SCREENSHOT and the PR SCREENSHOT. If NO red is visible anywhere in the DIFF IMAGE, this array MUST be empty: [] otherwise if there is any red visible, describe what those red areas show and diff_highlights must have at least one item in the array."],
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

      Combine your visual analysis capabilities to detect what happened to the website in the PR. Do not make assumptions, only report what you can see in the images but use your good judgement to analyze the changes and report them in the visual_changes section.
      Always keep in mind that differences in top sections can affect the entire diff image, so you must analyze the entire diff image to determine what the visual differences are.
      Use all 3 of the images and the section analysis to determine what the visual differences are and which ones are relevant to report.

      **Return ONLY valid JSON matching the structure above.**
    `;

    const resultAgent = await agent.execute({
      instruction: agentInstruction,
      maxSteps: 10,
      highlightCursor: true,
    });

    // Extract JSON from agent response.
    let agentResponse = "";
    if (typeof resultAgent === "string") {
      agentResponse = resultAgent;
    } else if (resultAgent && typeof resultAgent === "object") {
      // Handle different possible response structures.
      agentResponse =
        (resultAgent as any).message ||
        (resultAgent as any).response ||
        (resultAgent as any).text ||
        JSON.stringify(resultAgent);
    } else {
      agentResponse = String(resultAgent);
    }

    // Extract JSON from the response (may be wrapped in markdown code blocks or text).
    const jsonString = extractJsonFromResponse(agentResponse) ?? agentResponse.trim();

    // Parse and validate JSON.
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse agent JSON response:", parseError);
      console.error("Agent response:", agentResponse);
      throw new Error(
        `Failed to parse agent response as JSON: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`,
      );
    }

    // Validate against schema.
    const result = ImageAnalysisResultSchema.parse(parsedJson);

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

export async function analyzeSectionDiffExplanationsAgent(
  stagehand: Stagehand,
  cards: AnalyzeSectionDiffExplanationsInput[],
  base_url: string,
  preview_url: string,
): Promise<SectionDiffExplanation[]> {
  if (cards.length === 0) {
    return [];
  }

  console.log(
    `\n${"=".repeat(50)}\n🔍 Agent 4: Explaining Problematic Sections\n${"=".repeat(50)}`,
  );

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const explanations: SectionDiffExplanation[] = [];

  for (const card of cards) {
    const reviewHtml = createSectionDiffReviewHtml([card], base_url, preview_url);
    const uniqueId = uuidv4();
    const tempHtmlPath = join(
      __dirname,
      "..",
      "..",
      `temp-section-diff-review-${uniqueId}.html`,
    );
    writeFileSync(tempHtmlPath, reviewHtml, "utf-8");

    let page: Awaited<ReturnType<Stagehand["context"]["newPage"]>> | null = null;

    try {
      page = await stagehand.context.newPage();
      await page.goto(`file://${tempHtmlPath}`, {
        waitUntil: "networkidle",
        timeoutMs: 30000,
      });

      const agent = stagehand.agent(({
        model: "openai/gpt-5-mini",
        // Stagehand defaults temperature for agent calls; null disables that for reasoning models.
        temperature: null,
        systemPrompt:
          "You are an expert visual UI reviewer. Compare the design crop, webpage crop, and diff image for one section. Return valid JSON only.",
      } as unknown) as Parameters<typeof stagehand.agent>[0]);

      const instruction = `
        You are reviewing exactly one section card on this page.

        The card contains:
        - the design section image
        - the webpage section image
        - the diff image
        - deterministic metrics

        Write a human-readable explanation of what is visibly different in this section.

        Rules:
        - Do not decide whether the section matched; that was already determined.
        - Mention at least one concrete visible element or property such as a heading, card, image, icon, button, text block, spacing, padding, alignment, border, background, column layout, or text wrapping.
        - If the section looks visually close, say that and mention any minor visible deviation.
        - If the crop looks ambiguous or weakly matched, say that clearly.
        - Keep the explanation to 1 or 2 sentences.
        - Do not use generic phrases like "overall layout structure differs", "a corresponding webpage region was found", or "the section differs materially from the design" unless you also name specific visible changes.
        - explanation_confidence must be between 0 and 1.

        Return ONLY JSON in this exact format:
        {
          "sections": [
            {
              "section_id": "${card.section_id}",
              "explanation": "Concrete explanation of the visible difference.",
              "explanation_confidence": 0.84
            }
          ]
        }
      `;

      const resultAgent = await agent.execute({
        instruction,
        maxSteps: 10,
        highlightCursor: true,
      });

      let agentResponse = "";
      if (typeof resultAgent === "string") {
        agentResponse = resultAgent;
      } else if (resultAgent && typeof resultAgent === "object") {
        agentResponse =
          (resultAgent as any).message ||
          (resultAgent as any).response ||
          (resultAgent as any).text ||
          JSON.stringify(resultAgent);
      } else {
        agentResponse = String(resultAgent);
      }

      const jsonString =
        extractJsonFromResponse(agentResponse) ?? agentResponse.trim();
      const parsedJson = JSON.parse(jsonString);
      const result = SectionDiffExplanationsSchema.parse(parsedJson);
      const explanation = result.sections.find(
        (section) => section.section_id === card.section_id,
      );

      if (explanation && !isUnusableSectionExplanation(explanation.explanation)) {
        explanations.push(explanation);
      } else {
        console.warn(
          `Section explanation for ${card.section_id} was too generic or missing in model output.`,
        );
      }
    } finally {
      try {
        if (page) {
          await page.close();
        }
      } catch (closeError) {
        console.warn(`Warning: Could not close section review page: ${closeError}`);
      }
      try {
        unlinkSync(tempHtmlPath);
      } catch (cleanupError) {
        console.warn(`Warning: Could not delete temporary file: ${cleanupError}`);
      }
    }
  }

  return explanations;
}

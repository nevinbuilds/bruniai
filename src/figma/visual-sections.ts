/**
 * AI-based visual section detection for Figma prototypes.
 *
 * Since Figma prototypes render to a canvas element without DOM structure,
 * we use AI vision to identify visual sections from screenshots.
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

/**
 * Visual section detected from an image.
 */
export interface VisualSection {
  /** Name of the section (e.g., "Hero Section", "Navigation"). */
  name: string;
  /** Unique identifier for this section. */
  sectionId: string;
  /** Description of the section content and purpose. */
  description: string;
  /** Bounding box of the section in pixels. */
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Position in the visual hierarchy. */
  position: "top" | "middle" | "bottom";
  /** Visual patterns or characteristics of this section. */
  visualPatterns: string;
}

/**
 * Result of visual section extraction.
 */
export interface VisualSectionsResult {
  /** List of detected visual sections. */
  sections: VisualSection[];
  /** Overall layout description. */
  layoutDescription: string;
  /** Image dimensions used for analysis. */
  imageDimensions: {
    width: number;
    height: number;
  };
}

/**
 * Zod schema for visual section detection response.
 */
const VisualSectionSchema = z.object({
  name: z.string(),
  sectionId: z.string(),
  description: z.string(),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  position: z.enum(["top", "middle", "bottom"]),
  visualPatterns: z.string(),
});

const VisualSectionsResultSchema = z.object({
  sections: z.array(VisualSectionSchema),
  layoutDescription: z.string(),
  imageDimensions: z.object({
    width: z.number(),
    height: z.number(),
  }),
});

/**
 * Create an HTML page that displays the screenshot for AI analysis.
 *
 * @param screenshotPath - Path to the screenshot image.
 * @param imageWidth - Width of the image in pixels.
 * @param imageHeight - Height of the image in pixels.
 * @returns HTML content as a string.
 */
function createImageAnalysisHtml(
  screenshotPath: string,
  imageWidth: number,
  imageHeight: number
): string {
  // Read the image and convert to base64.
  const imageBuffer = readFileSync(screenshotPath);
  const base64Image = imageBuffer.toString("base64");
  const mimeType = screenshotPath.endsWith(".png") ? "image/png" : "image/jpeg";

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Visual Section Analysis</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      background: #1a1a1a;
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .container {
      max-width: 100%;
      margin: 0 auto;
    }
    h1 {
      font-size: 18px;
      margin-bottom: 10px;
      color: #888;
    }
    .image-container {
      position: relative;
      display: inline-block;
      border: 2px solid #333;
    }
    .screenshot {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .info {
      margin-top: 10px;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Screenshot for Visual Section Analysis</h1>
    <div class="image-container">
      <img 
        class="screenshot" 
        src="data:${mimeType};base64,${base64Image}" 
        alt="Screenshot for analysis"
        width="${imageWidth}"
        height="${imageHeight}"
      />
    </div>
    <div class="info">
      Image dimensions: ${imageWidth} x ${imageHeight} pixels
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Get image dimensions from a PNG or JPEG file.
 *
 * @param imagePath - Path to the image file.
 * @returns Object with width and height.
 */
function getImageDimensions(imagePath: string): { width: number; height: number } {
  const buffer = readFileSync(imagePath);

  // PNG signature: 89 50 4E 47 0D 0A 1A 0A.
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    // PNG: width and height are in IHDR chunk at bytes 16-23.
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }

  // JPEG: SOI marker FF D8.
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        break;
      }
      const marker = buffer[offset + 1];
      // SOF markers (Start of Frame).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      // Move to next marker.
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  // Fallback: return default dimensions.
  console.warn("Could not determine image dimensions, using defaults");
  return { width: 1920, height: 1080 };
}

/**
 * Extract visual sections from a screenshot using AI vision.
 *
 * This function analyzes a screenshot image using Stagehand's agent to
 * identify visual sections without relying on DOM structure.
 *
 * @param stagehand - The Stagehand instance.
 * @param screenshotPath - Path to the screenshot image to analyze.
 * @returns Visual sections result with detected sections and layout info.
 */
export async function extractVisualSections(
  stagehand: Stagehand,
  screenshotPath: string
): Promise<VisualSectionsResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Extracting visual sections from screenshot\n${"=".repeat(50)}`
  );

  // Get image dimensions.
  const imageDimensions = getImageDimensions(screenshotPath);
  console.log(`Image dimensions: ${imageDimensions.width}x${imageDimensions.height}`);

  // Create HTML page with the screenshot.
  const analysisHtml = createImageAnalysisHtml(
    screenshotPath,
    imageDimensions.width,
    imageDimensions.height
  );

  // Create a temporary HTML file.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const uniqueId = uuidv4();
  const tempHtmlPath = join(
    __dirname,
    "..",
    "..",
    `temp-visual-sections-${uniqueId}.html`
  );

  writeFileSync(tempHtmlPath, analysisHtml, "utf-8");

  try {
    // Create a fresh page for this analysis.
    const page = await stagehand.context.newPage();
    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: "networkidle",
      timeoutMs: 30000,
    });

    // Create an agent for visual analysis.
    const agent = stagehand.agent({
      model: "openai/gpt-4.1-mini",
      systemPrompt: `You are an expert visual analysis assistant specializing in identifying sections and layout structure from website or design screenshots. You must respond with valid JSON only.`,
    });

    // Use the agent to identify visual sections.
    const agentInstruction = `
      Analyze the screenshot image displayed on this page to identify all major visual sections.

      The image shows a website or design prototype. Your task is to:

      1. Identify all major visual sections (header, hero, features, content blocks, footer, etc.)
      2. For each section, estimate its bounding box coordinates in PIXELS relative to the image
      3. Generate a unique, descriptive ID for each section (e.g., "hero-section", "nav-header")
      4. Describe the visual patterns and content of each section

      **IMPORTANT IMAGE DIMENSIONS:**
      - The image is ${imageDimensions.width} pixels wide and ${imageDimensions.height} pixels tall
      - All bounding box coordinates must be within these dimensions
      - x + width must not exceed ${imageDimensions.width}
      - y + height must not exceed ${imageDimensions.height}

      **CRITICAL GUIDELINES:**
      - Identify sections from TOP to BOTTOM of the image
      - Sections should not overlap significantly
      - Include ALL visible sections, even if they appear partial
      - Focus on major structural sections, not individual components
      - Estimate bounding boxes as accurately as possible based on visual boundaries

      **IMPORTANT: You must respond with valid JSON only, following this exact structure:**

      {
        "sections": [
          {
            "name": "Section Name (e.g., Navigation Header, Hero Section)",
            "sectionId": "kebab-case-id (e.g., nav-header, hero-section)",
            "description": "Description of section content and purpose",
            "boundingBox": {
              "x": 0,
              "y": 0,
              "width": ${imageDimensions.width},
              "height": 100
            },
            "position": "top" | "middle" | "bottom",
            "visualPatterns": "Description of visual characteristics"
          }
        ],
        "layoutDescription": "Overall description of the page layout structure",
        "imageDimensions": {
          "width": ${imageDimensions.width},
          "height": ${imageDimensions.height}
        }
      }

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
      agentResponse =
        (resultAgent as any).message ||
        (resultAgent as any).response ||
        (resultAgent as any).text ||
        JSON.stringify(resultAgent);
    } else {
      agentResponse = String(resultAgent);
    }

    // Extract JSON from the response.
    let jsonString = agentResponse.trim();

    // Remove markdown code blocks if present.
    const jsonMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    } else {
      const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        jsonString = jsonObjectMatch[0];
      }
    }

    // Parse and validate JSON.
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse visual sections JSON response:", parseError);
      console.error("Agent response:", agentResponse);
      throw new Error(
        `Failed to parse agent response as JSON: ${
          parseError instanceof Error ? parseError.message : String(parseError)
        }`
      );
    }

    // Validate against schema.
    const result = VisualSectionsResultSchema.parse(parsedJson);

    // Close the page.
    await page.close();

    console.log(`Detected ${result.sections.length} visual sections`);
    for (const section of result.sections) {
      console.log(`  - ${section.name} (${section.sectionId}): ${section.boundingBox.y}px - ${section.boundingBox.y + section.boundingBox.height}px`);
    }

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

/**
 * Format visual sections as a string similar to DOM-based section analysis.
 *
 * This creates a formatted output that can be used by the existing
 * comparison workflow.
 *
 * @param result - The visual sections result.
 * @returns Formatted string representation.
 */
export function formatVisualSectionsAsAnalysis(
  result: VisualSectionsResult
): string {
  let output = `### Visual Section Analysis (AI-detected)\n`;
  output += `Layout: ${result.layoutDescription}\n\n`;
  output += `### Sections (in order of appearance):\n`;

  result.sections.forEach((section, index) => {
    output += `${index + 1}. ${section.name}\n`;
    output += `   - Section ID: ${section.sectionId}\n`;
    output += `   - Position: ${section.position}\n`;
    output += `   - Description: ${section.description}\n`;
    output += `   - Visual Patterns: ${section.visualPatterns}\n`;
    output += `   - Bounding Box: x=${section.boundingBox.x}, y=${section.boundingBox.y}, w=${section.boundingBox.width}, h=${section.boundingBox.height}\n`;
    // Add placeholders for DOM-based fields (not available for Figma).
    output += `   - HTML Element: none (visual detection)\n`;
    output += `   - HTML ID: none\n`;
    output += `   - HTML Classes: none\n`;
    output += `   - ARIA Label: none\n`;
    output += `   - Content Identifier: ${section.description.substring(0, 50)}\n\n`;
  });

  return output;
}

/**
 * Take screenshots of detected visual sections from a URL.
 *
 * This function uses the bounding boxes from visual section detection
 * to capture section-specific screenshots from a live URL.
 *
 * @param stagehand - The Stagehand instance.
 * @param url - The URL to screenshot.
 * @param sections - The detected visual sections with bounding boxes.
 * @param outputDir - Directory to save screenshots.
 * @param pageSuffix - Suffix for file naming.
 * @returns Map of section IDs to screenshot paths.
 */
export async function takeSectionScreenshotsFromVisualBounds(
  stagehand: Stagehand,
  url: string,
  sections: VisualSection[],
  outputDir: string,
  pageSuffix: string
): Promise<Record<string, string>> {
  const screenshots: Record<string, string> = {};
  const page = stagehand.context.pages()[0];

  // Navigate to the URL.
  page.setViewportSize(1920, 1080);
  await page.goto(url, { waitUntil: "networkidle", timeoutMs: 60000 });

  // Get the full page height.
  const fullPageHeight = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (globalThis as any).document;
    return Math.max(
      doc.body.scrollHeight,
      doc.body.offsetHeight,
      doc.documentElement.clientHeight,
      doc.documentElement.scrollHeight,
      doc.documentElement.offsetHeight
    );
  });

  // Set viewport to full page height for accurate screenshots.
  page.setViewportSize(1920, fullPageHeight);

  for (const section of sections) {
    try {
      const outputPath = join(
        outputDir,
        `preview_screenshot_${pageSuffix}_section_${section.sectionId}.png`
      );

      // Take screenshot with clip.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const screenshot = await page.screenshot({
        clip: {
          x: section.boundingBox.x,
          y: section.boundingBox.y,
          width: section.boundingBox.width,
          height: section.boundingBox.height,
        },
      } as any);

      writeFileSync(outputPath, screenshot);
      screenshots[section.sectionId] = outputPath;
      console.log(`Captured section screenshot: ${section.sectionId}`);
    } catch (error) {
      console.warn(
        `Failed to capture section ${section.sectionId}: ${error}`
      );
    }
  }

  return screenshots;
}

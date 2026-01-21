/**
 * AI-based visual section detection for screenshot/image baselines.
 *
 * This does not rely on DOM structure; it uses AI vision to identify sections
 * from screenshots. It supports very tall images by chunking and merging.
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import { writeFileSync, unlinkSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";

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

function createImageAnalysisHtml(
  screenshotPath: string,
  imageWidth: number,
  imageHeight: number
): string {
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
    .container { max-width: 100%; margin: 0 auto; }
    h1 { font-size: 18px; margin-bottom: 10px; color: #888; }
    .image-container { position: relative; display: inline-block; border: 2px solid #333; }
    .screenshot { display: block; max-width: 100%; height: auto; }
    .info { margin-top: 10px; font-size: 14px; color: #666; }
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

function getImageDimensions(imagePath: string): { width: number; height: number } {
  const buffer = readFileSync(imagePath);

  // PNG signature.
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
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
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      const length = buffer.readUInt16BE(offset + 2);
      offset += 2 + length;
    }
  }

  console.warn("Could not determine image dimensions, using defaults");
  return { width: 1920, height: 1080 };
}

export async function extractVisualSections(
  stagehand: Stagehand,
  screenshotPath: string
): Promise<VisualSectionsResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Extracting visual sections from screenshot\n${"=".repeat(50)}`
  );

  const imageDimensions = getImageDimensions(screenshotPath);
  console.log(`Image dimensions: ${imageDimensions.width}x${imageDimensions.height}`);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const uniqueId = uuidv4();
  const tempDir = join(__dirname, "..", "..");

  // Chunk tall screenshots to avoid missing mid/bottom sections.
  const maxChunkHeight = 2200;
  const chunkOverlap = 250;
  const chunkCount =
    imageDimensions.height > maxChunkHeight
      ? Math.ceil(
          (imageDimensions.height - chunkOverlap) / (maxChunkHeight - chunkOverlap)
        )
      : 1;

  try {
    const agent = stagehand.agent({
      model: "openai/gpt-4.1-mini",
      systemPrompt:
        "You are an expert visual analysis assistant specializing in identifying sections and layout structure from website or design screenshots. You must respond with valid JSON only.",
    });

    const allSections: VisualSection[] = [];
    let layoutDescription = "";

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const yStart =
        chunkCount === 1 ? 0 : chunkIndex * (maxChunkHeight - chunkOverlap);
      const yEnd = Math.min(imageDimensions.height, yStart + maxChunkHeight);
      const chunkHeight = Math.max(1, yEnd - yStart);

      const chunkPath = join(
        tempDir,
        `temp-visual-sections-${uniqueId}-chunk-${chunkIndex}.png`
      );

      await sharp(screenshotPath)
        .extract({
          left: 0,
          top: yStart,
          width: imageDimensions.width,
          height: chunkHeight,
        })
        .png()
        .toFile(chunkPath);

      const analysisHtml = createImageAnalysisHtml(
        chunkPath,
        imageDimensions.width,
        chunkHeight
      );

      const tempHtmlPath = join(
        tempDir,
        `temp-visual-sections-${uniqueId}-chunk-${chunkIndex}.html`
      );
      writeFileSync(tempHtmlPath, analysisHtml, "utf-8");

      const page = await stagehand.context.newPage();
      await page.goto(`file://${tempHtmlPath}`, {
        waitUntil: "networkidle",
        timeoutMs: 30000,
      });

      const agentInstruction = `
Analyze the screenshot image displayed on this page to identify all major visual sections.

This is CHUNK ${chunkIndex + 1} of ${chunkCount} of a tall page.
The chunk is a vertical slice of the full page from y=${yStart}px to y=${yEnd}px.

Your task is to:
1. Identify major visual sections (header, hero, features, content blocks, footer, etc.)
2. For each section, estimate its bounding box coordinates in PIXELS relative to THIS CHUNK
3. Generate a unique, descriptive ID for each section (e.g., "hero-section", "nav-header")
4. Describe the visual patterns and content of each section

**CHUNK IMAGE DIMENSIONS:**
- The chunk is ${imageDimensions.width} pixels wide and ${chunkHeight} pixels tall
- All bounding box coordinates must be within these chunk dimensions

**IMPORTANT: You must respond with valid JSON only, following this exact structure:**
{
  "sections": [
    {
      "name": "Section Name",
      "sectionId": "kebab-case-id",
      "description": "Description of section content and purpose",
      "boundingBox": { "x": 0, "y": 0, "width": ${imageDimensions.width}, "height": 100 },
      "position": "top" | "middle" | "bottom",
      "visualPatterns": "Description of visual characteristics"
    }
  ],
  "layoutDescription": "Overall description of the page layout structure (for this chunk)",
  "imageDimensions": { "width": ${imageDimensions.width}, "height": ${chunkHeight} }
}
`;

      const resultAgent = await agent.execute({
        instruction: agentInstruction,
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

      let jsonString = agentResponse.trim();
      const jsonMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1];
      } else {
        const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonString = jsonObjectMatch[0];
        }
      }

      const chunkResult = VisualSectionsResultSchema.parse(JSON.parse(jsonString));
      if (!layoutDescription && chunkResult.layoutDescription) {
        layoutDescription = chunkResult.layoutDescription;
      }

      for (const section of chunkResult.sections) {
        allSections.push({
          ...section,
          boundingBox: {
            ...section.boundingBox,
            y: section.boundingBox.y + yStart,
          },
        });
      }

      await page.close();

      try {
        unlinkSync(tempHtmlPath);
      } catch {
        // Ignore.
      }
      try {
        unlinkSync(chunkPath);
      } catch {
        // Ignore.
      }
    }

    allSections.sort((a, b) => a.boundingBox.y - b.boundingBox.y);

    function normalizeName(s: string): string {
      return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    }
    function isSimilar(a: string, b: string): boolean {
      const na = normalizeName(a);
      const nb = normalizeName(b);
      if (!na || !nb) return false;
      if (na === nb) return true;
      if (na.includes(nb) || nb.includes(na)) return true;
      const aHead = na.split(" ").slice(0, 2).join(" ");
      const bHead = nb.split(" ").slice(0, 2).join(" ");
      return Boolean(aHead) && aHead === bHead;
    }
    function overlapRatio(a: VisualSection, b: VisualSection): number {
      const aTop = a.boundingBox.y;
      const aBot = a.boundingBox.y + a.boundingBox.height;
      const bTop = b.boundingBox.y;
      const bBot = b.boundingBox.y + b.boundingBox.height;
      const inter = Math.max(0, Math.min(aBot, bBot) - Math.max(aTop, bTop));
      const minH = Math.max(1, Math.min(a.boundingBox.height, b.boundingBox.height));
      return inter / minH;
    }

    const merged: VisualSection[] = [];
    for (const section of allSections) {
      const last = merged[merged.length - 1];
      if (
        last &&
        isSimilar(last.name, section.name) &&
        overlapRatio(last, section) > 0.6
      ) {
        const x1 = Math.min(last.boundingBox.x, section.boundingBox.x);
        const y1 = Math.min(last.boundingBox.y, section.boundingBox.y);
        const x2 = Math.max(
          last.boundingBox.x + last.boundingBox.width,
          section.boundingBox.x + section.boundingBox.width
        );
        const y2 = Math.max(
          last.boundingBox.y + last.boundingBox.height,
          section.boundingBox.y + section.boundingBox.height
        );

        last.boundingBox = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
        if (section.description && !last.description.includes(section.description)) {
          last.description = `${last.description} ${section.description}`.trim();
        }
        continue;
      }
      merged.push(section);
    }

    const seenIds = new Map<string, number>();
    for (const s of merged) {
      const count = seenIds.get(s.sectionId) || 0;
      if (count > 0) {
        s.sectionId = `${s.sectionId}-${count + 1}`;
      }
      seenIds.set(s.sectionId, count + 1);
    }

    for (const s of merged) {
      const mid = s.boundingBox.y + s.boundingBox.height / 2;
      const frac = mid / Math.max(1, imageDimensions.height);
      s.position = frac < 0.33 ? "top" : frac < 0.66 ? "middle" : "bottom";
    }

    console.log(`Detected ${merged.length} visual sections (chunked)`);
    for (const section of merged) {
      console.log(
        `  - ${section.name} (${section.sectionId}): ${section.boundingBox.y}px - ${
          section.boundingBox.y + section.boundingBox.height
        }px`
      );
    }

    return {
      sections: merged,
      layoutDescription:
        layoutDescription || "Layout detected from chunked screenshot analysis.",
      imageDimensions: {
        width: imageDimensions.width,
        height: imageDimensions.height,
      },
    };
  } finally {
    // Per-chunk cleanup happens during processing.
  }
}

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
 * Uses the bounding boxes from visual section detection to capture section
 * screenshots from a live URL.
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
      console.warn(`Failed to capture section ${section.sectionId}: ${error}`);
    }
  }

  return screenshots;
}


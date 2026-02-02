/**
 * Visual section detection for screenshot/image baselines.
 *
 * Uses an LLM vision API only (no DOM, no banding fallback). Sections are
 * extracted from a thumbnail and bounding boxes are scaled to the full image.
 */

import { Stagehand } from "@browserbasehq/stagehand";
import OpenAI from "openai";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";
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

/**
 * Result from detecting a single section in the sequential approach.
 */
export interface SequentialSectionResult {
  /** Name of the section (e.g., "Hero Banner", "Features"). */
  name: string;
  /** Unique identifier for this section in kebab-case. */
  sectionId: string;
  /** One sentence describing what this section contains. */
  description: string;
  /** Where this section ends (Y coordinate relative to the cropped image). */
  endY: number;
  /** Whether there are more sections below this one. */
  hasMoreSections: boolean;
}

/**
 * A detected section with its screenshot path immediately available.
 */
export interface DetectedSection extends VisualSection {
  /** Path to the cropped screenshot file for this section. */
  screenshotPath: string;
}

/**
 * Result of sequential visual section extraction.
 */
export interface SequentialSectionsResult {
  /** List of detected visual sections with screenshot paths. */
  sections: DetectedSection[];
  /** Overall layout description. */
  layoutDescription: string;
  /** Image dimensions used for analysis. */
  imageDimensions: {
    width: number;
    height: number;
  };
}

function getImageDimensions(imagePath: string): {
  width: number;
  height: number;
} {
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

function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function extractJsonFromResponse(response: string): string | null {
  let jsonString = response.trim();
  const jsonMatch = jsonString.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    return jsonMatch[1];
  }
  const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    return jsonObjectMatch[0];
  }
  return null;
}

/**
 * Crop the remaining portion of an image starting from a Y coordinate.
 * Returns the cropped image as a base64 PNG string.
 */
async function cropFromY(
  imagePath: string,
  startY: number,
  maxWidth: number = 1200,
): Promise<{ base64: string; width: number; height: number }> {
  const metadata = await sharp(imagePath).metadata();
  const origWidth = metadata.width || 1920;
  const origHeight = metadata.height || 1080;

  // Calculate remaining height.
  const remainingHeight = Math.max(1, origHeight - startY);

  // Crop the remaining portion.
  const croppedBuffer = await sharp(imagePath)
    .extract({
      left: 0,
      top: startY,
      width: origWidth,
      height: remainingHeight,
    })
    .resize({ width: maxWidth, withoutEnlargement: true })
    .png()
    .toBuffer();

  const croppedMeta = await sharp(croppedBuffer).metadata();
  const croppedWidth = croppedMeta.width || maxWidth;
  const croppedHeight = croppedMeta.height || remainingHeight;

  return {
    base64: croppedBuffer.toString("base64"),
    width: croppedWidth,
    height: croppedHeight,
  };
}

/**
 * Crop a section from the original image and save it to a file.
 */
async function cropSection(
  imagePath: string,
  outputPath: string,
  boundingBox: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const metadata = await sharp(imagePath).metadata();
  const imageWidth = metadata.width || 1920;
  const imageHeight = metadata.height || 1080;

  // Clamp values to image bounds.
  const left = Math.max(0, Math.round(boundingBox.x));
  const top = Math.max(0, Math.round(boundingBox.y));
  const width = Math.max(1, Math.round(boundingBox.width));
  const height = Math.max(1, Math.round(boundingBox.height));

  const safeWidth = Math.min(width, Math.max(1, imageWidth - left));
  const safeHeight = Math.min(height, Math.max(1, imageHeight - top));

  const buffer = await sharp(imagePath)
    .extract({ left, top, width: safeWidth, height: safeHeight })
    .png()
    .toBuffer();
  writeFileSync(outputPath, buffer);
}

/**
 * Calculate the position (top/middle/bottom) based on Y coordinates.
 */
function calculatePosition(
  startY: number,
  endY: number,
  imageHeight: number,
): "top" | "middle" | "bottom" {
  const midpoint = (startY + endY) / 2;
  const fraction = midpoint / Math.max(1, imageHeight);
  if (fraction < 0.33) return "top";
  if (fraction < 0.66) return "middle";
  return "bottom";
}

/**
 * System prompt for sequential section detection.
 * Defines what constitutes a section and how to identify boundaries.
 */
const SEQUENTIAL_SECTION_SYSTEM_PROMPT = `You are analyzing a webpage screenshot to identify the NEXT logical section.

CRITICAL: Be EXTREMELY granular. Each section must have ONE specific purpose. When in doubt, make it SMALLER.

These are ALWAYS separate sections (never combine them):
1. HEADER/NAVIGATION - The top bar with logo and menu links. STOP as soon as the nav ends.
2. HERO BANNER - Large headline/branding with a main image. STOP before any "about" or "who we are" text.
3. INTRODUCTION/ABOUT TEXT - A text block introducing the company (e.g., "Who We Are", "About Us"). STOP before any gallery or cards.
4. GALLERY/GRID - A collection of images or product cards. This is its own section.
5. FEATURES/HOW IT WORKS - Cards or steps explaining functionality.
6. TESTIMONIALS - Customer quotes or reviews.
7. PRICING - Pricing tables or plans.
8. FAQ - Questions and answers.
9. CTA BANNER - A call-to-action block.
10. FOOTER - Bottom links and copyright.

IMMEDIATE SECTION BOUNDARIES - Stop the current section when you see:
- A new heading text (like "WHO WE ARE", "OUR PRODUCTS", "HOW IT WORKS")
- A horizontal line or divider
- A significant whitespace gap
- Background color change
- Content type change (text → images, images → cards, etc.)
- Any element that starts a NEW topic

EXAMPLE: A page with:
- Nav bar at top → Section 1: "Header"
- Big logo + hero image → Section 2: "Hero Banner" 
- "Who We Are" heading + intro text → Section 3: "About/Introduction"
- Grid of product images → Section 4: "Gallery"

These are FOUR separate sections, not one!

NEVER include multiple topics in one section. If you see a hero AND an intro text AND a gallery, that's THREE sections.

Return JSON only.`;

/**
 * Detect the next section from a cropped image showing the remaining page.
 * Returns null if no more sections can be detected.
 */
async function detectNextSection(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number,
  currentAbsoluteY: number,
  fullPageHeight: number,
): Promise<SequentialSectionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "OPENAI_API_KEY not set; cannot detect sections via vision API.",
    );
    return null;
  }

  const model =
    process.env.OPENAI_SECTION_MODEL ||
    process.env.SECTION_EXTRACTION_MODEL ||
    "gpt-4o-mini";

  const userPrompt = `This image shows the REMAINING portion of a webpage.
- This cropped image starts at Y=${currentAbsoluteY}px of the full page.
- The full page height is ${fullPageHeight}px.
- This cropped image dimensions: width=${imageWidth}px, height=${imageHeight}px.

Identify ONLY the FIRST section visible at the TOP of this image. Be VERY specific and SMALL.

Ask yourself: What is the SINGLE purpose of the content at the very top?
- If it's a navigation bar → that's the section. STOP there.
- If it's a hero with big text/image → that's the section. STOP before any "about" text.
- If it's an intro heading like "Who We Are" → that's the section. STOP before any gallery.
- If it's a grid of images/products → that's the section.

Return JSON:
{
  "name": "Specific name (e.g., 'Navigation Header', 'Hero Banner', 'Who We Are Introduction', 'Product Gallery')",
  "sectionId": "kebab-case-id",
  "description": "The ONE specific purpose of this section",
  "endY": <number - where this SINGLE-PURPOSE section ends>,
  "hasMoreSections": <boolean - is there different content below?>
}

CRITICAL for endY - STOP the section as soon as you see:
- A new heading (e.g., "WHO WE ARE", "OUR PRODUCTS", "HOW IT WORKS")
- A change from hero/branding to text content
- A change from text to images/gallery
- A visual divider or significant whitespace
- Any indication of a NEW topic starting

DO NOT include multiple things in one section:
- Nav + Hero = TWO sections
- Hero + "About Us" text = TWO sections  
- Intro text + Gallery = TWO sections

The section should be as SMALL as possible while containing complete content for ONE purpose.

Return JSON only.`;

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SEQUENTIAL_SECTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    console.warn("No content in vision API response");
    return null;
  }

  const jsonString = extractJsonFromResponse(content);
  if (!jsonString) {
    console.warn("Could not extract JSON from response:", content);
    return null;
  }

  try {
    const parsed = JSON.parse(jsonString) as {
      name?: string;
      sectionId?: string;
      description?: string;
      endY?: number;
      hasMoreSections?: boolean;
    };

    if (!parsed.name || parsed.endY === undefined) {
      console.warn("Invalid section response:", parsed);
      return null;
    }

    // Validate and clamp endY.
    const endY = Math.min(Math.max(1, parsed.endY), imageHeight);

    return {
      name: parsed.name,
      sectionId: parsed.sectionId || toKebabCase(parsed.name),
      description: parsed.description || "",
      endY,
      hasMoreSections: parsed.hasMoreSections ?? false,
    };
  } catch (error) {
    console.warn("Failed to parse section JSON:", error);
    return null;
  }
}

/** Maximum number of sections to prevent infinite loops. */
const MAX_SECTIONS = 50;

/** Minimum section height in pixels. */
const MIN_SECTION_HEIGHT = 50;

/**
 * Extract visual sections sequentially, one at a time.
 *
 * This approach processes the page from top to bottom, detecting one section
 * at a time and immediately cropping it. Each section starts where the
 * previous one ended, ensuring contiguous coverage with no overlaps or gaps.
 */
export async function extractSectionsSequentially(
  screenshotPath: string,
  outputDir: string,
): Promise<SequentialSectionsResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Extracting visual sections sequentially\n${"=".repeat(50)}`,
  );

  const imageDimensions = getImageDimensions(screenshotPath);
  const imageWidth = imageDimensions.width;
  const imageHeight = imageDimensions.height;

  console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);

  const sections: DetectedSection[] = [];
  let currentY = 0;
  let sectionIndex = 0;

  while (currentY < imageHeight && sectionIndex < MAX_SECTIONS) {
    const remainingHeight = imageHeight - currentY;

    // If remaining height is too small, we're done.
    if (remainingHeight < MIN_SECTION_HEIGHT) {
      console.log(
        `Remaining height (${remainingHeight}px) below threshold, stopping.`,
      );
      break;
    }

    console.log(
      `\nProcessing section ${sectionIndex + 1} starting at Y=${currentY}px...`,
    );

    // Crop the remaining portion of the image.
    const croppedImage = await cropFromY(screenshotPath, currentY);

    // Ask AI to detect the next section.
    const result = await detectNextSection(
      croppedImage.base64,
      croppedImage.width,
      croppedImage.height,
      currentY,
      imageHeight,
    );

    if (!result) {
      console.log("No more sections detected, stopping.");
      break;
    }

    // Scale endY from the cropped thumbnail coordinates to original coordinates.
    // The cropped image was resized to maxWidth (1200), so we need to scale back.
    const scaleRatio = remainingHeight / croppedImage.height;
    const scaledEndY = Math.round(result.endY * scaleRatio);

    // Calculate absolute coordinates in the original image.
    const sectionStartY = currentY;
    const sectionEndY = Math.min(currentY + scaledEndY, imageHeight);
    const sectionHeight = sectionEndY - sectionStartY;

    // Ensure section has minimum height.
    if (sectionHeight < MIN_SECTION_HEIGHT) {
      console.log(
        `Section "${result.name}" height (${sectionHeight}px) below threshold, ` +
          `extending to minimum.`,
      );
    }

    const boundingBox = {
      x: 0,
      y: sectionStartY,
      width: imageWidth,
      height: Math.max(MIN_SECTION_HEIGHT, sectionHeight),
    };

    // Generate unique section ID if there are duplicates.
    let sectionId = result.sectionId;
    const existingIds = sections.map((s) => s.sectionId);
    if (existingIds.includes(sectionId)) {
      sectionId = `${sectionId}-${sectionIndex + 1}`;
    }

    // Crop and save the section immediately.
    const sectionPath = join(outputDir, `base_section_${sectionId}.png`);
    await cropSection(screenshotPath, sectionPath, boundingBox);

    const section: DetectedSection = {
      name: result.name,
      sectionId,
      description: result.description,
      boundingBox,
      position: calculatePosition(sectionStartY, sectionEndY, imageHeight),
      visualPatterns: "",
      screenshotPath: sectionPath,
    };

    sections.push(section);

    console.log(
      `  ✓ ${section.name} (${section.sectionId}): ` +
        `Y ${sectionStartY}px - ${sectionEndY}px ` +
        `(${boundingBox.width}x${boundingBox.height})`,
    );
    console.log(`    Screenshot saved: ${sectionPath}`);

    // Move to the next section.
    currentY = sectionEndY;
    sectionIndex++;

    // Check if there are more sections.
    if (!result.hasMoreSections) {
      console.log("AI indicated no more sections, stopping.");
      break;
    }
  }

  if (sections.length === 0) {
    // Fallback: treat entire image as one section.
    console.log("No sections detected, using entire image as one section.");
    const sectionPath = join(outputDir, "base_section_full-page.png");
    await cropSection(screenshotPath, sectionPath, {
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
    });

    sections.push({
      name: "Full Page",
      sectionId: "full-page",
      description: "Complete page content",
      boundingBox: { x: 0, y: 0, width: imageWidth, height: imageHeight },
      position: "middle",
      visualPatterns: "",
      screenshotPath: sectionPath,
    });
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`✓ Extracted ${sections.length} sections sequentially`);
  console.log(`${"=".repeat(50)}\n`);

  return {
    sections,
    layoutDescription: `Sequential extraction: ${sections.length} sections`,
    imageDimensions: { width: imageWidth, height: imageHeight },
  };
}

/** Section extraction via OpenAI vision API only. No Stagehand, no fallback. */
async function extractSectionsViaVisionAPI(
  screenshotPath: string,
): Promise<VisualSectionsResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "OPENAI_API_KEY not set; cannot extract sections via vision API.",
    );
    return null;
  }

  const thumbWidth = 1200;
  const thumbBuf = await sharp(screenshotPath)
    .resize({ width: thumbWidth, withoutEnlargement: true })
    .png()
    .toBuffer();
  const thumbMeta = await sharp(thumbBuf).metadata();
  const thumbW = thumbMeta.width || thumbWidth;
  const thumbH =
    thumbMeta.height ||
    Math.max(
      1,
      Math.round(
        (thumbWidth * (await sharp(screenshotPath).metadata()).height!) /
          Math.max(1, (await sharp(screenshotPath).metadata()).width!),
      ),
    );
  const thumbBase64 = thumbBuf.toString("base64");

  const imageMeta = await sharp(screenshotPath).metadata();
  const origW = imageMeta.width || thumbW;
  const origH = imageMeta.height || thumbH;

  const model =
    process.env.OPENAI_SECTION_MODEL ||
    process.env.SECTION_EXTRACTION_MODEL ||
    "gpt-4o-mini";

  const systemPrompt =
    "You are an expert visual analyst. You will be given a page thumbnail and must return valid JSON only describing logical page sections in order. For each section return sectionId (kebab-case), name, description, and a bbox in the thumbnail coordinate space: {x,y,width,height}. Do not produce any other text. Respond with JSON only.";

  const userText = `Identify complete, standalone website sections in this page thumbnail in top-to-bottom order. For each section return: sectionId (kebab-case), name, description (1 sentence), and bbox (x,y,width,height) in pixels relative to the thumbnail. Thumbnail dimensions: width=${thumbW}, height=${thumbH}. Avoid tiny decorative crops.

Include distinct sections such as: header/navigation, hero, how-it-works, testimonials (or quotes/reviews), pricing/packages, portfolio/gallery, services, FAQ, call-to-action, footer. Do not merge testimonial or quote blocks with adjacent sections; treat them as their own section (e.g. "Testimonials").

Return valid JSON only with this exact structure:
{
  "sections": [
    { "sectionId": "hero", "name": "Hero", "description": "Main headline and CTA", "bbox": { "x": 0, "y": 0, "width": 1200, "height": 400 } }
  ],
  "layoutDescription": "Optional short layout summary"
}`;

  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${thumbBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  const jsonString = extractJsonFromResponse(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as {
      sections?: Array<{
        sectionId?: string;
        name?: string;
        description?: string;
        bbox?: { x: number; y: number; width: number; height: number };
      }>;
      layoutDescription?: string;
    };
    if (!parsed.sections || !Array.isArray(parsed.sections)) return null;

    const sections: VisualSection[] = [];
    for (const s of parsed.sections) {
      if (!s.bbox) continue;
      const sectionId =
        s.sectionId || toKebabCase(s.name || `section-${sections.length + 1}`);
      const bx = Math.max(0, Math.round((s.bbox.x / thumbW) * origW));
      const by = Math.max(0, Math.round((s.bbox.y / thumbH) * origH));
      const bw = Math.max(1, Math.round((s.bbox.width / thumbW) * origW));
      const bh = Math.max(1, Math.round((s.bbox.height / thumbH) * origH));

      sections.push({
        name: s.name || sectionId,
        sectionId,
        description: s.description || "",
        boundingBox: { x: bx, y: by, width: bw, height: bh },
        position: "middle",
        visualPatterns: "",
      });
    }

    for (const s of sections) {
      const mid = s.boundingBox.y + s.boundingBox.height / 2;
      const frac = mid / Math.max(1, origH);
      s.position = frac < 0.33 ? "top" : frac < 0.66 ? "middle" : "bottom";
    }

    return {
      sections,
      layoutDescription:
        parsed.layoutDescription || "Sections from vision API.",
      imageDimensions: { width: origW, height: origH },
    };
  } catch {
    return null;
  }
}

export async function extractVisualSections(
  screenshotPath: string,
): Promise<VisualSectionsResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Extracting visual sections from screenshot\n${"=".repeat(50)}`,
  );

  const imageDimensions = getImageDimensions(screenshotPath);
  console.log(
    `Image dimensions: ${imageDimensions.width}x${imageDimensions.height}`,
  );

  const result = await extractSectionsViaVisionAPI(screenshotPath);
  if (!result || !result.sections || result.sections.length === 0) {
    throw new Error(
      "Section extraction returned no sections. Ensure OPENAI_API_KEY is set and the vision API returned valid JSON.",
    );
  }

  console.log(`Using vision API sections: ${result.sections.length}`);
  for (const section of result.sections) {
    console.log(
      `  - ${section.name} (${section.sectionId}): ${section.boundingBox.y}px - ${
        section.boundingBox.y + section.boundingBox.height
      }px (${section.boundingBox.width}x${section.boundingBox.height})`,
    );
  }

  return result;
}

export function formatVisualSectionsAsAnalysis(
  result: VisualSectionsResult,
): string {
  let output = `### Visual Section Analysis (vision API)\n`;
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
 * Format sequential sections result as analysis text.
 */
export function formatSequentialSectionsAsAnalysis(
  result: SequentialSectionsResult,
): string {
  let output = `### Visual Section Analysis (sequential extraction)\n`;
  output += `Layout: ${result.layoutDescription}\n\n`;
  output += `### Sections (in order of appearance):\n`;

  result.sections.forEach((section, index) => {
    output += `${index + 1}. ${section.name}\n`;
    output += `   - Section ID: ${section.sectionId}\n`;
    output += `   - Position: ${section.position}\n`;
    output += `   - Description: ${section.description}\n`;
    output += `   - Bounding Box: x=${section.boundingBox.x}, y=${section.boundingBox.y}, w=${section.boundingBox.width}, h=${section.boundingBox.height}\n`;
    output += `   - Screenshot: ${section.screenshotPath}\n\n`;
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
  pageSuffix: string,
): Promise<Record<string, string>> {
  const screenshots: Record<string, string> = {};
  const page = stagehand.context.pages()[0];

  // Get current viewport width (preserve it if already set to match base image).
  const currentViewport = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = (globalThis as any).window;
    return {
      width: win.innerWidth || 1920,
      height: win.innerHeight || 1080,
    };
  });
  const viewportWidth = currentViewport.width;

  // Navigate to the URL (viewport should already be set by caller).
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
      doc.documentElement.offsetHeight,
    );
  });

  // Set viewport to full page height while preserving width.
  page.setViewportSize(viewportWidth, fullPageHeight);

  for (const section of sections) {
    try {
      const outputPath = join(
        outputDir,
        `preview_screenshot_${pageSuffix}_section_${section.sectionId}.png`,
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

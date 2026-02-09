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
import { extractJsonFromResponse } from "../utils/json.js";

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

export interface VisualSectionSlice {
  sectionId: string;
  name: string;
  yStart: number;
  yEnd: number;
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

function normalizeSlices(
  slices: VisualSectionSlice[],
  imageHeight: number,
): VisualSectionSlice[] {
  const normalized: VisualSectionSlice[] = [];
  let prevEnd = 0;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    let yStart = Math.max(0, Math.round(slice.yStart));
    let yEnd = Math.min(imageHeight, Math.round(slice.yEnd));

    yStart = i === 0 ? 0 : prevEnd;
    if (i === slices.length - 1) {
      yEnd = imageHeight;
    } else {
      yEnd = Math.max(yEnd, yStart + 1);
    }

    if (yEnd < yStart) {
      yEnd = Math.min(imageHeight, yStart + 1);
    }

    normalized.push({ ...slice, yStart, yEnd });
    prevEnd = yEnd;
  }

  return normalized;
}

function slicesToSections(
  slices: VisualSectionSlice[],
  imageWidth: number,
  baseSections: VisualSection[],
): VisualSection[] {
  const baseById = new Map(baseSections.map((s) => [s.sectionId, s]));
  return slices.map((slice) => {
    const base = baseById.get(slice.sectionId);
    return {
      name: base?.name || slice.name,
      sectionId: slice.sectionId,
      description: base?.description || "",
      boundingBox: {
        x: 0,
        y: slice.yStart,
        width: imageWidth,
        height: Math.max(1, slice.yEnd - slice.yStart),
      },
      position: base?.position || "middle",
      visualPatterns: base?.visualPatterns || "full-width slice",
    };
  });
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

Include distinct sections such as: header/navigation, client logos, social proof, logo clouds, teasers, hero, how-it-works, testimonials (or quotes/reviews), pricing/packages, portfolio/gallery, services, FAQ, call-to-action, footer. These are just examples you should be able to judge and detect sections not highlighted here.

Make sure sections end on a whitespace or at least they do not cut content in the middle of a section.

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

async function refineSectionSlicesViaVisionAPI(
  screenshotPath: string,
  sections: VisualSection[],
): Promise<{
  slices: VisualSectionSlice[];
  imageDimensions: { width: number; height: number };
  layoutDescription: string;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "OPENAI_API_KEY not set; cannot refine section slices via vision API.",
    );
    return null;
  }

  const thumbWidth = Number(process.env.OPENAI_SLICE_THUMB_WIDTH || 1600);
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
    process.env.OPENAI_SECTION_SLICE_MODEL ||
    process.env.OPENAI_SECTION_MODEL ||
    process.env.SECTION_EXTRACTION_MODEL ||
    "gpt-4o";

  const systemPrompt =
    "You are an expert visual analyst. You will be given a page screenshot thumbnail and a list of detected sections (in order). Return JSON only with clean horizontal slice boundaries for each section. Do not reorder or rename sections. No extra text.";

  const sectionsList = sections
    .map((s, i) => `${i + 1}. ${s.name} (id: ${s.sectionId})`)
    .join("\n");

  const userText = `You are given the full page thumbnail and a list of sections in order. Your task: determine the exact horizontal cut lines so each section becomes a full-width slice. Return yStart/yEnd for each section in thumbnail pixel coordinates.

Constraints:
- Preserve section order and IDs exactly.
- Full-width slices only (x=0..width). Only return yStart/yEnd.
- No overlaps. Slices must be contiguous.
- First slice yStart must be 0. Last slice yEnd must be ${thumbH}.
- Each slice must have yEnd > yStart.
- Cut lines must fall between sections in visual whitespace.
- Never cut through headings, buttons, or images. If a boundary intersects content, move it to the nearest blank gap.
- If unsure, bias toward including the full heading of the upper section.

Thumbnail dimensions: width=${thumbW}, height=${thumbH}.

Sections (in order):
${sectionsList}

Return valid JSON only in this structure:
{
  "slices": [
    { "sectionId": "hero", "name": "Hero", "yStart": 0, "yEnd": 420 }
  ],
  "layoutDescription": "Short optional summary"
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
    max_tokens: 2048,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;

  const jsonString = extractJsonFromResponse(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as {
      slices?: Array<{
        sectionId?: string;
        name?: string;
        yStart?: number;
        yEnd?: number;
      }>;
      layoutDescription?: string;
    };
    if (!parsed.slices || !Array.isArray(parsed.slices)) return null;

    const slices: VisualSectionSlice[] = [];
    for (const s of parsed.slices) {
      if (s.yStart == null || s.yEnd == null) continue;
      const sectionId = s.sectionId || "";
      const name = s.name || sectionId;
      const yStart = Math.max(0, Math.round((s.yStart / thumbH) * origH));
      const yEnd = Math.max(1, Math.round((s.yEnd / thumbH) * origH));
      slices.push({ sectionId, name, yStart, yEnd });
    }

    return {
      slices,
      imageDimensions: { width: origW, height: origH },
      layoutDescription:
        parsed.layoutDescription || "Slices refined via vision API.",
    };
  } catch {
    return null;
  }
}

async function computeRowVarianceMap(
  imagePath: string,
  targetWidth = 600,
): Promise<{
  rowScores: number[];
  scaledHeight: number;
  scaleY: number;
  origHeight: number;
  stats: { p25: number; median: number; p75: number };
}> {
  const imageMeta = await sharp(imagePath).metadata();
  const origHeight = imageMeta.height || 1080;

  const { data, info } = await sharp(imagePath)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const rowScores = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y++) {
    let sum = 0;
    let sumSq = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx] || 0;
      const g = data[idx + 1] || 0;
      const b = data[idx + 2] || 0;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += lum;
      sumSq += lum * lum;
    }
    const mean = sum / width;
    const variance = Math.max(0, sumSq / width - mean * mean);
    rowScores[y] = variance;
  }

  const smoothed = rowScores.map((value, i) => {
    const prev = rowScores[i - 1] ?? value;
    const next = rowScores[i + 1] ?? value;
    return (prev + value + next) / 3;
  });

  const sorted = [...smoothed].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)))] ??
    0;

  return {
    rowScores: smoothed,
    scaledHeight: height,
    scaleY: origHeight / Math.max(1, height),
    origHeight,
    stats: { p25: q(0.25), median: q(0.5), p75: q(0.75) },
  };
}

function snapBoundaryToWhitespace(
  y: number,
  rowScores: number[],
  scaleY: number,
  stats: { p25: number; median: number; p75: number },
  searchRadiusPx = 48,
  windowPx = 12,
  minImprovementRatio = 0.12,
): number {
  const scaledY = Math.max(
    0,
    Math.min(rowScores.length - 1, Math.round(y / scaleY)),
  );
  const radius = Math.max(
    1,
    Math.round(searchRadiusPx / Math.max(0.01, scaleY)),
  );
  const start = Math.max(0, scaledY - radius);
  const end = Math.min(rowScores.length - 1, scaledY + radius);

  const prefix = new Array<number>(rowScores.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < rowScores.length; i++) {
    prefix[i + 1] = prefix[i] + rowScores[i];
  }
  const windowRadius = Math.max(0, Math.round(windowPx / 2 / Math.max(0.01, scaleY)));
  const windowAvg = (idx: number) => {
    const wStart = Math.max(0, idx - windowRadius);
    const wEnd = Math.min(rowScores.length - 1, idx + windowRadius);
    const sum = prefix[wEnd + 1] - prefix[wStart];
    return sum / Math.max(1, wEnd - wStart + 1);
  };

  let bestIdx = scaledY;
  let bestScore = windowAvg(scaledY);

  for (let i = start; i <= end; i++) {
    const score = windowAvg(i);
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const originalScore = windowAvg(scaledY);
  const improvement =
    originalScore > 0 ? (originalScore - bestScore) / originalScore : 0;

  const shouldSnap =
    bestIdx !== scaledY &&
    (improvement >= minImprovementRatio ||
      originalScore >= stats.p75 ||
      bestScore <= stats.p25);

  if (shouldSnap) {
    return Math.round(bestIdx * scaleY);
  }

  return y;
}

export async function snapSliceBoundariesToWhitespace(
  imagePath: string,
  slices: VisualSectionSlice[],
  imageHeight: number,
): Promise<VisualSectionSlice[]> {
  if (slices.length === 0) return slices;

  const debug = process.env.BRUNI_DEBUG_SECTION_SLICES === "1";
  const { rowScores, scaleY, stats } = await computeRowVarianceMap(imagePath);
  const searchRadiusPx = Number(
    process.env.BRUNI_SLICE_SNAP_RADIUS_PX || 48,
  );
  const windowPx = Number(process.env.BRUNI_SLICE_SNAP_WINDOW_PX || 12);
  const minImprovementRatio = Number(
    process.env.BRUNI_SLICE_SNAP_MIN_IMPROVEMENT || 0.12,
  );

  const adjusted: VisualSectionSlice[] = [];
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    let yStart = slice.yStart;
    let yEnd = slice.yEnd;

    if (i < slices.length - 1) {
      const snapped = snapBoundaryToWhitespace(
        yEnd,
        rowScores,
        scaleY,
        stats,
        searchRadiusPx,
        windowPx,
        minImprovementRatio,
      );
      if (debug && snapped !== yEnd) {
        console.log(
          `Slice ${slice.sectionId}: yEnd ${yEnd} -> ${snapped} (snap)`,
        );
      }
      yEnd = snapped;
    } else {
      yEnd = imageHeight;
    }

    if (yEnd <= yStart) {
      yEnd = Math.min(imageHeight, yStart + 1);
    }

    adjusted.push({ ...slice, yStart, yEnd });
  }

  return adjusted;
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

export async function refineVisualSectionSlices(
  screenshotPath: string,
  baseSections: VisualSection[],
): Promise<{
  slices: VisualSectionSlice[];
  sections: VisualSection[];
  layoutDescription: string;
  imageDimensions: { width: number; height: number };
} | null> {
  const imageDimensions = getImageDimensions(screenshotPath);
  const result = await refineSectionSlicesViaVisionAPI(
    screenshotPath,
    baseSections,
  );
  if (!result || !result.slices || result.slices.length === 0) {
    return null;
  }

  const sliceById = new Map(
    result.slices.map((slice) => [slice.sectionId, slice]),
  );

  const orderedSlices: VisualSectionSlice[] = [];
  for (const section of baseSections) {
    const matched = sliceById.get(section.sectionId);
    if (!matched) {
      return null;
    }
    orderedSlices.push({
      sectionId: section.sectionId,
      name: section.name,
      yStart: matched.yStart,
      yEnd: matched.yEnd,
    });
  }

  const snappedSlices = await snapSliceBoundariesToWhitespace(
    screenshotPath,
    orderedSlices,
    imageDimensions.height,
  );
  const normalized = normalizeSlices(snappedSlices, imageDimensions.height);
  const sections = slicesToSections(
    normalized,
    imageDimensions.width,
    baseSections,
  );

  return {
    slices: normalized,
    sections,
    layoutDescription: result.layoutDescription,
    imageDimensions,
  };
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
  indexBySectionId?: Map<string, number>,
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
      const index = indexBySectionId?.get(section.sectionId);
      const indexPrefix = index ? `${String(index).padStart(2, "0")}_` : "";
      const outputPath = join(
        outputDir,
        `preview_screenshot_${pageSuffix}_section_${indexPrefix}${section.sectionId}.png`,
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

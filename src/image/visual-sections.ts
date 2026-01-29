/**
 * Visual section detection for screenshot/image baselines.
 *
 * This does not rely on DOM structure. It first bands the image into
 * deterministic horizontal slices, then labels each band with a vision model.
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

const VisualSectionListSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string(),
      sectionId: z.string().optional(),
      description: z.string().optional(),
      visualPatterns: z.string().optional(),
      anchorText: z.string().optional(),
    }),
  ),
  layoutDescription: z.string().optional(),
});

// createImageAnalysisHtml removed in favor of createBandAnalysisHtml

function createFullPageAnalysisHtml(
  fullImagePath: string,
  imageWidth: number,
  imageHeight: number,
): string {
  const fullBuffer = readFileSync(fullImagePath);
  const fullBase64 = fullBuffer.toString("base64");
  const mimeType = fullImagePath.endsWith(".png") ? "image/png" : "image/jpeg";
  const displayWidth = Math.min(900, imageWidth);
  const scale = displayWidth / Math.max(1, imageWidth);
  const displayHeight = Math.round(imageHeight * scale);

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
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { font-size: 18px; margin-bottom: 10px; color: #888; }
    .full-image {
      position: relative;
      display: inline-block;
      border: 2px solid #333;
      background: #111;
    }
    .full-image img { display: block; width: ${displayWidth}px; height: ${displayHeight}px; }
    .info { font-size: 13px; color: #666; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Full Page Screenshot</h1>
    <div class="full-image">
      <img src="data:${mimeType};base64,${fullBase64}" alt="Full page" />
    </div>
    <div class="info">
      Image dimensions: ${imageWidth}x${imageHeight}px.
    </div>
  </div>
</body>
</html>
  `;
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

const BANDING_TARGET_WIDTH = 360;
const BANDING_MAX_HEIGHT = 2400;
const MIN_SECTION_HEIGHT = 100;
const MAX_SECTION_COUNT = 12;

type SectionBand = {
  start: number;
  end: number;
};

function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isGenericSectionName(value: string): boolean {
  const normalized = normalizeName(value);
  if (!normalized) return true;
  const tokens = normalized.split(" ").filter(Boolean);
  const genericTokens = new Set([
    "content",
    "section",
    "block",
    "area",
    "band",
    "panel",
    "layout",
    "general",
    "information",
  ]);
  if (tokens.length <= 2 && tokens.every((token) => genericTokens.has(token))) {
    return true;
  }
  if (
    normalized.includes("content section") ||
    normalized.includes("content block") ||
    normalized.includes("content area")
  ) {
    return true;
  }
  return false;
}

function smoothArray(values: number[], windowSize: number): number[] {
  const half = Math.floor(windowSize / 2);
  const smoothed = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= values.length) continue;
      sum += values[j];
      count += 1;
    }
    smoothed[i] = count ? sum / count : values[i];
  }
  return smoothed;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

async function computeRowStats(imagePath: string): Promise<{
  width: number;
  height: number;
  rowMeanR: number[];
  rowMeanG: number[];
  rowMeanB: number[];
  rowEdge: number[];
}> {
  const { data, info } = await sharp(imagePath)
    .resize({
      width: BANDING_TARGET_WIDTH,
      height: BANDING_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const rowMeanR = new Array<number>(height).fill(0);
  const rowMeanG = new Array<number>(height).fill(0);
  const rowMeanB = new Array<number>(height).fill(0);
  const rowEdge = new Array<number>(height).fill(0);

  for (let y = 0; y < height; y++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let edge = 0;
    let prevLum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = channels > 1 ? data[idx + 1] : r;
      const b = channels > 2 ? data[idx + 2] : r;
      sumR += r;
      sumG += g;
      sumB += b;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (x > 0) {
        edge += Math.abs(lum - prevLum);
      }
      prevLum = lum;
    }
    rowMeanR[y] = sumR / Math.max(1, width);
    rowMeanG[y] = sumG / Math.max(1, width);
    rowMeanB[y] = sumB / Math.max(1, width);
    rowEdge[y] = edge / Math.max(1, width - 1);
  }

  return { width, height, rowMeanR, rowMeanG, rowMeanB, rowEdge };
}

function computeBoundaryCandidates(stats: {
  width: number;
  height: number;
  rowMeanR: number[];
  rowMeanG: number[];
  rowMeanB: number[];
  rowEdge: number[];
}): number[] {
  const scores = new Array<number>(stats.height).fill(0);
  for (let y = 1; y < stats.height; y++) {
    const dr = stats.rowMeanR[y] - stats.rowMeanR[y - 1];
    const dg = stats.rowMeanG[y] - stats.rowMeanG[y - 1];
    const db = stats.rowMeanB[y] - stats.rowMeanB[y - 1];
    const colorDelta = Math.sqrt(dr * dr + dg * dg + db * db) / 255;
    const edgeDelta =
      Math.abs(stats.rowEdge[y] - stats.rowEdge[y - 1]) / 255;
    scores[y] = colorDelta * 0.7 + edgeDelta * 0.3;
  }

  const smoothed = smoothArray(scores, 5);
  const mean = smoothed.reduce((sum, v) => sum + v, 0) / Math.max(1, smoothed.length);
  const variance =
    smoothed.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) /
    Math.max(1, smoothed.length);
  const std = Math.sqrt(Math.max(0, variance));
  const threshold = mean + std * 0.8;

  const candidates: number[] = [];
  const peaks: Array<{ y: number; score: number }> = [];
  for (let y = 1; y < smoothed.length - 1; y++) {
    if (
      smoothed[y] >= threshold &&
      smoothed[y] >= smoothed[y - 1] &&
      smoothed[y] >= smoothed[y + 1]
    ) {
      candidates.push(y);
    }
    if (
      smoothed[y] >= smoothed[y - 1] &&
      smoothed[y] >= smoothed[y + 1]
    ) {
      peaks.push({ y, score: smoothed[y] });
    }
  }

  const lowEdgeThreshold = percentile(stats.rowEdge, 0.2);
  const minGapRows = Math.max(4, Math.round(stats.height * 0.01));
  let gapStart: number | null = null;
  for (let y = 0; y < stats.height; y++) {
    if (stats.rowEdge[y] <= lowEdgeThreshold) {
      if (gapStart === null) gapStart = y;
      continue;
    }
    if (gapStart !== null) {
      const gapLength = y - gapStart;
      if (gapLength >= minGapRows) {
        candidates.push(gapStart + Math.floor(gapLength / 2));
      }
      gapStart = null;
    }
  }
  if (gapStart !== null) {
    const gapLength = stats.height - gapStart;
    if (gapLength >= minGapRows) {
      candidates.push(gapStart + Math.floor(gapLength / 2));
    }
  }

  if (candidates.length < 2 && peaks.length > 0) {
    const minPeakDistance = Math.max(6, Math.round(stats.height * 0.02));
    const sortedPeaks = [...peaks].sort((a, b) => b.score - a.score);
    const picked: number[] = [];
    for (const peak of sortedPeaks) {
      if (picked.length >= 6) break;
      if (picked.every((p) => Math.abs(p - peak.y) >= minPeakDistance)) {
        picked.push(peak.y);
      }
    }
    candidates.push(...picked);
  }

  return candidates;
}

function buildBands(boundaries: number[], height: number): SectionBand[] {
  const clamped = boundaries
    .map((v) => Math.max(0, Math.min(height, v)))
    .filter((v) => Number.isFinite(v));
  const sorted = uniqueSorted([0, ...clamped, height]);
  const bands: SectionBand[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end > start) {
      bands.push({ start, end });
    }
  }
  return bands;
}

function mergeSmallBands(bands: SectionBand[], minHeight: number): SectionBand[] {
  if (bands.length === 0) return [];
  const merged: SectionBand[] = [];
  let pendingStart: number | null = null;

  for (const band of bands) {
    const height = band.end - band.start;
    if (height < minHeight) {
      if (merged.length > 0) {
        merged[merged.length - 1].end = band.end;
        continue;
      }
      if (pendingStart === null) {
        pendingStart = band.start;
      }
      continue;
    }

    if (pendingStart !== null) {
      band.start = pendingStart;
      pendingStart = null;
    }
    merged.push({ ...band });
  }

  if (pendingStart !== null && merged.length > 0) {
    merged[0].start = pendingStart;
  }

  return merged.length ? merged : bands;
}

function limitBandCount(bands: SectionBand[], maxBands: number): SectionBand[] {
  let current = [...bands];
  while (current.length > maxBands) {
    let smallestIndex = 0;
    let smallestHeight = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < current.length; i++) {
      const height = current[i].end - current[i].start;
      if (height < smallestHeight) {
        smallestHeight = height;
        smallestIndex = i;
      }
    }

    if (current.length <= 1) break;
    const mergeIndex =
      smallestIndex === 0
        ? 1
        : smallestIndex === current.length - 1
          ? smallestIndex - 1
          : (current[smallestIndex - 1].end - current[smallestIndex - 1].start) <=
              (current[smallestIndex + 1].end - current[smallestIndex + 1].start)
            ? smallestIndex - 1
            : smallestIndex + 1;

    const target = current[mergeIndex];
    const source = current[smallestIndex];
    const start = Math.min(target.start, source.start);
    const end = Math.max(target.end, source.end);
    const newBand = { start, end };

    const newBands = current.filter((_, idx) => idx !== mergeIndex && idx !== smallestIndex);
    newBands.splice(Math.min(mergeIndex, smallestIndex), 0, newBand);
    current = newBands.sort((a, b) => a.start - b.start);
  }
  return current;
}

function computeSectionBandsFromStats(
  stats: {
    width: number;
    height: number;
    rowMeanR: number[];
    rowMeanG: number[];
    rowMeanB: number[];
    rowEdge: number[];
  },
  imageHeight: number,
  boundaries?: number[],
): SectionBand[] {
  const boundaryList = boundaries ?? computeBoundaryCandidates(stats);
  let bands = buildBands(boundaryList, stats.height);

  const scale = imageHeight / Math.max(1, stats.height);
  bands = bands.map((band) => {
    const start = Math.max(0, Math.round(band.start * scale));
    const scaledEnd = Math.max(1, Math.round(band.end * scale));
    const end = Math.max(start + 1, scaledEnd);
    return { start, end };
  });

  bands = mergeSmallBands(bands, MIN_SECTION_HEIGHT);
  bands = limitBandCount(bands, MAX_SECTION_COUNT);
  bands = bands.sort((a, b) => a.start - b.start);

  if (bands.length <= 1) {
    const maxByHeight = Math.max(1, Math.floor(imageHeight / MIN_SECTION_HEIGHT));
    const estimatedCount = Math.max(2, Math.round(imageHeight / 600));
    const count = Math.min(MAX_SECTION_COUNT, maxByHeight, estimatedCount);
    if (count > 1) {
      const step = imageHeight / count;
      const fallbackBands: SectionBand[] = [];
      for (let i = 0; i < count; i++) {
        const start = Math.round(i * step);
        const end = i === count - 1 ? imageHeight : Math.max(start + 1, Math.round((i + 1) * step));
        fallbackBands.push({ start, end });
      }
      return fallbackBands;
    }
  }

  if (bands.length === 0) {
    return [{ start: 0, end: imageHeight }];
  }

  bands[0].start = 0;
  bands[bands.length - 1].end = imageHeight;
  return bands;
}

type BandStats = {
  avgR: number;
  avgG: number;
  avgB: number;
  avgEdge: number;
};

function computeBandStats(
  stats: {
    height: number;
    rowMeanR: number[];
    rowMeanG: number[];
    rowMeanB: number[];
    rowEdge: number[];
  },
  bands: SectionBand[],
  imageHeight: number,
): BandStats[] {
  const scale = stats.height / Math.max(1, imageHeight);
  return bands.map((band) => {
    const start = Math.max(0, Math.floor(band.start * scale));
    const end = Math.max(start + 1, Math.min(stats.height, Math.ceil(band.end * scale)));
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumEdge = 0;
    let count = 0;
    for (let y = start; y < end; y++) {
      sumR += stats.rowMeanR[y];
      sumG += stats.rowMeanG[y];
      sumB += stats.rowMeanB[y];
      sumEdge += stats.rowEdge[y];
      count += 1;
    }
    const denom = Math.max(1, count);
    return {
      avgR: sumR / denom,
      avgG: sumG / denom,
      avgB: sumB / denom,
      avgEdge: sumEdge / denom,
    };
  });
}

function bandSimilarity(a: BandStats, b: BandStats): number {
  const dr = (a.avgR - b.avgR) / 255;
  const dg = (a.avgG - b.avgG) / 255;
  const db = (a.avgB - b.avgB) / 255;
  const color = Math.sqrt(dr * dr + dg * dg + db * db);
  const edge = Math.abs(a.avgEdge - b.avgEdge) / 255;
  return color * 0.7 + edge * 0.3;
}

function mergeBandStats(
  a: BandStats,
  b: BandStats,
  aHeight: number,
  bHeight: number,
): BandStats {
  const total = Math.max(1, aHeight + bHeight);
  return {
    avgR: (a.avgR * aHeight + b.avgR * bHeight) / total,
    avgG: (a.avgG * aHeight + b.avgG * bHeight) / total,
    avgB: (a.avgB * aHeight + b.avgB * bHeight) / total,
    avgEdge: (a.avgEdge * aHeight + b.avgEdge * bHeight) / total,
  };
}

function buildUniformBands(imageHeight: number, count: number): SectionBand[] {
  const safeCount = Math.max(1, count);
  const step = imageHeight / safeCount;
  const bands: SectionBand[] = [];
  for (let i = 0; i < safeCount; i++) {
    const start = Math.round(i * step);
    const end =
      i === safeCount - 1
        ? imageHeight
        : Math.max(start + 1, Math.round((i + 1) * step));
    bands.push({ start, end });
  }
  if (bands.length > 0) {
    bands[0].start = 0;
    bands[bands.length - 1].end = imageHeight;
  }
  return bands;
}

function mergeBandsToTargetCount(
  bands: SectionBand[],
  stats: BandStats[],
  targetCount: number,
): { bands: SectionBand[]; stats: BandStats[] } {
  let currentBands = [...bands];
  let currentStats = [...stats];
  const target = Math.max(1, targetCount);

  while (currentBands.length > target && currentBands.length > 1) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < currentBands.length - 1; i++) {
      const score = bandSimilarity(currentStats[i], currentStats[i + 1]);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const first = currentBands[bestIndex];
    const second = currentBands[bestIndex + 1];
    const mergedBand: SectionBand = {
      start: Math.min(first.start, second.start),
      end: Math.max(first.end, second.end),
    };
    const mergedStats = mergeBandStats(
      currentStats[bestIndex],
      currentStats[bestIndex + 1],
      first.end - first.start,
      second.end - second.start,
    );

    const nextBands = currentBands.filter((_, idx) => idx !== bestIndex + 1);
    const nextStats = currentStats.filter((_, idx) => idx !== bestIndex + 1);
    nextBands[bestIndex] = mergedBand;
    nextStats[bestIndex] = mergedStats;
    currentBands = nextBands;
    currentStats = nextStats;
  }

  return { bands: currentBands, stats: currentStats };
}

async function extractSectionListFromFullImage(
  stagehand: Stagehand,
  screenshotPath: string,
  imageDimensions: { width: number; height: number },
  tempDir: string,
  uniqueId: string,
): Promise<{
  sections: Array<{
    name: string;
    sectionId?: string;
    description?: string;
    visualPatterns?: string;
    anchorText?: string;
  }>;
  layoutDescription: string;
}> {
  const tempHtmlPath = join(
    tempDir,
    `temp-visual-sections-${uniqueId}-full.html`,
  );
  const analysisHtml = createFullPageAnalysisHtml(
    screenshotPath,
    imageDimensions.width,
    imageDimensions.height,
  );
  writeFileSync(tempHtmlPath, analysisHtml, "utf-8");

  const agent = stagehand.agent({
    model: "openai/gpt-4o-mini",
    systemPrompt:
      "You are an expert visual analysis assistant specializing in identifying logical website sections from full-page screenshots. You must respond with valid JSON only.",
  });

  const page = await stagehand.context.newPage();
  try {
    await page.goto(`file://${tempHtmlPath}`, {
      waitUntil: "networkidle",
      timeoutMs: 30000,
    });

    const instruction = `
Analyze the full-page screenshot and identify the major visual sections in order from top to bottom.
Each section should make sense as a standalone website section.

For each section, provide:
- name: short label (e.g., "Hero", "About", "What We Do", "Testimonials", "CTA", "Footer")
- sectionId: optional kebab-case id
- description: short summary of the content
- visualPatterns: key visual traits
- anchorText: the most prominent heading or text that anchors the section

Avoid generic names like "Content Section" unless there is no clear type. If unsure, use the anchorText.

Return JSON only with this exact structure:
{
  "sections": [
    {
      "name": "Section name",
      "sectionId": "kebab-case-id",
      "description": "Short description",
      "visualPatterns": "Key visual traits",
      "anchorText": "Prominent heading or text"
    }
  ],
  "layoutDescription": "Overall layout summary"
}
`;

    const resultAgent = await agent.execute({
      instruction,
      maxSteps: 8,
      highlightCursor: false,
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

    const jsonString = extractJsonFromResponse(agentResponse);
    if (!jsonString) {
      return { sections: [], layoutDescription: "" };
    }
    try {
      const parsed = VisualSectionListSchema.parse(JSON.parse(jsonString));
      return {
        sections: parsed.sections,
        layoutDescription: parsed.layoutDescription || "",
      };
    } catch {
      return { sections: [], layoutDescription: "" };
    }
  } finally {
    await page.close();
    try {
      unlinkSync(tempHtmlPath);
    } catch {
      // Ignore.
    }
  }
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

export async function extractVisualSections(
  stagehand: Stagehand,
  screenshotPath: string,
): Promise<VisualSectionsResult> {
  console.log(
    `\n${"=".repeat(50)}\n🔍 Extracting visual sections from screenshot\n${"=".repeat(50)}`,
  );

  const imageDimensions = getImageDimensions(screenshotPath);
  console.log(
    `Image dimensions: ${imageDimensions.width}x${imageDimensions.height}`,
  );

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const uniqueId = uuidv4();
  const tempDir = join(__dirname, "..", "..");

  const rowStats = await computeRowStats(screenshotPath);
  const boundaries = computeBoundaryCandidates(rowStats);
  const bands = computeSectionBandsFromStats(
    rowStats,
    imageDimensions.height,
    boundaries,
  );
  const bandStats = computeBandStats(
    rowStats,
    bands,
    imageDimensions.height,
  );
  console.log(`Banding produced ${bands.length} candidate sections`);

  const sectionListResult = await extractSectionListFromFullImage(
    stagehand,
    screenshotPath,
    imageDimensions,
    tempDir,
    uniqueId,
  );
  const sectionList = sectionListResult.sections;
  const targetCount = sectionList.length > 0 ? sectionList.length : bands.length;

  let adjustedBands = bands;
  let adjustedStats = bandStats;

  if (adjustedBands.length > targetCount) {
    const mergedResult = mergeBandsToTargetCount(
      adjustedBands,
      adjustedStats,
      targetCount,
    );
    adjustedBands = mergedResult.bands;
    adjustedStats = mergedResult.stats;
  } else if (adjustedBands.length < targetCount) {
    adjustedBands = buildUniformBands(imageDimensions.height, targetCount);
    adjustedStats = computeBandStats(
      rowStats,
      adjustedBands,
      imageDimensions.height,
    );
  }

  const sections: VisualSection[] = adjustedBands.map((band, index) => {
    const info = sectionList[index];
    const fallbackName = `Section ${index + 1}`;
    const rawName = info?.name?.trim() || fallbackName;
    const anchorText = info?.anchorText?.trim();
    const name = isGenericSectionName(rawName) && anchorText
      ? anchorText
      : rawName;
    const sectionIdBase = info?.sectionId || name || anchorText || fallbackName;
    const sectionId = toKebabCase(sectionIdBase) || `section-${index + 1}`;
    const description = info?.description?.trim() ||
      (anchorText
        ? `Section anchored by "${anchorText}".`
        : `Section ${index + 1} from full-page analysis.`);
    const visualPatterns = info?.visualPatterns?.trim() ||
      "Section with mixed content and standard layout.";
    const height = Math.max(1, band.end - band.start);

    return {
      name,
      sectionId,
      description,
      boundingBox: {
        x: 0,
        y: band.start,
        width: imageDimensions.width,
        height,
      },
      position: "middle",
      visualPatterns,
    };
  });

  const seenIds = new Map<string, number>();
  for (const s of sections) {
    const normalized = toKebabCase(s.sectionId || s.name) || s.sectionId;
    s.sectionId = normalized || s.sectionId;
    const count = seenIds.get(s.sectionId) || 0;
    if (count > 0) {
      s.sectionId = `${s.sectionId}-${count + 1}`;
    }
    seenIds.set(s.sectionId, count + 1);
  }

  for (const s of sections) {
    const mid = s.boundingBox.y + s.boundingBox.height / 2;
    const frac = mid / Math.max(1, imageDimensions.height);
    s.position = frac < 0.33 ? "top" : frac < 0.66 ? "middle" : "bottom";
  }

  const minHeight = Math.max(60, Math.round(MIN_SECTION_HEIGHT * 0.6));
  const filtered = sections.filter((s) => {
    const h = s.boundingBox.height;
    if (h < minHeight) {
      console.log(
        `  Filtering out ${s.sectionId}: height ${h}px < ${minHeight}px (too small)`,
      );
      return false;
    }
    return true;
  });

  const finalSections = filtered.length > 0 ? filtered : sections;

  console.log(
    `Detected ${finalSections.length} visual sections (banded from ${bands.length})`,
  );
  for (const section of finalSections) {
    console.log(
      `  - ${section.name} (${section.sectionId}): ${section.boundingBox.y}px - ${
        section.boundingBox.y + section.boundingBox.height
      }px (${section.boundingBox.width}x${section.boundingBox.height})`,
    );
  }

  return {
    sections: finalSections,
    layoutDescription:
      sectionListResult.layoutDescription ||
      "Layout derived from full-page section analysis and banded bounds.",
    imageDimensions: {
      width: imageDimensions.width,
      height: imageDimensions.height,
    },
  };
}

export function formatVisualSectionsAsAnalysis(
  result: VisualSectionsResult,
): string {
  let output = `### Visual Section Analysis (full-page list + banded bounds)\n`;
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

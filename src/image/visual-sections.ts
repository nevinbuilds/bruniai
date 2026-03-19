/**
 * Deterministic section detection and matching for image-to-URL comparisons.
 *
 * This module intentionally avoids LLM-based section extraction. It trims
 * uniform margins from the design image, segments the design into full-width
 * vertical sections, and matches each section against the normalized webpage
 * screenshot using structural similarity.
 */

import sharp from "sharp";

export interface VisualSection {
  name: string;
  sectionId: string;
  description: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  position: "top" | "middle" | "bottom";
  visualPatterns: string;
}

export interface VisualSectionsResult {
  sections: VisualSection[];
  layoutDescription: string;
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

export interface TrimResult {
  outputPath: string;
  originalDimensions: {
    width: number;
    height: number;
  };
  trimmedDimensions: {
    width: number;
    height: number;
  };
  trim: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  backgroundColor: {
    r: number;
    g: number;
    b: number;
  };
}

export interface SectionRange {
  startY: number;
  endY: number;
}

export interface VisualSectionMatch {
  sectionId: string;
  name: string;
  description: string;
  designRange: SectionRange;
  matchedRange: SectionRange | null;
  matchScore: number;
  similarityScore: number;
  status: "matched" | "problematic" | "missing";
}

interface RawImage {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

interface MatchingFeatures {
  width: number;
  height: number;
  grayscale: Float64Array;
  edgeMap: Float64Array;
}

const MIN_SECTION_HEIGHT = 160;
const MERGE_BOUNDARY_GAP = 120;
const TARGET_SECTION_HEIGHT = 260;
const MATCH_STEP = 32;
const LOCAL_SEARCH_BAND = 300;
const MISSING_MATCH_THRESHOLD = 0.55;
const PROBLEMATIC_SECTION_THRESHOLD = 0.75;
const MATCH_TIE_BAND = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function movingAverage(values: number[], radius: number): number[] {
  if (values.length === 0) return [];

  const prefix = new Array<number>(values.length + 1).fill(0);
  for (let i = 0; i < values.length; i++) {
    prefix[i + 1] = prefix[i] + values[i];
  }

  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length - 1, index + radius);
    const sum = prefix[end + 1] - prefix[start];
    return sum / Math.max(1, end - start + 1);
  });
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round((sorted.length - 1) * clamp(ratio, 0, 1));
  return sorted[index] ?? 0;
}

function normalizeSeries(values: number[]): number[] {
  const max = values.reduce((best, value) => Math.max(best, value), 0);
  if (max <= 0) {
    return values.map(() => 0);
  }
  return values.map((value) => value / max);
}

function toKebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

async function loadRawImage(imagePath: string): Promise<RawImage> {
  const { data, info } = await sharp(imagePath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

async function writeRawImage(image: RawImage, outputPath: string): Promise<void> {
  await sharp(image.data, {
    raw: {
      width: image.width,
      height: image.height,
      channels: image.channels as 1 | 2 | 3 | 4,
    },
  })
    .png()
    .toFile(outputPath);
}

function getPixelOffset(image: RawImage, x: number, y: number): number {
  return (y * image.width + x) * image.channels;
}

function estimateBackgroundColor(image: RawImage): { r: number; g: number; b: number } {
  const sampleThickness = Math.max(
    2,
    Math.round(Math.min(image.width, image.height) * 0.03),
  );

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  const visit = (x: number, y: number) => {
    const offset = getPixelOffset(image, x, y);
    rSum += image.data[offset] || 0;
    gSum += image.data[offset + 1] || 0;
    bSum += image.data[offset + 2] || 0;
    count += 1;
  };

  const cornerRanges = [
    { xStart: 0, xEnd: sampleThickness, yStart: 0, yEnd: sampleThickness },
    {
      xStart: Math.max(0, image.width - sampleThickness),
      xEnd: image.width,
      yStart: 0,
      yEnd: sampleThickness,
    },
    {
      xStart: 0,
      xEnd: sampleThickness,
      yStart: Math.max(0, image.height - sampleThickness),
      yEnd: image.height,
    },
    {
      xStart: Math.max(0, image.width - sampleThickness),
      xEnd: image.width,
      yStart: Math.max(0, image.height - sampleThickness),
      yEnd: image.height,
    },
  ];

  for (const range of cornerRanges) {
    for (let y = range.yStart; y < range.yEnd; y++) {
      for (let x = range.xStart; x < range.xEnd; x++) {
        visit(x, y);
      }
    }
  }

  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: Math.round(rSum / count),
    g: Math.round(gSum / count),
    b: Math.round(bSum / count),
  };
}

function rowContentScore(
  image: RawImage,
  row: number,
  background: { r: number; g: number; b: number },
): { avgDistance: number; variance: number; foregroundRatio: number } {
  let distanceSum = 0;
  let lumSum = 0;
  let lumSqSum = 0;
  let foregroundCount = 0;

  for (let x = 0; x < image.width; x++) {
    const offset = getPixelOffset(image, x, row);
    const r = image.data[offset] || 0;
    const g = image.data[offset + 1] || 0;
    const b = image.data[offset + 2] || 0;
    const dr = r - background.r;
    const dg = g - background.g;
    const db = b - background.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    distanceSum += distance;
    lumSum += luminance;
    lumSqSum += luminance * luminance;
    if (distance > 20) {
      foregroundCount += 1;
    }
  }

  const meanLum = lumSum / Math.max(1, image.width);
  const variance = Math.max(0, lumSqSum / Math.max(1, image.width) - meanLum * meanLum);

  return {
    avgDistance: distanceSum / Math.max(1, image.width),
    variance,
    foregroundRatio: foregroundCount / Math.max(1, image.width),
  };
}

function columnContentScore(
  image: RawImage,
  column: number,
  background: { r: number; g: number; b: number },
): { avgDistance: number; variance: number; foregroundRatio: number } {
  let distanceSum = 0;
  let lumSum = 0;
  let lumSqSum = 0;
  let foregroundCount = 0;

  for (let y = 0; y < image.height; y++) {
    const offset = getPixelOffset(image, column, y);
    const r = image.data[offset] || 0;
    const g = image.data[offset + 1] || 0;
    const b = image.data[offset + 2] || 0;
    const dr = r - background.r;
    const dg = g - background.g;
    const db = b - background.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    distanceSum += distance;
    lumSum += luminance;
    lumSqSum += luminance * luminance;
    if (distance > 20) {
      foregroundCount += 1;
    }
  }

  const meanLum = lumSum / Math.max(1, image.height);
  const variance = Math.max(0, lumSqSum / Math.max(1, image.height) - meanLum * meanLum);

  return {
    avgDistance: distanceSum / Math.max(1, image.height),
    variance,
    foregroundRatio: foregroundCount / Math.max(1, image.height),
  };
}

function rowContainsContent(
  image: RawImage,
  row: number,
  background: { r: number; g: number; b: number },
): boolean {
  const score = rowContentScore(image, row, background);
  return (
    score.avgDistance > 12 ||
    score.variance > 28 ||
    score.foregroundRatio > 0.015
  );
}

function columnContainsContent(
  image: RawImage,
  column: number,
  background: { r: number; g: number; b: number },
): boolean {
  const score = columnContentScore(image, column, background);
  return (
    score.avgDistance > 12 ||
    score.variance > 28 ||
    score.foregroundRatio > 0.015
  );
}

function cropRawImage(
  image: RawImage,
  bounds: { left: number; top: number; width: number; height: number },
): RawImage {
  const left = clamp(Math.round(bounds.left), 0, image.width - 1);
  const top = clamp(Math.round(bounds.top), 0, image.height - 1);
  const width = clamp(Math.round(bounds.width), 1, image.width - left);
  const height = clamp(Math.round(bounds.height), 1, image.height - top);
  const data = new Uint8Array(width * height * image.channels);

  for (let y = 0; y < height; y++) {
    const sourceStart = ((top + y) * image.width + left) * image.channels;
    const sourceEnd = sourceStart + width * image.channels;
    const targetStart = y * width * image.channels;
    data.set(image.data.subarray(sourceStart, sourceEnd), targetStart);
  }

  return {
    data,
    width,
    height,
    channels: image.channels,
  };
}

function buildGrayscale(image: RawImage): Float64Array {
  const output = new Float64Array(image.width * image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = getPixelOffset(image, x, y);
      const r = image.data[offset] || 0;
      const g = image.data[offset + 1] || 0;
      const b = image.data[offset + 2] || 0;
      output[y * image.width + x] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
  }
  return output;
}

function buildEdgeMap(grayscale: Float64Array, width: number, height: number): Float64Array {
  const edges = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const current = grayscale[index] || 0;
      const right = grayscale[y * width + Math.min(width - 1, x + 1)] || 0;
      const down = grayscale[Math.min(height - 1, y + 1) * width + x] || 0;
      const left = grayscale[y * width + Math.max(0, x - 1)] || 0;
      const up = grayscale[Math.max(0, y - 1) * width + x] || 0;
      const gx = Math.abs(right - left);
      const gy = Math.abs(down - up);
      edges[index] = clamp((gx + gy) / 2, 0, 255);
      if (current === 0 && right === 0 && down === 0 && left === 0 && up === 0) {
        edges[index] = 0;
      }
    }
  }

  return edges;
}

function resizeChannelNearest(
  channel: Float64Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): Float64Array {
  const output = new Float64Array(targetWidth * targetHeight);

  for (let y = 0; y < targetHeight; y++) {
    const sourceY = Math.min(height - 1, Math.floor((y / targetHeight) * height));
    for (let x = 0; x < targetWidth; x++) {
      const sourceX = Math.min(width - 1, Math.floor((x / targetWidth) * width));
      output[y * targetWidth + x] = channel[sourceY * width + sourceX] || 0;
    }
  }

  return output;
}

function prepareMatchingFeatures(image: RawImage, targetWidth = 320): MatchingFeatures {
  const grayscale = buildGrayscale(image);
  const edgeMap = buildEdgeMap(grayscale, image.width, image.height);

  if (image.width <= targetWidth) {
    return {
      width: image.width,
      height: image.height,
      grayscale,
      edgeMap,
    };
  }

  const targetHeight = Math.max(1, Math.round((image.height / image.width) * targetWidth));

  return {
    width: targetWidth,
    height: targetHeight,
    grayscale: resizeChannelNearest(
      grayscale,
      image.width,
      image.height,
      targetWidth,
      targetHeight,
    ),
    edgeMap: resizeChannelNearest(
      edgeMap,
      image.width,
      image.height,
      targetWidth,
      targetHeight,
    ),
  };
}

function cropFullWidthChannel(
  channel: Float64Array,
  width: number,
  startY: number,
  endY: number,
): Float64Array {
  const safeStart = Math.max(0, Math.round(startY));
  const safeEnd = Math.max(safeStart + 1, Math.round(endY));
  return channel.slice(safeStart * width, safeEnd * width);
}

function meanAbsoluteDifference(a: Float64Array, b: Float64Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 255;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += Math.abs((a[i] || 0) - (b[i] || 0));
  }

  return sum / length;
}

function computeSsim(a: Float64Array, b: Float64Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < length; i++) {
    meanA += a[i] || 0;
    meanB += b[i] || 0;
  }
  meanA /= length;
  meanB /= length;

  let varianceA = 0;
  let varianceB = 0;
  let covariance = 0;

  for (let i = 0; i < length; i++) {
    const da = (a[i] || 0) - meanA;
    const db = (b[i] || 0) - meanB;
    varianceA += da * da;
    varianceB += db * db;
    covariance += da * db;
  }

  varianceA /= length;
  varianceB /= length;
  covariance /= length;

  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;

  const numerator = (2 * meanA * meanB + c1) * (2 * covariance + c2);
  const denominator =
    (meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2);

  if (denominator <= 0) {
    return 0;
  }

  return clamp(numerator / denominator, 0, 1);
}

function computeSimilarity(
  designGray: Float64Array,
  candidateGray: Float64Array,
  designEdge: Float64Array,
  candidateEdge: Float64Array,
): number {
  const graySsim = computeSsim(designGray, candidateGray);
  const edgeSsim = computeSsim(designEdge, candidateEdge);
  const diffScore = 1 - clamp(meanAbsoluteDifference(designGray, candidateGray) / 255, 0, 1);

  return clamp(0.45 * edgeSsim + 0.35 * graySsim + 0.2 * diffScore, 0, 1);
}

function normalizeSlices(
  slices: VisualSectionSlice[],
  imageHeight: number,
): VisualSectionSlice[] {
  const normalized: VisualSectionSlice[] = [];
  let previousEnd = 0;

  for (let index = 0; index < slices.length; index++) {
    const slice = slices[index];
    let yStart = index === 0 ? 0 : previousEnd;
    let yEnd =
      index === slices.length - 1
        ? imageHeight
        : clamp(Math.round(slice.yEnd), yStart + 1, imageHeight);

    if (yEnd <= yStart) {
      yEnd = Math.min(imageHeight, yStart + 1);
    }

    normalized.push({
      ...slice,
      yStart,
      yEnd,
    });
    previousEnd = yEnd;
  }

  return normalized;
}

function positionForSection(midpoint: number, imageHeight: number): "top" | "middle" | "bottom" {
  const ratio = midpoint / Math.max(1, imageHeight);
  if (ratio < 0.33) return "top";
  if (ratio < 0.66) return "middle";
  return "bottom";
}

function slicesToSections(
  slices: VisualSectionSlice[],
  imageWidth: number,
  imageHeight: number,
): VisualSection[] {
  return slices.map((slice, index) => {
    const midpoint = slice.yStart + (slice.yEnd - slice.yStart) / 2;
    const position = positionForSection(midpoint, imageHeight);
    const height = Math.max(1, slice.yEnd - slice.yStart);

    return {
      name: slice.name,
      sectionId: slice.sectionId,
      description: `Detected full-width section spanning rows ${slice.yStart}-${slice.yEnd}.`,
      boundingBox: {
        x: 0,
        y: slice.yStart,
        width: imageWidth,
        height,
      },
      position,
      visualPatterns:
        index === 0
          ? "top-of-page layout chunk"
          : index === slices.length - 1
            ? "bottom-of-page layout chunk"
            : "mid-page layout chunk",
    };
  });
}

function buildRowSignal(
  image: RawImage,
  background: { r: number; g: number; b: number },
): number[] {
  const grayscale = buildGrayscale(image);
  const edgeMap = buildEdgeMap(grayscale, image.width, image.height);
  const edgeDensity = new Array<number>(image.height).fill(0);
  const colorChange = new Array<number>(image.height).fill(0);
  const whitespace = new Array<number>(image.height).fill(0);

  const rowMeanGray = new Array<number>(image.height).fill(0);

  for (let y = 0; y < image.height; y++) {
    const content = rowContentScore(image, y, background);
    whitespace[y] = 1 - clamp(content.foregroundRatio, 0, 1);

    let graySum = 0;
    let edgeSum = 0;
    for (let x = 0; x < image.width; x++) {
      graySum += grayscale[y * image.width + x] || 0;
      edgeSum += edgeMap[y * image.width + x] || 0;
    }

    rowMeanGray[y] = graySum / Math.max(1, image.width);
    edgeDensity[y] = edgeSum / Math.max(1, image.width * 255);
  }

  for (let y = 1; y < image.height; y++) {
    colorChange[y] = Math.abs(rowMeanGray[y] - rowMeanGray[y - 1]) / 255;
  }

  const normalizedEdge = normalizeSeries(edgeDensity);
  const normalizedChange = normalizeSeries(colorChange);
  const normalizedWhitespace = normalizeSeries(whitespace);

  const signal = new Array<number>(image.height).fill(0);
  for (let y = 0; y < image.height; y++) {
    signal[y] =
      normalizedWhitespace[y] * 0.45 +
      normalizedChange[y] * 0.35 +
      (1 - normalizedEdge[y]) * 0.2;
  }

  return movingAverage(signal, 6);
}

function findBoundaryCandidates(
  signal: number[],
  imageHeight: number,
  minSectionHeight: number,
  mergeGap: number,
): number[] {
  if (signal.length === 0) return [];

  const mean = signal.reduce((sum, value) => sum + value, 0) / signal.length;
  const variance =
    signal.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
    signal.length;
  const stdDev = Math.sqrt(variance);
  const threshold = Math.max(mean + stdDev * 0.35, percentile(signal, 0.72));
  const localWindow = Math.max(2, Math.round(mergeGap / 4));
  const minY = minSectionHeight;
  const maxY = imageHeight - minSectionHeight;

  const peaks: Array<{ y: number; score: number }> = [];

  for (let y = minY; y <= maxY; y++) {
    const score = signal[y] || 0;
    if (score < threshold) continue;

    let isPeak = true;
    for (let offset = -localWindow; offset <= localWindow; offset++) {
      if (offset === 0) continue;
      const compareIndex = clamp(y + offset, 0, signal.length - 1);
      if ((signal[compareIndex] || 0) > score) {
        isPeak = false;
        break;
      }
    }

    if (isPeak) {
      peaks.push({ y, score });
    }
  }

  peaks.sort((a, b) => a.y - b.y);

  const merged: Array<{ y: number; score: number }> = [];
  for (const peak of peaks) {
    const previous = merged[merged.length - 1];
    if (previous && peak.y - previous.y < mergeGap) {
      if (peak.score > previous.score) {
        previous.y = peak.y;
        previous.score = peak.score;
      }
    } else {
      merged.push({ ...peak });
    }
  }

  return merged.map((peak) => peak.y);
}

function slicesFromBoundaries(
  boundaries: number[],
  imageHeight: number,
  minSectionHeight: number,
): VisualSectionSlice[] {
  const slices: VisualSectionSlice[] = [];
  let start = 0;

  for (const boundary of boundaries) {
    const end = clamp(Math.round(boundary), start + 1, imageHeight);
    slices.push({
      sectionId: "",
      name: "",
      yStart: start,
      yEnd: end,
    });
    start = end;
  }

  slices.push({
    sectionId: "",
    name: "",
    yStart: start,
    yEnd: imageHeight,
  });

  const merged: VisualSectionSlice[] = [];
  for (const slice of slices) {
    const previous = merged[merged.length - 1];
    const height = slice.yEnd - slice.yStart;

    if (previous && height < minSectionHeight) {
      previous.yEnd = slice.yEnd;
      continue;
    }

    merged.push({ ...slice });
  }

  while (merged.length > 1) {
    const tinyIndex = merged.findIndex(
      (slice) => slice.yEnd - slice.yStart < minSectionHeight,
    );
    if (tinyIndex === -1) {
      break;
    }

    if (tinyIndex === 0) {
      merged[1].yStart = 0;
      merged.shift();
    } else {
      merged[tinyIndex - 1].yEnd = merged[tinyIndex].yEnd;
      merged.splice(tinyIndex, 1);
    }
  }

  return merged.map((slice, index) => ({
    sectionId: `section-${String(index + 1).padStart(2, "0")}`,
    name: `Section ${index + 1}`,
    yStart: slice.yStart,
    yEnd: slice.yEnd,
  }));
}

function estimateMaxSectionCount(imageHeight: number): number {
  return clamp(Math.round(imageHeight / TARGET_SECTION_HEIGHT), 2, 12);
}

function mergeSlicesToTargetCount(
  slices: VisualSectionSlice[],
  maxCount: number,
): VisualSectionSlice[] {
  if (slices.length <= maxCount) {
    return slices;
  }

  const working = slices.map((slice) => ({ ...slice }));

  while (working.length > maxCount) {
    let smallestIndex = 0;
    let smallestHeight = Number.POSITIVE_INFINITY;

    for (let index = 0; index < working.length; index++) {
      const height = working[index].yEnd - working[index].yStart;
      if (height < smallestHeight) {
        smallestHeight = height;
        smallestIndex = index;
      }
    }

    if (smallestIndex === 0) {
      working[1].yStart = working[0].yStart;
      working.splice(0, 1);
      continue;
    }

    if (smallestIndex === working.length - 1) {
      working[working.length - 2].yEnd = working[working.length - 1].yEnd;
      working.splice(working.length - 1, 1);
      continue;
    }

    const previousHeight =
      working[smallestIndex - 1].yEnd - working[smallestIndex - 1].yStart;
    const nextHeight =
      working[smallestIndex + 1].yEnd - working[smallestIndex + 1].yStart;

    if (previousHeight <= nextHeight) {
      working[smallestIndex - 1].yEnd = working[smallestIndex].yEnd;
      working.splice(smallestIndex, 1);
    } else {
      working[smallestIndex + 1].yStart = working[smallestIndex].yStart;
      working.splice(smallestIndex, 1);
    }
  }

  return working.map((slice, index) => ({
    sectionId: `section-${String(index + 1).padStart(2, "0")}`,
    name: `Section ${index + 1}`,
    yStart: slice.yStart,
    yEnd: slice.yEnd,
  }));
}

async function computeRowVarianceMap(
  imagePath: string,
  targetWidth = 600,
): Promise<{
  rowScores: number[];
  scaleY: number;
  stats: { p25: number; median: number; p75: number };
}> {
  const metadata = await sharp(imagePath).metadata();
  const originalHeight = metadata.height || 1080;

  const { data, info } = await sharp(imagePath)
    .resize({ width: targetWidth, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rowScores = new Array<number>(info.height).fill(0);
  for (let y = 0; y < info.height; y++) {
    let sum = 0;
    let sumSquares = 0;
    for (let x = 0; x < info.width; x++) {
      const index = (y * info.width + x) * info.channels;
      const r = data[index] || 0;
      const g = data[index + 1] || 0;
      const b = data[index + 2] || 0;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += luminance;
      sumSquares += luminance * luminance;
    }
    const mean = sum / Math.max(1, info.width);
    rowScores[y] = Math.max(0, sumSquares / Math.max(1, info.width) - mean * mean);
  }

  const smoothed = movingAverage(rowScores, 1);
  return {
    rowScores: smoothed,
    scaleY: originalHeight / Math.max(1, info.height),
    stats: {
      p25: percentile(smoothed, 0.25),
      median: percentile(smoothed, 0.5),
      p75: percentile(smoothed, 0.75),
    },
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
  const scaledY = clamp(Math.round(y / Math.max(scaleY, 0.01)), 0, rowScores.length - 1);
  const radius = Math.max(1, Math.round(searchRadiusPx / Math.max(scaleY, 0.01)));
  const start = Math.max(0, scaledY - radius);
  const end = Math.min(rowScores.length - 1, scaledY + radius);

  const prefix = new Array<number>(rowScores.length + 1).fill(0);
  for (let index = 0; index < rowScores.length; index++) {
    prefix[index + 1] = prefix[index] + rowScores[index];
  }

  const windowRadius = Math.max(
    0,
    Math.round(windowPx / 2 / Math.max(scaleY, 0.01)),
  );

  const windowAverage = (index: number) => {
    const windowStart = Math.max(0, index - windowRadius);
    const windowEnd = Math.min(rowScores.length - 1, index + windowRadius);
    const sum = prefix[windowEnd + 1] - prefix[windowStart];
    return sum / Math.max(1, windowEnd - windowStart + 1);
  };

  let bestIndex = scaledY;
  let bestScore = windowAverage(scaledY);

  for (let index = start; index <= end; index++) {
    const score = windowAverage(index);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  const originalScore = windowAverage(scaledY);
  const improvement =
    originalScore > 0 ? (originalScore - bestScore) / originalScore : 0;

  const shouldSnap =
    bestIndex !== scaledY &&
    (improvement >= minImprovementRatio ||
      originalScore >= stats.p75 ||
      bestScore <= stats.p25 ||
      originalScore >= stats.median * 1.25);

  return shouldSnap ? Math.round(bestIndex * scaleY) : y;
}

export async function snapSliceBoundariesToWhitespace(
  imagePath: string,
  slices: VisualSectionSlice[],
  imageHeight: number,
): Promise<VisualSectionSlice[]> {
  if (slices.length === 0) return slices;

  const { rowScores, scaleY, stats } = await computeRowVarianceMap(imagePath);
  const searchRadius = Number(process.env.BRUNI_SLICE_SNAP_RADIUS_PX || 48);
  const windowSize = Number(process.env.BRUNI_SLICE_SNAP_WINDOW_PX || 12);
  const minImprovement = Number(
    process.env.BRUNI_SLICE_SNAP_MIN_IMPROVEMENT || 0.12,
  );

  const adjusted: VisualSectionSlice[] = [];

  for (let index = 0; index < slices.length; index++) {
    const slice = slices[index];
    let yEnd = slice.yEnd;

    if (index < slices.length - 1) {
      yEnd = snapBoundaryToWhitespace(
        slice.yEnd,
        rowScores,
        scaleY,
        stats,
        searchRadius,
        windowSize,
        minImprovement,
      );
    } else {
      yEnd = imageHeight;
    }

    adjusted.push({
      ...slice,
      yEnd: Math.max(slice.yStart + 1, Math.min(imageHeight, yEnd)),
    });
  }

  return adjusted;
}

export async function trimImageToContent(
  inputPath: string,
  outputPath: string,
): Promise<TrimResult> {
  const image = await loadRawImage(inputPath);
  const background = estimateBackgroundColor(image);

  let top = 0;
  while (top < image.height - 1 && !rowContainsContent(image, top, background)) {
    top += 1;
  }

  let bottom = image.height - 1;
  while (bottom > top && !rowContainsContent(image, bottom, background)) {
    bottom -= 1;
  }

  let left = 0;
  while (left < image.width - 1 && !columnContainsContent(image, left, background)) {
    left += 1;
  }

  let right = image.width - 1;
  while (right > left && !columnContainsContent(image, right, background)) {
    right -= 1;
  }

  const width = Math.max(1, right - left + 1);
  const height = Math.max(1, bottom - top + 1);
  const trimmed = cropRawImage(image, {
    left,
    top,
    width,
    height,
  });

  await writeRawImage(trimmed, outputPath);

  return {
    outputPath,
    originalDimensions: {
      width: image.width,
      height: image.height,
    },
    trimmedDimensions: {
      width: trimmed.width,
      height: trimmed.height,
    },
    trim: {
      left,
      top,
      right: image.width - right - 1,
      bottom: image.height - bottom - 1,
    },
    backgroundColor: background,
  };
}

export async function extractVisualSections(
  screenshotPath: string,
): Promise<VisualSectionsResult> {
  const image = await loadRawImage(screenshotPath);
  const background = estimateBackgroundColor(image);
  const signal = buildRowSignal(image, background);
  const boundaries = findBoundaryCandidates(
    signal,
    image.height,
    MIN_SECTION_HEIGHT,
    MERGE_BOUNDARY_GAP,
  );

  const preliminarySlices = slicesFromBoundaries(
    boundaries,
    image.height,
    MIN_SECTION_HEIGHT,
  );
  const compactedSlices = mergeSlicesToTargetCount(
    preliminarySlices,
    estimateMaxSectionCount(image.height),
  );

  const snappedSlices = await snapSliceBoundariesToWhitespace(
    screenshotPath,
    compactedSlices,
    image.height,
  );

  const normalizedSlices = normalizeSlices(snappedSlices, image.height);
  const sections = slicesToSections(normalizedSlices, image.width, image.height);

  return {
    sections,
    layoutDescription: `Detected ${sections.length} deterministic full-width sections after trimming the design image to content.`,
    imageDimensions: {
      width: image.width,
      height: image.height,
    },
  };
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
  const extracted = await extractVisualSections(screenshotPath);

  if (extracted.sections.length !== baseSections.length) {
    return null;
  }

  const slices = extracted.sections.map((section) => ({
    sectionId: section.sectionId,
    name: section.name,
    yStart: section.boundingBox.y,
    yEnd: section.boundingBox.y + section.boundingBox.height,
  }));

  return {
    slices,
    sections: extracted.sections,
    layoutDescription: extracted.layoutDescription,
    imageDimensions: extracted.imageDimensions,
  };
}

function generateSearchStarts(
  expectedStart: number,
  previewHeight: number,
  sectionHeight: number,
  step: number,
  localBand: number,
  fullScan: boolean,
): number[] {
  const maxStart = Math.max(0, previewHeight - sectionHeight);
  if (sectionHeight > previewHeight) {
    return [];
  }

  const starts: number[] = [];
  const startMin = fullScan
    ? 0
    : clamp(expectedStart - localBand, 0, maxStart);
  const startMax = fullScan
    ? maxStart
    : clamp(expectedStart + localBand, 0, maxStart);

  const safeStep = Math.max(1, step);
  for (let start = startMin; start <= startMax; start += safeStep) {
    starts.push(start);
  }

  if (!starts.includes(expectedStart) && expectedStart <= maxStart) {
    starts.push(clamp(expectedStart, 0, maxStart));
  }

  if (!starts.includes(maxStart)) {
    starts.push(maxStart);
  }

  starts.sort((a, b) => a - b);
  return starts;
}

function chooseBestMatch(
  starts: number[],
  expectedStart: number,
  scoreAt: (start: number) => number,
): { start: number | null; score: number } {
  let bestStart: number | null = null;
  let bestScore = -1;

  for (const start of starts) {
    const score = scoreAt(start);
    if (bestStart == null) {
      bestStart = start;
      bestScore = score;
      continue;
    }

    const scoreGap = score - bestScore;
    if (scoreGap > MATCH_TIE_BAND) {
      bestStart = start;
      bestScore = score;
      continue;
    }

    if (Math.abs(scoreGap) <= MATCH_TIE_BAND) {
      const currentDistance = Math.abs(start - expectedStart);
      const bestDistance = Math.abs(bestStart - expectedStart);
      if (currentDistance < bestDistance) {
        bestStart = start;
        bestScore = score;
      }
    }
  }

  return {
    start: bestStart,
    score: clamp(bestScore, 0, 1),
  };
}

export async function matchVisualSections(
  designImagePath: string,
  previewImagePath: string,
  sections: VisualSection[],
  options?: {
    stepPx?: number;
    localBandPx?: number;
    missingThreshold?: number;
    problematicThreshold?: number;
    matchingWidth?: number;
  },
): Promise<VisualSectionMatch[]> {
  const design = await loadRawImage(designImagePath);
  const preview = await loadRawImage(previewImagePath);
  const designFeatures = prepareMatchingFeatures(
    design,
    options?.matchingWidth ?? 320,
  );
  const previewFeatures = prepareMatchingFeatures(
    preview,
    options?.matchingWidth ?? 320,
  );
  const designFullGray = buildGrayscale(design);
  const previewFullGray = buildGrayscale(preview);
  const designFullEdge = buildEdgeMap(designFullGray, design.width, design.height);
  const previewFullEdge = buildEdgeMap(previewFullGray, preview.width, preview.height);

  const stepPx = options?.stepPx ?? MATCH_STEP;
  const localBandPx = options?.localBandPx ?? LOCAL_SEARCH_BAND;
  const missingThreshold = options?.missingThreshold ?? MISSING_MATCH_THRESHOLD;
  const problematicThreshold =
    options?.problematicThreshold ?? PROBLEMATIC_SECTION_THRESHOLD;

  const scaleYDesign = designFeatures.height / Math.max(1, design.height);
  const scaleYPreview = previewFeatures.height / Math.max(1, preview.height);

  const matches: VisualSectionMatch[] = [];

  for (const section of sections) {
    const designStartY = section.boundingBox.y;
    const designEndY = section.boundingBox.y + section.boundingBox.height;
    const sectionHeight = section.boundingBox.height;
    const scaledStart = clamp(
      Math.round(designStartY * scaleYDesign),
      0,
      designFeatures.height - 1,
    );
    const scaledEnd = clamp(
      Math.round(designEndY * scaleYDesign),
      scaledStart + 1,
      designFeatures.height,
    );
    const scaledHeight = scaledEnd - scaledStart;

    const designGray = cropFullWidthChannel(
      designFeatures.grayscale,
      designFeatures.width,
      scaledStart,
      scaledEnd,
    );
    const designEdge = cropFullWidthChannel(
      designFeatures.edgeMap,
      designFeatures.width,
      scaledStart,
      scaledEnd,
    );

    const scaledExpectedStart = clamp(
      Math.round(designStartY * scaleYPreview),
      0,
      Math.max(0, previewFeatures.height - scaledHeight),
    );
    const scaledStep = Math.max(1, Math.round(stepPx * scaleYPreview));
    const scaledBand = Math.max(1, Math.round(localBandPx * scaleYPreview));

    const scoreAt = (candidateStart: number): number => {
      const candidateEnd = candidateStart + scaledHeight;
      const candidateGray = cropFullWidthChannel(
        previewFeatures.grayscale,
        previewFeatures.width,
        candidateStart,
        candidateEnd,
      );
      const candidateEdge = cropFullWidthChannel(
        previewFeatures.edgeMap,
        previewFeatures.width,
        candidateStart,
        candidateEnd,
      );

      return computeSimilarity(designGray, candidateGray, designEdge, candidateEdge);
    };

    const localStarts = generateSearchStarts(
      scaledExpectedStart,
      previewFeatures.height,
      scaledHeight,
      scaledStep,
      scaledBand,
      false,
    );
    let best = chooseBestMatch(localStarts, scaledExpectedStart, scoreAt);

    if ((best.start == null || best.score < missingThreshold) && previewFeatures.height > scaledHeight) {
      const fullStarts = generateSearchStarts(
        scaledExpectedStart,
        previewFeatures.height,
        scaledHeight,
        scaledStep,
        scaledBand,
        true,
      );
      best = chooseBestMatch(fullStarts, scaledExpectedStart, scoreAt);
    }

    const matchedStartY =
      best.start == null
        ? null
        : clamp(
            Math.round(best.start / Math.max(scaleYPreview, 0.0001)),
            0,
            Math.max(0, preview.height - sectionHeight),
          );
    const matchedEndY =
      matchedStartY == null
        ? null
        : clamp(matchedStartY + sectionHeight, matchedStartY + 1, preview.height);

    if (best.start == null || matchedStartY == null || matchedEndY == null) {
      matches.push({
        sectionId: section.sectionId,
        name: section.name,
        description: section.description,
        designRange: {
          startY: designStartY,
          endY: designEndY,
        },
        matchedRange: null,
        matchScore: clamp(best.score, 0, 1),
        similarityScore: 0,
        status: "missing",
      });
      continue;
    }

    const fullGrayDesign = cropFullWidthChannel(
      designFullGray,
      design.width,
      designStartY,
      designEndY,
    );
    const fullGrayPreview = cropFullWidthChannel(
      previewFullGray,
      preview.width,
      matchedStartY,
      matchedEndY,
    );
    const fullEdgeDesign = cropFullWidthChannel(
      designFullEdge,
      design.width,
      designStartY,
      designEndY,
    );
    const fullEdgePreview = cropFullWidthChannel(
      previewFullEdge,
      preview.width,
      matchedStartY,
      matchedEndY,
    );

    const similarityScore = computeSimilarity(
      fullGrayDesign,
      fullGrayPreview,
      fullEdgeDesign,
      fullEdgePreview,
    );

    const status =
      best.score < missingThreshold
        ? "missing"
        : similarityScore < problematicThreshold
          ? "problematic"
          : "matched";

    matches.push({
      sectionId: section.sectionId,
      name: section.name,
      description: section.description,
      designRange: {
        startY: designStartY,
        endY: designEndY,
      },
      matchedRange: {
        startY: matchedStartY,
        endY: matchedEndY,
      },
      matchScore: clamp(best.score, 0, 1),
      similarityScore: clamp(similarityScore, 0, 1),
      status,
    });
  }

  return matches;
}

export function formatVisualSectionsAsAnalysis(
  result: VisualSectionsResult,
): string {
  let output = "### Visual Section Analysis (deterministic)\n";
  output += `Layout: ${result.layoutDescription}\n\n`;
  output += "### Sections (top to bottom)\n";

  result.sections.forEach((section, index) => {
    output += `${index + 1}. ${section.name}\n`;
    output += `   - Section ID: ${section.sectionId}\n`;
    output += `   - Position: ${section.position}\n`;
    output += `   - Description: ${section.description}\n`;
    output += `   - Bounding Box: x=${section.boundingBox.x}, y=${section.boundingBox.y}, w=${section.boundingBox.width}, h=${section.boundingBox.height}\n\n`;
  });

  return output;
}

export function formatMatchedSectionsAsAnalysis(
  sectionsResult: VisualSectionsResult,
  matches: VisualSectionMatch[],
): string {
  let output = "### Visual Section Matching (deterministic)\n";
  output += `Layout: ${sectionsResult.layoutDescription}\n`;
  output += `Detected Sections: ${sectionsResult.sections.length}\n\n`;
  output += "### Section Matches\n";

  matches.forEach((match, index) => {
    output += `${index + 1}. ${match.name}\n`;
    output += `   - Section ID: ${match.sectionId}\n`;
    output += `   - Design Range: y=${match.designRange.startY}-${match.designRange.endY}\n`;
    output += `   - Matched Range: ${
      match.matchedRange
        ? `y=${match.matchedRange.startY}-${match.matchedRange.endY}`
        : "none"
    }\n`;
    output += `   - Match Score: ${match.matchScore.toFixed(3)}\n`;
    output += `   - Similarity Score: ${match.similarityScore.toFixed(3)}\n`;
    output += `   - Status: ${match.status}\n`;
    output += `   - Description: ${match.description}\n\n`;
  });

  return output;
}

export function buildSectionId(name: string, index: number): string {
  const value = toKebabCase(name);
  return value || `section-${String(index + 1).padStart(2, "0")}`;
}

/**
 * Figma prototype screenshot utilities.
 *
 * Handles capturing screenshots from Figma prototype URLs by targeting the
 * canvas element where the design is rendered.
 */

import type { Stagehand } from "@browserbasehq/stagehand";
import { writeFileSync } from "fs";
import sharp from "sharp";

/**
 * Bounding box for an element.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Result of a Figma screenshot operation.
 */
export interface FigmaScreenshotResult {
  /** Path to the saved screenshot. */
  screenshotPath: string;
  /** Bounding box of the captured canvas. */
  canvasBounds: BoundingBox;
  /** Whether the screenshot was successful. */
  success: boolean;
  /** Error message if screenshot failed. */
  error?: string;
}

/**
 * Canvas dimensions result including both display and actual content size.
 */
interface CanvasDimensions {
  /** Index of the selected canvas in document.querySelectorAll("canvas"). */
  canvasIndex: number;
  /** Display bounding box (what's visible on screen). */
  displayBounds: BoundingBox;
  /** Actual canvas buffer dimensions (full content size). */
  actualWidth: number;
  actualHeight: number;
  /** Scale factor between display and actual size. */
  scaleX: number;
  scaleY: number;
}

async function computeBottomStripHash(
  imageBuffer: Buffer,
  stripHeightPx: number = 120
): Promise<string> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) {
    return "";
  }

  const extractHeight = Math.max(1, Math.min(stripHeightPx, h));
  const y = Math.max(0, h - extractHeight);
  const raw = await sharp(imageBuffer)
    .extract({ left: 0, top: y, width: w, height: extractHeight })
    .ensureAlpha()
    .raw({ depth: "uchar" })
    .toBuffer();

  // Very cheap checksum-based hash (enough for change detection).
  let sum = 0;
  for (let i = 0; i < raw.length; i += 97) {
    sum = (sum + raw[i]) % 1000000007;
  }
  return `${w}x${h}:${sum}`;
}

async function isLikelyBlankImage(imageBuffer: Buffer): Promise<boolean> {
  // Downscale heavily and measure variance.
  const resized = await sharp(imageBuffer)
    .ensureAlpha()
    .resize(32, 32, { fit: "fill" })
    .raw({ depth: "uchar" })
    .toBuffer();

  // Compute mean and variance over RGB channels.
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let i = 0; i < resized.length; i += 4) {
    const v = (resized[i] + resized[i + 1] + resized[i + 2]) / 3;
    n += 1;
    const delta = v - mean;
    mean += delta / n;
    m2 += delta * (v - mean);
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;

  // Heuristic: near-uniform and very dark.
  return mean < 15 && variance < 25;
}

async function waitForFigmaCanvasCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  timeoutMs: number = 60000
): Promise<CanvasDimensions[] | null> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const candidates = await page.evaluate((): CanvasDimensions[] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = (globalThis as any).window;

      const canvases = Array.from(doc.querySelectorAll("canvas"));
      if (canvases.length === 0) {
        return [];
      }

      const viewportW = win.innerWidth || 0;
      const viewportH = win.innerHeight || 0;

      const scored = canvases
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((canvas: any, idx: number) => {
          const rect = canvas.getBoundingClientRect();
          const area = rect.width * rect.height;
          const visible =
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.left < viewportW &&
            rect.top < viewportH;
          const inPrototypeView = Boolean(
            canvas.closest?.(
              "[data-testid='prototype-view'], .prototype-view, #prototype-container"
            )
          );

          let score = area;
          if (visible) score += 5_000_000_000;
          if (inPrototypeView) score += 10_000_000_000;

          return { canvas, idx, rect, score };
        })
        .filter((c: any) => c.rect.width > 100 && c.rect.height > 100)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 6);

      return scored.map((c: any) => {
        const actualWidth = c.canvas.width || c.rect.width;
        const actualHeight = c.canvas.height || c.rect.height;
        const scaleX = actualWidth / c.rect.width;
        const scaleY = actualHeight / c.rect.height;

        return {
          canvasIndex: c.idx,
          displayBounds: {
            x: Math.round(c.rect.x),
            y: Math.round(c.rect.y),
            width: Math.round(c.rect.width),
            height: Math.round(c.rect.height),
          },
          actualWidth,
          actualHeight,
          scaleX,
          scaleY,
        };
      });
    });

    if (candidates.length > 0) {
      return candidates;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
}

/**
 * Wait for the Figma prototype canvas to be ready and get its dimensions.
 *
 * Figma prototypes render inside a canvas element. This function waits for
 * the canvas to be visible and returns both display and actual dimensions.
 *
 * @param page - The Playwright page object.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @returns The canvas dimensions including actual buffer size.
 */
async function waitForFigmaCanvas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  timeoutMs: number = 60000
): Promise<CanvasDimensions | null> {
  const candidates = await waitForFigmaCanvasCandidates(page, timeoutMs);
  if (!candidates || candidates.length === 0) {
    return null;
  }
  return candidates[0];
}

async function scrollFigmaPrototype(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  canvasIndex: number,
  deltaY: number
): Promise<{ method: "scroll" | "wheel" | "none"; scrollTop?: number }> {
  return await page.evaluate(
    (params: { idx: number; dy: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = (globalThis as any).window;

      const canvases = Array.from(doc.querySelectorAll("canvas"));
      const canvas = canvases[params.idx] as any;
      if (!canvas) {
        return { method: "none" as const };
      }

      // Try a real scrollable ancestor first.
      let parent: any = canvas.parentElement;
      while (parent && parent !== doc.body) {
        const style = win.getComputedStyle(parent);
        const overflowY = style.overflowY;
        const canScroll =
          (overflowY === "auto" || overflowY === "scroll") &&
          parent.scrollHeight > parent.clientHeight + 5;
        if (canScroll) {
          parent.scrollBy(0, params.dy);
          return { method: "scroll" as const, scrollTop: parent.scrollTop };
        }
        parent = parent.parentElement;
      }

      // Fallback to wheel event on the canvas.
      const rect = canvas.getBoundingClientRect();
      const WheelEventClass = (win as any).WheelEvent;
      if (WheelEventClass) {
        const wheelEvent = new WheelEventClass("wheel", {
          deltaY: params.dy,
          deltaMode: 0,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        });
        canvas.dispatchEvent(wheelEvent);
        return { method: "wheel" as const };
      }

      return { method: "none" as const };
    },
    { idx: canvasIndex, dy: deltaY }
  );
}

async function captureClipScreenshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  clip: BoundingBox
): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await page.screenshot({
    clip: {
      x: clip.x,
      y: clip.y,
      width: clip.width,
      height: clip.height,
    },
  } as any);
}

async function stitchVertical(
  buffers: Buffer[],
  overlapPx: number
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const firstMeta = await sharp(buffers[0]).metadata();
  const width = firstMeta.width || 0;
  const height = firstMeta.height || 0;
  if (!width || !height) {
    return { buffer: buffers[0], width, height };
  }

  const step = Math.max(1, height - overlapPx);
  const stitchedHeight = height + (buffers.length - 1) * step;

  const compositeInputs: sharp.OverlayOptions[] = buffers.map((b, i) => ({
    input: b,
    top: i * step,
    left: 0,
  }));

  const out = await sharp({
    create: {
      width,
      height: stitchedHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();

  return { buffer: out, width, height: stitchedHeight };
}

/**
 * Wait for Figma loading overlays to disappear.
 *
 * Figma may show loading spinners or splash screens. This waits for them
 * to be removed from the DOM.
 *
 * @param page - The Playwright page object.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 */
async function waitForLoadingToComplete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const hasLoadingOverlay = await page.evaluate((): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;

      // Common loading indicator selectors in Figma.
      const loadingSelectors = [
        "[data-testid='loading-spinner']",
        ".loading-spinner",
        ".prototype-loading",
        "[class*='loading']",
        "[class*='spinner']",
      ];

      for (const selector of loadingSelectors) {
        const element = doc.querySelector(selector);
        if (element) {
          const style = (globalThis as any).window.getComputedStyle(element);
          // Check if element is visible.
          if (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0"
          ) {
            return true;
          }
        }
      }

      return false;
    });

    if (!hasLoadingOverlay) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

/**
 * Take a screenshot of a Figma prototype.
 *
 * This function navigates to the Figma prototype URL, waits for the canvas
 * to render, and captures the full prototype content by using fullPage
 * screenshot or scrolling if needed.
 *
 * @param stagehand - The Stagehand instance.
 * @param figmaUrl - The Figma prototype URL.
 * @param outputPath - Path to save the screenshot.
 * @returns Result containing the screenshot path and canvas bounds.
 */
export async function screenshotFigmaPrototype(
  stagehand: Stagehand,
  figmaUrl: string,
  outputPath: string
): Promise<FigmaScreenshotResult> {
  try {
    const page = stagehand.context.pages()[0];

    // Set a reasonable viewport size for Figma prototypes.
    const initialViewportHeight = 1080;
    page.setViewportSize(1920, initialViewportHeight);

    console.log(`Navigating to Figma prototype: ${figmaUrl}`);

    // Navigate to the prototype URL.
    // Use 'load' instead of 'networkidle' because Figma prototypes have
    // continuous network activity for real-time collaboration features.
    await page.goto(figmaUrl, {
      waitUntil: "load",
      timeoutMs: 60000,
    });

    // Give Figma additional time to initialize the prototype.
    console.log("Waiting for Figma prototype to initialize...");
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Wait for any loading overlays to disappear.
    console.log("Waiting for Figma loading to complete...");
    await waitForLoadingToComplete(page);

    // Wait for the canvas to be ready.
    console.log("Waiting for Figma canvas to render...");
    const canvasCandidates = await waitForFigmaCanvasCandidates(page);
    const canvasDimensions = canvasCandidates ? canvasCandidates[0] : null;

    if (!canvasDimensions) {
      console.warn(
        "Could not find Figma canvas element, falling back to full page screenshot"
      );

      // Fallback: take a full page screenshot.
      const screenshot = await page.screenshot({ fullPage: true });
      writeFileSync(outputPath, screenshot);

      const viewportSize = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = (globalThis as any).window;
        return {
          width: win.innerWidth,
          height: win.innerHeight,
        };
      });

      return {
        screenshotPath: outputPath,
        canvasBounds: {
          x: 0,
          y: 0,
          width: viewportSize.width,
          height: viewportSize.height,
        },
        success: true,
      };
    }

    // Log the canvas dimensions.
    console.log(`Found Figma canvas:`);
    console.log(`  Canvas index: ${canvasDimensions.canvasIndex}`);
    console.log(`  Display bounds: ${JSON.stringify(canvasDimensions.displayBounds)}`);
    console.log(`  Actual canvas size: ${canvasDimensions.actualWidth}x${canvasDimensions.actualHeight}`);
    if (canvasCandidates) {
      console.log(`  Canvas candidates considered: ${canvasCandidates.length}`);
    }

    // Try to get the actual content dimensions from Figma's scroll container.
    const contentDimensions = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = (globalThis as any).window;

      // Look for Figma's scroll container.
      const scrollContainer =
        doc.querySelector('[data-testid="scroll-container"]') ||
        doc.querySelector('div[style*="overflow"]');

      if (!scrollContainer) {
        return null;
      }

      // The actual content is usually a transformed inner node.
      const content = scrollContainer.firstElementChild;
      if (!content) {
        return {
          scrollWidth: scrollContainer.scrollWidth,
          scrollHeight: scrollContainer.scrollHeight,
          contentWidth: 0,
          contentHeight: 0,
          devicePixelRatio: win.devicePixelRatio,
        };
      }

      const rect = content.getBoundingClientRect();

      return {
        scrollWidth: scrollContainer.scrollWidth,
        scrollHeight: scrollContainer.scrollHeight,
        contentWidth: Math.ceil(rect.width),
        contentHeight: Math.ceil(rect.height),
        devicePixelRatio: win.devicePixelRatio,
      };
    });

    if (contentDimensions) {
      console.log(`Scroll container dimensions:`);
      console.log(`  Scroll size: ${contentDimensions.scrollWidth}x${contentDimensions.scrollHeight}`);
      console.log(`  Content size: ${contentDimensions.contentWidth}x${contentDimensions.contentHeight}`);
      console.log(`  Device pixel ratio: ${contentDimensions.devicePixelRatio}`);
    } else {
      console.log("No scroll container found");
    }

    // Capture the rendered canvas area via a clipped page screenshot.
    // This avoids WebGL readback issues that produce black images with toBlob().
    console.log("Capturing rendered canvas via clipped screenshot...");

    const overlapCss = 120;
    const maxFrames = 40;

    const candidatesToTry =
      canvasCandidates && canvasCandidates.length > 0
        ? canvasCandidates
        : [canvasDimensions];

    let selected = candidatesToTry[0];
    let firstFrame = await captureClipScreenshot(page, selected.displayBounds);
    let firstBlank = await isLikelyBlankImage(firstFrame);

    if (firstBlank && candidatesToTry.length > 1) {
      console.warn(
        "Primary canvas capture looks blank. Trying alternate canvas candidates..."
      );
      for (let i = 1; i < candidatesToTry.length; i++) {
        const candidate = candidatesToTry[i];
        const buf = await captureClipScreenshot(page, candidate.displayBounds);
        const blank = await isLikelyBlankImage(buf);
        console.log(
          `  Candidate ${i + 1}/${candidatesToTry.length} (index ${candidate.canvasIndex}) blank=${blank}`
        );
        if (!blank) {
          selected = candidate;
          firstFrame = buf;
          firstBlank = false;
          break;
        }
      }
    }

    const clip = selected.displayBounds;
    const scrollStepCss = Math.max(50, clip.height - overlapCss);

    const frames: Buffer[] = [];
    let lastHash = await computeBottomStripHash(firstFrame, 120);
    let sameHashCount = 0;

    frames.push(firstFrame);
    if (firstBlank) {
      console.warn(
        "Selected canvas frame still looks blank. Will fall back if stitching remains blank."
      );
    }

    for (let i = 1; i < maxFrames; i++) {
      const scrollResult = await scrollFigmaPrototype(
        page,
        selected.canvasIndex,
        scrollStepCss
      );
      console.log(
        `Scrolled (${scrollResult.method}) by ${scrollStepCss}px (frame ${i}/${maxFrames})`
      );

      await new Promise((resolve) => setTimeout(resolve, 700));

      const buffer = await captureClipScreenshot(page, clip);
      const hash = await computeBottomStripHash(buffer, 120);
      frames.push(buffer);

      if (hash && hash === lastHash) {
        sameHashCount += 1;
      } else {
        sameHashCount = 0;
      }
      lastHash = hash;

      if (sameHashCount >= 2 && i >= 2) {
        console.log(`Reached end of content after ${i + 1} frames.`);
        break;
      }
    }

    // If we only got one frame, just write it.
    if (frames.length === 1) {
      const blank = await isLikelyBlankImage(frames[0]);
      if (blank) {
        console.warn(
          "Captured canvas frame appears blank. Falling back to full page screenshot."
        );
        const fallback = await page.screenshot({ fullPage: true });
        writeFileSync(outputPath, fallback);
        return {
          screenshotPath: outputPath,
          canvasBounds: clip,
          success: true,
        };
      }

      writeFileSync(outputPath, frames[0]);
      return {
        screenshotPath: outputPath,
        canvasBounds: { x: 0, y: 0, width: clip.width, height: clip.height },
        success: true,
      };
    }

    // Stitch all frames into one tall image.
    const firstMeta = await sharp(frames[0]).metadata();
    const imgHeight = firstMeta.height || clip.height;
    const dpr = imgHeight / clip.height;
    const overlapPx = Math.round(overlapCss * dpr);

    console.log(`Stitching ${frames.length} frames (overlap ${overlapPx}px)...`);
    const stitched = await stitchVertical(frames, overlapPx);
    const stitchedBlank = await isLikelyBlankImage(stitched.buffer);
    if (stitchedBlank) {
      console.warn(
        "Stitched image appears blank. Falling back to full page screenshot."
      );
      const fallback = await page.screenshot({ fullPage: true });
      writeFileSync(outputPath, fallback);
      return {
        screenshotPath: outputPath,
        canvasBounds: clip,
        success: true,
      };
    }
    writeFileSync(outputPath, stitched.buffer);

    return {
      screenshotPath: outputPath,
      canvasBounds: { x: 0, y: 0, width: stitched.width, height: stitched.height },
      success: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`Failed to screenshot Figma prototype: ${errorMessage}`);

    return {
      screenshotPath: outputPath,
      canvasBounds: { x: 0, y: 0, width: 0, height: 0 },
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get the dimensions of the Figma prototype frame.
 *
 * This can be useful for understanding the design dimensions without taking
 * a screenshot. Returns the actual canvas buffer dimensions (full content).
 *
 * @param stagehand - The Stagehand instance.
 * @param figmaUrl - The Figma prototype URL.
 * @returns The bounding box of the canvas (actual dimensions) or null.
 */
export async function getFigmaPrototypeDimensions(
  stagehand: Stagehand,
  figmaUrl: string
): Promise<BoundingBox | null> {
  try {
    const page = stagehand.context.pages()[0];
    page.setViewportSize(1920, 1080);

    await page.goto(figmaUrl, {
      waitUntil: "load",
      timeoutMs: 60000,
    });

    // Give Figma time to initialize.
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await waitForLoadingToComplete(page);
    const canvasDimensions = await waitForFigmaCanvas(page);

    if (!canvasDimensions) {
      return null;
    }

    // Return the actual canvas dimensions as a bounding box.
    return {
      x: canvasDimensions.displayBounds.x,
      y: canvasDimensions.displayBounds.y,
      width: canvasDimensions.actualWidth,
      height: canvasDimensions.actualHeight,
    };
  } catch (error) {
    console.error(`Failed to get Figma dimensions: ${error}`);
    return null;
  }
}

/**
 * Figma prototype screenshot utilities.
 *
 * Handles capturing screenshots from Figma prototype URLs by targeting the
 * canvas element where the design is rendered.
 */

import type { Stagehand } from "@browserbasehq/stagehand";
import { writeFileSync } from "fs";

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
 * Wait for the Figma prototype canvas to be ready.
 *
 * Figma prototypes render inside a canvas element. This function waits for
 * the canvas to be visible and have non-zero dimensions.
 *
 * @param page - The Playwright page object.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @returns The bounding box of the canvas element.
 */
async function waitForFigmaCanvas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  timeoutMs: number = 60000
): Promise<BoundingBox | null> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    // Try to find the canvas element and get its bounds.
    const canvasBounds = await page.evaluate((): BoundingBox | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = (globalThis as any).document;

      // Figma uses a canvas element for rendering the prototype.
      // It's typically inside a container with specific attributes.
      const canvasSelectors = [
        "canvas",
        "[data-testid='prototype-view'] canvas",
        ".prototype-view canvas",
        "#prototype-container canvas",
      ];

      for (const selector of canvasSelectors) {
        const canvas = doc.querySelector(selector);
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          // Ensure canvas has meaningful dimensions.
          if (rect.width > 100 && rect.height > 100) {
            return {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          }
        }
      }

      return null;
    });

    if (canvasBounds) {
      return canvasBounds;
    }

    // Wait before next poll.
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
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
 * to render, and captures only the canvas area (excluding Figma UI chrome).
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
    page.setViewportSize(1920, 1080);

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
    const canvasBounds = await waitForFigmaCanvas(page);

    if (!canvasBounds) {
      console.warn(
        "Could not find Figma canvas element, falling back to full page screenshot"
      );

      // Fallback: take a full page screenshot.
      const screenshot = await page.screenshot({ fullPage: true });
      writeFileSync(outputPath, screenshot);

      // Return approximate bounds for full page.
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

    console.log(`Found Figma canvas: ${JSON.stringify(canvasBounds)}`);

    // Take screenshot clipped to canvas bounds.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const screenshot = await page.screenshot({
      clip: {
        x: canvasBounds.x,
        y: canvasBounds.y,
        width: canvasBounds.width,
        height: canvasBounds.height,
      },
    } as any);

    writeFileSync(outputPath, screenshot);

    return {
      screenshotPath: outputPath,
      canvasBounds,
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
 * a screenshot.
 *
 * @param stagehand - The Stagehand instance.
 * @param figmaUrl - The Figma prototype URL.
 * @returns The bounding box of the canvas or null if not found.
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
    return await waitForFigmaCanvas(page);
  } catch (error) {
    console.error(`Failed to get Figma dimensions: ${error}`);
    return null;
  }
}

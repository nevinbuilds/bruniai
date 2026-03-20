/**
 * Ensure viewport is set to a specific width (default 1920x1080) and verify it's correct.
 * Optionally navigate to a URL after setting the viewport.
 *
 * @param page - The page object from Stagehand
 * @param url - Optional URL to navigate to after setting viewport
 * @param width - Optional viewport width (defaults to 1920)
 * @param height - Optional viewport height (defaults to 1080)
 * @returns Promise that resolves when viewport is set and verified
 */
export async function ensureViewportSize(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  url?: string,
  width: number = 1920,
  height: number = 1080
): Promise<void> {
  // Set viewport size before navigating (if URL provided).
  page.setViewportSize(width, height);

  // Navigate to URL if provided.
  if (url) {
    try {
      // Wait until network is mostly idle so that client-side JS has a chance
      // to render the full page (SPA content, lazy sections, etc.).
      await page.goto(url, {
        waitUntil: "networkidle",
        timeoutMs: 60000,
      });
    } catch (error) {
      // Fallback: if networkidle never settles (e.g., long polling), at least
      // ensure we navigated to the URL.
      console.warn(
        `ensureViewportSize: networkidle wait failed for ${url}: ${error}`
      );
      await page.goto(url, { waitUntil: "load" });
    }

    // Small extra delay to let late JS-driven content finish.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Verify viewport is set correctly.
  const viewportSize = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = (globalThis as any).window;
    return {
      width: win.innerWidth,
      height: win.innerHeight,
    };
  });

  // Reset viewport if it's 0 width (navigation may have reset it).
  if (viewportSize.width === 0) {
    console.warn(
      `Viewport width is 0 after navigation, resetting to ${width}x${height}`
    );
    page.setViewportSize(width, height);
    // Wait a bit for viewport to be applied.
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Scrolls the page down to trigger lazy-loading content.
 *
 * This is useful before taking full-page screenshots on long, JS-heavy pages.
 */
export async function scrollPageToBottom(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  stepPx: number = 800,
  delayMs: number = 500,
  maxSteps: number = 40
): Promise<void> {
  // Start from the top.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.scrollTo(0, 0);
  });

  for (let i = 0; i < maxSteps; i++) {
    const reachedEnd = await page.evaluate((step: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = (globalThis as any).window;
      const doc = win.document.documentElement;
      const body = win.document.body;
      const maxScroll =
        Math.max(
          doc.scrollHeight,
          doc.offsetHeight,
          body ? body.scrollHeight : 0,
          body ? body.offsetHeight : 0
        ) - (win.innerHeight || doc.clientHeight || 0);
      const next = Math.min(maxScroll, win.scrollY + step);
      win.scrollTo(0, next);
      return win.scrollY >= maxScroll - 2;
    }, stepPx);

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (reachedEnd) {
      break;
    }
  }
}

/**
 * Wait until all images currently in the viewport have finished loading.
 *
 * This helps ensure that lazy-loaded images that appear as we scroll are
 * actually rendered before we take the screenshot.
 */
export async function waitForImagesInViewport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  timeoutMs: number = 15000
): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = (globalThis as any).window;
        const doc = win.document;
        const viewportHeight = win.innerHeight || doc.documentElement.clientHeight || 0;
        const viewportWidth = win.innerWidth || doc.documentElement.clientWidth || 0;

        const imgs = Array.from(doc.images || []) as any[];
        if (!imgs.length) return true;

        const visible = imgs.filter((img) => {
          const rect = img.getBoundingClientRect();
          if (rect.bottom <= 0 || rect.top >= viewportHeight) return false;
          if (rect.right <= 0 || rect.left >= viewportWidth) return false;
          // Ignore tiny tracking pixels.
          if (rect.width < 4 || rect.height < 4) return false;
          return true;
        });

        if (!visible.length) return true;

        return visible.every(
          (img) => {
            const imageSrc = String(img.currentSrc || img.src || "").toLowerCase();
            const looksLikePlaceholder =
              imageSrc.includes("/placeholder.svg") ||
              imageSrc.includes("placeholder.svg?") ||
              imageSrc.includes("%2fplaceholder.svg");

            return (
              img.complete &&
              typeof img.naturalHeight === "number" &&
              img.naturalHeight > 0 &&
              !looksLikePlaceholder
            );
          }
        );
      },
      { timeout: timeoutMs }
    );
  } catch (error) {
    console.warn(`waitForImagesInViewport: timed out after ${timeoutMs}ms: ${error}`);
  }
}

/**
 * Ensure a page is fully rendered for a full-page screenshot:
 *  - scrolls down to trigger lazy-loaded content
 *  - waits for visible images to finish loading
 */
export async function ensurePageFullyRendered(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  options?: {
    scrollStepPx?: number;
    scrollDelayMs?: number;
    imagesTimeoutMs?: number;
  }
): Promise<void> {
  const step = options?.scrollStepPx ?? 800;
  const delay = options?.scrollDelayMs ?? 600;
  const imgTimeout = options?.imagesTimeoutMs ?? 15000;

  await scrollPageToBottom(page, step, delay);
  await waitForImagesInViewport(page, imgTimeout);
}

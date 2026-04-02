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
export declare function ensureViewportSize(page: any, url?: string, width?: number, height?: number): Promise<void>;
/**
 * Scrolls the page down to trigger lazy-loading content.
 *
 * This is useful before taking full-page screenshots on long, JS-heavy pages.
 */
export declare function scrollPageToBottom(page: any, stepPx?: number, delayMs?: number, maxSteps?: number): Promise<void>;
/**
 * Wait until all images currently in the viewport have finished loading.
 *
 * This helps ensure that lazy-loaded images that appear as we scroll are
 * actually rendered before we take the screenshot.
 */
export declare function waitForImagesInViewport(page: any, timeoutMs?: number): Promise<void>;
/**
 * Ensure a page is fully rendered for a full-page screenshot:
 *  - scrolls down to trigger lazy-loaded content
 *  - waits for visible images to finish loading
 */
export declare function ensurePageFullyRendered(page: any, options?: {
    scrollStepPx?: number;
    scrollDelayMs?: number;
    imagesTimeoutMs?: number;
}): Promise<void>;
//# sourceMappingURL=window.d.ts.map
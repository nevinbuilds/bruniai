/**
 * Extract real DOM information using Stagehand's page directly.
 */
export async function extractRealDomInfo(stagehand, url) {
    try {
        const page = stagehand.context.pages()[0];
        await page.goto(url, { waitUntil: "networkidle", timeoutMs: 60000 });
        // Extract real DOM information using evaluate.
        // The code inside evaluate runs in the browser context where document is available.
        const domInfo = await page.evaluate(() => {
            const selector = "section,header,footer,main,nav,aside,article,div[class*='section'],div[class*='hero'],div[class*='content'],div[class*='container']";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nodes = globalThis.document.querySelectorAll(selector);
            return (Array.from(nodes)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((node) => {
                const rect = node.getBoundingClientRect();
                // Skip elements that are too small or not visible.
                if (rect.width < 50 || rect.height < 50) {
                    return null;
                }
                const nodeId = node.getAttribute("id") || "";
                const nodeClass = node.getAttribute("class") || "";
                const ariaLabel = node.getAttribute("aria-label") || "";
                const tagName = node.tagName.toLowerCase();
                const textContent = (node.textContent || "").substring(0, 100);
                return {
                    tag: tagName,
                    id: nodeId,
                    className: nodeClass,
                    ariaLabel: ariaLabel,
                    textContent: textContent,
                    boundingBox: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    },
                };
            })
                .filter((node) => node !== null));
        });
        return domInfo;
    }
    catch (error) {
        console.error(`Error extracting DOM info: ${error}`);
        return [];
    }
}
//# sourceMappingURL=sectionDom.js.map
/**
 * Parse section data from the formatted analysis output string.
 *
 * @param sectionsAnalysis - String output from the section analysis
 * @returns Array of section data objects
 */
export function parseSectionDataFromAnalysis(sectionsAnalysis) {
    const sectionsData = [];
    if (!sectionsAnalysis) {
        return sectionsData;
    }
    // Look for section blocks in the analysis.
    // Pattern matches: "1. Section Name\n   - Section ID: ...\n   - ..."
    const sectionPattern = /(\d+)\.\s*([^\n]+)\s*\n(.*?)(?=\d+\.|$)/gs;
    const matches = Array.from(sectionsAnalysis.matchAll(sectionPattern));
    for (const match of matches) {
        const sectionNum = match[1];
        const sectionName = match[2];
        const sectionContent = match[3];
        // Extract various attributes.
        const sectionIdMatch = sectionContent.match(/Section ID:\s*([a-zA-Z0-9\-_]+)/);
        const htmlElementMatch = sectionContent.match(/HTML Element:\s*([^\n]+)/);
        const htmlIdMatch = sectionContent.match(/HTML ID:\s*([^\n]+)/);
        const htmlClassesMatch = sectionContent.match(/HTML Classes:\s*([^\n]+)/);
        const ariaLabelMatch = sectionContent.match(/ARIA Label:\s*([^\n]+)/);
        const contentIdentifierMatch = sectionContent.match(/Content Identifier:\s*([^\n]+)/);
        const sectionData = {
            name: sectionName.trim(),
            sectionId: sectionIdMatch ? sectionIdMatch[1] : `section-${sectionNum}`,
            htmlElement: htmlElementMatch ? htmlElementMatch[1].trim() : null,
            htmlId: htmlIdMatch ? htmlIdMatch[1].trim() : null,
            htmlClasses: htmlClassesMatch ? htmlClassesMatch[1].trim() : null,
            ariaLabel: ariaLabelMatch ? ariaLabelMatch[1].trim() : null,
            contentIdentifier: contentIdentifierMatch
                ? contentIdentifierMatch[1].trim()
                : null,
        };
        // Clean up "none" values.
        if (sectionData.htmlId && sectionData.htmlId.toLowerCase() === "none") {
            sectionData.htmlId = null;
        }
        if (sectionData.htmlClasses &&
            sectionData.htmlClasses.toLowerCase() === "none") {
            sectionData.htmlClasses = null;
        }
        if (sectionData.ariaLabel &&
            sectionData.ariaLabel.toLowerCase() === "none") {
            sectionData.ariaLabel = null;
        }
        sectionsData.push(sectionData);
    }
    return sectionsData;
}
/**
 * Match a DOM section to analysis section data.
 *
 * @param section - DOM section data
 * @param analysisSection - Analysis section data
 * @returns True if sections match
 */
function matchSectionToAnalysis(section, analysisSection) {
    // Match by HTML ID (most specific).
    if (analysisSection.htmlId && section.id) {
        if (analysisSection.htmlId.toLowerCase() === section.id.toLowerCase()) {
            return true;
        }
    }
    // Match by Tag + ALL Classes (strict matching).
    if (analysisSection.htmlElement &&
        section.tag &&
        analysisSection.htmlClasses &&
        section.className) {
        // First verify tag names match.
        if (analysisSection.htmlElement.toLowerCase() === section.tag.toLowerCase()) {
            // Then check if all analysis classes are present in section classes.
            const analysisClasses = new Set(analysisSection.htmlClasses.toLowerCase().split(/\s+/));
            const sectionClasses = new Set(section.className.toLowerCase().split(/\s+/));
            const isSubset = Array.from(analysisClasses).every((cls) => sectionClasses.has(cls));
            if (isSubset) {
                return true;
            }
        }
    }
    // Match by ARIA label.
    if (analysisSection.ariaLabel && section.ariaLabel) {
        if (analysisSection.ariaLabel.toLowerCase() ===
            section.ariaLabel.toLowerCase()) {
            return true;
        }
    }
    // Match by content identifier.
    if (analysisSection.contentIdentifier && section.textContent) {
        const contentWords = analysisSection.contentIdentifier
            .toLowerCase()
            .split(/\s+/);
        const sectionText = section.textContent.toLowerCase();
        if (contentWords.every((word) => sectionText.includes(word))) {
            return true;
        }
    }
    return false;
}
/**
 * Extract section bounding boxes and match them with section data from analysis.
 *
 * @param stagehand - Stagehand instance
 * @param url - URL to analyze
 * @param sectionsAnalysis - Optional analysis output containing section data
 * @returns Array of enriched sections with bounding boxes and matched IDs
 */
export async function extractSectionBoundingBoxes(stagehand, url, sectionsAnalysis) {
    try {
        // Parse section data from analysis if provided.
        const sectionsData = sectionsAnalysis
            ? parseSectionDataFromAnalysis(sectionsAnalysis)
            : [];
        const page = stagehand.context.pages()[0];
        await page.goto(url, { waitUntil: "networkidle", timeoutMs: 60000 });
        // Extract DOM sections using page.evaluate().
        const selector = "section,header,footer,main,nav,aside,article,div[class*='section'],div[class*='hero'],div[class*='content'],div[class*='container']";
        const sections = await page.evaluate((sel) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nodes = globalThis.document.querySelectorAll(sel);
            return (Array.from(nodes)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((node) => {
                const rect = node.getBoundingClientRect();
                // Skip elements that are too small or not visible.
                if (rect.width < 50 || rect.height < 50) {
                    return null;
                }
                const nodeText = node.textContent || "";
                const nodeId = node.getAttribute("id") || "";
                const nodeClass = node.getAttribute("class") || "";
                const ariaLabel = node.getAttribute("aria-label") || "";
                const dataAttributes = {};
                // Extract data attributes.
                for (let i = 0; i < node.attributes.length; i++) {
                    const attr = node.attributes[i];
                    if (attr.name.startsWith("data-")) {
                        dataAttributes[attr.name] = attr.value;
                    }
                }
                return {
                    tag: node.tagName.toLowerCase(),
                    id: nodeId,
                    className: nodeClass,
                    ariaLabel: ariaLabel,
                    textContent: nodeText.substring(0, 200), // First 200 chars for matching.
                    boundingBox: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    },
                    dataAttributes: dataAttributes,
                };
            })
                .filter((node) => node !== null));
        }, selector);
        if (!sections) {
            return [];
        }
        // Try to match sections with data from analysis.
        const enrichedSections = [];
        const usedAnalysisSections = new Set(); // Track which analysis sections have been matched.
        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            let sectionId = `section-${i}`; // Default fallback.
            let matchedAnalysis = null;
            // Try to match with analysis data.
            if (sectionsData.length > 0) {
                // First try strict matching.
                for (let j = 0; j < sectionsData.length; j++) {
                    if (!usedAnalysisSections.has(j) &&
                        matchSectionToAnalysis(section, sectionsData[j])) {
                        sectionId = sectionsData[j].sectionId;
                        matchedAnalysis = sectionsData[j];
                        usedAnalysisSections.add(j);
                        break;
                    }
                }
                // If no strict match found, try position-based fallback.
                if (!matchedAnalysis &&
                    usedAnalysisSections.size < sectionsData.length) {
                    // Sort sections by y-coordinate (top to bottom).
                    const sortedSections = [...sections].sort((a, b) => a.boundingBox.y - b.boundingBox.y);
                    const sectionIndex = sortedSections.indexOf(section);
                    // Match by order of appearance.
                    for (let j = 0; j < sectionsData.length; j++) {
                        if (!usedAnalysisSections.has(j) && j === sectionIndex) {
                            sectionId = sectionsData[j].sectionId;
                            matchedAnalysis = sectionsData[j];
                            usedAnalysisSections.add(j);
                            console.log(`Position-based fallback match: section ${i} -> ${sectionId}`);
                            break;
                        }
                    }
                }
            }
            enrichedSections.push({
                ...section,
                sectionId,
                matchedAnalysis,
            });
        }
        console.log(`Extracted ${enrichedSections.length} sections with IDs`);
        return enrichedSections;
    }
    catch (error) {
        console.error(`Error extracting section bounding boxes: ${error}`);
        return [];
    }
}
/**
 * Take a screenshot of a specific section using its ID and analysis data.
 *
 * @param stagehand - Stagehand instance
 * @param url - URL to screenshot
 * @param outputPath - Path to save the screenshot
 * @param sectionId - The section ID to target
 * @param sectionsAnalysis - The sections analysis data containing section information
 * @returns True if successful, False otherwise
 */
export async function takeSectionScreenshot(stagehand, url, outputPath, sectionId, sectionsAnalysis) {
    try {
        // Parse the sections analysis to get the section data.
        const sectionsData = parseSectionDataFromAnalysis(sectionsAnalysis);
        // Find the section with the matching ID.
        const targetSection = sectionsData.find((section) => section.sectionId === sectionId);
        if (!targetSection) {
            console.error(`Section ID ${sectionId} not found in analysis`);
            return false;
        }
        const page = stagehand.context.pages()[0];
        // Set initial viewport with reasonable width, height will be calculated.
        page.setViewportSize(1920, 1080);
        await page.goto(url, { waitUntil: "networkidle", timeoutMs: 60000 });
        // Calculate the full page height to set viewport accordingly.
        const fullPageHeight = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc = globalThis.document;
            return Math.max(doc.body.scrollHeight, doc.body.offsetHeight, doc.documentElement.clientHeight, doc.documentElement.scrollHeight, doc.documentElement.offsetHeight);
        });
        // Set viewport to full page height for complete screenshot capture.
        page.setViewportSize(1920, fullPageHeight);
        // Get bounding box by querying the DOM element.
        // First, try to find the element using available attributes.
        let boundingBox = null;
        // Build a selector based on available attributes.
        // Escape CSS class names properly for use in selectors.
        // Tailwind classes may contain special characters like /, [, ], etc.
        function escapeCssClass(className) {
            // Escape special characters that need escaping in CSS identifiers.
            return className.replace(/[\\\[\](){}:;,\.!@#$%^&*+=|/~`"'<>? ]/g, "\\$&");
        }
        let selector = null;
        if (targetSection.htmlId) {
            selector = `#${targetSection.htmlId}`;
            // Add classes to ID selector if available.
            if (targetSection.htmlClasses) {
                const escapedClasses = targetSection.htmlClasses
                    .split(/\s+/)
                    .map((cls) => `.${escapeCssClass(cls)}`)
                    .join("");
                selector += escapedClasses;
            }
        }
        else if (targetSection.htmlElement && targetSection.htmlClasses) {
            // Escape CSS classes and build selector.
            const escapedClasses = targetSection.htmlClasses
                .split(/\s+/)
                .map((cls) => `.${escapeCssClass(cls)}`)
                .join("");
            selector = `${targetSection.htmlElement}${escapedClasses}`;
        }
        else if (targetSection.htmlElement) {
            selector = targetSection.htmlElement;
        }
        if (selector) {
            try {
                // Try to find the element and get its bounding box.
                boundingBox = await page.evaluate((sel) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const element = globalThis.document.querySelector(sel);
                    if (!element) {
                        return null;
                    }
                    const rect = element.getBoundingClientRect();
                    return {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    };
                }, selector);
            }
            catch (error) {
                console.warn(`Failed to find element with selector: ${selector}`);
            }
        }
        // If exact selector failed, try attribute-based selector as fallback.
        // This is more flexible and handles cases where classes might not match exactly.
        if (!boundingBox &&
            targetSection.htmlElement &&
            targetSection.htmlClasses) {
            try {
                // Build attribute selector that matches element with classes containing the key parts.
                // Use [class*="..."] to match partial class names.
                const keyClasses = targetSection.htmlClasses
                    .split(/\s+/)
                    .filter((cls) => cls.length > 0)
                    .slice(0, 3); // Use first 3 classes to avoid overly specific selector.
                if (keyClasses.length > 0) {
                    const attributeSelectors = keyClasses
                        .map((cls) => `[class*="${cls.replace(/"/g, '\\"')}"]`)
                        .join("");
                    const fallbackSelector = `${targetSection.htmlElement}${attributeSelectors}`;
                    console.log(`Trying fallback attribute selector: ${fallbackSelector}`);
                    boundingBox = await page.evaluate((sel) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const element = globalThis.document.querySelector(sel);
                        if (!element) {
                            return null;
                        }
                        const rect = element.getBoundingClientRect();
                        return {
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                        };
                    }, fallbackSelector);
                    if (boundingBox) {
                        console.log(`Found element using fallback attribute selector`);
                    }
                }
            }
            catch (error) {
                console.warn(`Fallback attribute selector also failed: ${error}`);
            }
        }
        // If selector-based approach failed, try to get bounding box from enriched sections.
        if (!boundingBox) {
            const enrichedSections = await extractSectionBoundingBoxes(stagehand, url, sectionsAnalysis);
            const matchedSection = enrichedSections.find((section) => section.sectionId === sectionId);
            if (matchedSection) {
                boundingBox = matchedSection.boundingBox;
            }
        }
        if (!boundingBox) {
            console.warn(`Could not find bounding box for section ${sectionId}, taking full page screenshot`);
            // Fallback to full page screenshot.
            const screenshot = await page.screenshot({ fullPage: true });
            const fs = await import("fs");
            fs.writeFileSync(outputPath, screenshot);
            return true;
        }
        // Get page dimensions for validation.
        const pageSize = await page.evaluate(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const win = globalThis.window;
            return {
                width: win.innerWidth,
                height: win.innerHeight,
            };
        });
        await stagehand.context
            .pages()[0]
            .setViewportSize(pageSize.width, pageSize.height);
        console.log(`Section ${sectionId}: bounding box ${JSON.stringify(boundingBox)}, viewport ${JSON.stringify(pageSize)}`);
        // Check if element is in viewport, if not scroll to it.
        if (boundingBox.y > pageSize.height) {
            await page.evaluate((y) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                globalThis.window.scrollTo(0, y - 100); // Scroll with some offset.
            }, boundingBox.y);
            // Wait a bit for scroll to complete.
            await new Promise((resolve) => setTimeout(resolve, 500));
            // Get updated bounding box after scroll.
            if (selector) {
                const updatedBoundingBox = await page.evaluate((sel) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const element = globalThis.document.querySelector(sel);
                    if (!element) {
                        return null;
                    }
                    const rect = element.getBoundingClientRect();
                    return {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    };
                }, selector);
                if (updatedBoundingBox) {
                    boundingBox = updatedBoundingBox;
                    console.log(`Section ${sectionId}: scrolled, updated bounding box ${JSON.stringify(boundingBox)}`);
                }
            }
        }
        // Take screenshot with clip parameter using Stagehand's method.
        // Note: Stagehand wraps Playwright, so we use Playwright's screenshot API.
        const screenshot = await page.screenshot({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            clip: {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height,
            },
        });
        const fs = await import("fs");
        fs.writeFileSync(outputPath, screenshot);
        return true;
    }
    catch (error) {
        console.error(`Failed to take section screenshot: ${error}`);
        return false;
    }
}
//# sourceMappingURL=sectionExtraction.js.map
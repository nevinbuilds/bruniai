import { z } from "zod/v3";
import { extractRealDomInfo } from "./sectionDom.js";
const SectionSchema = z.object({
    name: z.string(),
    sectionId: z.string(),
    position: z.string(),
    purpose: z.string(),
    keyElements: z.array(z.string()),
    visualPatterns: z.string(),
    animation: z.string(),
    htmlElement: z.string(),
    htmlId: z.string(),
    htmlClasses: z.string(),
    ariaLabel: z.string(),
    contentIdentifier: z.string(),
});
const SectionAnalysisSchema = z.object({
    baseUrlStructure: z.string(),
    sections: z.array(SectionSchema),
});
/**
 * Analyze the base URL to identify its sections structure using Stagehand's
 * extract method.
 */
export async function analyzeSectionsSideBySide(stagehand, baseUrl, _previewUrl) {
    const maxRetries = 3;
    const retryDelay = 15000; // 15 seconds in milliseconds
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log(`\n${"=".repeat(50)}\n🔍 Starting base URL section analysis (attempt ${attempt + 1}/${maxRetries})\n${"=".repeat(50)}`);
            // Extract real DOM information first.
            console.log("Extracting real DOM information using Stagehand...");
            const domInfo = await extractRealDomInfo(stagehand, baseUrl);
            console.log(`Found ${domInfo.length} DOM elements with real class names`);
            // Create a summary of the real DOM structure for the analysis.
            let domSummary = "Real DOM Structure:\n";
            domInfo.forEach((element, i) => {
                domSummary += `${i + 1}. ${element.tag.toUpperCase()} element:\n`;
                domSummary += `   - ID: ${element.id || "none"}\n`;
                domSummary += `   - Classes: ${element.className || "none"}\n`;
                domSummary += `   - ARIA Label: ${element.ariaLabel || "none"}\n`;
                domSummary += `   - Content: ${element.textContent.substring(0, 50)}...\n`;
                domSummary += `   - Position: ${element.boundingBox.x}, ${element.boundingBox.y}\n\n`;
            });
            // Navigate to base URL for analysis.
            const page = stagehand.context.pages()[0];
            await page.goto(baseUrl, { waitUntil: "networkidle", timeoutMs: 60000 });
            // Use Stagehand's extract method to analyze sections.
            const analysisPrompt = `Please analyze this base URL to establish our reference structure:
      Base URL: ${baseUrl}

      Focus on identifying all major sections and their characteristics. Make sure that the sections actually exist in the base URL,
      they should be well visible and only list the ones that are actually present. Don't register sections that are not present in the base URL.

      **CRITICAL**: Use the real DOM structure information provided below to get accurate class names and attributes. This information was extracted directly from the page using Playwright and contains the actual class names, IDs, and other attributes.

      ${domSummary}

      For the base URL:
      1. List all major sections found. Make sure that the sections actually exist in the base URL and has some content (is not empty), they should be well visible, have content and has actual key elements in it.
      2. Note their position and structure
      3. Describe the purpose of each section
      4. Note any important visual elements or patterns
      5. Note if the section animates or moves. This is important as it should probably be ignored.
      6. Generate a unique, descriptive ID for each section (e.g., "hero-section", "features-section", "footer-section")
      7. **CRITICAL**: For each section, identify the HTML element that represents it. Use the provided real DOM structure information to get accurate attributes:
        - HTML tag names (section, div, header, footer, main, nav, aside, article) - provide ONLY the tag name without backticks
        - ID attributes (e.g., id="hero", id="navigation") - use "none" if no ID - provide ONLY the ID value without backticks
        - Class names - Use the REAL class names from the DOM structure provided below. Do not guess or assume. Provide ONLY the class names without backticks
        - Data attributes (e.g., data-section="hero")
        - ARIA labels or roles
        - Make sure to decide on the element that best represents the start of the section (and will end at the beginning of the next section)

        **IMPORTANT**: Use the real DOM structure information provided in the prompt to get accurate class names and attributes. The DOM structure below contains the actual extracted information from the page.

      This will serve as our baseline for comparing visual changes.`;
            try {
                const sectionAnalysis = await Promise.race([
                    stagehand.extract(analysisPrompt, SectionAnalysisSchema),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Section analysis timed out")), 120000)),
                ]);
                // Format the response similar to Python version.
                let formattedOutput = `### Base URL Structure:\n${sectionAnalysis.baseUrlStructure}\n\n### Sections (in order of appearance):\n`;
                sectionAnalysis.sections.forEach((section, index) => {
                    formattedOutput += `${index + 1}. ${section.name}\n`;
                    formattedOutput += `   - Section ID: ${section.sectionId}\n`;
                    formattedOutput += `   - Position: ${section.position}\n`;
                    formattedOutput += `   - Purpose: ${section.purpose}\n`;
                    formattedOutput += `   - Key Elements: ${section.keyElements.join(", ")}\n`;
                    formattedOutput += `   - Visual Patterns: ${section.visualPatterns}\n`;
                    formattedOutput += `   - Animation: ${section.animation}\n`;
                    formattedOutput += `   - HTML Element: ${section.htmlElement}\n`;
                    formattedOutput += `   - HTML ID: ${section.htmlId}\n`;
                    formattedOutput += `   - HTML Classes: ${section.htmlClasses}\n`;
                    formattedOutput += `   - ARIA Label: ${section.ariaLabel}\n`;
                    formattedOutput += `   - Content Identifier: ${section.contentIdentifier}\n\n`;
                });
                console.log(`\n${"=".repeat(50)}\n🗺️ Base URL Section Analysis:\n${formattedOutput}\n${"=".repeat(50)}`);
                return formattedOutput;
            }
            catch (error) {
                if (error instanceof Error &&
                    error.message === "Section analysis timed out") {
                    if (attempt < maxRetries - 1) {
                        console.warn(`Section analysis timed out. Retrying in ${retryDelay / 1000} seconds...`);
                        await new Promise((resolve) => setTimeout(resolve, retryDelay));
                        continue;
                    }
                    else {
                        throw new Error("Section analysis timed out after all retries");
                    }
                }
                throw error;
            }
        }
        catch (error) {
            console.error(`Error during section analysis: ${error}`);
            if (attempt < maxRetries - 1) {
                console.warn(`Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Section analysis failed after all retries");
}
//# sourceMappingURL=sections.js.map
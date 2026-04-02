import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { tmpdir } from "os";
async function loadImageToImageComparisonModule() {
    try {
        return await import("../../../dist/comparison/image-image-core.js");
    }
    catch {
        return await import("../../../src/comparison/image-image-core.js");
    }
}
function isSupportedImageInput(input) {
    if (!input) {
        return false;
    }
    if (input.startsWith("data:image/")) {
        return true;
    }
    try {
        const parsed = new URL(input);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch {
        return false;
    }
}
function assertSupportedImageInput(input, fieldName) {
    if (!isSupportedImageInput(input)) {
        throw new Error(`${fieldName} must be an HTTP(S) image URL or data:image/... string`);
    }
}
/**
 * Compare two images visually and return analysis results.
 *
 * This function performs a complete image-native comparison workflow:
 * - Creates a temporary directory for images
 * - Normalizes both inputs into PNG images
 * - Trims margins and generates a diff image
 * - Matches sections deterministically
 * - Produces structured analysis output
 *
 * @param input - Comparison input parameters
 * @returns Complete analysis results with image paths
 */
export async function compareImages(input) {
    const { baseImage, previewImage } = input;
    const { performImageToImageComparison } = await loadImageToImageComparisonModule();
    assertSupportedImageInput(baseImage, "baseImage");
    assertSupportedImageInput(previewImage, "previewImage");
    const imagesDir = join(tmpdir(), `bruniai-${Date.now()}`);
    if (!existsSync(imagesDir)) {
        mkdirSync(imagesDir, { recursive: true });
    }
    const result = await performImageToImageComparison({
        baseImageUrl: baseImage,
        previewImageUrl: previewImage,
        imagesDir,
    });
    const status = result.visual_analysis.status === "none"
        ? "pass"
        : result.visual_analysis.status;
    return {
        status,
        visual_analysis: result.visual_analysis,
        sections_analysis: result.sections_analysis,
        images: {
            base_screenshot: result.base_screenshot,
            preview_screenshot: result.preview_screenshot,
            diff_image: result.diff_image,
            section_screenshots: Object.keys(result.section_screenshots).length > 0
                ? Object.fromEntries(Object.entries(result.section_screenshots).map(([key, value]) => [
                    key,
                    { base: value.base, preview: value.preview },
                ]))
                : undefined,
        },
    };
}
//# sourceMappingURL=compare-images.js.map
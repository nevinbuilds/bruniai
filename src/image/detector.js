/**
 * Image URL detection utilities.
 */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
export function isImageSourceUrl(input) {
    if (!input) {
        return false;
    }
    // Data URLs like data:image/png;base64,...
    if (input.startsWith("data:image/")) {
        return true;
    }
    try {
        const parsed = new URL(input);
        const pathname = parsed.pathname.toLowerCase();
        for (const ext of IMAGE_EXTENSIONS) {
            if (pathname.endsWith(ext)) {
                return true;
            }
        }
        return false;
    }
    catch {
        const lower = input.toLowerCase();
        for (const ext of IMAGE_EXTENSIONS) {
            if (lower.includes(ext)) {
                return true;
            }
        }
        return false;
    }
}
//# sourceMappingURL=detector.js.map
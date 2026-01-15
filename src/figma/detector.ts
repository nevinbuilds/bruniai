/**
 * Figma URL detection utilities.
 */

/**
 * Check if a URL is a Figma prototype URL.
 *
 * Figma prototype URLs follow the pattern:
 * https://www.figma.com/proto/{fileKey}/{fileName}?node-id=...
 *
 * @param url - The URL to check.
 * @returns True if the URL is a Figma prototype URL.
 */
export function isFigmaPrototypeUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "figma.com" ||
      parsed.hostname === "www.figma.com" ||
      parsed.hostname.endsWith(".figma.com")
    ) && parsed.pathname.startsWith("/proto/");
  } catch {
    // If URL parsing fails, fallback to simple string check.
    return url.includes("figma.com/proto/");
  }
}

/**
 * Extract the file key from a Figma prototype URL.
 *
 * @param url - The Figma prototype URL.
 * @returns The file key or null if not found.
 */
export function extractFigmaFileKey(url: string): string | null {
  if (!isFigmaPrototypeUrl(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    // Path format: /proto/{fileKey}/{fileName}
    const pathParts = parsed.pathname.split("/").filter((p) => p);
    if (pathParts.length >= 2 && pathParts[0] === "proto") {
      return pathParts[1];
    }
  } catch {
    // Fallback regex extraction.
    const match = url.match(/figma\.com\/proto\/([a-zA-Z0-9]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract the node ID from a Figma prototype URL.
 *
 * @param url - The Figma prototype URL.
 * @returns The node ID or null if not found.
 */
export function extractFigmaNodeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("node-id");
  } catch {
    // Fallback regex extraction.
    const match = url.match(/node-id=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

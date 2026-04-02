/**
 * Download an image URL and save it as a PNG file.
 *
 * This normalizes formats (jpeg/webp/etc) into PNG so downstream tooling
 * can assume `.png` paths.
 */
export declare function downloadImageToPng(imageUrl: string, outputPngPath: string): Promise<void>;
//# sourceMappingURL=fetch.d.ts.map
/**
 * Generate a diff image comparing two screenshots.
 *
 * It uses 2 screenshots and pads the smallest image with a white background so that they match and can be
 * compared using pixelmatch.
 *
 * @param beforePath
 *  Path to the before screenshot
 * @param afterPath
 *  Path to the after screenshot
 * @param diffOutputPath
 *  Path where the diff image will be saved
 *
 * @returns void
 *  Writes the diff image to the diffOutputPath
 */
export declare function generateDiffImage(beforePath: string, afterPath: string, diffOutputPath: string): Promise<void>;
//# sourceMappingURL=diff.d.ts.map
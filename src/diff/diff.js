import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
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
export async function generateDiffImage(beforePath, afterPath, diffOutputPath) {
    // Load both images and convert to RGB
    const img1 = sharp(beforePath);
    const img2 = sharp(afterPath);
    // Get image dimensions
    const metadata1 = await img1.metadata();
    const metadata2 = await img2.metadata();
    if (!metadata1.width ||
        !metadata1.height ||
        !metadata2.width ||
        !metadata2.height) {
        throw new Error("Failed to read image dimensions");
    }
    // Calculate maximum dimensions
    const maxWidth = Math.max(metadata1.width, metadata2.width);
    const maxHeight = Math.max(metadata1.height, metadata2.height);
    // Create white background images
    const whiteBackground1 = sharp({
        create: {
            width: maxWidth,
            height: maxHeight,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    });
    const whiteBackground2 = sharp({
        create: {
            width: maxWidth,
            height: maxHeight,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    });
    // Convert original images to RGB and get buffers
    const rgbImg1Buffer = await img1.removeAlpha().toBuffer();
    const rgbImg2Buffer = await img2.removeAlpha().toBuffer();
    // Composite original images onto white backgrounds
    const newImg1 = whiteBackground1.composite([
        { input: rgbImg1Buffer, top: 0, left: 0 },
    ]);
    const newImg2 = whiteBackground2.composite([
        { input: rgbImg2Buffer, top: 0, left: 0 },
    ]);
    // Save transformed images (resized versions)
    const beforeResizedPath = beforePath.replace(".png", "-resized.png");
    const afterResizedPath = afterPath.replace(".png", "-resized.png");
    await newImg1.png().toFile(beforeResizedPath);
    await newImg2.png().toFile(afterResizedPath);
    // Get raw RGBA pixel data for pixelmatch
    // pixelmatch expects RGBA buffers (4 channels: R, G, B, A)
    const img1Buffer = await newImg1
        .ensureAlpha()
        .raw({ depth: "uchar" })
        .toBuffer({ resolveWithObject: false });
    const img2Buffer = await newImg2
        .ensureAlpha()
        .raw({ depth: "uchar" })
        .toBuffer({ resolveWithObject: false });
    // Create output PNG for diff
    const diff = new PNG({ width: maxWidth, height: maxHeight });
    // Use pixelmatch to compute differences
    // pixelmatch outputs RGBA data with red highlights where differences exist
    pixelmatch(img1Buffer, img2Buffer, diff.data, maxWidth, maxHeight, {
        threshold: 0.1,
        includeAA: false,
        alpha: 0.1,
    });
    // Save the diff image using sharp
    await sharp(diff.data, {
        raw: {
            width: maxWidth,
            height: maxHeight,
            channels: 4,
        },
    })
        .png()
        .toFile(diffOutputPath);
    console.log(`Diff image saved at: ${diffOutputPath}`);
}
//# sourceMappingURL=diff.js.map
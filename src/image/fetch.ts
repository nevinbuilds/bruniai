import sharp from "sharp";
import { writeFileSync } from "fs";

/**
 * Download an image URL and save it as a PNG file.
 *
 * This normalizes formats (jpeg/webp/etc) into PNG so downstream tooling
 * can assume `.png` paths.
 */
export async function downloadImageToPng(
  imageUrl: string,
  outputPngPath: string
): Promise<void> {
  if (!imageUrl) {
    throw new Error("Image URL is required.");
  }

  // Handle data URLs directly.
  if (imageUrl.startsWith("data:image/")) {
    const commaIdx = imageUrl.indexOf(",");
    if (commaIdx === -1) {
      throw new Error("Invalid data URL.");
    }
    const base64 = imageUrl.slice(commaIdx + 1);
    const buf = Buffer.from(base64, "base64");
    const png = await sharp(buf).png().toBuffer();
    writeFileSync(outputPngPath, png);
    return;
  }

  const res = await fetch(imageUrl, {
    redirect: "follow",
    headers: {
      // Some hosts require a UA to return the actual image bytes.
      "user-agent": "bruniai/0.1",
      accept: "image/*,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  const png = await sharp(buf).png().toBuffer();
  writeFileSync(outputPngPath, png);
}


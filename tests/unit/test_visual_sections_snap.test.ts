import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { snapSliceBoundariesToWhitespace } from "../../src/image/visual-sections.js";

function buildStripedImage(
  width: number,
  height: number,
  bandHeight: number,
): Buffer {
  const channels = 3;
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const inTop = y < bandHeight;
    const inMiddle = y >= bandHeight && y < bandHeight * 2;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      let r = 0;
      let g = 0;
      let b = 0;
      if (inMiddle) {
        r = 255;
        g = 255;
        b = 255;
      } else if (inTop) {
        const v = (x + y) % 2 === 0 ? 0 : 255;
        r = v;
        g = v;
        b = v;
      } else {
        const v = (x * 3 + y * 5) % 2 === 0 ? 0 : 255;
        r = v;
        g = v;
        b = v;
      }
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
    }
  }
  return data;
}

describe("snapSliceBoundariesToWhitespace", () => {
  it("snaps a boundary into a low-variance whitespace band", async () => {
    const tmpDir = mkdtempSync("/tmp/bruni-visual-sections-");
    const imagePath = join(tmpDir, "bands.png");

    const width = 120;
    const height = 90;
    const bandHeight = 30;
    const raw = buildStripedImage(width, height, bandHeight);
    await sharp(raw, { raw: { width, height, channels: 3 } })
      .png()
      .toFile(imagePath);

    const slices = [
      { sectionId: "top", name: "Top", yStart: 0, yEnd: 20 },
      { sectionId: "middle", name: "Middle", yStart: 20, yEnd: 60 },
      { sectionId: "bottom", name: "Bottom", yStart: 60, yEnd: 90 },
    ];

    const snapped = await snapSliceBoundariesToWhitespace(
      imagePath,
      slices,
      height,
    );

    // Expect first boundary to move into the middle band (30-59).
    expect(snapped[0].yEnd).toBeGreaterThanOrEqual(30);
    expect(snapped[0].yEnd).toBeLessThan(60);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});

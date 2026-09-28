import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

import { DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_ALT, OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "./seo";

/** A PNG's IHDR carries its pixel size in the two big-endian words at byte 16. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString("latin1"), `${file} is a PNG`).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

describe("the default social-share card", () => {
  const file = resolve(process.cwd(), "static", DEFAULT_OG_IMAGE.replace(/^\//, ""));

  // Without this every share is imageless and downgrades to a small summary
  // card. The template ships "" on purpose — a Reddoor default would leak into
  // every clone — so a real site setting it is the fix, not a regression.
  it("is set, and points at a file this repository ships", () => {
    expect(DEFAULT_OG_IMAGE).not.toBe("");
    expect(DEFAULT_OG_IMAGE.startsWith("/")).toBe(true);
    expect(statSync(file).isFile()).toBe(true);
  });

  // The one image this stack never resizes: `imgix()` returns a non-Prismic URL
  // unchanged, so the committed bytes are exactly what a crawler downloads.
  // Wrong by a pixel and the card is cropped or letterboxed in every feed.
  it("is EXACTLY the canvas, because nothing downstream will resize it", () => {
    const png = pngSize(file);
    expect(png.width).toBe(OG_IMAGE_WIDTH);
    expect(png.height).toBe(OG_IMAGE_HEIGHT);
  });

  it("is small enough to be fetched by a crawler that will not wait", () => {
    expect(pngSize(file).bytes).toBeLessThan(300_000);
  });

  // The card is the REVERSE wordmark on garnet, composed once in Chromium with
  // no script to re-run — so when the wordmark's INTERESTS line moved from
  // #e8e1d1 to #eae7e4 (2026-09-28) nothing tied the picture to the file. Its
  // flat letter strokes survive the lossless encode exactly: 10,239 pixels of
  // the sand the file names. A card left on another sand scores 0, and 5,000 is
  // a floor far from both.
  it("draws the wordmark in the colours logo-reverse.svg names", async () => {
    const svg = readFileSync(resolve(process.cwd(), "static", "logo-reverse.svg"), "utf8");
    const accents = [
      ...new Set([...svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase())),
    ].filter((hex) => hex !== "#ffffff");
    expect(accents, "logo-reverse.svg's non-white fills").toHaveLength(1);
    const want = [1, 3, 5].map((i) => parseInt(accents[0].slice(i, i + 2), 16));
    const raw = await sharp(file).removeAlpha().raw().toBuffer();
    let exact = 0;
    for (let i = 0; i < raw.length; i += 3) {
      if (raw[i] === want[0] && raw[i + 1] === want[1] && raw[i + 2] === want[2]) exact += 1;
    }
    expect(
      exact,
      `${DEFAULT_OG_IMAGE} has ${exact} pixels of ${accents[0]} — it draws another wordmark`,
    ).toBeGreaterThan(5_000);
  });

  // Seo.svelte falls back to the page title, which describes the PAGE. For a
  // card that is only the wordmark that reads as a description of the site's
  // whole proposition attached to a picture of two words.
  it("has an alt of its own, which is not the site's name repeated", () => {
    expect(DEFAULT_OG_IMAGE_ALT.trim().length).toBeGreaterThan(10);
    expect(DEFAULT_OG_IMAGE_ALT).toMatch(/wordmark/i);
  });
});

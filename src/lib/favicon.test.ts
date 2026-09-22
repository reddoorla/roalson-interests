import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * #4 measured the gap this closes: "a wrong favicon ships green". Nothing in
 * the repo checked that the icon existed, what size it was, or that it was not
 * still the SvelteKit skeleton every clone of the starter is born with. The
 * site shipped that skeleton in every browser tab for the whole build.
 *
 * So every assertion here demands an artifact only a real icon set produces —
 * PNG magic, an IHDR that agrees with the `sizes` attribute claiming it, a
 * colour type that cannot carry alpha, an opaque ground painted before the mark
 * — rather than the absence of an error.
 */

const root = process.cwd();
const staticDir = resolve(root, "static");
const appHtml = readFileSync(resolve(root, "src/app.html"), "utf8");
const netlifyToml = readFileSync(resolve(root, "netlify.toml"), "utf8");

/**
 * `reddoor-starter/static/favicon.png`: 128×128, 8-bit grey, mtime 2023-12-14.
 * A clone ships it until someone replaces it, and it is byte-identical across
 * the fleet — so the hash, not the filename, is what says "still the template".
 * Renaming the file does not get past this.
 */
const TEMPLATE_ICON_SHA256 = "5146ed79b486cb9e1cdcdd7814cd22ae78e70ceb30fa06b4cd9a16cf121bc9e6";

/**
 * Every name a browser or platform treats as an icon, not just the three this
 * site happens to ship. A fourth added later is then covered on arrival rather
 * than silently exempt — which is the whole failure mode #4 records.
 */
const ICON_FILE =
  /^(?:favicon|icon|apple-touch-icon|apple-icon|android-chrome|mstile|safari-pinned-tab)[\w.-]*\.(?:png|svg|ico|webp)$/i;

const shipped = readdirSync(staticDir)
  .filter((name) => ICON_FILE.test(name))
  .sort();

type IconLink = { rel: string; href: string; type?: string; sizes?: string };

const attr = (tag: string, name: string) =>
  new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? undefined;

const links: IconLink[] = [...appHtml.matchAll(/<link\b[^>]*>/g)]
  .map((m) => m[0])
  .map((tag) => ({
    rel: attr(tag, "rel") ?? "",
    href: attr(tag, "href") ?? "",
    type: attr(tag, "type"),
    sizes: attr(tag, "sizes"),
  }))
  .filter((link) => link.rel === "icon" || link.rel === "apple-touch-icon");

/** `%sveltekit.assets%/favicon.svg` → `favicon.svg`. */
const basename = (href: string) => href.split("/").pop() ?? href;

const read = (name: string) => readFileSync(resolve(staticDir, name));

/** The PNG chunk names in order, so tRNS can be ruled out rather than assumed. */
function pngChunks(bytes: Buffer) {
  const names: string[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const name = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    names.push(name);
    if (name === "IEND") break;
    offset += 12 + length;
  }
  return names;
}

function png(name: string) {
  const bytes = read(name);
  expect(bytes.subarray(1, 4).toString("latin1"), `${name} is a PNG`).toBe("PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    /** 0 grey · 2 RGB · 3 palette · 4 grey+alpha · 6 RGBA */
    colourType: bytes[25],
    chunks: pngChunks(bytes),
    bytes: bytes.length,
  };
}

describe("the site's icons", () => {
  it("ships an SVG, a PNG fallback and an apple-touch-icon", () => {
    expect(shipped).toContain("favicon.svg");
    expect(shipped.some((n) => n.endsWith(".png") && n.startsWith("favicon"))).toBe(true);
    expect(shipped).toContain("apple-touch-icon.png");
  });

  // The defect itself. Not "an icon exists" — the starter's icon exists too.
  it("ships nothing that is still the starter's skeleton icon", () => {
    expect(shipped.length).toBeGreaterThan(0);
    for (const name of shipped) {
      const sha = createHash("sha256").update(read(name)).digest("hex");
      expect(sha, `${name} is byte-identical to reddoor-starter's template icon`).not.toBe(
        TEMPLATE_ICON_SHA256,
      );
    }
  });

  // Both directions. A file nobody links is dead weight that a future session
  // will "fix" by pointing at it; a link with no file is a 404 in every tab.
  it("links every icon it ships, and ships every icon it links", () => {
    const linked = links.map((l) => basename(l.href)).sort();
    expect(linked).toEqual(shipped);
  });

  it("declares each icon's real type, and points apple-touch-icon at its own file", () => {
    const svg = links.find((l) => l.href.endsWith(".svg"));
    expect(svg?.type, "the SVG icon needs type=image/svg+xml or Safari ignores it").toBe(
      "image/svg+xml",
    );
    const apple = links.find((l) => l.rel === "apple-touch-icon");
    expect(apple).toBeDefined();
    // The template pointed this at the same href as rel=icon — a 128px grey PNG
    // as a home-screen icon.
    expect(basename(apple!.href)).not.toBe(basename(svg!.href));
  });

  it("has PNGs whose pixels match the sizes attribute claiming them", () => {
    for (const link of links.filter((l) => l.href.endsWith(".png"))) {
      const file = png(basename(link.href));
      if (link.sizes) {
        const [w, h] = link.sizes.split("x").map(Number);
        expect(file.width, `${link.href} sizes="${link.sizes}"`).toBe(w);
        expect(file.height, `${link.href} sizes="${link.sizes}"`).toBe(h);
      }
    }
    // iOS renders this one at up to 180×180 and will upscale anything smaller.
    const apple = png("apple-touch-icon.png");
    expect(apple.width).toBe(180);
    expect(apple.height).toBe(180);
  });

  // iOS composites a home-screen icon's transparency onto BLACK. This mark is a
  // CUTOUT — the fill is the block and the letters are holes — so a transparent
  // ground does not make a floating logo, it makes a black RI inside a garnet
  // square. The same transparency puts the browser's own tab colour inside the
  // letters, which is why the tab icon is opaque too.
  it("ships PNGs that cannot carry transparency at all", () => {
    for (const name of shipped.filter((n) => n.endsWith(".png"))) {
      const file = png(name);
      expect([4, 6], `${name} has an alpha channel`).not.toContain(file.colourType);
      expect(file.chunks, `${name} carries a tRNS chunk`).not.toContain("tRNS");
    }
  });

  // The SVG's ground is the same decision, and the SVG is the one a modern
  // browser actually uses.
  it("paints an opaque ground under the mark in the SVG", () => {
    const svg = read("favicon.svg").toString("utf8");
    const [, , w, h] = /viewBox="([^"]+)"/.exec(svg)![1].split(/\s+/);
    const ground = new RegExp(
      `<rect[^>]*\\bwidth="${w}"[^>]*\\bheight="${h}"[^>]*\\bfill="#[0-9a-fA-F]{3,6}"[^>]*/>`,
    ).exec(svg);
    expect(ground, "favicon.svg has no full-bleed <rect> ground").not.toBeNull();
    expect(svg.indexOf(ground![0]), "the ground must be painted BEFORE the mark").toBeLessThan(
      svg.indexOf("<path"),
    );
  });

  // The trap #4 named: `immutable` promises the bytes at a path never change,
  // which is only true of a content-hashed path. It was pinned on
  // `/favicon.png`, so correcting that file in place would have left returning
  // visitors on the skeleton for a year.
  it("is not pinned immutable in netlify.toml", () => {
    const blocks = [
      ...netlifyToml.matchAll(/\[\[headers\]\]\s*\n\s*for = "([^"]+)"([\s\S]*?)(?=\n\[|$)/g),
    ];
    for (const [, path, body] of blocks) {
      if (!ICON_FILE.test(basename(path))) continue;
      expect(body, `${path} is pinned immutable`).not.toMatch(/immutable/);
    }
  });
});

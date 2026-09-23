// @vitest-environment node
//
// THE GUARD ON THE COMMITTED PLACEHOLDER, and it is the whole reason #122 is
// shaped the way it is.
//
// `static/map-home-*.webp` is a PICTURE of `static/map-style.json` at a camera
// from `src/lib/map-home.ts`. Nothing in a browser, a build or a unit test
// would ever notice the day those three stopped describing the same map: the
// page would render a perfectly good image of a map that no longer exists,
// which is this repo's signature defect with a new coat on. So the generator
// records every input it used in `scripts/map-home.manifest.json`, and this
// file reads the COMMITTED bytes and re-derives each one. It needs no network,
// no browser and no CMS.
//
// WHY A MANIFEST AND NOT A RE-RENDER. Nothing offline can re-derive a raster —
// it needs Chromium, WebGL and OpenFreeMap's tiles — so a test that tried would
// either be a network test or would prove nothing. The manifest is the second
// copy of the truth, exactly as `scripts/map-style.sha256` is for the style,
// and the same argument applies: a tool cannot vouch for its own output.
//
// AND THE LAST CASE IS THE ONE THAT MATTERS MOST. A digest check proves the
// bytes are the bytes the generator wrote; it cannot prove those bytes are a
// MAP. A render whose every tile request failed still fires `idle`, still
// screenshots, and still commits — as a flat #f2efe9 rectangle with a perfectly
// valid digest. So the committed file is decoded and its ink counted here, and
// the pass needs a number only a drawn map produces. An error matcher could
// only ever have denied.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, it, expect } from "vitest";

import { digest, inkStats, MIN_DISTINCT_COLOURS, MIN_PAINTED_SHARE } from "./map-home.mjs";
import { MAP_HOME, MAP_HOME_GROUND } from "../src/lib/map-home";

const ROOT = join(import.meta.dirname, "..");
const STYLE_PATH = join(ROOT, "static", "map-style.json");
const MANIFEST_PATH = join(ROOT, "scripts", "map-home.manifest.json");

const styleBytes = readFileSync(STYLE_PATH);
const style = JSON.parse(styleBytes.toString("utf-8"));
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
const frames = Object.entries(MAP_HOME);

describe("the raster is a picture of the style beside it", () => {
  it("was rendered from the committed static/map-style.json, byte for byte", () => {
    // THE GUARD #122 CALLS "the part that matters". Re-run `pnpm map:style`
    // and this goes red until `pnpm map:home` has run too — which is correct:
    // a repainted road is a repainted placeholder.
    expect(manifest.styleDigest, "manifest styleDigest is empty or malformed").toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(
      createHash("sha256").update(styleBytes).digest("hex"),
      "static/map-style.json has changed since the placeholder was rendered. " +
        "The committed raster is a picture of a map that no longer exists — " +
        "re-run `pnpm map:home` and commit both.",
    ).toBe(manifest.styleDigest);
  });

  it("paints the style's own background colour in its margins", () => {
    // The raster is centred at its natural size, so a container wider than it
    // shows this colour. A different beige is a seam, at exactly the moment
    // the tiles arrive.
    const background = style.layers.find((l: { type: string }) => l.type === "background") as {
      paint: Record<string, string>;
    };
    expect(background.paint["background-color"]).toBe(MAP_HOME_GROUND);
    expect(manifest.ground).toBe(MAP_HOME_GROUND);
  });
});

describe("the raster is a picture of MAP_HOME", () => {
  it.each(frames)("%s was rendered at the camera the app constructs", (key, frame) => {
    // The second guard #122 names: if the constant and the image part company
    // the placeholder is a lie and nothing else would notice. (The OTHER half
    // of that guard — that MapLibre is constructed with this same camera —
    // is asserted in src/lib/components/PropertyMap.test.ts, because it is a
    // claim about the component and not about the file.)
    const recorded = manifest.frames[key];
    expect(recorded, `manifest has no ${key} frame`).toBeDefined();
    expect(recorded.camera).toEqual(frame.camera);
    expect(recorded.raster).toEqual(frame.raster);
    expect(recorded.file).toBe(frame.file);
  });

  it("records every frame the app draws, and no others", () => {
    expect(Object.keys(manifest.frames).sort()).toEqual(Object.keys(MAP_HOME).sort());
  });
});

describe("the committed file is the file the generator wrote", () => {
  it.each(frames)("%s matches its recorded digest", (key, frame) => {
    const bytes = readFileSync(join(ROOT, "static", frame.file));
    const recorded = manifest.frames[key];
    expect(recorded.digest, `manifest ${key}.digest is malformed`).toMatch(/^[0-9a-f]{64}$/);
    expect(
      digest(bytes),
      `static/${frame.file} does not match its digest in scripts/map-home.manifest.json — ` +
        "it was replaced by hand, or regenerated without committing the manifest.",
    ).toBe(recorded.digest);
    expect(bytes.length).toBe(recorded.bytes);
  });
});

describe("and the file is a MAP, which no digest can say", () => {
  it.each(frames)("%s decodes at its declared size", async (_key, frame) => {
    const meta = await sharp(join(ROOT, "static", frame.file)).metadata();
    expect(meta.format).toBe("webp");
    // The size the component writes into `background-size`. A raster that
    // decoded smaller would be silently scaled by the browser, and a scaled
    // placeholder cannot align with the tiles.
    expect({ width: meta.width, height: meta.height }).toEqual(frame.raster);
  });

  it.each(frames)("%s has the ink of a drawn map, not a flat fill", async (key, frame) => {
    const raw = await sharp(join(ROOT, "static", frame.file))
      .removeAlpha()
      .raw()
      .toBuffer();
    const ink = inkStats(raw, frame.raster, MAP_HOME_GROUND);
    // A blank render scores a handful of colours and ~0% painted. The floors
    // are far under what a real render produces (full 15964 / 20.5%, compact
    // 10001 / 26.0%), because this catches "no tiles arrived", not bad
    // cartography.
    expect(
      ink.distinctColours,
      `static/${frame.file} has ${ink.distinctColours} distinct colours — it is a flat fill, ` +
        "not a map. The render's tiles never arrived.",
    ).toBeGreaterThanOrEqual(MIN_DISTINCT_COLOURS);
    expect(ink.paintedShare).toBeGreaterThanOrEqual(MIN_PAINTED_SHARE);
    // And it is the SAME picture the generator measured, not merely a busy
    // one: re-encoding by hand at another quality would keep the ink and lose
    // this.
    expect(ink.distinctColours).toBe(manifest.frames[key].distinctColours);
    expect(Number(ink.paintedShare.toFixed(4))).toBe(manifest.frames[key].paintedShare);
  });
});

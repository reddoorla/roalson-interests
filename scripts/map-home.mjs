// Renders `static/map-home-*.webp` — the fixed-frame raster placeholder every
// property map opens on (#122) — from OUR OWN `static/map-style.json`.
//
//   pnpm map:home              # render both frames, write the rasters + manifest
//   pnpm map:home --print      # render, report, write NOTHING
//
// THIS IS A MAINTENANCE TOOL AND IT IS NEVER PART OF `pnpm build`, for the same
// reason `scripts/map-style.mjs` is not: it needs a browser and a network, and
// a build that fetches OpenFreeMap's tiles would break on a PR that touched
// nothing near the map. The OUTPUT is committed and guarded offline by
// `scripts/map-home.test.ts`.
//
// WHAT IT IS A PICTURE OF, AND WHAT THAT BUYS.
// `PropertyMap.svelte` shows a list of links until 426.4 KB of maplibre-gl has
// downloaded, parsed and executed — and not one tile is requested until it has.
// The raster is that first state instead. It is honest only because the camera
// is a CONSTANT (`$lib/map-home`): a placeholder rendered at `fitCamera(points)`
// would be derived from published Prismic content and could go silently wrong
// after a publish that never touches this repo, with nothing offline able to
// tell. Fixed, the only input that can move underneath it is the style file in
// the same commit — so the guard is a digest comparison, which is a guard that
// works rather than one that cannot.
//
// WHY MAPLIBRE IN A REAL BROWSER RATHER THAN A NATIVE RENDERER.
// `maplibre-gl-native` would be a second engine with a second set of rendering
// bugs, and the point of the placeholder is that it is INDISTINGUISHABLE from
// the first frame the shipped engine draws. Playwright's Chromium is already a
// devDependency (the smoke suite), and the map it renders is the same
// maplibre-gl 6.10.0 from this repo's own node_modules, on the same style, at
// the same camera, at devicePixelRatio 1. Nothing about the image is a
// re-implementation.
//
// DETERMINISM, HONESTLY BOUNDED. Given the same style, the same camera, the
// same maplibre build and the same upstream tiles, this writes the same picture
// — but the TILES are OpenFreeMap's and they move on their own schedule, so a
// re-run months from now can legitimately differ. That is the same boundary
// `scripts/map-style.mjs` draws, and it is why the digest that CI checks is the
// STYLE's, not a re-render's: nothing offline can re-derive a raster, so the
// manifest is the second copy of the truth.
//
// A RENDER THAT DREW NOTHING IS A FAILURE, NOT A BLANK PICTURE. A page whose
// tile requests all failed still fires `idle` and still screenshots cleanly —
// it just returns a flat #f2efe9 rectangle. So the pixels are counted before
// anything is written, and both counts go in the manifest for the offline test
// to re-measure against the committed file. An error matcher could only deny;
// this is the artifact a working render is the only way to produce.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { MAP_HOME, MAP_HOME_GROUND } from "../src/lib/map-home.ts";

// `@playwright/test` is imported inside `main()` and not here, so that
// `scripts/map-home.test.ts` — which reads the committed artifacts and needs
// nothing but the filesystem — can import `digest`, `inkStats` and the floors
// below without dragging a browser driver into the unit suite.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC = join(ROOT, "static");
const STYLE_PATH = join(STATIC, "map-style.json");
const MANIFEST_PATH = join(ROOT, "scripts", "map-home.manifest.json");
const MAPLIBRE_DIST = join(ROOT, "node_modules", "maplibre-gl", "dist");

/** Mirrors `scripts/map-style.mjs`'s, so the two digests are the same thing. */
export function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The render must produce a MAP, and these two numbers are how that is said
 * without an error matcher.
 *
 * `distinctColours` is small for a blank fill and large for a drawn map;
 * `paintedShare` is the fraction of pixels far enough from the style's
 * background colour to be ink — a road, water, a landuse wash, a label.
 * Measured on the committed render: full 15964 colours / 20.5% painted,
 * compact 10001 / 26.0%. The floors are deliberately far under those; they
 * exist to catch "nothing drew", not to police cartography.
 *
 * `INK_TOLERANCE` IS NOT SLOP, it is what makes the number survive the encode.
 * Measured against an exact-equality version of this function on the same
 * files: webp at q82 perturbs even the flat ground, so NO pixel is still
 * exactly #f2efe9 and `paintedShare` read 100.0% on both frames — a statistic
 * that a blank render would have scored just as well on, i.e. a green that
 * proved nothing. Six levels of Chebyshev distance is under the encoder's
 * noise and far under any real ink.
 */
export const MIN_DISTINCT_COLOURS = 64;
export const MIN_PAINTED_SHARE = 0.15;
export const INK_TOLERANCE = 6;

/** Distinct RGB triples, and the share of pixels that are ink rather than
 *  `ground` (within `INK_TOLERANCE` per channel). */
export function inkStats(raw, { width, height }, ground) {
  const want = [
    parseInt(ground.slice(1, 3), 16),
    parseInt(ground.slice(3, 5), 16),
    parseInt(ground.slice(5, 7), 16),
  ];
  const seen = new Set();
  let painted = 0;
  for (let i = 0; i < width * height; i += 1) {
    const r = raw[i * 3];
    const g = raw[i * 3 + 1];
    const b = raw[i * 3 + 2];
    seen.add((r << 16) | (g << 8) | b);
    const off = Math.max(Math.abs(r - want[0]), Math.abs(g - want[1]), Math.abs(b - want[2]));
    if (off > INK_TOLERANCE) painted += 1;
  }
  return { distinctColours: seen.size, paintedShare: painted / (width * height) };
}

const TYPES = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".map": "application/json",
  ".css": "text/css",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/** Serves `static/` at `/` and maplibre's dist at `/vendor/`, so the style is
 *  fetched from the same relative path the site serves it from. */
function serve() {
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    const file = path.startsWith("/vendor/")
      ? join(MAPLIBRE_DIST, path.slice("/vendor/".length))
      : join(STATIC, path.slice(1));
    if (!file.startsWith(MAPLIBRE_DIST) && !file.startsWith(STATIC)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/** The render harness. `window.render(frame)` resolves when MapLibre says the
 *  frame is idle AND every tile it wanted is in — `idle` alone fires on a map
 *  whose tiles all 404'd. Errors are collected, never swallowed. */
const PAGE = `<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="/vendor/maplibre-gl.css">
<style>html,body{margin:0;background:#fff}#box{position:absolute;top:0;left:0}</style>
<div id="box"></div>
<script type="module">
// maplibre-gl 6 ships ESM only, and its worker resolves off import.meta.url —
// which here is /vendor/, where the server puts the whole dist. No bundler and
// no ?worker&url dance: the same three files the app ships, served flat.
import * as maplibregl from "/vendor/maplibre-gl.mjs";
window.__errors = [];
window.__map = null;
window.render = function (frame) {
  // One frame at a time in one box. Without the teardown the second call
  // stacks a second canvas on the first and the screenshot locator finds two.
  if (window.__map) { window.__map.remove(); window.__map = null; }
  const box = document.getElementById("box");
  box.style.width = frame.raster.width + "px";
  box.style.height = frame.raster.height + "px";
  return new Promise(function (resolve, reject) {
    const map = new maplibregl.Map({
      container: box,
      style: "/map-style.json",
      center: [frame.camera.lng, frame.camera.lat],
      zoom: frame.camera.zoom,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
    });
    window.__map = map;
    map.on("error", function (e) {
      window.__errors.push(String((e && e.error && e.error.message) || e));
    });
    const deadline = setTimeout(function () { reject(new Error("render timed out")); }, 120000);
    map.on("idle", function () {
      if (!map.areTilesLoaded() || !map.isStyleLoaded()) return;
      clearTimeout(deadline);
      resolve({ zoom: map.getZoom(), center: map.getCenter().toArray() });
    });
  });
};
</script>`;

async function main() {
  const printOnly = process.argv.includes("--print");
  const styleBytes = readFileSync(STYLE_PATH);
  const styleDigest = digest(styleBytes);
  const style = JSON.parse(styleBytes.toString("utf-8"));
  const background = style.layers.find((l) => l.type === "background")?.paint?.["background-color"];
  const problems = [];
  if (background !== MAP_HOME_GROUND) {
    problems.push(
      `the style's background layer is ${background} but MAP_HOME_GROUND is ${MAP_HOME_GROUND}`,
    );
  }

  const { chromium } = await import("@playwright/test");
  const { server, port } = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 960 },
    deviceScaleFactor: 1,
  });
  // A page that cannot load the engine would otherwise time out silently on a
  // `waitForFunction`, which says nothing about why.
  page.on("pageerror", (err) => console.error(`  ! page error: ${err.message}`));
  page.on("requestfailed", (r) =>
    console.error(`  ! ${r.url()} failed: ${r.failure()?.errorText}`),
  );
  page.on("response", (r) => {
    if (!r.ok()) console.error(`  ! ${r.status()} ${r.url()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  // The harness is a module script, so it is deferred: asking for it before it
  // has evaluated is a race that would show up as "render is not a function"
  // on a slow machine and never on this one.
  await page.waitForFunction(() => typeof window.render === "function");

  const frames = {};
  for (const [key, frame] of Object.entries(MAP_HOME)) {
    const drawn = await page.evaluate((f) => window.render(f), frame);
    const errors = await page.evaluate(() => window.__errors.splice(0));
    if (errors.length > 0) problems.push(`${key}: maplibre reported ${errors.join("; ")}`);
    // The camera the engine ACTUALLY settled on, not the one it was asked for.
    if (drawn.zoom !== frame.camera.zoom) {
      problems.push(`${key}: asked for z${frame.camera.zoom}, drew z${drawn.zoom}`);
    }

    const png = await page.locator("#box canvas").screenshot({ type: "png" });
    const image = sharp(png);
    const meta = await image.metadata();
    if (meta.width !== frame.raster.width || meta.height !== frame.raster.height) {
      problems.push(
        `${key}: rendered ${meta.width}x${meta.height}, wanted ` +
          `${frame.raster.width}x${frame.raster.height}`,
      );
    }
    // Lossless would be ~4x the bytes on a map this flat; q82 is the knee.
    const webp = await sharp(png).removeAlpha().webp({ quality: 82, effort: 6 }).toBuffer();
    // MEASURED ON THE ENCODED FILE, NOT THE SCREENSHOT, and that is a
    // correction this script paid for rather than reasoned out: the counts
    // recorded here are re-derived by `scripts/map-home.test.ts` from the
    // COMMITTED webp, and a lossy encode moves every one of them (the compact
    // frame went 4622 -> 10001 distinct colours across the encode). Measuring
    // the PNG would have put a number in the manifest that the guard could
    // never reproduce.
    const raw = await sharp(webp).removeAlpha().raw().toBuffer();
    const ink = inkStats(raw, frame.raster, MAP_HOME_GROUND);
    if (ink.distinctColours < MIN_DISTINCT_COLOURS || ink.paintedShare < MIN_PAINTED_SHARE) {
      problems.push(
        `${key}: the render is blank — ${ink.distinctColours} colours, ` +
          `${(ink.paintedShare * 100).toFixed(1)}% painted. Tiles did not arrive.`,
      );
    }
    frames[key] = { frame, webp, ink, drawn, bytes: webp.length };
    console.log(
      `${key.padEnd(8)} ${frame.raster.width}x${frame.raster.height} z${frame.camera.zoom} ` +
        `-> ${(webp.length / 1024).toFixed(1)} KB webp, ${ink.distinctColours} colours, ` +
        `${(ink.paintedShare * 100).toFixed(1)}% painted`,
    );
  }

  await browser.close();
  server.close();

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) — writing NOTHING:\n`);
    for (const problem of problems) console.error(`  x ${problem}`);
    process.exit(1);
  }
  if (printOnly) {
    console.log("\n--print: nothing written.");
    return;
  }

  const manifest = {
    // Read this first. Everything under it describes ONE render.
    README:
      "Generated by `pnpm map:home`. Guarded offline by scripts/map-home.test.ts. " +
      "styleDigest is the sha256 of static/map-style.json AS RENDERED FROM — when " +
      "the style changes and this does not, the raster is a picture of a map that " +
      "no longer exists and the test goes red. Re-run `pnpm map:home`.",
    styleDigest,
    ground: MAP_HOME_GROUND,
    minDistinctColours: MIN_DISTINCT_COLOURS,
    minPaintedShare: MIN_PAINTED_SHARE,
    frames: {},
  };
  for (const [key, { frame, webp, ink }] of Object.entries(frames)) {
    writeFileSync(join(STATIC, frame.file), webp);
    manifest.frames[key] = {
      file: frame.file,
      camera: frame.camera,
      raster: frame.raster,
      bytes: webp.length,
      digest: digest(webp),
      distinctColours: ink.distinctColours,
      paintedShare: Number(ink.paintedShare.toFixed(4)),
    };
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nscripts/map-home.manifest.json written; style ${styleDigest}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

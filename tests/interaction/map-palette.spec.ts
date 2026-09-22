import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { hydrated } from "./hydrated";

// WHAT COLOUR THE TILES ACTUALLY COME OUT (#13 follow-up).
//
// `scripts/map-style.test.ts` proves the committed style SAYS `#f2efe9`. That
// is a claim about a JSON file and it is worth nothing on its own: the style
// could fail to load, `PUBLIC_MAP_STYLE_URL` could still point upstream, a
// same-origin fetch could be refused by CSP, MapLibre could reject a layer and
// carry on. Every one of those failure modes ends with a map on the page and
// no error in the console.
//
// So the evidence here is READ OFF THE PIXELS: the map element is screenshotted
// after MapLibre's own `load`, decoded, and the exact colours counted. A
// working system is the only thing that produces 83% of a canvas in a colour
// that exists nowhere but our style file.
//
// THIS RUNS AGAINST /properties, NOT /dev/properties, on purpose. The rest of
// tests/interaction measures geometry on the dev fixtures; this one has to be
// able to run against a PRODUCTION build (`REDDOOR_GATE_SERVER=preview`), where
// every /dev/* route 404s by design (src/routes/dev/+layout.server.ts). The
// coupling to published content is the same one tests/smoke/routes.ts already
// accepts for /properties/25331-ih-10-west.
//
// WHAT reducedMotion MAKES VACUOUS HERE: nothing. The shared config forces
// `contextOptions.reducedMotion: "reduce"` on every test and the axe runner
// injects `*{transition:none}` — both act on CSS and on MapLibre's easing, and
// neither can change which colour a tile is rasterised in. The camera is set by
// `jumpTo` at boot either way (see $lib/property-map's header).
const MAP = "[data-property-map]";

/** The colours at issue. Upstream's two are here to be DENIED, never to grant. */
const OURS = { land: "#f2efe9", water: "#a8b4b8" };
const UPSTREAM = { land: "#f8f4f0", water: "#9ebdff" };

/** Positive evidence a frame was drawn: MapLibre's own `load` sets this. */
const drawn = (page: Page, nth = 0) =>
  expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", { timeout: 40_000 });

/** Exact-colour histogram of the first map's rendered pixels. */
async function pixels(page: Page) {
  const shot = await page.locator(MAP).first().screenshot();
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += info.channels) {
    const hex =
      "#" +
      data[i].toString(16).padStart(2, "0") +
      data[i + 1].toString(16).padStart(2, "0") +
      data[i + 2].toString(16).padStart(2, "0");
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return { counts, total: info.width * info.height, width: info.width, height: info.height };
}

test.describe("the tiles paint in the brand palette", () => {
  test("the ground is ours and the water is ours, counted off the canvas", async ({ page }) => {
    await page.goto("/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page);

    // `load` fires when the style and the FIRST tiles are in; the rest of the
    // frame settles over the next second or so, so the sample polls rather than
    // reading once. Measured against the production build on 2026-09-22, on the
    // shared config's Desktop Chrome viewport: 203,832 px, of which 169,425
    // (83.12%) are exactly #f2efe9 and 1,684 exactly #a8b4b8. At 1440x900 the
    // same page gives 234,228 px, 194,510 (83.04%) and 3,103.
    const measured = { total: 0, land: 0, water: 0, upstreamLand: 0, upstreamWater: 0 };
    await expect
      .poll(
        async () => {
          const { counts, total } = await pixels(page);
          measured.total = total;
          measured.land = counts.get(OURS.land) ?? 0;
          measured.water = counts.get(OURS.water) ?? 0;
          measured.upstreamLand = counts.get(UPSTREAM.land) ?? 0;
          measured.upstreamWater = counts.get(UPSTREAM.water) ?? 0;
          // LOGGED ON EVERY SAMPLE, not after the poll. A poll that never
          // succeeds throws, so anything printed afterwards is printed only on
          // the GREEN path — and the numbers are the whole point of the red
          // one. Mutating DEFAULT_MAP_STYLE_URL back to upstream printed
          // "203832 px: #f2efe9 596 (0.29%), #a8b4b8 0, #f8f4f0 0, #9ebdff
          // 1676" here, which names the failure — and incidentally shows why
          // the #f8f4f0 deny below is nearly worthless. Without this line the
          // red was a bare "expected true".
          console.log(
            `[map-palette] ${measured.total} px: ${OURS.land} ${measured.land} ` +
              `(${((measured.land / measured.total) * 100).toFixed(2)}%), ` +
              `${OURS.water} ${measured.water}, ` +
              `${UPSTREAM.land} ${measured.upstreamLand}, ` +
              `${UPSTREAM.water} ${measured.upstreamWater}`,
          );
          // THE POSITIVE HALF, and it is the loop's EXIT CONDITION rather than
          // an assertion afterwards: most of this frame is open Texas
          // rangeland, i.e. the `background` layer and nothing else, so our
          // off-white is the MAJORITY colour or the style did not take. Water
          // is small but not optional — Choke Canyon Reservoir, Lake Corpus
          // Christi and the Nueces are all inside the land section's frame, so
          // a `water` layer that failed to parse takes it to zero.
          return (
            measured.total > 100_000 && measured.land / measured.total > 0.5 && measured.water > 500
          );
        },
        {
          message: "the canvas never came up in the brand palette — counts above",
          timeout: 30_000,
        },
      )
      .toBe(true);

    // THE DENYING HALF, and one of the two is nearly worthless — recorded here
    // rather than quietly relied on. Upstream's water #9ebdff really does go to
    // zero (measured: 3,089 px with the stock style, 0 with ours), so that one
    // discriminates. Upstream's LAND #f8f4f0 measures 0 px with the stock style
    // TOO, because liberty multiplies a Natural Earth hillshade over the
    // background and no pixel survives neat. Asserting its absence would pass
    // against the very style it is supposed to exclude. It stays as a deny —
    // it can only ever fail a green, never grant one — but the 50% floor above
    // is what actually rules the old style out (it gives 595 px, 0.25%).
    expect(measured.upstreamWater, "upstream's blue water").toBe(0);
    expect(measured.upstreamLand, "upstream's neat ground").toBe(0);
  });

  test("makes no Natural Earth raster request at all", async ({ page }) => {
    const hits: string[] = [];
    const tiles: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("natural_earth") || url.includes("ne2sr")) hits.push(url);
      if (url.includes("tiles.openfreemap.org")) tiles.push(url);
    });

    await page.goto("/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page);
    await page.waitForTimeout(3000);

    // NON-VACUITY FIRST. "No requests to X" is trivially true of a listener
    // that never fired, so prove the map really did go to the network before
    // believing the zero.
    expect(tiles.length, "the map fetched nothing from the tile host at all").toBeGreaterThan(2);
    expect(hits, "the Natural Earth hillshade is gone from the style").toEqual([]);
  });
});

test.describe("the attribution", () => {
  // THE PRECEDENCE PROOF. The credit line comes out of OpenFreeMap's TileJSON,
  // not out of our code, and our style overrides it only because MapLibre
  // resolves a source as `pick(extend(tileJSON, options), [...])` — `options`
  // being our own source spec, written over the fetched document. That is a
  // claim about a dependency's internals, and reading it in
  // node_modules/maplibre-gl/dist/maplibre-gl-dev.mjs is not proof that the
  // shipped bundle behaves that way.
  //
  // So both halves are asserted in one test: the fetched document DOES still
  // carry "OpenFreeMap" (non-vacuity — otherwise suppressing it proves
  // nothing), and the rendered control does NOT. If the precedence ran the
  // other way the second assertion goes red with the word in it.
  test("renders our line, and the TileJSON's own line is really a different one", async ({
    page,
  }) => {
    await page.goto("/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page);

    const fetched = await page.evaluate(async () => {
      const response = await fetch("https://tiles.openfreemap.org/planet");
      return (await response.json()).attribution as string;
    });
    expect(
      fetched,
      "OpenFreeMap stopped sending its own name; this test no longer proves precedence",
    ).toContain("OpenFreeMap");

    const control = page.locator(`${MAP} .maplibregl-ctrl-attrib`).first();
    await expect(control).toBeVisible();
    const rendered = await control.innerText();
    // The licence conditions stay: OpenFreeMap's terms make OpenMapTiles and
    // OpenStreetMap required and their own name explicitly optional.
    expect(rendered).toContain("OpenMapTiles");
    expect(rendered).toContain("OpenStreetMap");
    expect(rendered, "our source spec did not beat the fetched TileJSON").not.toContain(
      "OpenFreeMap",
    );

    // And the links are real links, because a credit nobody can follow is not
    // one. Their hrefs come from our style, so this also pins the markup.
    await expect(control.locator('a[href="https://www.openmaptiles.org/"]')).toHaveCount(1);
    await expect(control.locator('a[href="https://www.openstreetmap.org/copyright"]')).toHaveCount(
      1,
    );
  });
});

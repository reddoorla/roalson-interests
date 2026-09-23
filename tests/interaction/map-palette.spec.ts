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
// THIS USED TO RUN AGAINST /properties, AND THE REASON GIVEN FOR IT WAS FALSE.
// The header said it targeted the published route "on purpose" so that it could
// run against a production build under `REDDOOR_GATE_SERVER=preview`. Nothing
// ever ran it that way: `readGateServer` returns "dev" unless
// `package.json#reddoor.gateServer` is "preview", and this repo's `reddoor`
// block has only `a11yRoutes`. So `pnpm verify` and CI have always run this
// spec against `vite dev` — the claim bought nothing and cost the gate its
// determinism. (Review of #113; the preview gap is #120.)
//
// What it cost: the thresholds below were tuned to whatever was published that
// day — 17 land listings inside lng -98.9023..-97.8487, lat 27.4901..29.9813,
// whose 1,684 water pixels were Choke Canyon Reservoir, Lake Corpus Christi and
// the Nueces. `fitCamera` reframes on every publish. One listing outside that
// bbox and the reservoirs leave the frame, water falls under 500, and CI reds
// with "the canvas never came up in the brand palette" on a commit that touched
// no map code. The operator is actively publishing listings.
//
// SO IT MEASURES THE FIXTURE, like every other spec in this directory. The land
// section of `propertyListingFixture()` is four committed coordinates — Potranco
// Road, FM 1560 & Galm Road, Hwy 90 West at Castroville and IH-35 at New
// Braunfels — so the camera, the tiles and therefore the histogram are a
// function of this repository and nothing else. `fitCamera` puts it at
// -98.5045, 29.5397, z7.8765, i.e. lng -99.0162..-97.9928 and lat
// 28.7610..30.3124: Fredericksburg to Pleasanton, Medina Lake to New Braunfels.
// Measured three times in a row on 2026-09-22: 203,832 px, 150,381 (73.78%)
// `#f2efe9` and 952 `#a8b4b8`, byte-identical every run. A number here moving
// is now a real signal.
//
// NOT EVERY TEST IN THIS FILE MOVED, and the one that did not is the
// interesting one — see the comment on the Natural Earth case below. The
// fixture frame is z7.8765 and `natural_earth` is maxzoom 7, so on the fixture
// the stock style draws no hillshade either and "we request none" becomes free.
// Only the PIXEL GATE and the attribution moved; the raster test stays where it
// can still tell the two styles apart.
//
// WHAT THIS GIVES UP, SAID OUT LOUD. /dev/* 404s on a production build, so this
// spec can never be the thing that proves `/map-style.json` resolves in the
// shipped bundle — if `static/` stopped being copied into the publish directory,
// or a `kit.paths.base` were introduced, the map would boot with no style and
// this gate would stay green. It could not have caught that before either
// (it ran against dev, which serves `static/` directly), so nothing was lost
// here; the difference is that the file no longer claims otherwise. #120.
//
// WHAT reducedMotion MAKES VACUOUS HERE: nothing. The shared config forces
// `contextOptions.reducedMotion: "reduce"` on every test and the axe runner
// injects `*{transition:none}` — both act on CSS and on MapLibre's easing, and
// neither can change which colour a tile is rasterised in. The camera is set by
// `jumpTo` at boot either way (see $lib/property-map's header).
const MAP = "[data-property-map]";

/** OpenFreeMap's stock style, for the control in the Natural Earth case below.
 *  A LITERAL and not `MAP_TILE_HOST` from $lib on purpose — twice over. This
 *  file cannot import from src/lib at all (the chain reaches
 *  @prismicio/svelte's .svelte entry and Playwright's loader has no transform
 *  for it), and the string is a THIRD PARTY'S document rather than our
 *  configuration: if we ever moved providers, the control would have to be
 *  re-chosen by hand anyway. Same literal as the request filters below. */
const STOCK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

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
    await page.goto("/dev/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page);

    // `load` fires when the style and the FIRST tiles are in; the rest of the
    // frame settles over the next second or so, so the sample polls rather than
    // reading once. Measured on the fixture on 2026-09-22, on the shared
    // config's Desktop Chrome viewport, three runs, identical every time:
    // 203,832 px, of which 150,381 (73.78%) are exactly #f2efe9 and 952 exactly
    // #a8b4b8. (Against the published portfolio the same test read 169,425 /
    // 83.12% / 1,684 — a different frame, which is the whole point.)
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
          // an assertion afterwards: most of this frame is open Hill Country
          // and SA-metro rangeland, i.e. the `background` layer and nothing
          // else, so our off-white is the MAJORITY colour or the style did not
          // take. Water is small but not optional, and it is FOUR NAMED LAKES,
          // counted by flood-filling the blobs and unprojecting each centroid:
          // Canyon Lake 410 px at 29.8878,-98.2535; Medina Lake 289 at
          // 29.5802,-98.9583; Calaveras Lake 165 at 29.3058,-98.3208; Braunig
          // Lake 63 at 29.2567,-98.3802 — 927 of the 952, across 24 blobs. A
          // `water` layer that failed to parse takes all of it to zero.
          //
          // THE FLOORS ARE NOT THE MEASUREMENTS. 0.5 against a measured 0.7378
          // and 300 against a measured 952 leave room for a tile server that
          // hands back a slightly different generalisation, while still being
          // nowhere near what the old style gives (0.25% land, 0 water). They
          // are floors on a DETERMINISTIC frame now, so if one of them ever
          // trips it is the palette and not the portfolio.
          return (
            measured.total > 100_000 && measured.land / measured.total > 0.5 && measured.water > 300
          );
        },
        {
          message: "the canvas never came up in the brand palette — counts above",
          timeout: 30_000,
        },
      )
      .toBe(true);

    // THE DENYING HALF — and a belief this move CORRECTED, so it is recorded
    // rather than carried over. On the published frame the #f8f4f0 deny was
    // worth nothing: the 2026-09-22 entry measured 0 px of it with the STOCK
    // style, because liberty multiplies a Natural Earth hillshade over its
    // background and no pixel survived neat, so asserting its absence passed
    // against the very style it excluded.
    //
    // That was a fact about z6.948, not about the style. `natural_earth` is
    // maxzoom 7 and the fixture frame is z7.8765, so the hillshade is not drawn
    // here at all and the stock background DOES survive neat: measured
    // 147,888 px (72.55%) of #f8f4f0 with the stock style route-intercepted in,
    // against 0 with ours. On this frame BOTH denies discriminate.
    //
    // They are still only denies — an error matcher may fail a green, never
    // grant one — and the 50% floor above is still what positively rules the
    // old style out (it gives 595 px of our ground, 0.29%).
    expect(measured.upstreamWater, "upstream's blue water").toBe(0);
    expect(measured.upstreamLand, "upstream's neat ground").toBe(0);
  });

  // THIS ONE STAYS ON /properties, AND THE FIXTURE IS THE REASON (review of
  // #113). Moving it with the pixel gate above looked free and is not: the
  // `natural_earth` LAYER is maxzoom 7, the fixture land section fits at
  // z7.8765, and a layer past its maxzoom draws nothing. Measured both ways on
  // 2026-09-22, stock liberty route-intercepted in as the control:
  //
  //   /dev/properties  z7.8765   ours 0 requests   STOCK LIBERTY 0 requests
  //   /properties      z6.948    ours 0 requests   stock liberty 1 request
  //                                                (natural_earth/ne2sr/6/14/26.png)
  //
  // On the fixture frame the zero is free — the stock style this test exists to
  // exclude produces the same zero — so the test would have passed while
  // proving nothing, which is the shape CLAUDE.md opens with. On the published
  // frame it discriminates, so that is where it runs.
  //
  // THE PRICE, STATED. This test is therefore still coupled to published
  // content: a portfolio that reframes past z7 takes the hillshade off the map
  // and makes the zero free again. That is why the control below is IN the test
  // rather than in this comment — it fails loudly, naming the frame, instead of
  // going quietly vacuous. #120 covers the real fix.
  test("makes no Natural Earth raster request, on a frame where the stock style does", async ({
    page,
  }) => {
    const watch = (p: typeof page, ne: string[], tiles: string[]) =>
      p.on("request", (request) => {
        const url = request.url();
        if (url.includes("natural_earth") || url.includes("ne2sr")) ne.push(url);
        if (url.includes("tiles.openfreemap.org")) tiles.push(url);
      });

    const ours: string[] = [];
    const tiles: string[] = [];
    watch(page, ours, tiles);
    await page.goto("/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page);
    await page.waitForTimeout(3000);

    // NON-VACUITY, PART ONE. "No requests to X" is trivially true of a listener
    // that never fired, so prove the map really did go to the network.
    expect(tiles.length, "the map fetched nothing from the tile host at all").toBeGreaterThan(2);

    // NON-VACUITY, PART TWO, AND IT IS THE ONE THAT MATTERS. Run the SAME page
    // at the SAME frame with OpenFreeMap's stock style served in place of ours,
    // and require that it really does fetch the hillshade. Without this the
    // zero above is just as true of a frame where nobody would have drawn it.
    const control = await page.context().newPage();
    const controlNe: string[] = [];
    const controlTiles: string[] = [];
    watch(control, controlNe, controlTiles);
    await control.route("**/map-style.json", (route) =>
      route.fulfill({
        status: 302,
        headers: { location: STOCK_STYLE_URL },
      }),
    );
    await control.goto("/properties");
    await hydrated(control);
    await control.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(control);
    await control.waitForTimeout(3000);
    expect(
      controlNe.length,
      "the stock style fetched no hillshade at this frame either — the section now fits past " +
        "natural_earth's maxzoom 7, so this test proves nothing here. See #120.",
    ).toBeGreaterThan(0);
    await control.close();

    // AND ONLY NOW is the zero worth something.
    expect(ours, "the Natural Earth hillshade is gone from the style").toEqual([]);
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
    await page.goto("/dev/properties");
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
    // AND THE WORD THE OSMF GUIDELINES ASK FOR, read off the RENDERED control
    // rather than off the constant. scripts/map-style.test.ts pins it in
    // ATTRIBUTION and in the committed JSON; neither of those proves MapLibre
    // put it on the page, which is the only place it discharges the obligation.
    // (Review of #113.)
    expect(rendered, "the rendered credit does not name OpenStreetMap's contributors").toContain(
      "OpenStreetMap contributors",
    );
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

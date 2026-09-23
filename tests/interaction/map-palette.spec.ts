import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { cameraProbeInstalled, jumpToZoom, mapZoom, watchCamera } from "./camera-probe";
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
// EVERY TEST IN THIS FILE IS ON THE FIXTURE NOW, and the last one to move was
// the interesting one. The Natural Earth case was left on /properties because
// the fixture fits at z7.8765, `natural_earth` is maxzoom 7, and on that frame
// the stock style draws no hillshade either — so the control went vacuous and
// the guard inside it went red rather than pass for nothing. The answer was not
// a different route: it was to stop letting ANY section's fit pick the zoom.
// That case now drives both maps to z6 through the camera probe. See its own
// comment.
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
//
// WHAT THE CAMERA (#112) DOES CHANGE is WHICH GROUND is under the sample, and
// that turned out to matter a great deal — see the note on the first case.
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
  // MEASURED AT 390, AND THAT IS NOT A STYLE CHOICE — IT IS THE ONLY WIDTH
  // WHERE THE FRAME IS DETERMINISTIC.
  //
  // This case was written before the map had a camera (#112). It sampled at the
  // shared config's Desktop Chrome viewport and its numbers — 203,832 px, of
  // which 169,425 (83.12%) #f2efe9 and 1,684 #a8b4b8 — are the LAND SECTION'S
  // FIT frame, which is what the map showed at every scroll position back then.
  // Its water premise is a property of that frame: Choke Canyon Reservoir, Lake
  // Corpus Christi and the Nueces are inside the fit of all 17 land listings.
  //
  // From `lg` the map now follows the card on the centre line, so it sits at
  // z12 on ONE listing and that premise is gone. Worse, the sampling itself
  // decides which: `locator.screenshot()` scrolls its target into view, the map
  // is 595 tall in a 720 viewport, and the scroll that makes it fully visible
  // puts a card on the centre line. Measured at 1280x720 after that scroll:
  // 83.37% #f2efe9 — the palette is plainly fine — but water **284**, against
  // the 500 this asserts. Centring six different land listings by hand gave
  // water 284 / 287 / 256 / 2,150 / 31,106 / 375: the count is now a fact about
  // which listing you happened to stop on, which is no basis for a threshold.
  //
  // Below `lg` the camera does not run AT ALL — `centreWatch` is not
  // constructed there (see PropertyListing.svelte), so `active` stays null and
  // `cameraMove` fits every point, forever. That is the same fit frame this
  // case was written against, now reachable deterministically. Measured at
  // 390x844: 67,335 px, 42,010 (62.39%) #f2efe9 and **12,113** #a8b4b8, with
  // both upstream colours at 0.
  //
  // Nothing about what this proves has changed: the colours are the style's,
  // the deny half is untouched, and the water margin is 24x rather than 3x.
  test("the ground is ours and the water is ours, counted off the canvas", async ({ page }) => {
    // BOTH halves of this line were changed on two branches for two reasons,
    // and they compose. `fix/map-palette-review` moved it to the fixture so
    // the frame stops depending on what is published in Prismic; the camera
    // branch moved it to 390 because at `lg` the centre rule now drives the
    // camera, so the frame there is whatever card is centred rather than the
    // section's fit. The fixture AT 390 is deterministic in both senses.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dev/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page);

    // Positive evidence the frame really is the section's fit and not one
    // listing: nothing is on the centre line, because nothing is watching it.
    expect(
      await page.evaluate(() => {
        const mid = window.innerHeight / 2;
        for (const li of document.querySelectorAll<HTMLElement>("[data-centre-id]")) {
          const box = li.getBoundingClientRect();
          if (box.top <= mid && box.bottom >= mid) return li.dataset.centreId ?? null;
        }
        return null;
      }),
      "no card drives the camera below `lg`, so this is the section's fit frame",
    ).toBeNull();

    // `load` fires when the style and the FIRST tiles are in; the rest of the
    // frame settles over the next second or so, so the sample polls rather than
    // reading once. Measured on the FIXTURE at 390x844 on 2026-09-22, three
    // runs, byte-identical every time: 70,350 px, of which 39,491 (56.14%) are
    // exactly #f2efe9 and 441 exactly #a8b4b8, with both upstream colours at 0.
    //
    // "BYTE-IDENTICAL" IS TOO STRONG, and this is the counterexample rather
    // than a rewrite of the claim above. The same three runs repeated inside a
    // full `pnpm verify` on a loaded machine (load average 10.15) gave 38,651
    // (54.94%) against the 39,491 (56.14%) recorded here, water 441 both
    // times: the land count moves by about a percent when tiles arrive late
    // enough for the poll to sample a partly-drawn frame.
    //
    // AND THE TOTAL IS NOT A CONSTANT EITHER, which matters more. CI printed
    // `67335 px: #f2efe9 36228 (53.80%), #a8b4b8 454` for this same case on
    // `3c87497` — a different CANVAS SIZE from this machine's 70,350, because
    // the element's box depends on the runner's scrollbar and device pixel
    // ratio, not on anything this repo controls. So all three numbers above
    // are one machine's reading of a deterministic FRAME, not a fixture to
    // diff against. The floors are what travel: > 50,000 px, > 0.5 land,
    // > 200 water, all of which both machines clear by a wide margin
    // (CI's worst is 53.80% against 0.5, and 454 against 200). A reader
    // treating any of the exact figures as an expectation would be chasing
    // hardware.
    //
    // These are neither branch's numbers and that is the point. `feat/map-camera`
    // measured 67,335 / 62.39% / 12,113 against the PUBLISHED portfolio at 390;
    // `fix/map-palette-review` measured 203,832 / 73.78% / 952 against the
    // fixture at Desktop Chrome. This case is the fixture AT 390, so it inherits
    // neither, and taking either branch's figures on faith would have pinned a
    // frame that is not the one being sampled.
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
          // "70350 px: #f2efe9 355 (0.50%), #a8b4b8 0, #f8f4f0 0, #9ebdff
          // 12444" here, which names the failure — and incidentally shows why
          // the #f8f4f0 deny below is nearly worthless. Without this line the
          // red was a bare "expected true".
          //
          // (That mutation was re-run at 390 when this case moved there, and
          // the separation is WIDER than the 1280 numbers it replaces —
          // "203832 px: #f2efe9 596 (0.29%), #a8b4b8 0, #f8f4f0 0, #9ebdff
          // 1676" — because the fit frame holds far more water than one
          // listing's z12 frame does.)
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
          // take. Water is small but not optional: a `water` layer that failed
          // to parse takes it to zero.
          //
          // THE FLOORS ARE NOT THE MEASUREMENTS, and one of them is TIGHT.
          // Water at 200 against a measured 441 is 2.2x of headroom. Land at
          // 0.5 against a measured 0.5614 is SIX POINTS, which is deliberate
          // but worth knowing: 0.5 is not a margin, it is the claim itself —
          // our off-white is the majority colour of the canvas or the style
          // did not take. A tile generalisation that adds a few percent of
          // road or building fill would trip it, and that is the one way this
          // gate can red without the palette being wrong. Three byte-identical
          // runs say the frame itself is not the source of variance.
          //
          // They are floors on a DETERMINISTIC frame now — the fixture, not
          // the portfolio — so if one trips it is the palette, not the content.
          return (
            measured.total > 50_000 && measured.land / measured.total > 0.5 && measured.water > 200
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

  // THE ZOOM IS NAMED HERE, AND THAT IS THE WHOLE FIX (review of #121 + #118).
  //
  // The claim is "our style has no `natural_earth` layer". That is a fact about
  // a JSON file and has nothing to do with what any section happens to fit at —
  // yet this control was twice made a hostage to exactly that, and the second
  // time it went red:
  //
  //   /properties      z6.948    ours 0   stock 1  (natural_earth/ne2sr/6/14/26.png)
  //   /dev/properties  z7.8765   ours 0   STOCK 0  ← the control proves nothing
  //
  // Read off the live style on 2026-09-22 rather than inferred: liberty's
  // source is `ne2_shaded` (raster, maxzoom 6, tiles at
  // `/natural_earth/ne2sr/{z}/{x}/{y}.png`) and the single layer drawn from it
  // is `natural_earth`, **maxzoom 7**. So the layer paints below z7 and nowhere
  // else. The fixture fits at z7.8765, which is past it — the stock style drew
  // no hillshade either and the zero became free. The guard at the end of this
  // test is what said so, and it was right to red.
  //
  // Picking a route whose fit merely HAPPENS to be low is the same mistake one
  // step along (CLAUDE.md's opening worked example), and pointing back at
  // /properties reintroduces the published-content coupling this branch exists
  // to remove. So neither frame decides: the test DRIVES both maps to z6 — one
  // whole zoom inside the layer's maxzoom, and at the source's own maxzoom 6 so
  // the tile is served natively rather than overzoomed — through the camera
  // probe, which reaches the real MapLibre instance without shipping a test
  // hook. A reframe of the fixture, of the portfolio, or of the camera cannot
  // now take this control away.
  //
  // WHAT IS STILL ASSERTED, in order, and none of it is an absence:
  //   1. both maps went to the tile host at all, BEFORE and AFTER the jump —
  //      a listener that never fired makes every "no requests to X" true;
  //   2. both maps are really AT the driven frame when measured, read back off
  //      MapLibre (`mapZoom`), not assumed from the fact we asked;
  //   3. the STOCK style fetched a hillshade AT that frame — the discrimination
  //      control, and the only thing that makes the zero mean anything;
  //   4. and only then, that ours fetched none.
  const NE_ZOOM = 6;
  /** `natural_earth`'s own maxzoom, read off the live liberty style. The layer
   *  draws below this and not at or above it. */
  const NE_LAYER_MAXZOOM = 7;

  /** Boot the fixture map, drive it to `NE_ZOOM`, and report what it fetched
   *  before and after. `stock` serves OpenFreeMap's liberty in place of ours. */
  async function hillshadeAtDrivenZoom(p: Page, stock: boolean) {
    const ne: string[] = [];
    const tiles: string[] = [];
    p.on("request", (request) => {
      const url = request.url();
      if (url.includes("natural_earth") || url.includes("ne2sr")) ne.push(url);
      if (url.includes("tiles.openfreemap.org")) tiles.push(url);
    });
    if (stock) {
      await p.route("**/map-style.json", (route) =>
        route.fulfill({ status: 302, headers: { location: STOCK_STYLE_URL } }),
      );
    }
    await watchCamera(p);
    // 390, for the same reason the pixel case above uses it: below `lg`
    // `centreWatch` is never constructed, so the only camera command on the
    // page is the section's own fit and nothing competes with the jump.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.goto("/dev/properties");
    await hydrated(p);
    await p.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(p);
    // Never infer the patch landed from a log that is merely empty.
    expect(
      await cameraProbeInstalled(p),
      "the camera probe did not install, so nothing here drove the frame",
    ).toBe(true);

    const beforeTiles = tiles.length;
    const beforeNe = ne.length;
    await jumpToZoom(p, NE_ZOOM);
    await p.waitForTimeout(3000);
    return {
      ne,
      tiles,
      zoom: await mapZoom(p),
      tilesAfterJump: tiles.length - beforeTiles,
      neAfterJump: ne.length - beforeNe,
    };
  }

  test("makes no Natural Earth raster request at a frame the stock style draws one at", async ({
    page,
  }) => {
    const ours = await hillshadeAtDrivenZoom(page, false);

    const control = await page.context().newPage();
    let stock: Awaited<ReturnType<typeof hillshadeAtDrivenZoom>>;
    try {
      stock = await hillshadeAtDrivenZoom(control, true);
    } finally {
      await control.close();
    }

    // Logged either way: the numbers are the point of the red, and a bare
    // "expected > 0" is what sent the last reader to the trace viewer.
    console.log(
      `[map-ne] ours z${ours.zoom.toFixed(4)} tiles ${ours.tiles.length} ` +
        `(+${ours.tilesAfterJump} after the jump) ne ${ours.ne.length} | ` +
        `stock z${stock.zoom.toFixed(4)} tiles ${stock.tiles.length} ` +
        `(+${stock.tilesAfterJump}) ne ${stock.ne.length} (+${stock.neAfterJump})`,
    );

    // 1. NON-VACUITY. Both maps really went to the network, and both really
    //    re-rendered at the DRIVEN frame rather than only at their fit.
    expect(ours.tiles.length, "our map fetched nothing from the tile host at all").toBeGreaterThan(
      2,
    );
    expect(
      stock.tiles.length,
      "the control fetched nothing from the tile host at all",
    ).toBeGreaterThan(2);
    expect(
      ours.tilesAfterJump,
      "our map fetched no tiles after the jump, so the driven frame was never drawn",
    ).toBeGreaterThan(0);
    expect(
      stock.tilesAfterJump,
      "the control fetched no tiles after the jump, so the driven frame was never drawn",
    ).toBeGreaterThan(0);

    // 2. AND BOTH ARE AT THE FRAME WE ASKED FOR, read back off MapLibre. If
    //    anything re-fitted over the jump this says so by name instead of
    //    letting the comparison quietly happen somewhere else.
    expect(ours.zoom, "our map did not hold the driven frame").toBeLessThan(NE_LAYER_MAXZOOM);
    expect(stock.zoom, "the control did not hold the driven frame").toBeLessThan(NE_LAYER_MAXZOOM);

    // 3. THE DISCRIMINATION CONTROL. Same page, same frame, stock style served
    //    in place of ours: it MUST fetch the hillshade, or the zero below is
    //    just as true of a style that has the layer.
    expect(
      stock.neAfterJump,
      `the stock style fetched no hillshade at z${stock.zoom.toFixed(4)} either — if ` +
        "natural_earth's maxzoom moved, NE_ZOOM has to move with it; this test proves " +
        "nothing as it stands",
    ).toBeGreaterThan(0);

    // 4. AND ONLY NOW is the zero worth something.
    expect(ours.ne, "the Natural Earth hillshade is gone from the style").toEqual([]);
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

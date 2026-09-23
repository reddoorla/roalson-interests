import { expect, test, type Page } from "@playwright/test";

// THE FIXED-FRAME PLACEHOLDER (#122), on the routes the site really serves.
//
// WHAT ONLY A BROWSER CAN SAY HERE, and it is the whole reason this file is not
// more cases in PropertyMap.test.ts:
//
//  1. THE CONTAINER QUERY PICKS A FRAME. jsdom resolves no stylesheet, so the
//     unit suite can only see that BOTH layers are in the markup. Which one is
//     painted is `@container (max-height: 299.98px)` against the box's own
//     measured height, and that exists only where there is layout.
//  2. ONE RASTER IS FETCHED, NOT TWO. The other layer is `display: none`, and
//     "a background image on a display:none element is never requested" is a
//     claim about a browser. It is measured as a 200 for one file and NO
//     request at all for the other — the artifact, not the absence of an error.
//  3. THE PINS DO NOT MOVE ACROSS THE HAND-OVER. The whole design rests on the
//     server's markers landing exactly where `map.project()` will put the live
//     ones, and only real MapLibre on real tiles can say whether they do.
//
// EVERY FRAME CASE RUNS WITH SCRIPTING OFF, and that is a correction rather
// than a preference. The first version of this file waited for `hydrated()` and
// then read the layers — and found NONE, on a page a bare probe showed had
// four. At 1440 the first map on /properties is on screen at load, so MapLibre
// boots immediately, and Playwright's fleet config forces
// `reducedMotion: "reduce"`, under which the hand-over is instant: the picture
// was already gone by the time the assertion ran. The race was the test's, not
// the component's. `javaScriptEnabled: false` removes it AND measures the
// stronger claim — this is what a crawler and a scripting-off browser get.
//
// /dev/* 404s on a production build (#120), so every route below is one the
// site serves. Run it either way:
//
//   pnpm exec playwright test tests/interaction/map-home.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/map-home.spec.ts

const PROPERTIES = "/properties";
const HOME = "/";
const MAP = "[data-property-map]";

/** MapLibre's own `load` has fired for the nth map — never "the import
 *  resolved", and never "no error appeared". */
const drawn = (page: Page, nth = 0) =>
  expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", { timeout: 45_000 });

/** Which frame layer a browser is actually painting, and which it is not. */
const painted = (page: Page, nth = 0) =>
  page
    .locator(MAP)
    .nth(nth)
    .locator("[data-map-home-frame]")
    .evaluateAll((els) =>
      els.map((el) => ({
        frame: (el as HTMLElement).dataset.mapHomeFrame,
        display: getComputedStyle(el).display,
        image: getComputedStyle(el).backgroundImage,
        size: getComputedStyle(el).backgroundSize,
        position: getComputedStyle(el).backgroundPosition,
      })),
    );

/** Every marker the given selector draws in the nth map, as offsets from that
 *  map's own box — which is the only frame of reference the picture and the
 *  live canvas share. */
const markers = (page: Page, selector: string, id: string, nth = 0) =>
  page
    .locator(MAP)
    .nth(nth)
    .locator(selector)
    .evaluateAll(
      (els, key) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          const box = el.closest("[data-property-map]")!.getBoundingClientRect();
          return {
            id: (el as HTMLElement).dataset[key]!,
            x: +(r.left - box.left).toFixed(1),
            y: +(r.top - box.top).toFixed(1),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
            box: { w: +box.width.toFixed(1), h: +box.height.toFixed(1) },
          };
        }),
      id,
    );

test.describe("the picture is there with no script at all", () => {
  test("the 595 panel paints the full raster and fetches only that one", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const rasters: string[] = [];
    page.on("response", (r) => {
      const path = new URL(r.url()).pathname;
      if (/\/map-home-.*\.webp$/.test(path)) rasters.push(`${r.status()} ${path}`);
    });
    await page.goto(PROPERTIES);

    const layers = await painted(page);
    expect(layers.map((l) => l.frame)).toEqual(["full", "compact"]);
    const full = layers.find((l) => l.frame === "full")!;
    const compact = layers.find((l) => l.frame === "compact")!;
    expect(full.display).toBe("block");
    expect(compact.display, "the compact layer is not painted on a 595 box").toBe("none");
    expect(full.image).toContain("map-home-full.webp");
    // The raster at its OWN pixel size and centred — never `cover`, which would
    // scale it and put its roads where the tiles' are not.
    expect(full.size).toBe("1088px 1184px");
    expect(full.position).toBe("50% 50%");

    // THE BYTE CLAIM, as an artifact: a 200 for the one the browser paints and
    // nothing at all for the other.
    await expect.poll(() => rasters, { timeout: 15_000 }).toContain("200 /map-home-full.webp");
    expect(rasters.join(" ")).not.toContain("map-home-compact.webp");
    await context.close();
  });

  test("the 200 box paints the compact raster instead", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const rasters: string[] = [];
    page.on("response", (r) => {
      const path = new URL(r.url()).pathname;
      if (/\/map-home-.*\.webp$/.test(path)) rasters.push(`${r.status()} ${path}`);
    });
    await page.goto(PROPERTIES);

    const layers = await painted(page);
    const full = layers.find((l) => l.frame === "full")!;
    const compact = layers.find((l) => l.frame === "compact")!;
    expect(compact.display, "a 200 box is the compact frame").toBe("block");
    expect(full.display).toBe("none");
    expect(compact.size).toBe("1024px 304px");
    await expect.poll(() => rasters, { timeout: 15_000 }).toContain("200 /map-home-compact.webp");
    expect(rasters.join(" ")).not.toContain("map-home-full.webp");
    await context.close();
  });

  test("the homepage band opens on a picture, and keeps its list underneath", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(HOME);
    const map = page.locator(MAP).first();
    await expect(map.locator("[data-map-home-box]")).toHaveCount(1);
    expect((await painted(page)).find((l) => l.frame === "full")!.display).toBe("block");
    // The list is still there as the map's accessible equivalent — visually
    // hidden, not removed. #13's definition of done, kept.
    const rows = map.locator("[data-map-link]");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const cls of await rows.evaluateAll((els) => els.map((e) => e.className))) {
      expect(cls).toContain("sr-only");
    }
    // And every pin is a link to the same place its row points at, so a
    // scripting-off visitor loses no route to a listing.
    const hrefs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const pins = await map
      .locator('[data-map-home-frame="full"] [data-map-home-pin]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(hrefs).toContain(pin);
    await context.close();
  });
});

test("the live pins land exactly where the picture drew them", async ({ browser }) => {
  // THE CLAIM THE WHOLE CROSS-FADE RESTS ON, and the one thing no unit test can
  // reach: the server placed its markers from MAP_HOME arithmetic and MapLibre
  // places the live ones with `map.project()` on the camera it was constructed
  // with. If those two ever disagreed the swap would be a visible jump, and
  // nothing else in the system would notice.
  //
  // AT 390 ON PURPOSE. PropertyListing drives the camera from `centreWatch`,
  // which is gated `minWidth: 1024` — below `lg` it never observes, so `active`
  // stays null, the camera never leaves MAP_HOME, and the live pins are still
  // where the picture put them. At 1440 this would be measuring a camera that
  // had correctly flown to whichever card crossed the centre line.
  const viewport = { width: 390, height: 844 };

  const still = await browser.newContext({ viewport, javaScriptEnabled: false });
  const drawnPage = await still.newPage();
  await drawnPage.goto(PROPERTIES);
  // SCOPED TO THE LAYER THE BROWSER IS PAINTING, and that is not pedantry: the
  // server renders BOTH frames and the container query hides one, and a
  // `display: none` element's `getBoundingClientRect` is all zeros. Reading
  // every `[data-map-home-pin]` on the box therefore mixed 8 real positions
  // with 8 zeroed ones and this case failed by 266.5px on the first of them —
  // the test measuring the hidden layer, not the component placing a pin badly.
  const compact = (await painted(drawnPage)).find((l) => l.frame === "compact")!;
  expect(compact.display, "a 200 box paints the compact layer").toBe("block");
  const picture = await markers(
    drawnPage,
    '[data-map-home-frame="compact"] [data-map-home-pin]',
    "mapHomePin",
  );
  expect(picture.length, "the picture drew pins to compare against").toBeGreaterThan(0);
  await still.close();

  const live = await browser.newContext({ viewport });
  const page = await live.newPage();
  await page.goto(PROPERTIES);
  await page.locator(MAP).first().scrollIntoViewIfNeeded();
  await drawn(page);
  const canvas = await markers(page, "[data-map-pin]", "mapPin");
  await live.close();

  // The comparison is only honest if both loads got the same box: pin offsets
  // are measured from the box's centre, so a different width would move every
  // one of them for a reason that has nothing to do with the camera.
  expect(canvas[0]!.box, "both loads laid the map out the same").toEqual(picture[0]!.box);

  for (const pin of picture) {
    const drawnLive = canvas.find((a) => a.id === pin.id);
    expect(drawnLive, `the live map draws ${pin.id} too`).toBeDefined();
    // One CSS pixel: MapLibre rounds its own transform, and the question is
    // "did anything visibly move", not "are two floats bit-identical".
    expect(Math.abs(drawnLive!.x - pin.x), `${pin.id} x`).toBeLessThanOrEqual(1);
    expect(Math.abs(drawnLive!.y - pin.y), `${pin.id} y`).toBeLessThanOrEqual(1);
    expect(drawnLive!.w).toBeCloseTo(pin.w, 1);
    expect(drawnLive!.h).toBeCloseTo(pin.h, 1);
  }
});

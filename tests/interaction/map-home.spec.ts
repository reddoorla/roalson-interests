import { expect, test, type Browser, type Page } from "@playwright/test";

// THE FIXED-FRAME PLACEHOLDER (#122), on the routes the site really serves.
//
// WHAT ONLY A BROWSER CAN SAY HERE, and it is the whole reason this file is not
// more cases in PropertyMap.test.ts:
//
//  1. THE CONTAINER QUERY PICKS A FRAME. jsdom resolves no stylesheet, so the
//     unit suite can only see that BOTH layers are in the markup. Which one is
//     painted is `@container (0px < height < 300px)` against the box's own
//     measured height, and that exists only where there is layout.
//  2. ONE RASTER IS FETCHED, NOT TWO — and the reason is that the losing layer
//     has NO IMAGE, not that its image is hidden. "A background image on a
//     display:none element is never requested" was the first version of this
//     claim and it was false: both rasters were fetched on up to 16 of 16
//     production loads, because the first style pass runs before the container
//     has a size and nothing is display:none yet (#133). Measured as a 200 for
//     the painted file and NO request at all for the other — the artifact,
//     not the absence of an error.
//  3. THE PINS DO NOT MOVE ACROSS THE HAND-OVER. The whole design rests on the
//     server's markers landing exactly where `map.project()` will put the live
//     ones, and only real MapLibre on real tiles can say whether they do.
//  4. NOR DURING IT (#132). The camera holds MAP_HOME for as long as the
//     picture of MAP_HOME is on screen, at every width and with a listing
//     active — the state the case at the bottom of this file could not reach,
//     because it runs at 390 where nothing is ever active.
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

/**
 * Every live marker has been PLACED, which is not the same as rendered.
 *
 * `reposition()` writes each marker's `transform` from `map.project()`, and
 * Svelte renders the markers one keyed `{#each}` earlier — so a marker read
 * between those two sits at the overlay's ORIGIN, with an empty `transform`
 * and a rect at the box's top-left. Under four parallel workers that window is
 * wide enough to land in: the case below failed 4 times in 112 repeats at
 * `Received: 246.5`, which is exactly the first picture pin's own x — the live
 * pin it was compared against was at 0, not 246.5 away.
 *
 * So the wait is on the artifact a placed marker has, never on a timeout.
 */
const placed = (page: Page, nth = 0) =>
  expect
    .poll(
      () =>
        page
          .locator(MAP)
          .nth(nth)
          .locator("[data-map-pin]")
          .evaluateAll(
            (els) =>
              els.length > 0 && els.every((el) => (el as HTMLElement).style.transform !== ""),
          ),
      { timeout: 15_000 },
    )
    .toBe(true);

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

    // THE MECHANISM, FIRST: the layer that is not painted has no image to
    // fetch. This is the half that makes the byte claim below deterministic —
    // while `background-image` sat in both layers' inline `style` the request
    // for the losing one went out anyway, from the style pass that runs before
    // the container has a size, and this case measured BOTH rasters on 4 of 16
    // production loads (#133).
    expect(compact.image, "the unpainted layer has no image to request").toBe("none");

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
    expect(compact.image).toContain("map-home-compact.webp");
    expect(full.image, "the unpainted layer has no image to request").toBe("none");
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
    const rasters: string[] = [];
    page.on("response", (r) => {
      const path = new URL(r.url()).pathname;
      if (/\/map-home-.*\.webp$/.test(path)) rasters.push(`${r.status()} ${path}`);
    });
    await page.goto(HOME);
    const map = page.locator(MAP).first();
    await expect(map.locator("[data-map-home-box]")).toHaveCount(1);
    const layers = await painted(page);
    expect(layers.find((l) => l.frame === "full")!.display).toBe("block");
    expect(layers.find((l) => l.frame === "compact")!.image, "no image on the losing layer").toBe(
      "none",
    );
    // THE BYTE CLAIM ON THE WORST CELL. This band, at this width, fetched BOTH
    // rasters on 16 of 16 production loads before #133 — the container has no
    // resolved size in the first style pass, so a `height < 300px` rule matched
    // it as if it were zero and requested the compact raster for a box that
    // ends up 843.44 tall. The rule is `0px < height < 300px` for that reason
    // and this is the case that would see it come back.
    await expect.poll(() => rasters, { timeout: 15_000 }).toContain("200 /map-home-full.webp");
    expect(rasters.join(" ")).not.toContain("map-home-compact.webp");
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
  await placed(page);
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

// ---------------------------------------------------------------------------
// THE CROSS-FADE ITSELF (#132)
// ---------------------------------------------------------------------------

interface FadeProbe {
  /** One entry per animation frame on which the picture's pins and the live
   *  pins were BOTH in the DOM. */
  samples: { t: number; opacity: number; delta: number; matched: number; pics: number }[];
  /** The furthest any live pin has travelled from where it stood when the
   *  picture was retired — the flight, once the picture is out of the way. */
  afterTravel: number;
  /** Whether the browser is emulating `prefers-reduced-motion: reduce`, under
   *  which there is no cross-fade at all and everything below is vacuous. */
  reduced: boolean;
}

declare global {
  interface Window {
    __mapHomeFade?: FadeProbe;
  }
}

/**
 * Watch one map through its whole cross-fade, from before the document exists.
 *
 * SAMPLED EVERY FRAME, not at one instant, and that is the point: #130's
 * `map-home.spec.ts` sampled after the hand-over, when the camera has
 * legitimately moved, so the only widths it could ask about were the ones
 * where nothing ever moves. A max over every frame the picture was up cannot
 * be missed by landing on the wrong millisecond.
 */
const overTheFade = async (
  browser: Browser,
  route: string,
  viewport: { width: number; height: number },
) => {
  const context = await browser.newContext({
    viewport,
    // EXPLICITLY OFF. The fleet Playwright config sets
    // `contextOptions.reducedMotion: "reduce"` for every test, under which the
    // canvas has no transition, `handedOver` flips on the same tick as `ready`
    // and there is no fade to measure. It is asserted below as well as set
    // here — this repo has now had four classes of assertion made vacuous by
    // that one line, and a setting that is merely PASSED is not evidence that
    // it took.
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    const probe: FadeProbe = {
      samples: [],
      afterTravel: 0,
      reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    window.__mapHomeFade = probe;
    let scrolled = false;
    let atHandover: { id: string; x: number; y: number }[] | null = null;
    const tick = () => {
      const map = document.querySelector("[data-property-map]");
      if (map) {
        // Put the map on the centre line before MapLibre boots, which is what
        // makes a listing ACTIVE at boot on /properties above `lg` —
        // `centreWatch` names whichever card is crossing it. Without this the
        // case measures the null-`active` map that was never in doubt.
        if (!scrolled) {
          map.scrollIntoView({ block: "center", behavior: "instant" });
          scrolled = true;
        }
        const box = map.getBoundingClientRect();
        const at = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { x: r.left - box.left, y: r.top - box.top };
        };
        // ONLY PINS THE MAP HAS PLACED. `reposition()` writes the transform a
        // frame after Svelte renders the marker, and a marker read in between
        // is at the overlay's origin — measured, as a 246.5 px "delta" that
        // was the picture pin's own x against a live pin at 0. A frame where
        // any marker is still unplaced is not a frame about the camera.
        const liveEls = [...map.querySelectorAll("[data-map-pin]")];
        const allPlaced =
          liveEls.length > 0 && liveEls.every((el) => (el as HTMLElement).style.transform !== "");
        const live = allPlaced
          ? liveEls.map((el) => ({ id: (el as HTMLElement).dataset.mapPin ?? "", ...at(el) }))
          : [];
        // Only the layer the container query is PAINTING: a `display: none`
        // element's rect is all zeros, and reading both layers would compare
        // real positions against eight of those.
        const layer = [...map.querySelectorAll("[data-map-home-frame]")].find(
          (el) => getComputedStyle(el).display !== "none",
        );
        const canvas = map.querySelector("[data-map-canvas]");
        const picture = layer ? [...layer.querySelectorAll("[data-map-home-pin]")] : [];
        if (picture.length > 0 && live.length > 0) {
          let delta = 0;
          let matched = 0;
          for (const el of picture) {
            const id = (el as HTMLElement).dataset.mapHomePin ?? "";
            const twin = live.find((l) => l.id === id);
            if (!twin) continue;
            matched += 1;
            const p = at(el);
            delta = Math.max(delta, Math.hypot(p.x - twin.x, p.y - twin.y));
          }
          probe.samples.push({
            t: performance.now(),
            opacity: canvas ? Number(getComputedStyle(canvas).opacity) : 1,
            delta,
            matched,
            pics: picture.length,
          });
        } else if (picture.length === 0 && live.length > 0 && probe.samples.length > 0) {
          if (atHandover === null) atHandover = live;
          for (const l of live) {
            const was = atHandover.find((a) => a.id === l.id);
            if (was)
              probe.afterTravel = Math.max(probe.afterTravel, Math.hypot(l.x - was.x, l.y - was.y));
          }
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(route);
  await drawn(page);
  // The picture is retired when the hand-over completes; everything sampled
  // before that is the cross-fade.
  await expect(page.locator(MAP).first().locator("[data-map-home-box]")).toHaveCount(0, {
    timeout: 45_000,
  });
  return { context, page };
};

for (const c of [
  {
    name: "/properties at 1440, a listing active from the scroll",
    route: PROPERTIES,
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "the homepage band at 1440, slide 0 active from the start",
    route: HOME,
    viewport: { width: 1440, height: 900 },
  },
  { name: "the homepage band at 390", route: HOME, viewport: { width: 390, height: 844 } },
]) {
  test(`the camera holds MAP_HOME for the whole fade — ${c.name}`, async ({ browser }) => {
    // #132, AND THE CASE #130 ROUTED AROUND. Booting at MAP_HOME is only half
    // of "no pin jump": with `active` non-null the first frame after `load`
    // answered `fly`, and a 500ms flight inside a 300ms cross-fade puts the
    // committed picture and a completely different live map on screen
    // together. Measured on a production build before the fix, as the largest
    // picture-pin-to-live-pin distance over every frame of the fade:
    // 14618.92 px here at 1440, 1772.50 px on the band at 1440, 1800.65 px at
    // 390 — against 0.00 px at the two widths #130 did measure.
    const { context, page } = await overTheFade(browser, c.route, c.viewport);
    // THE FLIGHT IS HELD, NOT CANCELLED: once the picture is gone the camera
    // goes to the active listing after all. This is what stops the case
    // passing on a map that simply never moves — which is how #130's own
    // 390-only case passed while the defect was live at every other width.
    await expect
      .poll(() => page.evaluate(() => window.__mapHomeFade?.afterTravel ?? 0), { timeout: 15_000 })
      .toBeGreaterThan(1);
    const probe = (await page.evaluate(() => window.__mapHomeFade))!;
    await context.close();

    expect(probe.reduced, "the fade really runs — reduced motion is NOT emulated").toBe(false);
    // THE CASE'S OWN NON-VACUITY, and it needs no clock. A sample exists only
    // on a frame where the LIVE pins (which exist only once MapLibre's `load`
    // has fired) and the PICTURE's pins were both in the DOM — which is the
    // cross-fade, by construction. A component that retired the picture at
    // `ready` would leave this at zero and red the case.
    //
    // An earlier version also demanded a sample at an opacity strictly
    // between 0.05 and 0.95, and that assertion was itself flaky: under four
    // parallel workers a starved rAF loop can tick twice in 300ms and land
    // neither tick in the band. It failed 6 times in 112 repeats, in whole
    // waves of three — the environment, not the camera. Removed rather than
    // retried, because a guard that is right 95% of the time is not a guard.
    expect(
      probe.samples.length,
      "the picture and the live map were on screen together for at least one frame",
    ).toBeGreaterThan(0);
    for (const s of probe.samples) {
      expect(s.matched, "every frame compared real pins, not an empty set").toBeGreaterThan(0);
    }
    const worst = probe.samples.reduce((m, s) => (s.delta > m.delta ? s : m), probe.samples[0]!);
    // One CSS pixel, the same tolerance the hand-over case above uses: MapLibre
    // rounds its own transform and the question is whether anything visibly
    // moved.
    expect(
      worst.delta,
      `worst pin delta over ${probe.samples.length} frames of the fade, at canvas opacity ${worst.opacity}`,
    ).toBeLessThanOrEqual(1);
  });
}

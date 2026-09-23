import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import {
  cameraLog,
  cameraMoves,
  cameraProbeInstalled,
  mapCentre,
  mapZoom,
  resetCamera,
  watchCamera,
} from "./camera-probe";
import { hydrated } from "./hydrated";

// THE STICKY MAP AND ITS CAMERA (#13 follow-up), in the only place either can
// be checked. Four claims, none of which jsdom can see:
//
//  1. THE MAP PINS, from `lg` only, UNDER the section divider rather than over
//     it, at an offset read off that divider rather than typed.
//  2. IT RELEASES at the section boundary, measured at a real scroll. `position:
//     sticky` is supposed to stop at its containing block's end and a sticky
//     GRID ITEM's containing block is its grid area — that is the spec, and
//     this measures the browser.
//  3. THE CENTRE RULE. The card crossing the middle of the window is the active
//     one, and the camera puts THAT listing at the middle of the map.
//  4. THE FLIGHT IS A FLIGHT. This one needs the shared config's
//     `reducedMotion: "reduce"` turned off, or it asserts nothing — see the
//     describe block that does it.
//
// /dev/properties is the fixture the rest of tests/interaction measures on: the
// real components through the real layout over fixture data, with no network
// but the tile host. Its land section's four listings are fm-1560-galm,
// potranco-road, hwy-90-castroville and ih-35-new-braunfels. The first two are
// 0.60 km apart and CLUSTER at the camera's z12 (the cluster radius is a 48px
// pin box, and 0.60 km is 36px at 16.596 m/px), so the two this file drives
// with are the other two, which stand alone at every zoom the page reaches.
const PROPERTIES = "/dev/properties";
const HOME = "/dev/home";
const MAP = "[data-property-map]";

/** The two land listings that never cluster. */
const CASTROVILLE = "hwy-90-castroville";
const NEW_BRAUNFELS = "ih-35-new-braunfels";

/** Positive evidence the engine drew a frame: `data-map-ready` is set by
 *  MapLibre's own `load`, not by the import resolving. */
const drawn = (page: Page, nth = 0) =>
  expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", { timeout: 25_000 });

/**
 * A context at one viewport, under the FLEET'S OWN reduced-motion emulation.
 *
 * `browser.newContext()` INHERITS `contextOptions` from the shared config —
 * measured, because it was assumed not to and that assumption decided how this
 * whole file was written. A throwaway spec printed `reduce = true` for both the
 * default `page` fixture and a context opened by hand. So everything below runs
 * the way CI runs it, and the two blocks that need real motion say so out loud
 * (`moving`, and the `test.use` on the flight block).
 */
async function at(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  return { context, page };
}

/** A context where motion is allowed. The homepage band draws NO pause control
 *  under `reduce` — `eligible` is `enabled && dwell > 0 && last > 0 && !reduced`
 *  — so a test about pausing it has to lift the emulation or it is looking for
 *  a button that was never rendered. (It spent 120s doing exactly that.) */
async function moving(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  return { context, page };
}

const land = (page: Page) => page.locator("section[aria-labelledby='listing-land']");

/** Which card the window's middle is crossing, computed here from boxes rather
 *  than read out of the component — so this measures the rule instead of
 *  agreeing with it. */
const onCentreLine = (section: Locator) =>
  section.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const box = li.getBoundingClientRect();
      if (box.top <= mid && box.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

/** Where a pin's own coordinate sits inside the map box, in px. The element is
 *  translated to the projected point and then by its own anchor, so the first
 *  translate IS the point. */
const pinAt = (section: Locator, id: string) =>
  section.locator(`[data-map-pin="${id}"]`).evaluate((el) => {
    const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec((el as HTMLElement).style.transform);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  });

const mapBox = (section: Locator) =>
  section.locator(MAP).evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { w: b.width, h: b.height, top: b.top, bottom: b.bottom };
  });

/** Scroll a listing's card to the middle of the window and let the observer,
 *  the camera and MapLibre settle. `behavior: "instant"` because what is being
 *  measured here is where things END UP; the travel has its own test. */
async function centre(page: Page, id: string) {
  await page.evaluate(
    (id) =>
      document
        .querySelector(`[data-centre-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" }),
    id,
  );
  await page.waitForTimeout(1200);
}

test.describe("the map pins beside its cards", () => {
  test("sticks under the pinned divider, at the divider's own measured height", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const sections = page.locator("section[aria-labelledby^='listing-']");

      // Section 0's divider does NOT pin (the comp's first divider has a 40px
      // pad and scrolls away), so its map lands on app.css's own declared
      // usable top — the bar plus 20px of air.
      const declared = await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollPaddingTop,
      );
      expect(declared).toBe("100px");
      const first = sections.nth(0).locator(MAP);
      expect(await first.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
      expect(await first.evaluate((el) => getComputedStyle(el).top)).toBe("100px");

      // Section 1's divider DOES pin, and its map's offset is that divider's
      // real rendered height — 145.41 here (its 100px pad plus a 45.41 label
      // block), which is exactly the number a typed `100` would have missed.
      const divider = sections.nth(1).locator("> div").first();
      expect(await divider.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");
      const dividerHeight = await divider.evaluate((el) => el.getBoundingClientRect().height);
      expect(dividerHeight).toBeGreaterThan(120);

      // Polled: the offset is written by an effect that runs after mount and
      // again whenever the divider's box changes, so the first frame carries
      // the pre-measurement fallback. What is asserted is where it SETTLES —
      // and that it settles somewhere a typed constant would not have.
      const second = sections.nth(1).locator(MAP);
      const top = () => second.evaluate((el) => parseFloat(getComputedStyle(el).top));
      await expect.poll(top, { timeout: 10_000 }).toBeCloseTo(dividerHeight, 1);
      expect(await top()).not.toBeCloseTo(100, 0);
    } finally {
      await context.close();
    }
  });

  // RENAMED TO WHAT IT MEASURES. It was "passes UNDER the divider rather than
  // over it", which reads as a claim about the sticky OFFSET, and it cannot
  // make one: the improved section's grid row is exactly 595 — the map's own
  // height — so the map has ZERO sticky travel there and is never pinned at
  // all. Measured at every `lg` width on this fixture (1024, 1100, 1200, 1280,
  // 1440): travel 0 at all five, while the land section gives 473.16 / 433.16 /
  // 433.16 / 433.16 / 457.39. With `top: 0` substituted this test stayed green.
  //
  // What it really measures is paint order where the two boxes overlap, which
  // is worth keeping on its own — it is the assertion that caught a `lg:z-0`
  // that did nothing and proved the divider's `lg:z-10` is what holds the
  // order. The OFFSET is guarded by "sticks under the pinned divider, at the
  // divider's own measured height" above (which polls it to the divider's real
  // height and asserts it is not 100) and by the no-JS case below.
  //
  // Giving this one real travel was tried and there is nowhere to get it: only
  // sections after the first have a pinned divider, and this fixture has
  // exactly one such section whose cards are shorter than the map.
  test("the pinned divider owns the pixels where it overlaps the map (z-order)", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      // Park the scroll where section 1's map has gone PAST its stick point and
      // is travelling up behind its own pinned divider. That is the one place
      // on this page where the two really overlap: section 0's map has left the
      // window entirely by the time section 1's divider pins.
      const seam = await page.evaluate(() => {
        const sections = [...document.querySelectorAll("section[aria-labelledby^='listing-']")];
        const map = sections[1]!.querySelector("[data-property-map]") as HTMLElement;
        // 110px into the divider's 145.41px band. NOT 60: the bar is `fixed`,
        // `z-50` and 80 tall at `lg`, so a hit test in the top 80px answers
        // with the NAV and says nothing about either of these two. That is
        // what the first version of this test measured.
        return map.getBoundingClientRect().top + window.scrollY - 110;
      });
      await page.evaluate((y) => window.scrollTo(0, y), seam);
      await page.waitForTimeout(300);

      // Hit-testing is the only honest way to ask "which of these is on top".
      const winner = await page.evaluate(() => {
        const sections = [...document.querySelectorAll("section[aria-labelledby^='listing-']")];
        const divider = sections[1]!.firstElementChild as HTMLElement;
        const map = sections[1]!.querySelector("[data-property-map]") as HTMLElement;
        const box = divider.getBoundingClientRect();
        const mapRect = map.getBoundingClientRect();
        const bar = document.querySelector('nav[aria-label="Primary"]')!.getBoundingClientRect();
        const y = Math.min(box.bottom - 4, mapRect.top + 10);
        const hit = document.elementFromPoint(mapRect.left + mapRect.width / 2, y);
        return {
          dividerTop: box.top,
          barBottom: bar.bottom,
          y,
          overlapping: mapRect.top < box.bottom && mapRect.bottom > box.top,
          inDivider: !!hit && divider.contains(hit),
          inMap: !!hit && !!hit.closest("[data-property-map]"),
        };
      });
      expect(winner.dividerTop).toBeCloseTo(0, 0);
      expect(winner.y, "the probe is below the fixed bar").toBeGreaterThan(winner.barBottom);
      expect(winner.overlapping, "the two really are on top of each other here").toBe(true);
      expect(winner.inDivider, "the pinned divider owns its own pixels").toBe(true);
      expect(winner.inMap).toBe(false);
    } finally {
      await context.close();
    }
  });

  test("lets go at the section's end, measured rather than assumed", async ({ browser }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const section = land(page);

      // EVERY NUMBER IN ONE FRAME. The first version of this test computed a
      // travel and a stick point up front and scrolled to them afterwards, and
      // it passed alone and failed inside `pnpm verify` with the map's top at
      // 0 against an expected 100: the fixture's card heights settle late (its
      // photos are data: URIs that fail to load, #17), so a plan measured
      // before the settle described a page that no longer existed. Everything
      // below is read in the same evaluate as the assertion it feeds.
      const look = () =>
        section.evaluate((el) => {
          const grid = el.children[1] as HTMLElement;
          const map = el.querySelector("[data-property-map]") as HTMLElement;
          const style = getComputedStyle(grid);
          const gridBox = grid.getBoundingClientRect();
          const mapBox = map.getBoundingClientRect();
          // The sticky containing block of a grid item is its GRID AREA, which
          // here is the grid's content box.
          const areaTop = gridBox.top + parseFloat(style.paddingTop);
          const areaBottom = gridBox.bottom - parseFloat(style.paddingBottom);
          return {
            top: parseFloat(getComputedStyle(map).top),
            mapTop: mapBox.top,
            mapHeight: mapBox.height,
            areaTop,
            areaBottom,
            travel: areaBottom - areaTop - mapBox.height,
            scrollY: window.scrollY,
          };
        });

      const rest = await look();
      expect(rest.travel, "the land section is taller than its map").toBeGreaterThan(100);

      const scrollBy = async (dy: number) => {
        await page.evaluate((dy) => window.scrollBy(0, dy), dy);
        await page.waitForTimeout(150);
      };

      // Mid-travel: pinned at its offset, and demonstrably not just sitting
      // where it started — its area's top is well above it by now.
      await scrollBy(rest.areaTop - rest.top + rest.travel / 2);
      const mid = await look();
      expect(mid.mapTop, "pinned at the offset").toBeCloseTo(mid.top, 0);
      expect(mid.areaTop, "and the page really has scrolled past its resting place").toBeLessThan(
        mid.top - 100,
      );

      // A pixel before the end of the travel: still pinned.
      await scrollBy(mid.travel / 2 - 1);
      const last = await look();
      expect(last.mapTop, "still pinned one pixel before the end").toBeCloseTo(last.top, 0);

      // 300 past it: RELEASED. The claim is not "it moved" — that is what an
      // unpinned map does too — but that it is parked on the BOTTOM of its own
      // grid area, which is the only thing `position: sticky` does here and
      // the thing nothing in the code asks for explicitly.
      await scrollBy(301);
      const after = await look();
      expect(after.mapTop, "let go at the section's end").toBeLessThan(after.top - 250);
      expect(after.areaBottom - after.mapHeight, "parked on the foot of its grid area").toBeCloseTo(
        after.mapTop,
        0,
      );
    } finally {
      await context.close();
    }
  });

  test("does not pin at 390, and watches nothing there", async ({ browser }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const section = land(page);
      const map = section.locator(MAP);
      expect(await map.evaluate((el) => getComputedStyle(el).position)).toBe("relative");

      // Not merely "looks unpinned": the box really travels with the page.
      await drawn(page);
      const before = await map.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(250);
      const after = await map.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(after).toBeCloseTo(before, 0);

      // And the camera is not being driven: with no observer running, the pins
      // sit where the FIT put them, and scrolling past three cards moves
      // nothing. (Above `lg` the same scroll moves the camera — the tests below
      // measure that, which is what keeps this one from being vacuous.)
      const pinsAt = () =>
        map.evaluate((el) =>
          [...el.querySelectorAll<HTMLElement>("[data-map-pin],[data-map-cluster]")].map(
            (p) => p.style.transform,
          ),
        );
      const first = await pinsAt();
      expect(first.length).toBeGreaterThan(0);
      await page.evaluate(() => window.scrollBy(0, 700));
      await page.waitForTimeout(1000);
      expect(await pinsAt()).toEqual(first);
    } finally {
      await context.close();
    }
  });
});

test.describe("the card on the centre line is the listing on the map", () => {
  test("puts the active listing's own pin at the middle of the map", async ({ browser }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      await drawn(page);
      const section = land(page);

      for (const id of [CASTROVILLE, NEW_BRAUNFELS, CASTROVILLE]) {
        await centre(page, id);
        // The rule, measured independently of the component: this listing's
        // card is the one the window's middle crosses.
        expect(await onCentreLine(section)).toBe(id);

        // And the camera answered it. The pin is anchored at its TIP and the
        // frame pads 52 top against 44 bottom, so the fitted centre sits
        // (44 - 52) / 2 = -4px of the box's middle and the coordinate draws 4px
        // BELOW it. Measured on this fixture at 1440x900: `translate(196px,
        // 301.5px)` in a 392.2 x 595 box.
        const box = await mapBox(section);
        const pin = await pinAt(section, id);
        expect(pin, `${id} has a pin of its own`).not.toBeNull();
        expect(pin!.x).toBeCloseTo(box.w / 2, 0);
        expect(pin!.y).toBeCloseTo(box.h / 2 + 4, 0);
      }
    } finally {
      await context.close();
    }
  });

  test("a pressed pin scrolls its card to the centre, and the centre rule does the rest", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      await drawn(page);
      const section = land(page);

      // Pressed FROM THE FIT, at scroll 0, and that is not convenience. Once a
      // listing is active the camera is at z12 on it and every other pin in the
      // section is tens of kilometres away — 70 km for these two, ~4200px at
      // 16.596 m/px — so it is outside the box, `overflow-hidden` clips it, and
      // Playwright waits forever for an element that will never be visible.
      // That is what the first version of this test did, for 90 seconds. At
      // scroll 0 the window's middle is on the masthead, no card is on the
      // centre line, `active` is null and the map shows them all.
      expect(await onCentreLine(section)).toBeNull();
      await section.locator(`[data-map-pin="${NEW_BRAUNFELS}"]`).click();
      await page.waitForTimeout(1500);

      // The card came to the middle…
      expect(await onCentreLine(section)).toBe(NEW_BRAUNFELS);
      // …and the map followed from THAT, not from the press: the pin ends at
      // the map's centre, which is what the centre rule asks for and what a
      // press-sets-active shortcut would have produced by a different route.
      const box = await mapBox(section);
      const pin = await pinAt(section, NEW_BRAUNFELS);
      expect(pin!.x).toBeCloseTo(box.w / 2, 0);
      expect(pin!.y).toBeCloseTo(box.h / 2 + 4, 0);
      // No sheet: on this page the card IS the detail.
      await expect(section.locator("[data-map-sheet]")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The one that needs the shared harness turned off
// ---------------------------------------------------------------------------

// `playwright-a11y` sets `contextOptions.reducedMotion: "reduce"` on EVERY test
// in the fleet. Under it `cameraMove` answers `jump`, MapLibre's own
// `reduceMotion` collapses whatever is left, and a test that asserted "the
// camera moved" would pass by arriving instantly — proving nothing about the
// flight. Overriding it here is the whole point of this block, and the first
// assertion is that the override TOOK.
test.describe("the flight, with the fleet's reduced-motion emulation lifted", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("travels, rather than arriving", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await drawn(page);
    const section = land(page);

    // Positive evidence the override took. Without this the rest of the test
    // could go green under `reduce` by measuring a jump's two endpoints.
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "the fleet's reduced-motion emulation is lifted in this block",
    ).toBe(false);

    await centre(page, CASTROVILLE);
    const start = await pinAt(section, NEW_BRAUNFELS);
    expect(start).not.toBeNull();

    // Sample from INSIDE the page, on rAF. Sampling from the test races the
    // round trip: a first read 60ms after the trigger landed 1.5px from the
    // destination on a loaded machine, and the whole flight is 500ms.
    const samples = await page.evaluate(
      async ({ id, ms }) => {
        const out: { x: number; y: number }[] = [];
        const read = () => {
          const el = document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`);
          const m = el && /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
          if (m) out.push({ x: Number(m[1]), y: Number(m[2]) });
        };
        document
          .querySelector(`[data-centre-id="${id}"]`)
          ?.scrollIntoView({ block: "center", behavior: "instant" });
        const until = performance.now() + ms;
        await new Promise<void>((resolve) => {
          const step = () => {
            read();
            if (performance.now() < until) requestAnimationFrame(step);
            else resolve();
          };
          requestAnimationFrame(step);
        });
        return out;
      },
      { id: NEW_BRAUNFELS, ms: 900 },
    );

    await page.waitForTimeout(800);
    const end = await pinAt(section, NEW_BRAUNFELS);
    const box = await mapBox(section);
    expect(end!.x).toBeCloseTo(box.w / 2, 0);
    expect(end!.y).toBeCloseTo(box.h / 2 + 4, 0);

    // Travel, positively: at least four frames at neither end. A jump can only
    // ever produce the start or the destination.
    const between = samples.filter(
      (s) =>
        Math.hypot(s.x - start!.x, s.y - start!.y) > 8 &&
        Math.hypot(s.x - end!.x, s.y - end!.y) > 8,
    );
    expect(between.length, `${samples.length} frames sampled`).toBeGreaterThan(3);
  });
});

test.describe("the homepage band, where the carousel drives the camera", () => {
  test("moves with the slides, and only while the carousel is turning", async ({ browser }) => {
    test.setTimeout(120_000);
    const { context, page } = await moving(browser, 1440);
    try {
      await page.goto(HOME);
      await hydrated(page);
      // Script has adopted the carousel — nothing may be pressed before that.
      await expect(page.locator("[data-featured-card]")).toHaveAttribute(
        "data-carousel-ready",
        "",
        { timeout: 20_000 },
      );
      // Hovering the band is itself a pause, so the pointer is parked first.
      await page.mouse.move(2, 2);
      // The band is below the fold and the engine waits for half its box.
      await page.locator("[data-map-slot]").scrollIntoViewIfNeeded();
      await drawn(page);
      const map = page.locator(MAP).first();

      const where = () =>
        map.evaluate((el) =>
          [...el.querySelectorAll<HTMLElement>("[data-map-pin],[data-map-cluster]")]
            .map((p) => p.style.transform)
            .join("|"),
        );

      // PAUSED FIRST. WCAG 2.2.2's mechanism for this band is the carousel's
      // own pause control, and the claim measured here is that it stops the MAP
      // too — which it can only do because the active listing is read off
      // `carousel.index` and nothing else writes it. There is no second gate to
      // disagree with, and this is the evidence there does not need to be one.
      await page.getByRole("button", { name: "Pause slides" }).click();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      await page.mouse.move(2, 2);
      await page.waitForTimeout(1200);
      const parked = await where();
      expect(parked.length).toBeGreaterThan(0);
      // Two and a bit full dwells (4000ms each) with the carousel stopped.
      await page.waitForTimeout(9500);
      expect(await where(), "a paused carousel is a still map").toBe(parked);

      // Now let it turn again, and the camera goes with it.
      await page.getByRole("button", { name: "Play slides" }).click();
      await page.mouse.move(2, 2);
      await expect.poll(async () => (await where()) !== parked, { timeout: 20_000 }).toBe(true);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The pinned box may not eat the page's scroll (#118 review, MAJOR 1)
// ---------------------------------------------------------------------------

test.describe("the pinned map is scrolled past, not scrolled in", () => {
  /** Wheel `ticks` 120px notches over (x, y) from a known scroll position and
   *  return how far the DOCUMENT moved. Real wheel events: `mouse.wheel`
   *  dispatches the same event MapLibre's ScrollZoomHandler listens for, and
   *  that handler's `preventDefault()` is exactly what this measures. */
  async function wheelOver(page: Page, x: number, y: number, ticks: number) {
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(x, y);
    await page.waitForTimeout(100);
    for (let i = 0; i < ticks; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);
    return (await page.evaluate(() => window.scrollY)) - before;
  }

  test("a wheel over the map moves the page exactly as far as one over the cards", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      await drawn(page);
      const section = land(page);

      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(500);

      // The obstacle is real and it is pinned: measured here rather than
      // described, so a layout change that moves the map out of the scroll's
      // way makes this test's premise visibly false instead of quietly true.
      const geom = await section.evaluate((el) => {
        const map = el.querySelector("[data-property-map]") as HTMLElement;
        // `:not([data-map-list])` — the MAP is first in the grid and renders
        // its own <ul> of Google Maps links, so a bare `querySelector("ul")`
        // returns a list INSIDE the map box. The control probe then lands on
        // the map and reads 0, which is the number the map is being accused
        // of: measured while mutating `scrollZoom` back on, where this test
        // failed on its own control instead of on its claim.
        const list = el.querySelector("ul:not([data-map-list])") as HTMLElement;
        const m = map.getBoundingClientRect();
        const l = list.getBoundingClientRect();
        return {
          map: { left: m.left, right: m.right, top: m.top, bottom: m.bottom, width: m.width },
          cardsCentreX: (l.left + l.right) / 2,
          viewport: window.innerWidth,
          pinned: getComputedStyle(map).position === "sticky",
        };
      });
      expect(geom.pinned, "the map really is pinned here").toBe(true);
      expect(
        geom.map.width / geom.viewport,
        "and it really is a large obstacle — 27% of the viewport's width",
      ).toBeGreaterThan(0.2);

      const overMap = {
        x: (geom.map.left + geom.map.right) / 2,
        y: (geom.map.top + geom.map.bottom) / 2,
      };
      // Positive evidence the probe point is ON the map and not beside it.
      expect(
        await page.evaluate(
          (p) => !!document.elementFromPoint(p.x, p.y)?.closest("[data-property-map]"),
          overMap,
        ),
        "the wheel probe really lands on the map",
      ).toBe(true);

      const oneOverMap = await wheelOver(page, overMap.x, overMap.y, 1);
      const oneOverCards = await wheelOver(page, geom.cardsCentreX, 450, 1);
      const fiveOverMap = await wheelOver(page, overMap.x, overMap.y, 5);
      const fiveOverCards = await wheelOver(page, geom.cardsCentreX, 450, 5);

      // The cards column is the control: it says what this page's scroll does
      // when nothing is in the way. Asserting it moved at all is what stops a
      // "both were zero" run reading as a pass.
      expect(oneOverCards, "the control really scrolls").toBeGreaterThan(0);
      expect(fiveOverCards, "and five ticks scroll five times as far").toBeCloseTo(
        oneOverCards * 5,
        0,
      );

      expect(oneOverMap, "one tick over the map moves the page as far as over the cards").toBe(
        oneOverCards,
      );
      expect(fiveOverMap, "and so do five").toBe(fiveOverCards);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// A press is ONE flight (#118 review, MAJOR 2)
// ---------------------------------------------------------------------------

// MOTION ALLOWED, AND THAT IS THE WHOLE POINT OF THIS BLOCK. Under the fleet's
// `reducedMotion: "reduce"` app.css collapses `scroll-behavior` to `auto`, the
// press-scroll lands in one frame, no intermediate card is ever crossed, and
// the defect this measures is STRUCTURALLY UNOBSERVABLE while the test passes.
// The pre-existing press test above runs that way and was green throughout.
test.describe("a pressed pin, with the fleet's reduced-motion emulation lifted", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("issues exactly ONE camera flight, however many cards the scroll crosses", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await drawn(page);
    const section = land(page);

    // Three pieces of positive evidence before anything is counted. Without the
    // first, an empty log means "the probe never installed" and would read as a
    // pass; without the other two the scroll is instant and there is nothing to
    // get wrong.
    expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
    expect(
      await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      "the fleet's reduced-motion emulation is lifted in this block",
    ).toBe(false);
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
      "and the document really does scroll smoothly",
    ).toBe("smooth");

    // From scrollY 0, where no card is on the centre line and the map shows
    // them all — so the press has the height of the section to travel and
    // crosses every card on the way.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    expect(await onCentreLine(section)).toBeNull();
    await resetCamera(page);

    // Sampled on rAF from INSIDE the page: a press-scroll is over in under a
    // second and a round trip per sample would miss the middle of it.
    const travel = await page.evaluate(async (id) => {
      const out: number[] = [];
      document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click();
      const until = performance.now() + 3000;
      await new Promise<void>((resolve) => {
        const step = () => {
          out.push(Math.round(window.scrollY));
          if (performance.now() < until) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      return out;
    }, NEW_BRAUNFELS);

    // The premise, measured: the page really made a long, multi-frame journey.
    // Without this the "one flight" below could be true because nothing moved.
    const distance = travel[travel.length - 1]! - travel[0]!;
    expect(
      distance,
      `the press really scrolled the page (${travel.length} frames)`,
    ).toBeGreaterThan(500);
    expect(
      new Set(travel).size,
      "and it glided rather than jumping — many distinct scroll positions",
    ).toBeGreaterThan(10);

    // It crossed other cards on the way. Counted from the sampled scroll
    // positions against the cards' own boxes, so this is the page's geometry
    // and not the component's opinion of it.
    const crossed = await page.evaluate((ys) => {
      const cards = [...document.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => {
        const b = li.getBoundingClientRect();
        return {
          id: li.dataset.centreId!,
          top: b.top + window.scrollY,
          bottom: b.bottom + window.scrollY,
        };
      });
      const seen = new Set<string>();
      for (const y of ys) {
        const mid = y + window.innerHeight / 2;
        for (const c of cards) if (c.top <= mid && c.bottom >= mid) seen.add(c.id);
      }
      return [...seen];
    }, travel);
    expect(
      crossed.length,
      `the scroll crossed several cards on its way (${crossed.join(", ")})`,
    ).toBeGreaterThan(2);

    const log = await cameraLog(page);
    const moves = log.fly.length + log.ease.length + log.jump.length;
    expect(
      moves,
      `the camera was issued exactly one command, not one per card crossed ` +
        `(fly ${log.fly.length}, ease ${log.ease.length}, jump ${log.jump.length})`,
    ).toBe(1);

    // And it was the right one: the pressed card ends on the centre line and
    // its pin ends at the middle of the map.
    await page.waitForTimeout(1200);
    expect(await onCentreLine(section)).toBe(NEW_BRAUNFELS);
    const box = await mapBox(section);
    const pin = await pinAt(section, NEW_BRAUNFELS);
    expect(pin!.x).toBeCloseTo(box.w / 2, 0);
    expect(pin!.y).toBeCloseTo(box.h / 2 + 4, 0);
  });
});

// ---------------------------------------------------------------------------
// What counts as "the visitor drove this map", against REAL gestures
// (#118 review, MAJOR 3)
// ---------------------------------------------------------------------------

/** A point inside the map box that is NOT a marker. Markers are <button>s and
 *  swallow the pointerdown — which is how a first attempt at this measured
 *  nothing and drew the wrong conclusion from it. */
const bareSpot = (section: Locator) =>
  section.evaluate((el) => {
    const box = (el.querySelector("[data-property-map]") as HTMLElement).getBoundingClientRect();
    for (let dy = 40; dy < box.height - 60; dy += 25)
      for (let dx = 40; dx < box.width - 60; dx += 25) {
        const x = box.left + dx;
        const y = box.top + dy;
        const hit = document.elementFromPoint(x, y);
        if (
          hit &&
          !hit.closest("[data-map-pin],[data-map-cluster],[data-map-expand],.maplibregl-ctrl")
        )
          return { x, y };
      }
    return null;
  });

test.describe("a gesture suspends the camera, and the page's next listing lifts it", () => {
  test("a wheel over the pinned map does not drive it at all", async ({ browser }) => {
    test.setTimeout(90_000);
    const { context, page } = await at(browser, 1440);
    try {
      await watchCamera(page);
      await page.goto(PROPERTIES);
      await hydrated(page);
      await drawn(page);
      expect(await cameraProbeInstalled(page)).toBe(true);
      const section = land(page);

      await centre(page, CASTROVILLE);
      const before = await mapZoom(page);
      expect(before).toBeCloseTo(12, 1);

      const spot = await bareSpot(section);
      expect(spot, "found a bare patch of map to wheel over").not.toBeNull();

      const scrollBefore = await page.evaluate(() => window.scrollY);
      await page.mouse.move(spot!.x, spot!.y);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(900);

      // The wheel went to the PAGE, not to the map. Both halves asserted: the
      // zoom is untouched (so nothing was taken) and the document moved (so the
      // event was not simply lost somewhere).
      expect(await mapZoom(page), "the map's zoom is untouched by a wheel").toBeCloseTo(before, 3);
      expect(
        await page.evaluate(() => window.scrollY),
        "and the page took the wheel instead",
      ).not.toBe(scrollBefore);
    } finally {
      await context.close();
    }
  });

  /** Drag the map 60x30 from a bare patch of it, and assert MapLibre really
   *  saw a gesture — a `movestart` carrying its `originalEvent`, which is the
   *  component's own predicate. */
  async function dragTheMap(page: Page, section: Locator) {
    const spot = await bareSpot(section);
    expect(spot, "found a bare patch of map to drag").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await page.mouse.down();
    await page.mouse.move(spot!.x + 60, spot!.y + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    expect(
      (await cameraLog(page)).movestart,
      "a real drag reaches MapLibre as a movestart carrying its originalEvent",
    ).toContain("mousemove");
  }

  // WHAT THIS COVERS, SAID PLAINLY — because it is less than it reads like,
  // and the re-fit it drives cannot happen on the real portfolio at all.
  //
  // The resize below moves an undriven camera on THIS FIXTURE, whose land
  // section is four points, and the positive control proves that much. On
  // production data it moves nothing, either way the flag is set:
  //
  //   * With one listing ACTIVE the fitted camera is independent of the box —
  //     zero span, zoom clamped to the frame's maxZoom, centre the point plus a
  //     constant-pixel padding correction. (The note further down says this.)
  //   * With NOTHING active, which is the case this flag was written for, the
  //     land fit is HEIGHT-bound at every desktop width on the real 17
  //     listings: box 294.9x595 at 1024 through 397x595 at 1440, boot zoom
  //     6.9481 at all of them. And the map's height is a fixed `lg:h-[595px]`,
  //     so no desktop resize changes the number the fit is bound by.
  //
  // So this is a true measurement of a real rule against a box change only the
  // fixture produces. The box change the real data DOES produce is the expand
  // affordance below `lg` — 200px to min(70dvh, 520px), which moves both the
  // bound and the frame — and it is driven, on /properties with the live
  // listings, in property-map-camera-prod.spec.ts. Keep both: this one is
  // hermetic and fast, that one can fail.
  test("a drag holds the view against a re-fit that would otherwise move it", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await at(browser, 1440);
    try {
      await watchCamera(page);
      await page.goto(PROPERTIES);
      await hydrated(page);
      await drawn(page);
      expect(await cameraProbeInstalled(page)).toBe(true);
      const section = land(page);

      // AT SCROLL 0, AND THAT DETAIL IS THE WHOLE REASON THIS WORKS. With one
      // listing active the fitted camera does not depend on the box at all — a
      // one-point bounds has zero span, the zoom clamps to the frame's maxZoom
      // and the centre is that point — so a resize asks for the camera the map
      // already has and NOTHING moves however the flag is set. A first version
      // of this test resized with a listing active, expected the control to
      // fly, and got no flight at all. At scroll 0 no card is on the centre
      // line, `active` is null, and the camera is fitted to every point INSIDE
      // the box, so the box's shape really does decide it. It is also the case
      // this flag was originally written for, when a box change was the only
      // thing that moved this camera.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(800);
      expect(await onCentreLine(section), "nothing is on the centre line at scroll 0").toBeNull();

      // THE POSITIVE CONTROL, on a map nobody has touched.
      await resetCamera(page);
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.waitForTimeout(1200);
      expect(
        await cameraMoves(page),
        "a resize really does re-fit an undriven map — the control for the assertion below",
      ).toBeGreaterThan(0);

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await resetCamera(page);
      await dragTheMap(page, section);
      const afterDrag = await mapCentre(page);

      // The same resize that just moved the camera. This time it must not.
      await resetCamera(page);
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.waitForTimeout(1200);
      expect(await onCentreLine(section), "still nothing on the centre line").toBeNull();
      expect(await cameraMoves(page), "the visitor's pan survives a re-fit").toBe(0);
      const held = await mapCentre(page);
      expect(held.lng, "and the view is exactly where they left it").toBeCloseTo(afterDrag.lng, 4);
      expect(held.lat).toBeCloseTo(afterDrag.lat, 4);
    } finally {
      await context.close();
    }
  });

  test("and lets go the moment the page asks for a different listing, every time", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await at(browser, 1440);
    try {
      await watchCamera(page);
      await page.goto(PROPERTIES);
      await hydrated(page);
      await drawn(page);
      expect(await cameraProbeInstalled(page)).toBe(true);
      const section = land(page);

      await centre(page, CASTROVILLE);
      await resetCamera(page);
      await dragTheMap(page, section);

      const arrivesAt = async (id: string) => {
        const box = await mapBox(section);
        const pin = await pinAt(section, id);
        expect(pin, `${id} has a pin`).not.toBeNull();
        expect(pin!.x).toBeCloseTo(box.w / 2, 0);
        expect(pin!.y).toBeCloseTo(box.h / 2 + 4, 0);
      };

      // 1. A DIFFERENT LISTING ENDS THE SUSPENSION. This is the half that was
      //    PERMANENT: nothing but `destroy()` ever cleared the flag, so one
      //    40px drag left the camera dead for the rest of the page — measured
      //    at 1440x900, pins at scrollY 500 and 760 byte-identical thereafter.
      await resetCamera(page);
      await centre(page, NEW_BRAUNFELS);
      expect(await onCentreLine(section)).toBe(NEW_BRAUNFELS);
      expect(await cameraMoves(page), "a different listing ends the suspension").toBeGreaterThan(0);
      await arrivesAt(NEW_BRAUNFELS);

      // 2. AND IT DOES NOT COME BACK when the visitor returns to the listing
      //    they dragged on. A gesture is an EVENT, not a property of a
      //    listing: the first version of this rule remembered the id forever,
      //    so `drivenAt === active` came true again here and the camera stayed
      //    stranded on New Braunfels. Caught here, in a browser, after the
      //    unit-level version of the case turned out to be unwritable (see
      //    PropertyMap.test.ts for why).
      await resetCamera(page);
      await centre(page, CASTROVILLE);
      expect(await onCentreLine(section)).toBe(CASTROVILLE);
      expect(
        await cameraMoves(page),
        "returning to the dragged listing is a fresh visit, not a resumed gesture",
      ).toBeGreaterThan(0);
      await arrivesAt(CASTROVILLE);

      // 3. And it keeps working after that — not a one-shot recovery.
      await resetCamera(page);
      await centre(page, NEW_BRAUNFELS);
      expect(await cameraMoves(page), "and the camera keeps following").toBeGreaterThan(0);
      await arrivesAt(NEW_BRAUNFELS);
    } finally {
      await context.close();
    }
  });
});

// ---------------------------------------------------------------------------
// The pinned offset with NO SCRIPT AT ALL (#118 review, MINOR 6)
// ---------------------------------------------------------------------------

// Both the map and the divider are `position: sticky` in plain CSS, so they pin
// on a page that never hydrates — and `--sticky-top` used to ship as a flat
// 100px that only an `$effect` corrected. Measured on a production build of
// /properties at 1440x900, scrollY 6000, script off: the map pinned at 100 with
// the divider's bottom at 145.41, so 45.41px of the fallback LIST OF LISTING
// LINKS — the whole of the map for a no-JS visitor — was behind an opaque
// block. This is that case, and it is the one test in this file that must run
// with `javaScriptEnabled: false`.
test.describe("with scripting off", () => {
  test.use({ javaScriptEnabled: false });

  test("the map still pins clear of its own divider, not behind it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);

    // Positive evidence that script really is off, and therefore that what
    // follows is the server's answer and not an effect's. `$$eval` runs through
    // Playwright's own binding, so it works here; the PAGE's scripts do not.
    expect(
      await page.$$eval("[data-property-map]", (els) =>
        els.map((el) => el.hasAttribute("data-map-ready")),
      ),
      "no map has booted, because nothing ran",
    ).not.toContain(true);
    expect(
      await page.$$eval("nav[aria-label='Primary']", (els) => getComputedStyle(els[0]!).position),
      "and the bar is still the server's `absolute`, never mount's `fixed`",
    ).toBe("absolute");

    const r = await page.$$eval("section[aria-labelledby^='listing-']", (secs) => {
      const read = (sec: Element) => {
        const map = sec.querySelector("[data-property-map]") as HTMLElement | null;
        if (!map) return null;
        const divider = sec.firstElementChild as HTMLElement;
        return {
          id: sec.getAttribute("aria-labelledby"),
          dividerHeight: divider.getBoundingClientRect().height,
          dividerSticky: getComputedStyle(divider).position === "sticky",
          offset: parseFloat(getComputedStyle(map).top),
          mapSticky: getComputedStyle(map).position === "sticky",
          listTop: (map.querySelector("[data-map-list]") as HTMLElement).getBoundingClientRect()
            .top,
        };
      };
      return { first: read(secs[0]!), second: read(secs[1]!) };
    });

    // Section 0's divider does not pin, so its map lands on the scrollport's
    // declared usable top.
    expect(r.first!.dividerSticky).toBe(false);
    expect(r.first!.mapSticky, "the map pins with no script at all").toBe(true);
    expect(r.first!.offset).toBeCloseTo(100, 1);

    // Section 1's DOES pin, and the server-sent offset has to clear it. This is
    // the assertion that was 45.41 wrong.
    expect(r.second!.dividerSticky).toBe(true);
    expect(r.second!.dividerHeight).toBeGreaterThan(120);
    expect(r.second!.offset, "the no-JS offset is the divider's height, not the bar's").toBeCloseTo(
      r.second!.dividerHeight,
      0,
    );
    expect(r.second!.offset, "and specifically it is NOT the old flat 100").toBeGreaterThan(140);

    // THE GUARD app.css PROMISES. `--listing-divider-top` is arithmetic over
    // the divider's own declared parts (100 pad + 2 rule + 18 gap + a 34.8
    // `t-h3` line box less its own -9.4 leading). If a font swap, a reworded
    // label or a changed pad moves the real divider and not that sum, the two
    // part company here rather than on a visitor's screen.
    const declared = await page.$$eval("html", (els) =>
      getComputedStyle(els[0]!).getPropertyValue("--listing-divider-top").trim(),
    );
    expect(declared, "app.css declares the derived divider height").not.toBe("");
    expect(
      r.second!.offset,
      "and the derivation matches the divider the browser actually rendered",
    ).toBeCloseTo(r.second!.dividerHeight, 0);

    // What the visitor sees: the list of links starts below the divider, not
    // under it.
    const behind = r.second!.dividerHeight - r.second!.listTop;
    expect(
      behind,
      `the fallback list is clear of the divider (${behind.toFixed(2)}px behind)`,
    ).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Where the BROWSER's own scrolls land inside a pinned section
// (#118 review, MINOR 10)
// ---------------------------------------------------------------------------

test.describe("a card scrolled to the top of the scrollport clears the pinned divider", () => {
  test("carries the extra scroll-margin a pinned divider costs, and none where nothing pins", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);

      const declared = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
      );
      expect(declared, "app.css still declares the usable top").toBeCloseTo(100, 1);

      // Section 0 pins no divider, so its cards need no extra margin at all —
      // `scroll-padding-top` is already the whole answer there.
      const firstMargin = await page.evaluate(() => {
        const sec = document.querySelectorAll("section[aria-labelledby^='listing-']")[0]!;
        return getComputedStyle(sec.querySelector("[data-centre-id]")!).scrollMarginTop;
      });
      expect(parseFloat(firstMargin), "no pinned divider, no extra margin").toBeCloseTo(0, 1);

      // Section 1 pins one, and its cards carry exactly the difference.
      const second = await page.evaluate(() => {
        const sec = document.querySelectorAll("section[aria-labelledby^='listing-']")[1]!;
        const divider = sec.firstElementChild as HTMLElement;
        return {
          dividerHeight: divider.getBoundingClientRect().height,
          margin: parseFloat(
            getComputedStyle(sec.querySelector("[data-centre-id]")!).scrollMarginTop,
          ),
        };
      });
      expect(
        second.margin,
        "the extra margin is the divider's height less the declared usable top",
      ).toBeCloseTo(second.dividerHeight - declared, 1);
      expect(second.margin, "and it is a real, non-zero correction").toBeGreaterThan(40);

      // AND IT LANDS. `scrollIntoView({block:"start"})` is the same scroll the
      // browser makes for a fragment and for a backward Tab onto an element
      // above the viewport, and it is the one `scroll-padding-top` governs.
      // Measured before this fix on a production build: card top 99.95 against
      // a divider bottom of 145.41.
      const landing = await page.evaluate(async () => {
        const sec = document.querySelectorAll("section[aria-labelledby^='listing-']")[1]!;
        const divider = sec.firstElementChild as HTMLElement;
        const cards = [...sec.querySelectorAll<HTMLElement>("[data-centre-id]")];
        const card = cards[cards.length - 1]!;
        card.scrollIntoView({ block: "start", behavior: "instant" });
        await new Promise((r) => setTimeout(r, 300));
        const d = divider.getBoundingClientRect();
        return {
          dividerPinned: Math.abs(d.top) < 1,
          dividerBottom: d.bottom,
          cardTop: card.getBoundingClientRect().top,
        };
      });
      expect(landing.dividerPinned, "the divider really is pinned at this scroll").toBe(true);
      const behind = landing.dividerBottom - landing.cardTop;
      expect(
        behind,
        `the card lands clear of the pinned divider (${behind.toFixed(2)}px behind it)`,
      ).toBeLessThan(1);
    } finally {
      await context.close();
    }
  });
});

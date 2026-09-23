import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

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

  test("passes UNDER the divider rather than over it", async ({ browser }) => {
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

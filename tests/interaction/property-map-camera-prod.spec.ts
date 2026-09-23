import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cameraLog,
  cameraMovesFor,
  cameraProbeInstalled,
  mapNamed,
  mapZoom,
  resetCamera,
  watchCamera,
} from "./camera-probe";
import { hydrated } from "./hydrated";

// THE CAMERA, ON THE SITE'S OWN ROUTES (#118 review).
//
// WHY A SECOND FILE AND NOT MORE CASES IN property-map-camera.spec.ts. That
// file measures /dev/properties and /dev/home — the real components over
// fixture data, hermetic, which is the right default and is why it stays. But
// /dev/* routes 404 on a production build (issue #120), so nothing in it can
// ever run against the shipped bundle, and that is not a theoretical gap: all
// three majors this file exists for were reported FIXED on the strength of
// measurements taken there, and independent verification found all three alive
// on a production build of `/` and `/properties`.
//
// So every case below drives a route the site really serves. Run it either way:
//
//   pnpm exec playwright test tests/interaction/property-map-camera-prod.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/property-map-camera-prod.spec.ts
//
// The second builds the site and serves the real bundle. Both were run for the
// PR that added this file; the numbers in the comments below are the
// production-build ones.
//
// NOTHING HERE HARD-CODES A LISTING. The ids on these routes are Prismic
// document ids from the live repository, so every case discovers the cards and
// pins it drives from the DOM. What it may assume is the SHAPE the page
// promises: a land section and an improved section, each with cards and a map.
//
// EVERY CASE LIFTS THE FLEET'S REDUCED-MOTION EMULATION, and that is not
// optional decoration. `playwright-a11y` sets `contextOptions.reducedMotion:
// "reduce"` on every test; app.css turns that into `scroll-behavior: auto
// !important`, so a smooth scroll lands in ONE frame, no card between here and
// there is ever crossed, and `cameraMove` answers `jump` for everything. The
// entire defect class below is structurally unobservable that way — which is
// exactly how it shipped.

const PROPERTIES = "/properties";
const HOME = "/";
const MAP = "[data-property-map]";

/** MapLibre's own `load` has fired for the nth map on the page. */
const drawn = (page: Page, nth = 0) =>
  expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", { timeout: 45_000 });

/** A point in the middle of the map's box AND inside the window — the two are
 *  not the same thing once the box is 520px tall on an 844px phone, and a
 *  `mouse.move` to a y below the viewport is clamped somewhere else entirely.
 *  A first version of the band cases wheeled at such a point and measured a map
 *  that never saw a wheel: zoom 12 before and 12 after, reported as a fix. */
const wheelSpot = (page: Page) =>
  page
    .locator(MAP)
    .first()
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      const top = Math.max(b.top, 0);
      const bottom = Math.min(b.bottom, window.innerHeight);
      return { x: b.left + b.width / 2, y: (top + bottom) / 2, height: bottom - top };
    });

/** A point inside the first map's box that is NOT a marker or a control.
 *  Markers are <button>s and swallow the pointerdown, which is how a first
 *  attempt at a drag test measured nothing and drew a conclusion from it. */
const bareSpot = (page: Page) =>
  page
    .locator(MAP)
    .first()
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      const floor = Math.min(box.bottom, window.innerHeight);
      for (let y = Math.max(box.top, 0) + 30; y < floor - 60; y += 20)
        for (let dx = 30; dx < box.width - 40; dx += 20) {
          const x = box.left + dx;
          const hit = document.elementFromPoint(x, y);
          if (
            hit &&
            !hit.closest("[data-map-pin],[data-map-cluster],[data-map-expand],.maplibregl-ctrl") &&
            el.contains(hit)
          )
            return { x, y };
        }
      return null;
    });

const land = (page: Page) => page.locator("section[aria-labelledby='listing-land']");
const improved = (page: Page) => page.locator("section[aria-labelledby='listing-improved']");

/** The card `data-centre-id` crossing the middle of the window, by the page's
 *  own geometry rather than by asking the component. */
const onCentreLine = (section: Locator) =>
  section.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const b = li.getBoundingClientRect();
      if (b.top <= mid && b.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

/** Where a listing's pin sits inside its map's box, or null if that listing is
 *  inside a cluster and has no pin of its own (issue #115). */
const pinAt = (section: Locator, id: string) =>
  section.evaluate((el, listing) => {
    const box = (el.querySelector("[data-property-map]") as HTMLElement).getBoundingClientRect();
    const pin = el.querySelector<HTMLElement>(`[data-map-pin="${listing}"]`);
    if (!pin) return null;
    const p = pin.getBoundingClientRect();
    return { x: p.left + p.width / 2 - box.left, y: p.bottom - box.top };
  }, id);

/** Every listing this section draws a single pin for, in DOM order. */
const pinIds = (section: Locator) =>
  section.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-map-pin]")].map((p) => p.dataset.mapPin!),
  );

/** Scroll `id`'s card to the middle of the window INSTANTLY, so the thing under
 *  test is the camera and not the scroll. */
async function centre(page: Page, id: string) {
  await page.evaluate((listing) => {
    const li = document.querySelector<HTMLElement>(`[data-centre-id="${listing}"]`)!;
    const box = li.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
      behavior: "instant" as ScrollBehavior,
    });
  }, id);
  await page.waitForTimeout(900);
}

/** The premises every count below rests on, asserted rather than assumed: the
 *  probe is in, motion is allowed, and the document really glides. Without the
 *  first an empty log reads as a pass; without the other two nothing is ever
 *  crossed on the way and there is nothing to coalesce. */
async function premises(page: Page) {
  expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "the fleet's reduced-motion emulation is lifted in this file",
  ).toBe(false);
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    "and the document really does scroll smoothly",
  ).toBe("smooth");
}

/** Sample `window.scrollY` every frame from INSIDE the page while `drive` runs
 *  and for `ms` afterwards — a round trip per sample would miss the middle of a
 *  scroll that is over in under a second. Returns the positions and the cards
 *  the centre line crossed, both measured off the page's own boxes. */
async function travelOf(page: Page, drive: () => Promise<void>, ms = 2500) {
  const sampling = page.evaluate(async (until) => {
    const out: number[] = [];
    const end = performance.now() + until;
    await new Promise<void>((resolve) => {
      const step = () => {
        out.push(Math.round(window.scrollY));
        if (performance.now() < end) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return out;
  }, ms);
  await drive();
  const positions = await sampling;
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
  }, positions);
  return { positions, crossed, distance: positions[positions.length - 1]! - positions[0]! };
}

// ---------------------------------------------------------------------------
// ONE FLIGHT PER SETTLED SCROLL, whatever caused the scroll (MAJOR 3)
// ---------------------------------------------------------------------------

test.describe("a smooth scroll commands the camera once, not once per card", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /** Load /properties at 1440x900 with the probe in, both maps drawn, parked at
   *  the top of the page with nothing on the centre line. */
  async function atTheTop(page: Page) {
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await drawn(page, 0);
    await premises(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);
    expect(await onCentreLine(land(page)), "nothing is on the centre line at the top").toBeNull();
    await resetCamera(page);
  }

  // THE NUMBERS THIS REPLACES, measured on a production build of /properties at
  // 1440x900 with motion allowed, counting the calls made to maplibre-gl:
  //
  //   End from scrollY 0    5-9 flyTo + 1 jumpTo, spanning 71-81ms
  //   PageDown x3           5 flyTo
  //   Space x4              4 flyTo
  //   scrollTo(0, 4999)     15 flyTo in 784ms
  //
  // Eight Van Wijk arcs each abandoned after ~9ms is a smear, and by the
  // severity bar the press path was fixed under — four flights in 322ms —
  // every one of these is the same defect. None of them goes anywhere near a
  // pin, which is why fixing the press fixed none of them.
  for (const [name, drive] of [
    ["the End key", (page: Page) => page.keyboard.press("End")],
    [
      "three PageDowns",
      async (page: Page) => {
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press("PageDown");
          await page.waitForTimeout(60);
        }
      },
    ],
    [
      "a page's own smooth scrollTo",
      (page: Page) =>
        page.evaluate(() => window.scrollTo({ top: 4999, behavior: "smooth" })) as Promise<void>,
    ],
  ] as const) {
    test(`${name} costs each map at most one command`, async ({ page }) => {
      test.setTimeout(180_000);
      await atTheTop(page);

      const travel = await travelOf(page, () => drive(page));

      // THE PREMISES. Without these a count of 1 could be true because nothing
      // moved, or because it moved in a single frame.
      expect(
        travel.distance,
        `the page really travelled (${travel.positions.length} frames)`,
      ).toBeGreaterThan(500);
      // It GLIDED — several distinct positions rather than one frame's jump.
      // Deliberately not a big number: Chromium's own `End` animation is short,
      // and measured on a production build it delivered as few as 10 distinct
      // positions for a 10 000px journey. A premise that is itself flaky turns
      // a real red into a coin toss, so this asks only for what it needs.
      expect(
        new Set(travel.positions).size,
        "and it glided rather than jumping — several distinct positions",
      ).toBeGreaterThan(4);
      expect(
        travel.crossed.length,
        `and it crossed several cards on the way (${travel.crossed.length})`,
      ).toBeGreaterThan(2);

      await page.waitForTimeout(1200);
      const log = await cameraLog(page);
      // FLIGHTS are what coalesce, and the claim is per MAP: a page draws one
      // map per section and an `End` crosses cards in all of them, so "the
      // camera flew once" is a statement about each of them, not about the sum.
      //
      // A JUMP is deliberately not in the class and is not counted here —
      // `cameraMove` refuses only a flight while the page moves, because an
      // instant move cannot be interrupted and cannot smear. A map that boots
      // mid-scroll issues one: its first measured box is not the box its boot
      // camera was computed against, and re-fitting that is a layout answer.
      const perMap = new Map<number, number>();
      for (const call of [...log.fly, ...log.ease])
        perMap.set(call.m, (perMap.get(call.m) ?? 0) + 1);
      const tally =
        `fly ${log.fly.length}, ease ${log.ease.length}, jump ${log.jump.length}; ` +
        `per map ${[...perMap].map(([m, n]) => `${m}:${n}`).join(" ") || "none"}`;
      for (const [m, n] of perMap)
        expect(n, `map ${m} flew ${n} times for ONE scroll (${tally})`).toBeLessThanOrEqual(1);
      // And positive evidence that it flew at all: a rule that answered "no
      // move" to everything would satisfy the line above perfectly.
      expect(log.fly.length, `the camera did follow the scroll (${tally})`).toBeGreaterThan(0);

      // And the camera is not merely quiet: it went where the scroll ENDED.
      const settled = await onCentreLine(land(page));
      if (settled) {
        const pin = await pinAt(land(page), settled);
        if (pin) {
          const box = await land(page)
            .locator(MAP)
            .evaluate((el) => {
              const b = el.getBoundingClientRect();
              return { w: b.width, h: b.height };
            });
          expect(pin.x).toBeCloseTo(box.w / 2, 0);
          expect(pin.y).toBeCloseTo(box.h / 2 + 4, 0);
        }
      }
    });
  }

  // THIS ONE DOES NOT DISCRIMINATE, AND IS KEPT ANYWAY. Run against the code
  // this PR replaces, on a production build, it PASSED — the press was the one
  // path that had been noticed and the one path that had been fixed. It guards
  // the other direction: the machinery that made it true was deleted here, and
  // the general rule has to cover the case it used to special-case.
  test("and a pressed pin is no longer a special case of anything", async ({ page }) => {
    test.setTimeout(180_000);
    await atTheTop(page);
    const section = land(page);
    const pins = await pinIds(section);
    expect(pins.length, "the land map draws pins to press").toBeGreaterThan(0);
    // The pin whose card is FURTHEST down the list, so the press has the most
    // to travel and crosses the most cards.
    const target = await section.evaluate((el, ids) => {
      const order = [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map(
        (li) => li.dataset.centreId!,
      );
      return ids.slice().sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]!;
    }, pins);

    const travel = await travelOf(page, async () => {
      await page.evaluate(
        (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
        target,
      );
    });
    expect(travel.distance, "the press really scrolled the page").toBeGreaterThan(500);
    expect(travel.crossed.length, "across several cards").toBeGreaterThan(2);

    await page.waitForTimeout(1200);
    const landMap = await mapNamed(page, "Land");
    expect(landMap, "the land map is one of the booted maps").toBeGreaterThanOrEqual(0);
    expect(
      await cameraMovesFor(page, landMap),
      "the pressed section's camera was commanded once",
    ).toBe(1);
    expect(await onCentreLine(section)).toBe(target);
  });
});

// ---------------------------------------------------------------------------
// A PRESS IN ONE SECTION LEAVES EVERY OTHER SECTION ALONE (MAJOR 1)
// ---------------------------------------------------------------------------

test.describe("two sections, two cameras, no shared state between them", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  // WHAT THIS IS ABOUT. The press suspension that shipped was keyed per section
  // while the three timers behind it were single component-level variables, so
  // the second press cancelled the first's pending resume and the first
  // section's centre rule stayed suspended for the life of the page. Measured
  // on a production build at 1440x900: press a land pin, then an improved pin
  // 300ms later, and the land map issued ZERO camera commands across five
  // subsequent card crossings — its centre byte-identical at -98.73018,
  // 29.77384 — against 9 for the same crossings with no cross-section press. A
  // 1000ms gap behaved the same; only waiting out the 2000ms cap recovered it.
  //
  // Nothing in the suite pressed pins in two sections, which is the whole
  // reason it shipped. This does.
  test("a press in the improved section does not freeze the land camera", async ({ page }) => {
    test.setTimeout(240_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await drawn(page, 0);
    await premises(page);

    // Both maps have to be booted before either can be pressed — the improved
    // one loads only when half of its box is on screen.
    await improved(page).locator(MAP).scrollIntoViewIfNeeded();
    await drawn(page, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);

    const landPins = await pinIds(land(page));
    const improvedPins = await pinIds(improved(page));
    expect(landPins.length, "the land map draws a pin to press").toBeGreaterThan(0);
    expect(improvedPins.length, "and so does the improved map").toBeGreaterThan(0);

    // THE SEQUENCE. A press in one section, then a press in the other while the
    // first scroll is still travelling.
    await page.evaluate(
      (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
      landPins[0]!,
    );
    await page.waitForTimeout(300);
    await page.evaluate(
      (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
      improvedPins[0]!,
    );
    await page.waitForTimeout(1500);

    // Now drive the LAND section's cards past the centre line, one at a time,
    // and ask its own map whether it noticed.
    const landCards = await land(page).evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => li.dataset.centreId!),
    );
    expect(landCards.length, "the land section has cards to cross").toBeGreaterThan(4);

    const landMap = await mapNamed(page, "Land");
    expect(landMap, "the land map is one of the booted maps").toBeGreaterThanOrEqual(0);
    await resetCamera(page);
    const before = await page.evaluate((n) => window.__camera.maps[n]!.getCenter(), landMap);
    for (const id of landCards.slice(0, 5)) await centre(page, id);
    const after = await page.evaluate((n) => window.__camera.maps[n]!.getCenter(), landMap);

    const followed = await cameraMovesFor(page, landMap);
    expect(
      followed,
      `the land camera followed its own cards after a press in another section ` +
        `(${followed} commands across ${landCards.slice(0, 5).length} crossings)`,
    ).toBeGreaterThan(0);
    // And it really moved, not merely issued something: the centre is not the
    // one it was stranded on.
    expect(
      Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat),
      `the land map's centre moved (${before.lng.toFixed(5)}, ${before.lat.toFixed(5)} -> ` +
        `${after.lng.toFixed(5)}, ${after.lat.toFixed(5)})`,
    ).toBeGreaterThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// A RE-FIT THE `userMoved` GUARD CAN ACTUALLY FAIL ON (MAJOR 3, the residual)
// ---------------------------------------------------------------------------

test.describe("a drag holds the view against a box change the real portfolio can produce", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference", hasTouch: true } });

  // WHY THIS EXISTS BESIDE THE ONE IN property-map-camera.spec.ts. That test
  // drags the map and then RESIZES THE WINDOW from 1440 to 1200, and its
  // positive control — an undriven map really does re-fit on that resize —
  // passes on the fixture. It cannot pass on the real portfolio, and saying so
  // plainly is half of what this file owes:
  //
  //   * With ONE listing active the fitted camera does not depend on the box at
  //     all. A one-point bounds has zero span, the zoom clamps to the frame's
  //     maxZoom and the centre is that point plus a padding correction that is
  //     a constant number of pixels. Nothing a resize does can move it.
  //   * With NOTHING active — the fit-them-all camera, which is the case the
  //     flag was written for — the land section's fit is HEIGHT-bound at every
  //     desktop width on production data: the box runs 294.9x595 at 1024
  //     through 397x595 at 1440 and the boot zoom is 6.9481 at all of them. And
  //     the map's height is a fixed `lg:h-[595px]`, so no desktop resize
  //     changes it.
  //
  // So on /properties at desktop, with the real 17 land listings, the re-fit
  // that test guards against cannot happen. It measures a real rule against a
  // box change only the 4-point fixture produces.
  //
  // The EXPAND affordance is a box change the real data does produce, on every
  // phone: it takes the map from 200px to min(70dvh, 520px), which changes both
  // the height the fit is bound by AND the frame (compact -> full, different
  // padding). Below `lg` the centre rule does not run at all, so `active` is
  // null and the camera on screen IS the fit-them-all one.
  test("expanding and collapsing re-fits an undriven map, and never a dragged one", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page)).toBe(true);
    expect(
      await onCentreLine(land(page)),
      "below `lg` nothing drives `active`, so the camera is the fit-them-all one",
    ).not.toBe(undefined);

    const expand = page.locator("[data-map-expand]").first();
    await expand.click();
    await page.waitForTimeout(900);

    // THE POSITIVE CONTROL, on a map nobody has touched: collapsing really does
    // ask this camera for a different one. Without it every line below could be
    // true because the box change moves nothing.
    await resetCamera(page);
    await expand.click();
    await page.waitForTimeout(1200);
    expect(
      await cameraMovesFor(page, 0),
      "a collapse really does re-fit an undriven map — the control for the assertion below",
    ).toBeGreaterThan(0);

    // Now the same box change, after a drag.
    await expand.click();
    await page.waitForTimeout(900);
    const spot = await bareSpot(page);
    expect(spot, "found a bare patch of the expanded map to drag").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await page.mouse.down();
    await page.mouse.move(spot!.x + 60, spot!.y + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    expect(
      (await cameraLog(page)).movestart,
      "a real drag reaches MapLibre as a movestart carrying its originalEvent",
    ).toContain("mousemove");

    const held = await page.evaluate(() => {
      const m = window.__camera.maps[0]!;
      const c = m.getCenter();
      return { lng: Number(c.lng.toFixed(5)), lat: Number(c.lat.toFixed(5)), zoom: m.getZoom() };
    });
    await resetCamera(page);
    await expand.click();
    await page.waitForTimeout(1200);
    expect(await cameraMovesFor(page, 0), "the visitor's pan survives the same box change").toBe(0);
    const after = await page.evaluate(() => {
      const m = window.__camera.maps[0]!;
      const c = m.getCenter();
      return { lng: Number(c.lng.toFixed(5)), lat: Number(c.lat.toFixed(5)), zoom: m.getZoom() };
    });
    expect(after.lng, "and the view is exactly where they left it").toBeCloseTo(held.lng, 4);
    expect(after.lat).toBeCloseTo(held.lat, 4);
    expect(after.zoom).toBeCloseTo(held.zoom, 4);
  });
});

// ---------------------------------------------------------------------------
// THE HOMEPAGE BAND'S CLOCK IS NOT A VISITOR (MAJOR 2)
// ---------------------------------------------------------------------------

test.describe("the band's auto-advance keeps its hands off the visitor's view", () => {
  test.use({
    contextOptions: { reducedMotion: "no-preference", hasTouch: true },
  });

  // THE ONE STATE WHERE THE WHEEL IS DELIBERATELY THE VISITOR'S. The in-page
  // map is built with scroll-zoom off so the pinned box cannot eat the page's
  // scroll; EXPANDING it turns scroll-zoom back on, and the expand affordance
  // exists only where the map is compact — below `lg`. So this runs at 390x844.
  //
  // Measured on a production build of `/` at 390x844 before the fix: four
  // wheel-up ticks took the map from z12 to z12.5387, and ~9s later — with no
  // further input at all — the camera had issued 2 flyTo back to z12 and the
  // zoom was gone while the map was still expanded. The dwell is 4000ms, so
  // nobody could hold a view for longer than four seconds.
  test("a visitor's zoom survives the dwell that follows it", async ({ page }) => {
    test.setTimeout(180_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    await hydrated(page);

    const band = page.locator("section:has([data-map-slot])").first();
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);

    const expand = page.locator("[data-map-expand]").first();
    await expect(expand).toHaveAttribute("data-map-expand", "expand");
    await expand.click();
    await expect(expand).toHaveAttribute("data-map-expand", "collapse");
    await page.waitForTimeout(600);
    expect(
      await page.evaluate(() => window.__camera.maps[0]!.scrollZoom.isEnabled()),
      "expanding is what hands the wheel to the map",
    ).toBe(true);

    const before = await mapZoom(page);
    const spot = await wheelSpot(page);
    expect(spot.height, "the expanded map really is on screen to wheel over").toBeGreaterThan(100);

    // Four ticks over the middle of the expanded map. This is the gesture
    // MapLibre leaves untagged — its `movestart` carries no `originalEvent` —
    // which is why the component listens for the wheel itself.
    await page.mouse.move(spot.x, spot.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(900);
    const zoomed = await mapZoom(page);
    expect(zoomed, `the wheel really zoomed the map (${before} -> ${zoomed})`).toBeGreaterThan(
      before + 0.1,
    );

    // Hands off the map, and off the band, so nothing after this is input to
    // anything: the pointer leaves the map entirely and the only thing left
    // running is the band's own 4000ms clock.
    await page.mouse.move(2, 2);
    const slideBefore = await band
      .locator("[data-carousel-slide]")
      .evaluateAll((els) => els.findIndex((el) => !el.hasAttribute("aria-hidden")));
    await resetCamera(page);
    await page.waitForTimeout(9000);

    // THE PREMISE, and without it "0 commands" would pass on a band that was
    // simply paused.
    const slideAfter = await band
      .locator("[data-carousel-slide]")
      .evaluateAll((els) => els.findIndex((el) => !el.hasAttribute("aria-hidden")));
    expect(
      slideAfter,
      `the band really did turn on its own (slide ${slideBefore} -> ${slideAfter})`,
    ).not.toBe(slideBefore);

    const log = await cameraLog(page);
    expect(
      log.fly.length + log.ease.length + log.jump.length,
      `the clock commanded the camera ${log.fly.length + log.ease.length + log.jump.length} ` +
        `times with nobody touching anything`,
    ).toBe(0);
    expect(await mapZoom(page), "and the visitor's zoom is exactly where they left it").toBeCloseTo(
      zoomed,
      3,
    );
    await expect(expand, "on a map that is still expanded").toHaveAttribute(
      "data-map-expand",
      "collapse",
    );
  });

  // ALSO NOT DISCRIMINATING, AND ALSO KEPT. Against the code this PR replaces
  // it passed, because there ANY change of `active` lifted the suspension —
  // which was the defect. It guards the OVER-correction: a rule that told an
  // auto-advance apart from a visitor and then never lifted for either would
  // be the older defect (one gesture killing the camera for the life of the
  // page) in new clothes, and it would satisfy the case above perfectly.
  test("and an arrow press — a visitor asking for somewhere else — gives it back", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    await hydrated(page);

    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page)).toBe(true);

    const expand = page.locator("[data-map-expand]").first();
    await expand.click();
    await page.waitForTimeout(600);
    const before = await mapZoom(page);
    const spot = await wheelSpot(page);
    await page.mouse.move(spot.x, spot.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(900);
    const zoomed = await mapZoom(page);
    expect(zoomed, `the wheel really zoomed the map (${before} -> ${zoomed})`).toBeGreaterThan(
      before + 0.1,
    );

    // THE OTHER HALF OF THE RULE. A suspension that nothing could lift would be
    // the older defect — one pan killing the feature for the life of the page —
    // wearing different clothes.
    await page.mouse.move(2, 2);
    await resetCamera(page);
    await page.getByRole("button", { name: "Next slide" }).click();
    await page.waitForTimeout(1500);

    const log = await cameraLog(page);
    expect(
      log.fly.length + log.ease.length + log.jump.length,
      "the visitor asked for a different listing, so the camera follows again",
    ).toBeGreaterThan(0);
    expect(await mapZoom(page), "and it is back on the frame's own zoom").not.toBeCloseTo(
      zoomed,
      3,
    );
  });
});

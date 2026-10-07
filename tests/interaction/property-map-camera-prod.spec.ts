import { expect, test, type Page } from "@playwright/test";

import {
  adopted,
  CAMERA_FLIGHT_MS,
  cameraAtRest,
  cameraLog,
  cameraMovesFor,
  cameraProbeInstalled,
  mapCentre,
  mapZoom,
  resetCamera,
  watchCamera,
} from "./camera-probe";
import { measureDwell, nextTurn, slideOnStage } from "./band-turn";
import { hydrated } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";

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

/** MapLibre's own `load` has fired for the nth map on the page — scrolled just
 *  far enough to boot first, where it cannot at rest (./map-boot). */
async function drawn(page: Page, nth = 0) {
  await scrollMapToBoot(page.locator(MAP).nth(nth));
  await expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", {
    timeout: 45_000,
  });
}

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

// (`aFreshDwell` lived here: wait for the band's clock to turn, so the band
// cases could wheel at the top of a 4000ms dwell instead of racing a turn's
// flight. Since the homepage lock (operator call, 2026-09-23) those cases pause
// the band before they wheel — a paused band has no clock to race — and a
// dwell-sized wait is exactly what the doubled 8000ms dwell would have turned
// into a pass that tested nothing. See ./band-turn.)

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
            !hit.closest("[data-map-pin],[data-map-cluster],[data-map-control],.maplibregl-ctrl") &&
            el.contains(hit)
          )
            return { x, y };
        }
      return null;
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
  // phone: it takes the map from 200px to the window (M1), which changes both
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
    // Installed is not ADOPTED. At 390 this map issues no camera command after
    // it boots, and on a production build addControl beats the patch, so
    // nothing here adopted it until PropertyMap's own `resize()` did (#135).
    await adopted(page);
    // POSITIVE EVIDENCE that the camera on screen is the fit-them-all one, not
    // an argument that it must be: `centreWatch` does not run below `lg`, so
    // `active` is null and the zoom is whatever the whole section fits into.
    // A camera driven by an active listing would be at the frame's maxZoom, 12,
    // exactly — so any zoom below that is a fit and nothing else.
    const fitted = await mapZoom(page);
    expect(
      fitted,
      `the map is fitted to the section, not centred on one listing (z${fitted})`,
    ).toBeLessThan(11.5);

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
      const m = window.__camera.map(0);
      const c = m.getCenter();
      return { lng: Number(c.lng.toFixed(5)), lat: Number(c.lat.toFixed(5)), zoom: m.getZoom() };
    });
    await resetCamera(page);
    await expand.click();
    await page.waitForTimeout(1200);
    expect(await cameraMovesFor(page, 0), "the visitor's pan survives the same box change").toBe(0);
    const after = await page.evaluate(() => {
      const m = window.__camera.map(0);
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

  // WHAT THIS BLOCK HOLDS NOW, and why it changed shape twice in one day.
  //
  // Measured on a production build of `/` at 390x844 before #126: four
  // wheel-up ticks on the expanded band map took it from z12 to z12.5387, and
  // ~9s later — with no further input — the camera had flown back to z12
  // twice. The clock's turns were read as the visitor asking for somewhere
  // else. `activeBy` fixed it, and these cases wheeled the RUNNING band and
  // waited out a dwell to prove it.
  //
  // THE HOMEPAGE LOCK (operator call, 2026-09-23) moved the ground under them:
  // the band's map is uninteractable while the slideshow runs, so a visitor
  // can only have a view of their own while it is PAUSED — and a paused band
  // has no clock. The class these cases exist for (a clock turn taking a
  // visitor's view away) is now closed twice over: the lock keeps the visitor
  // off a running map, and `activeBy` still holds a suspension through any
  // turn that did happen. What they measure now is the new boundary: paused,
  // the view is the visitor's for longer than the clock's own dwell; Play
  // hands the map back to the clock on purpose.
  //
  // EVENT-DRIVEN, BOTH WAYS. "Longer than a dwell" is measured off two of the
  // band's own turns rather than assumed (8000ms since #151; it was 4000ms),
  // and every wait for a turn fails if none comes.
  test("paused, the visitor's view outlasts the dwell; Play hands the map back to the clock", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    await hydrated(page);

    const band = page.locator("section:has([data-map-slot])").first();
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
    const dwell = await measureDwell(page, band);

    await page.getByRole("button", { name: "Pause slides" }).click();
    await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
    const expand = page.locator("[data-map-expand]").first();
    await expand.click();
    await expect(expand).toHaveAttribute("data-map-expand", "collapse");
    // The expand costs two flights (see `cameraAtRest`, #148), so the zoom
    // the wheel is measured against is read once they have landed.
    await cameraAtRest(page);
    expect(
      await page.evaluate(() => window.__camera.map(0).scrollZoom.isEnabled()),
      "paused, the map has the wheel",
    ).toBe(true);

    const before = await mapZoom(page);
    const spot = await wheelSpot(page);
    expect(spot.height, "the expanded map really is on screen to wheel over").toBeGreaterThan(100);
    // Four ticks over the middle of the expanded map — the gesture maplibre
    // leaves untagged, which is why the component listens for the wheel
    // itself. The 700ms rest first makes them a new scroll (`wheelRun`).
    await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(700);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
    }
    await cameraAtRest(page);
    const zoomed = await mapZoom(page);
    expect(zoomed, `the wheel really zoomed the map (${before} -> ${zoomed})`).toBeGreaterThan(
      before + 0.1,
    );

    // Hands off the map and the band for TWICE the dwell the clock was
    // measured running at.
    await page.mouse.move(2, 2);
    const slide = await slideOnStage(band);
    await resetCamera(page);
    await page.waitForTimeout(2 * dwell);
    expect(await slideOnStage(band), "paused: the band did not turn").toBe(slide);
    const held = await cameraLog(page);
    expect(
      held.fly.length + held.ease.length + held.jump.length,
      `the camera was commanded with nobody touching anything, over ${2 * dwell}ms`,
    ).toBe(0);
    expect(await mapZoom(page), "and the visitor's zoom is exactly where they left it").toBeCloseTo(
      zoomed,
      3,
    );

    // PLAY: the map is the slideshow's picture again, framed its way, and the
    // clock's next turn is followed. Collapsed first: since M1 the expanded map
    // is a full-window overlay, and Play is under it.
    await expand.click();
    await expect(expand).toHaveAttribute("data-map-expand", "expand");
    await page.getByRole("button", { name: "Play slides" }).click();
    await page.mouse.move(2, 2);
    await expect
      .poll(async () => (await cameraLog(page)).fly.length, {
        message: "Play flew the camera back to the slide on screen",
      })
      .toBeGreaterThan(0);
    expect((await cameraLog(page)).fly[0]!.zoom, "at the frame's own zoom").toBe(12);
    await page.waitForTimeout(CAMERA_FLIGHT_MS + 200);
    await resetCamera(page);
    await nextTurn(band, 3 * dwell);
    await expect
      .poll(async () => (await cameraLog(page)).fly.length, {
        message: "the clock's next turn was followed",
      })
      .toBeGreaterThan(0);
  });

  // THE OVER-CORRECTION GUARD, KEPT. A rule that told an auto-advance apart
  // from a visitor and then never lifted for either would be the older defect
  // (one gesture killing the camera for the life of the page) in new clothes.
  // Paused, so there is no clock to race — the arrow press is the only thing
  // that can move the camera here.
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

    await page.getByRole("button", { name: "Pause slides" }).click();
    await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
    const expand = page.locator("[data-map-expand]").first();
    await expand.click();
    await expect(expand).toHaveAttribute("data-map-expand", "collapse");
    // AT REST, NOT AFTER 1200ms (#148). The expand is two flights — the frame
    // change, then the re-ask when the first lands — 1100ms of motion
    // unloaded, so the fixed wait this replaced had 100ms of margin, and a Van
    // Wijk arc read mid-flight is a zoom BELOW where it lands. (#148's "the
    // zoom went DOWN" was on 6cfeba8, where this case did not pause the band
    // and waited 600ms, so a clock turn's arc and the expand's own were both
    // candidates. It pauses first now — Play is asserted above — so only the
    // expand's is left, and this is the wait for it.)
    await cameraAtRest(page);
    const before = await mapZoom(page);
    const spot = await wheelSpot(page);
    await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(700);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
    }
    await cameraAtRest(page);
    const zoomed = await mapZoom(page);
    expect(zoomed, `the wheel really zoomed the map (${before} -> ${zoomed})`).toBeGreaterThan(
      before + 0.1,
    );

    // Collapsed first: the arrow is under the full-window overlay (M1).
    await expand.click();
    await expect(expand).toHaveAttribute("data-map-expand", "expand");
    await page.mouse.move(2, 2);
    await cameraAtRest(page);
    const held = await mapCentre(page);
    await resetCamera(page);
    await page.getByRole("button", { name: "Next slide" }).click();

    await expect
      .poll(async () => (await cameraMovesFor(page, 0)) > 0, {
        message: "the visitor asked for a different listing, so the camera follows again",
      })
      .toBe(true);
    await cameraAtRest(page);
    // WHAT PROVES IT FOLLOWED, since 2026-09-23: the camera arrives somewhere
    // ELSE at the SAME zoom — the visitor's zoom is carried to the next
    // listing (`chosenZoom`, PropertyMap.svelte), so a zoom that differed from
    // theirs is no longer the evidence.
    const moved = await mapCentre(page);
    expect(
      Math.hypot(moved.lng - held.lng, moved.lat - held.lat),
      `and it went somewhere else (${JSON.stringify(held)} -> ${JSON.stringify(moved)})`,
    ).toBeGreaterThan(0.01);
    expect(await mapZoom(page), "at the zoom the visitor chose, not the frame's").toBeCloseTo(
      zoomed,
      3,
    );
  });
});

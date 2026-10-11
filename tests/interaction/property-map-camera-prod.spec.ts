import { expect, test, type Page } from "@playwright/test";

import {
  adopted,
  cameraLog,
  cameraMovesFor,
  cameraProbeInstalled,
  mapZoom,
  resetCamera,
  watchCamera,
} from "./camera-probe";
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
// Its homepage block (MAJOR 2: the band's clock is not a visitor) went with
// the band's map on 2026-10-09 (Erik: "lose map entirely").
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
const MAP = "[data-property-map]";

/** MapLibre's own `load` has fired for the nth map on the page — scrolled just
 *  far enough to boot first, where it cannot at rest (./map-boot). */
async function drawn(page: Page, nth = 0) {
  await scrollMapToBoot(page.locator(MAP).nth(nth));
  await expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", {
    timeout: 45_000,
  });
}

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

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cameraLog,
  cameraProbeInstalled,
  mapCentre,
  resetCamera,
  watchCamera,
} from "./camera-probe";
import { hydrated } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";
import { travelOf } from "./scroll-travel";

// A PRESSED PIN SENDS THE CAMERA STRAIGHT THERE (MarkUp, 2026-10-01: "when I
// click on a point on the map, it bounces around before returning to the same
// point").
//
// The press smooth-scrolls its card to the centre line, and the centre rule
// reports every card that scroll crosses. Before this fix the camera took the
// FIRST crossed card as its destination, refused the rest while that arc was
// in the air, and then flew on to the pressed listing: pin X pressed, camera
// away to Y, then back to X. The claim here is about DESTINATIONS, not counts:
// every camera command between the press and the camera settling names the
// pressed listing's camera, and no other.
//
// MOTION ALLOWED, or this asserts nothing: under the fleet's `reduce` the
// press-scroll lands in one frame, no card is crossed, and main passes too.
const PROPERTIES = "/dev/properties";
const MAP = "[data-property-map]";
const NEW_BRAUNFELS = "ih-35-new-braunfels";
const CASTROVILLE = "hwy-90-castroville";

const land = (page: Page) => page.locator("section[aria-labelledby='listing-land']");

const onCentreLine = (section: Locator) =>
  section.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const box = li.getBoundingClientRect();
      if (box.top <= mid && box.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

/** Each listing's longitude, read off the fallback list's own Google Maps
 *  links (`query=lat,lng`) and paired with the card order, which is the order
 *  `sectionPoints` keeps. Only for NAMING a flight in a failure message: a
 *  one-listing camera on the full frame keeps the point's longitude exactly
 *  (left and right padding are equal), so the nearest one is that flight's
 *  listing. */
const listingLngs = (section: Locator) =>
  section.evaluate((el) => {
    const ids = [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map(
      (li) => li.dataset.centreId!,
    );
    const lngs = [...el.querySelectorAll<HTMLAnchorElement>("[data-map-link]")].map((a) =>
      Number(new URL(a.href).searchParams.get("query")!.split(",")[1]),
    );
    return ids.map((id, i) => ({ id, lng: lngs[i]! }));
  });

test.describe("a pressed pin, with the fleet's reduced-motion emulation lifted", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  for (const target of [NEW_BRAUNFELS, CASTROVILLE]) {
    test(`flies straight to ${target}, visiting no listing on the way`, async ({ page }) => {
      test.setTimeout(120_000);
      await watchCamera(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(PROPERTIES);
      await hydrated(page);
      await scrollMapToBoot(page.locator(MAP).first());
      await expect(page.locator(MAP).first()).toHaveAttribute("data-map-ready", "", {
        timeout: 25_000,
      });
      const section = land(page);

      expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
        "the document scrolls smoothly, so the press crosses cards",
      ).toBe("smooth");

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(900);
      expect(await onCentreLine(section), "nothing on the centre line at the top").toBeNull();
      const lngs = await listingLngs(section);
      await resetCamera(page);

      // A script click, as the other press specs do: at scrollY 0 the pin is
      // below the fold, and a pointer click would scroll it into view first —
      // which moves the centre line, and the map, before the press.
      const travel = await travelOf(
        page,
        () =>
          page.evaluate(
            (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
            target,
          ),
        { atLeast: 3000 },
      );
      // The premise: a long glide that crossed other cards on the way. Without
      // it "no other destination" is true because there was none to visit.
      expect(travel.distance, "the press really scrolled the page").toBeGreaterThan(500);
      expect(travel.between, "and it glided rather than jumping").toBeGreaterThan(0);
      expect(
        travel.crossed.filter((id) => id !== target).length,
        `the scroll crossed other cards (${travel.crossed.join(", ")})`,
      ).toBeGreaterThan(0);

      await page.waitForTimeout(1500);
      expect(await onCentreLine(section)).toBe(target);
      const settled = await mapCentre(page, 0);
      const log = await cameraLog(page);
      const commands = [...log.fly, ...log.ease, ...log.jump]
        .filter((c) => c.m === 0 && c.center)
        .sort((a, b) => a.t - b.t);
      const name = (lng: number) =>
        lngs.reduce((best, p) => (Math.abs(p.lng - lng) < Math.abs(best.lng - lng) ? p : best)).id;
      const sequence = commands.map((c) => `${Math.round(c.t)}ms ${name(c.center![0])}`);
      const said = `camera targets after the press: [${sequence.join(", ")}]`;

      // Positive evidence first: the camera did go, and it ended on the pressed
      // listing — a camera that never moved would pass the line below.
      expect(commands.length, `the camera followed the press (${said})`).toBeGreaterThan(0);
      expect(name(settled.lng), `and it settled on ${target} (${said})`).toBe(target);
      // THE CLAIM: every destination it was given is the pressed listing's.
      // (Longitudes to 4 places: `mapCentre` reads 5, and the listings here
      // are kilometres apart.)
      for (const c of commands)
        expect(
          c.center![0],
          `a camera target other than ${target} between the press and settling (${said})`,
        ).toBeCloseTo(settled.lng, 4);
    });
  }
});

// BELOW `lg` a press turns the section's carousel and no centre rule runs, so
// nothing will ever come round to agree with a hold: one taken there would fly
// to the listing and then, at PRESS_HOLD_MAX_MS (2000), back to MAP_HOME. The
// camera must not move at all — exactly as before the fix.
test.describe("a pressed pin below `lg`, with motion allowed", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("turns the carousel and leaves the camera where it is", async ({ page }) => {
    test.setTimeout(120_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await scrollMapToBoot(page.locator(MAP).first());
    await expect(page.locator(MAP).first()).toHaveAttribute("data-map-ready", "", {
      timeout: 25_000,
    });
    expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
    const section = land(page);
    await page.waitForTimeout(900);
    await resetCamera(page);

    // A pin whose card is not the one on stage, so the press has a turn to make.
    const pins = await section.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("[data-map-pin]")].map((p) => p.dataset.mapPin!),
    );
    const order = await section.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => li.dataset.centreId!),
    );
    const target = pins.find((id) => order.indexOf(id) > 0);
    expect(target, `a pin for a card off stage (pins ${pins.join(", ")})`).toBeTruthy();
    await page.evaluate(
      (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
      target!,
    );

    // Positive evidence the press was handled: its card is the one on stage.
    await expect(section.locator(`[data-centre-id="${target}"]`)).not.toHaveClass(/invisible/);
    // Past the hold's cap, so a hold taken here would have flown both ways.
    await page.waitForTimeout(2600);
    const log = await cameraLog(page);
    const moves = [...log.fly, ...log.ease, ...log.jump].filter((c) => c.m === 0);
    expect(moves, `the camera moved after a carousel press (${JSON.stringify(moves)})`).toEqual([]);
  });
});

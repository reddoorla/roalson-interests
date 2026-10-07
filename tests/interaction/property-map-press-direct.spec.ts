import { expect, test, type Page } from "@playwright/test";

import { cameraLog, cameraProbeInstalled, resetCamera, watchCamera } from "./camera-probe";
import { hydrated } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";

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

const land = (page: Page) => page.locator("section[aria-labelledby='listing-land']");

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

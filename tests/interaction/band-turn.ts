import { expect, type Locator, type Page } from "@playwright/test";

// WAITING ON THE HOMEPAGE BAND'S CLOCK BY WHAT IT DOES, NEVER BY HOW LONG IT
// IS SUPPOSED TO TAKE.
//
// The band's dwell is 4000ms on main and 8000ms on the branch that doubles it
// (operator call, 2026-09-23), and specs on both sides of that merge wait on
// it. A wait sized for one dwell is wrong on the other in the worst direction:
// sized for 4000 and run at 8000, "nothing turned inside the window" is true
// because nothing TRIED to turn, and a test of "the clock left the visitor's
// view alone" passes having tested nothing. So a test that needs a turn waits
// for the slide on stage to change and FAILS if it does not; a test that needs
// "longer than a dwell" measures the dwell off two real turns first and waits
// a multiple of THAT.

/** Which slide of the band is on stage (the one without `aria-hidden`). */
export const slideOnStage = (band: Locator) =>
  band
    .locator("[data-carousel-slide]")
    .evaluateAll((els) => els.findIndex((el) => !el.hasAttribute("aria-hidden")));

/** Wait for the band to turn away from the slide on stage now, and return the
 *  wall time it was seen to. Fails after `timeout` if it never does — which is
 *  what a stopped clock, a clock with no autoplay and a dwell longer than the
 *  test believed all look like, and why none of them may read as a pass. */
export async function nextTurn(band: Locator, timeout = 30_000) {
  const from = await slideOnStage(band);
  await expect
    .poll(() => slideOnStage(band), {
      timeout,
      intervals: [50],
      message: `the band turned on its own from slide ${from}`,
    })
    .not.toBe(from);
  return Date.now();
}

/** The band's period — dwell plus hand-over — measured as the time between
 *  two consecutive turns it made on its own. The pointer is parked off the
 *  band first, where no hover can hold the clock. */
export async function measureDwell(page: Page, band: Locator) {
  await page.mouse.move(2, 2);
  await nextTurn(band);
  const from = Date.now();
  await nextTurn(band);
  const period = Date.now() - from;
  expect(period, "premise: the band turns on its own, at some real period").toBeGreaterThan(1000);
  return period;
}

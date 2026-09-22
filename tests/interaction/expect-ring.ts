import { expect, type Locator, type Page } from "@playwright/test";

import { HYDRATION_TIMEOUT } from "./hydrated";

// How every spec reads the keyboard-focus ring. It lives here, and not in
// focus-ring.spec.ts where it was written, because Playwright will not let one
// spec import another — and a second copy is how the read got flaky the first
// time: each half below was a failure on its own, found separately.

export const OFF_WHITE = "rgb(242, 239, 233)";
export const GARNET = "rgb(101, 35, 35)";

/** Focus as a keyboard user does and require the ring, in this colour.
 *
 *  One real Tab puts the page in keyboard modality, after which a scripted
 *  focus matches :focus-visible. Focus, the :focus-visible check and the read
 *  are ONE synchronous block, and the whole block is polled. Both halves are
 *  there because each was a failure on its own:
 *
 *   - Checked and read in two round trips, the menu test failed about one run
 *     in three with the link's own sand text colour: the focus trap moved
 *     focus between the calls, and the second measured an unfocused element
 *     (whose outline colour computes to `currentcolor`).
 *   - Read in the same task as the focus, EVERY run failed with the control's
 *     text colour: Tailwind's `transition-colors` lists `outline-color`, so at
 *     the instant of focus the ring is still leaving `currentcolor`.
 *
 *  So: `showing` must be true in the same read that reports the colour, and
 *  the read repeats until the transition has landed. An outline colour on an
 *  element whose ring is not showing is a number about nothing.
 *
 *  THE TIMEOUT IS `hydrated.ts`'s AND NOT PLAYWRIGHT'S 5s, for that file's own
 *  reason: every run starts its own dev server, so a page's client graph is
 *  transformed on first request, and /dev/properties' grew when the property
 *  map landed on it (#13). Measured: this poll timed out under `pnpm verify`'s
 *  parallel load, and the same spec passed 3/3 in 19–35s run on its own. A
 *  poll returns the moment it matches, so a generous ceiling costs a green run
 *  nothing and is the difference between a false red and none. */
export async function expectRing(page: Page, target: Locator, color: string) {
  await page.keyboard.press("Tab");
  await expect
    .poll(
      () =>
        target.evaluate((el) => {
          (el as HTMLElement).focus();
          const cs = getComputedStyle(el);
          return {
            showing: el.matches(":focus-visible"),
            color: cs.outlineColor,
            width: cs.outlineWidth,
            style: cs.outlineStyle,
          };
        }),
      { timeout: HYDRATION_TIMEOUT },
    )
    .toEqual({ showing: true, color, width: "2px", style: "solid" });
}

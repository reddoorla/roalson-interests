import { expect, type Locator, type Page } from "@playwright/test";

// How every spec waits for script to have taken the page over. It lives here,
// beside expect-ring.ts, because Playwright will not let one spec import
// another — and because it was nine private copies with a shared defect.
//
// WHAT IT WAITS FOR. The bar is `absolute` in the server's markup over a dark
// first band and `fixed` only after mount (Nav.svelte), so `position: fixed` is
// an artifact only a working script produces. That is the evidence; nothing
// here may weaken to "no error appeared".
//
// WHY THE TIMEOUT IS NOT PLAYWRIGHT'S 5s. Every run starts its OWN dev server
// (`reuseExistingServer: false`), so the first test that needs script pays for
// the whole client graph being transformed. Measured on this machine while
// agents were building in sibling worktrees: 5.0s, then a FAILURE at 5s (13
// polls, all `absolute`), then 6.6s. It cost three false reds in one session's
// `pnpm verify` — a different spec each time, and the first was read as a local
// condition rather than a shared defect. CI hides it with `retries: 2`; a
// laptop's `retries: 0` does not. The wait is a cold compile, not the site's
// speed, so making it generous costs a green run nothing: `toHaveCSS` polls and
// returns the moment the bar is pinned.

/** Playwright's default is 5s; a cold dev server's first transform is 5–7s. */
export const HYDRATION_TIMEOUT = 20_000;

const BAR = 'nav[aria-label="Primary"]';

/** Script has adopted the page: the bar is pinned, which only mount does. */
export const hydrated = (page: Page) =>
  expect(page.locator(BAR)).toHaveCSS("position", "fixed", { timeout: HYDRATION_TIMEOUT });

/** Script has adopted one carousel: `data-carousel-ready`, set by an effect. */
export const carouselHydrated = (region: Locator) =>
  expect(region).toHaveAttribute("data-carousel-ready", "", { timeout: HYDRATION_TIMEOUT });

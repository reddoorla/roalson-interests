import { test, expect, devices, type Browser, type Page } from "@playwright/test";

// A phone held sideways must not be locked out of the site (WCAG 2.1 SC 1.3.4,
// Orientation). The template used to mount `LandscapeModal` from the root
// layout, which paints an opaque black `aria-modal="true"` overlay — no close
// button, no Escape, nothing reachable behind it — on ANY coarse-pointer device
// in landscape under 1024px. No gate viewport was landscape-shaped, so nothing
// ever exercised it (reddoor-starter#121, beachfront-dentistry e8b5fe6).
//
// Two earlier cuts of this spec are why it measures so much. The first counted
// the overlay immediately after `goto` and passed green with the lockout still
// mounted — the count was taken before hydration, so it could never fail. The
// second clicked a control to prove hydration, and failed in BOTH orientations,
// including the portrait control where no overlay exists: a single click issued
// against not-yet-hydrated markup does nothing and is never retried. So:
//
//   - the two media queries LandscapeModal reads are read back from the page,
//     so "no overlay" can never mean "the device was never emulated";
//   - the overlay is WAITED FOR rather than counted, so the verdict cannot be
//     taken before hydration has had its say;
//   - operability is probed with a retrying click, which is the positive half —
//     a landscape phone can actually work the page, not merely lack an overlay.
const FIXTURES = "/dev/a11y-fixtures";
const MODAL = '[role="dialog"][aria-modal="true"]';
const OVERLAY_GRACE_MS = 8000;

/** Retrying click: a single click can land on markup that has not hydrated yet,
 *  where it does nothing at all. Re-issued until the Svelte-state accordion
 *  actually opens, which only happens once the client bundle is live. */
async function isOperable(page: Page) {
  const trigger = page.getByRole("button", { name: "What is this page?" });
  await expect(async () => {
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass({ timeout: 20000 });
  return true;
}

async function measure(browser: Browser, device: (typeof devices)[string]) {
  const context = await browser.newContext({ ...device });
  try {
    const page = await context.newPage();
    await page.goto(FIXTURES, { waitUntil: "domcontentloaded" });

    const media = await page.evaluate(() => ({
      coarse: window.matchMedia("(pointer: coarse)").matches,
      narrowLandscape: window.matchMedia("(orientation: landscape) and (max-width: 1023px)")
        .matches,
    }));

    const overlayAppeared = await page
      .locator(MODAL)
      .waitFor({ state: "attached", timeout: OVERLAY_GRACE_MS })
      .then(() => true)
      .catch(() => false);

    // Not probed when an overlay is up: it covers the viewport, so the click
    // would be measuring the overlay, and the overlay IS the failure.
    const operable = overlayAppeared ? false : await isOperable(page);

    return { ...media, overlayAppeared, operable };
  } finally {
    await context.close();
  }
}

test("a phone in landscape is not locked out by a modal overlay", async ({ browser }) => {
  const m = await measure(browser, devices["iPhone 13 landscape"]);
  // Preconditions: the device really is the one the lockout targeted.
  expect({ coarse: m.coarse, narrowLandscape: m.narrowLandscape }).toEqual({
    coarse: true,
    narrowLandscape: true,
  });
  expect(m.overlayAppeared, "a modal overlay appeared on a phone in landscape").toBe(false);
  expect(m.operable, "the page could not be operated on a phone in landscape").toBe(true);
});

// Control: the same page and the same assertions on a device the lockout never
// targeted. It passes with the lockout still mounted, which is what makes the
// landscape result above evidence rather than an untested assertion.
test("a phone in portrait shows no modal overlay either (control)", async ({ browser }) => {
  const m = await measure(browser, devices["iPhone 13"]);
  expect({ coarse: m.coarse, narrowLandscape: m.narrowLandscape }).toEqual({
    coarse: true,
    narrowLandscape: false,
  });
  expect(m.overlayAppeared).toBe(false);
  expect(m.operable).toBe(true);
});

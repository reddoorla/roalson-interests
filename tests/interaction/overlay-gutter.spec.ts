import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

import { forceStyle } from "./force-style";
import { gutter, measuresGutter } from "./gutter";
import { hydrated } from "./hydrated";

// THE FULL-WINDOW OVERLAYS COVER THE SCROLLBAR STRIP (#172).
//
// app.css keeps `scrollbar-gutter: stable` on html, so on a classic-scrollbar
// system the strip stays reserved under `lockBodyScroll`, and NOTHING paints
// into it: measured in Chromium 151 at 390 wide, a fixed overlay at `inset: 0`
// (box 375), at `width: 100vw` (box 390, paint still 375) and at `right:
// -15px`, and a <dialog>'s ::backdrop, all left the strip showing the canvas.
// The lock now releases the strip while it holds, pays it back to the page as
// body padding, and to the nav's bars as `--scroll-lock-gutter`.
//
// THE INSTRUMENT. The canvas is forced to a sentinel green no page paints, and
// the strip is read off a screenshot. Before the overlay opens the strip must
// BE the sentinel — the proof there is a strip and that this reads it — and
// with the overlay open it must hold none. A machine with overlay scrollbars
// has no strip, so the case skips there rather than pass on nothing.

measuresGutter();

const SENTINEL = [0, 255, 0];

/** The share of the right-hand strip, `gutter()` wide and the window tall,
 *  that is the sentinel canvas. */
async function sentinelShare(page: Page) {
  const { width, height } = page.viewportSize()!;
  const g = gutter();
  const shot = await page.screenshot({ clip: { x: width - g, y: 0, width: g, height } });
  const { data, info } = await sharp(shot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hits = 0;
  for (let i = 0; i < data.length; i += info.channels)
    if (SENTINEL.every((c, k) => Math.abs(data[i + k]! - c) <= 2)) hits++;
  return hits / (info.width * info.height);
}

/** Force the sentinel canvas, and check the instrument reads it in the strip. */
async function sentinelInStrip(page: Page) {
  test.skip(gutter() === 0, "overlay scrollbars: there is no strip to cover");
  await forceStyle(
    page,
    [["html", "background-color", "rgb(0, 255, 0)"]],
    "the canvas wears the sentinel",
  );
  expect(await sentinelShare(page), "closed, the strip is the canvas").toBeGreaterThan(0.99);
}

/** Open, the overlay's box is the window and the strip holds no canvas. Soft
 *  on the box, so a red run reports the pixels too. */
async function expectCovered(page: Page, overlay: Locator | null, what: string) {
  if (overlay) {
    const box = await overlay.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, window: window.innerWidth };
    });
    expect.soft(box.left, `${what}: from the window's left edge`).toBe(0);
    expect.soft(box.right, `${what}: to its right edge, strip included`).toBe(box.window);
  }
  await expect
    .poll(() => sentinelShare(page), { message: `${what}: none of the strip shows the canvas` })
    .toBe(0);
}

/** The page behind holds still: a landmark's left edge, before and after. */
const leftOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().left);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`${viewport.width}: the nav menu covers the strip, and the page and bar hold still`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      await page.goto("/dev/properties");
      await hydrated(page);
      await sentinelInStrip(page);
      const trigger = page.getByLabel("Open menu");
      const was = { trigger: await trigger.boundingBox(), main: await leftOf(page, "main h1") };
      await trigger.click();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu).toBeVisible();
      await expectCovered(page, menu, "the menu");
      expect(await leftOf(page, "main h1"), "the page behind did not move").toBe(was.main);
      expect(
        await page.getByLabel("Close menu").boundingBox(),
        "Close is where the trigger was",
      ).toEqual(was.trigger);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      expect(await sentinelShare(page), "closed again, the strip is back").toBeGreaterThan(0.99);
    } finally {
      await context.close();
    }
  });

  test(`${viewport.width}: the expanded map covers the strip`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      await page.goto("/dev/properties");
      await hydrated(page);
      const map = page.locator("[data-property-map]").first();
      await map.scrollIntoViewIfNeeded();
      await sentinelInStrip(page);
      const was = await leftOf(page, "article");
      await map.locator("[data-map-expand]").click();
      await expect(map).toHaveAttribute("data-expanded", "true");
      await expectCovered(page, map, "the expanded map");
      expect(await leftOf(page, "article"), "the page behind did not move").toBe(was);
      await page.keyboard.press("Escape");
      await expect(map).not.toHaveAttribute("data-expanded", "true");
      expect(await sentinelShare(page), "collapsed, the strip is back").toBeGreaterThan(0.99);
    } finally {
      await context.close();
    }
  });
}

test("1440: the Modal's backdrop covers the strip", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await page.goto("/dev/a11y-fixtures");
    await hydrated(page);
    await sentinelInStrip(page);
    const heading = "#modal-heading";
    const was = await leftOf(page, heading);
    // The bar shows through the backdrop, so its right-hand trigger must not
    // step into the released strip either.
    const trigger = await page.getByLabel("Open menu").boundingBox();
    // This page's bar is server-pinned, so `hydrated` passes before the
    // fixture's handlers exist: press until the dialog really opens.
    await expect(async () => {
      await page.getByRole("button", { name: "Open modal" }).click({ timeout: 2_000 });
      await expect(page.locator("dialog[open]")).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    // The ::backdrop has no box to read; the pixels are the evidence.
    await expectCovered(page, null, "the backdrop");
    expect(await leftOf(page, heading), "the page behind did not move").toBe(was);
    expect(await page.getByLabel("Open menu").boundingBox(), "nor did the bar").toEqual(trigger);
  } finally {
    await context.close();
  }
});

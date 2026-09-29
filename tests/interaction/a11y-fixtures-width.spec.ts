import { expect, test, type Page } from "@playwright/test";
import { measuresGutter, viewportFor } from "./gutter";

// #87. /dev/a11y-fixtures drew every band inside one `max-w-3xl` column, so a
// band measured there was a band at a width the site never draws (the
// featured card 425.89 at 1440, against 927 on `/`), and two `w-screen`
// primitives, 100vw wide from a column starting at x=336, scrolled the page
// 368px sideways. The full-bleed bands now sit outside that column. The
// launch featured band stays narrow ON PURPOSE: featured-properties.spec.ts
// holds its container query to a card under 640.
measuresGutter();

const PAGE = "/dev/a11y-fixtures";

/** How far the page really scrolls sideways: asked to go 10000px right, where
 *  does it land? `scrollWidth - clientWidth` alone reads 0 on this site with
 *  15px of travel left (clientWidth counts the gutter; see gutter.ts). */
const sideways = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(10_000, window.scrollY);
    const travel = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return {
      travel,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.getBoundingClientRect().width,
    };
  });

for (const width of [1440, 390] as const) {
  test(`at ${width} the fixtures page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize(viewportFor(width));
    await page.goto(PAGE);
    // The widest things on the page have laid out: the banner's poster box.
    await expect(page.locator("[data-vimeo-banner-controls]")).toHaveCount(1);
    expect(await sideways(page)).toEqual({ travel: 0, overflow: 0 });
  });
}

test("the homepage bands are drawn at the site's width — all but the launch band", async ({
  page,
}) => {
  await page.setViewportSize(viewportFor(1440));
  await page.goto(PAGE);
  const widths = await page.evaluate(() => {
    const w = (el: Element | null) => el?.getBoundingClientRect().width ?? -1;
    const cards = [...document.querySelectorAll("[data-featured-card]")];
    return {
      layout: document.documentElement.getBoundingClientRect().width,
      hero: w(document.querySelector('[data-slice-type="home_hero"]')),
      partners: w(document.querySelector('[data-slice-type="partners"]')),
      photo: w(document.querySelector('[data-slice-type="photo_band"]')),
      featured: cards.map(w),
    };
  });
  expect(widths.layout).toBe(1440);
  expect(widths.hero, "hero").toBe(1440);
  expect(widths.partners, "partners").toBe(1440);
  expect(widths.photo, "photo band").toBe(1440);
  expect(widths.featured.length).toBe(2);
  // `/`'s card at 1440 (featured-properties.spec.ts measures the same 927).
  expect(widths.featured[0], "three-listing card").toBeCloseTo(927, 0);
  expect(widths.featured[1], "launch card, narrow on purpose").toBeLessThan(640);
});

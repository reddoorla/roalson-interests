import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";

// #17. The property fixtures' photo was a 1x1 data: GIF, and PrismicImage's
// srcset appends `?width=` to it, which a data: URI cannot take: every load
// logged ERR_INVALID_URL and every card drew its alt text. A page now points
// the fixture at a drawn JPEG on its own origin (withFixturePhoto).
//
// A clean console alone would pass a page that drew no photo at all, so each
// case first requires a photo that DECODED from that file, then an empty
// console once every image on the page has settled.
for (const path of ["/dev/properties", "/dev/property?photo"]) {
  test(`${path} decodes its fixture photo and logs no console error`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(path);
    await hydrated(page);

    const photo = page.locator('img[srcset*="/dev/fixture-listing.jpg"]').first();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0)))
      .toBeGreaterThan(0);

    // Every image scrolled into view and settled, lazy ones included.
    await page.evaluate(async () => {
      for (const img of document.images) {
        img.scrollIntoView();
        await img.decode().catch(() => {});
      }
    });
    expect(errors).toEqual([]);
  });
}

// #184. /dev/a11y-fixtures had its OWN 1x1 data: GIF, and one SVG data: URI a
// PrismicImage appended `?width=` to: 2 ERR_INVALID_URL in the console at 1440
// (3 when filed) and 9 images that never decoded. Every media fixture there is
// now the same drawn JPEG on the page's origin. The positive half is every
// <img> on the page decoded — a page that drew none would pass an empty
// console — and enough of them from that file that the walk measured the
// fixtures it was written for.
test("/dev/a11y-fixtures decodes every image it draws and logs no console error", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/dev/a11y-fixtures");
  await hydrated(page);

  const images = await page.evaluate(async () => {
    for (const img of document.images) {
      img.scrollIntoView();
      await img.decode().catch(() => {});
    }
    return [...document.images].map((img) => ({
      src: (img.currentSrc || img.src).slice(0, 80),
      decoded: img.complete && img.naturalWidth > 0,
    }));
  });
  expect(
    images.filter((img) => !img.decoded).map((img) => img.src),
    "images that never decoded",
  ).toEqual([]);
  expect(
    images.filter((img) => img.src.includes("/dev/fixture-listing.jpg")).length,
    "the hero, media, testimonial, profile and listing fixtures all draw the photo",
  ).toBeGreaterThanOrEqual(15);
  expect(errors).toEqual([]);
});

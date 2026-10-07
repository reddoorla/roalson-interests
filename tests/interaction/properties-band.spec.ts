import { expect, test } from "@playwright/test";

import { hydrated } from "./hydrated";

const ROUTE = "/dev/properties";

const measure = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const band = document.querySelector("main > [data-pinned-band]");
    const footer = document.querySelector("footer")!.getBoundingClientRect();
    const r = band?.getBoundingClientRect();
    return { band: r ? { top: r.top, height: r.height } : null, footerTop: footer.top };
  });

const toEnd = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }),
  );

test.describe("motion allowed, where the band pins", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`${width}x${height}: the band above the footer is half the window tall and the footer slides over it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(ROUTE);
      await hydrated(page);
      const before = await measure(page);
      expect(before.band, "the band is drawn").not.toBeNull();
      expect(before.band!.height).toBeCloseTo(Math.max(240, height / 2), 0);
      await expect
        .poll(
          () => page.evaluate(() => getComputedStyle(document.querySelector("footer")!).marginTop),
          { message: "control: with a band the footer is laid back over its spacer" },
        )
        .not.toBe("0px");
      await toEnd(page);
      await expect
        .poll(async () => {
          const end = await measure(page);
          return end.band!.top <= 0.5 && end.footerTop < end.band!.top + end.band!.height;
        })
        .toBe(true);
    });
  }

  test("with no band photo the page ends on the listing and the footer is not pulled up", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${ROUTE}?noband`);
    await hydrated(page);
    const at = await measure(page);
    expect(at.band).toBeNull();
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector("footer")!).marginTop),
    ).toBe("0px");
  });
});

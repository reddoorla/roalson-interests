import { expect, test } from "@playwright/test";

import { hydrated, HYDRATION_TIMEOUT } from "./hydrated";

const label = (page: import("@playwright/test").Page) =>
  page
    .locator("section[aria-labelledby^='listing-']")
    .first()
    .locator('[aria-roledescription="slide"]:not([aria-hidden])')
    .getAttribute("aria-label");

for (const [width, height] of [
  [1440, 900],
  [390, 844],
] as const) {
  test(`${width}: Back from another page returns each panel to the listing it was on`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/dev/properties");
    await hydrated(page);
    const land = page.locator("section[aria-labelledby^='listing-']").first();
    await expect(
      land.locator('[aria-roledescription="carousel"][data-carousel-ready]'),
    ).toBeAttached({
      timeout: HYDRATION_TIMEOUT,
    });
    const next = land.getByRole("button", { name: "Next slide" });
    await next.click();
    await next.click();
    await expect.poll(() => label(page)).toMatch(/^3 of /);

    await page.locator('a[href="/contact"]:visible').first().click();
    await expect(page).toHaveURL(/\/contact$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/dev\/properties$/);
    await expect.poll(() => label(page)).toMatch(/^3 of /);
  });
}

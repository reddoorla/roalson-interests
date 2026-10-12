import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";

test("the open menu carries no MENU eyebrow, and its links stay on the listing column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/properties");
  await hydrated(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(menu.locator("p")).toHaveCount(0);
  await expect(menu).not.toContainText(/^\s*menu\s*$/im);
  const linkLeft = await menu
    .locator("ul a")
    .first()
    .evaluate((el) => el.getBoundingClientRect().left);
  const footerLeft = await page
    .locator("footer h2")
    .evaluate((el) => el.getBoundingClientRect().left);
  expect(Math.abs(linkLeft - footerLeft)).toBeLessThan(1.5);
});

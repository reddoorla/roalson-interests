import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";

for (const from of ["/", "/properties"]) {
  test(`ABOUT US from the menu on ${from} lands focus on the about band, not on the menu button`, async ({
    page,
  }) => {
    await page.goto(from);
    await hydrated(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    const about = page
      .getByRole("dialog", { name: "Menu" })
      .getByRole("link", { name: "About Us" });
    await about.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/#about$/);
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id), { timeout: 5000 })
      .toBe("about");
  });
}

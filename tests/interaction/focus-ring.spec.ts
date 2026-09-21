import { expect, test, type Locator, type Page } from "@playwright/test";

// The keyboard-focus ring is drawn OUTSIDE its element, so what it has to be
// legible against is the container's ground. It was garnet on every ground —
// 1:1 on the garnet card and the nav overlay. src/app.css now has each ground
// set `--focus-ring` for its children; jsdom resolves no stylesheets, so the
// cascade can only be checked here.
const FIXTURE = "/dev/properties";
const OFF_WHITE = "rgb(242, 239, 233)";
const GARNET = "rgb(101, 35, 35)";
const bar = 'nav[aria-label="Primary"]';

/** Focus as a keyboard user does. One real Tab puts the page in keyboard
 *  modality, after which a scripted focus matches :focus-visible — and the
 *  test REQUIRES that it does, because without the ring showing, an outline
 *  colour is a number about nothing. */
async function ring(page: Page, target: Locator) {
  await page.keyboard.press("Tab");
  await target.focus();
  expect(await target.evaluate((el) => el.matches(":focus-visible")), "the ring is showing").toBe(
    true,
  );
  return target.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle };
  });
}

test("the ring is off-white on dark grounds and garnet on light ones", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FIXTURE);
  await expect(page.locator(bar)).toHaveCSS("position", "fixed");

  // The floating bar has no ground of its own: it borrows the masthead's.
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  expect(await ring(page, page.getByLabel("Open menu"))).toEqual({
    color: OFF_WHITE,
    width: "2px",
    style: "solid",
  });

  // The garnet card: its LEARN MORE sits on bg-primary…
  const cards = page.locator("main article");
  expect((await ring(page, cards.nth(0).getByRole("link"))).color).toBe(OFF_WHITE);
  // …and the sand card beside it, inside the same section, gets garnet back.
  expect((await ring(page, cards.nth(1).getByRole("link"))).color).toBe(GARNET);

  // Once the bar has taken its off-white ground, so has its ring.
  await page.mouse.wheel(0, 600);
  await expect(page.locator(bar)).not.toHaveAttribute("data-floating", "");
  expect((await ring(page, page.getByLabel("Open menu"))).color).toBe(GARNET);
});

test("the ring is off-white inside the menu, which is a gradient with no bg-* at all", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FIXTURE);
  await expect(page.locator(bar)).toHaveCSS("position", "fixed");
  await page.getByLabel("Open menu").click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  expect((await ring(page, page.getByLabel("Close menu"))).color).toBe(OFF_WHITE);
  expect((await ring(page, menu.locator("ul a").first())).color).toBe(OFF_WHITE);
});

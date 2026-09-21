import { expect, test } from "@playwright/test";
import { expectRing, GARNET, OFF_WHITE } from "./expect-ring";

// The keyboard-focus ring is drawn OUTSIDE its element, so what it has to be
// legible against is the container's ground. It was garnet on every ground —
// 1:1 on the garnet card and the nav overlay. src/app.css now has each ground
// set `--focus-ring` for its children; jsdom resolves no stylesheets, so the
// cascade can only be checked here.
const FIXTURE = "/dev/properties";
const bar = 'nav[aria-label="Primary"]';

test("the ring is off-white on dark grounds and garnet on light ones", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(FIXTURE);
  await expect(page.locator(bar)).toHaveCSS("position", "fixed");

  // The floating bar has no ground of its own: it borrows the masthead's.
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
  await expectRing(page, page.getByLabel("Open menu"), OFF_WHITE);

  // The garnet card: its LEARN MORE sits on bg-primary…
  const cards = page.locator("main article");
  await expectRing(page, cards.nth(0).getByRole("link"), OFF_WHITE);
  // …and the sand card beside it, inside the same section, gets garnet back.
  await expectRing(page, cards.nth(1).getByRole("link"), GARNET);

  // Once the bar has taken its off-white ground, so has its ring.
  await page.mouse.wheel(0, 600);
  await expect(page.locator(bar)).not.toHaveAttribute("data-floating", "");
  await expectRing(page, page.getByLabel("Open menu"), GARNET);
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
  await expectRing(page, page.getByLabel("Close menu"), OFF_WHITE);
  await expectRing(page, menu.locator("ul a").first(), OFF_WHITE);
});

test("the homepage's hero buttons sit on the garnet band, and their ring is off-white", async ({
  page,
}) => {
  // The review of the hero batch caught this at its pre-rebase head: two CTAs on
  // a `from-primary` gradient with a garnet ring, 1:1. The ground rule fixes it
  // without the slice knowing — this holds that.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/home");
  await expect(page.locator(bar)).toHaveCSS("position", "fixed");
  const cta = page.locator("main h1 ~ * a, main h1 + * a").first();
  await expect(cta).toBeVisible();
  await expectRing(page, cta, OFF_WHITE);
});

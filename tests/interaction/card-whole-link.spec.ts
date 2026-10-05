import { expect, test, type Page } from "@playwright/test";
import { hydrated } from "./hydrated";

const LISTING = "/dev/properties";

async function pressCardBody(page: Page) {
  const card = page
    .locator("article:has([data-card-link])")
    .filter({ has: page.locator("li") })
    .first();
  const link = card.locator("[data-card-link]");
  const href = await link.getAttribute("href");
  await card.locator("ul:not([aria-label]) > li").first().click({ force: true });
  return href!;
}

test(
  "pressing a listing card anywhere, not only its button, opens the listing",
  { tag: "@smoke" },
  async ({ page }) => {
    await page.goto(LISTING);
    await hydrated(page);
    const href = await pressCardBody(page);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  },
);

test.describe("with scripting off", () => {
  test.use({ javaScriptEnabled: false });
  test("the whole card is still the link", { tag: "@smoke" }, async ({ page }) => {
    await page.goto(LISTING);
    const href = await pressCardBody(page);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});

test("a keyboard-focused card shows its ring around the whole card, in the card's ring colour", async ({
  page,
}) => {
  await page.goto(LISTING);
  await hydrated(page);
  await page.keyboard.press("Tab");
  const link = page.locator("article [data-card-link]").first();
  await link.focus();
  const ring = await link.evaluate((a) => {
    const after = getComputedStyle(a, "::after");
    const article = a.closest("article")!.getBoundingClientRect();
    return {
      style: after.outlineStyle,
      width: after.outlineWidth,
      color: after.outlineColor,
      expected: getComputedStyle(a).getPropertyValue("--focus-ring").trim(),
      inset: after.position === "absolute" && article.width > 0,
    };
  });
  expect(ring.style).toBe("solid");
  expect(ring.width).not.toBe("0px");
  expect(ring.inset).toBe(true);
  const probe = await page.evaluate((c) => {
    const el = document.createElement("i");
    el.style.color = c;
    document.body.append(el);
    const v = getComputedStyle(el).color;
    el.remove();
    return v;
  }, ring.expected);
  expect(ring.color).toBe(probe);
});

test.describe("at 390, in the carousel", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("a swipe across the card turns the carousel and opens nothing", async ({ page }) => {
    await page.goto(LISTING);
    await hydrated(page);
    const carousel = page.locator('[aria-roledescription="carousel"][data-carousel-ready]').first();
    await carousel.scrollIntoViewIfNeeded();
    const before = await carousel.locator("li:not(.invisible) [data-card-link]").textContent();
    const card = carousel.locator("li:not(.invisible) article");
    const box = (await card.boundingBox())!;
    const y = box.y + box.height * 0.75;
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, y, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(new RegExp(`${LISTING}$`));
    const after = await carousel.locator("li:not(.invisible) [data-card-link]").textContent();
    expect(after).not.toBe(before);
  });
});

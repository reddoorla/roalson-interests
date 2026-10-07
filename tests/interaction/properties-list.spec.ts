import { expect, test, type Locator, type Page } from "@playwright/test";

import { hydrated, HYDRATION_TIMEOUT } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";

const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const ROUTE = PREVIEW ? "/properties" : "/dev/properties";
const WIDE = { width: 1440, height: 900 };

const activeSections = (page: Page) => page.locator("section[data-view-section]");

async function everyCardShown(section: Locator) {
  await expect(section.getByRole("button", { name: "Next slide" })).toHaveCount(0);
  const cards = section.locator("[data-centre-id]");
  const count = await cards.count();
  expect(count, "premise: the section has more than one listing").toBeGreaterThan(1);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card.getByRole("link").first()).toBeVisible();
  }
}

test.describe("the List tab", { tag: "@smoke" }, () => {
  test("hydrated: every listing of every active section is on the page, with no carousel", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto(`${ROUTE}#list`);
    await hydrated(page);
    await expect(page.locator('[data-view-tab="list"]')).toHaveAttribute("aria-current", "true");
    expect(await activeSections(page).count()).toBeGreaterThan(0);
    for (const section of await activeSections(page).all()) await everyCardShown(section);
  });

  test("a press on List from All turns the panel into the list, and All turns it back", async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await page.goto(ROUTE);
    await hydrated(page);
    const land = activeSections(page).first();
    await expect(land.getByRole("button", { name: "Next slide" })).toBeVisible();
    await page.locator('[data-view-tab="list"]').click();
    await expect(page).toHaveURL(/#list$/);
    await everyCardShown(land);
    await page.locator('[data-view-tab="all"]').click();
    await expect(land.getByRole("button", { name: "Next slide" })).toBeVisible();
  });

  test("on a phone the list is stacked too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ROUTE}#list`);
    await hydrated(page);
    for (const section of await activeSections(page).all()) await everyCardShown(section);
  });
});

const garnetCard = (section: Locator) =>
  section.evaluate(
    (el) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].find((li) =>
        li.querySelector("article.bg-primary"),
      )?.dataset.centreId ?? null,
  );

const centreCard = (section: Locator) =>
  section.evaluate((el) => {
    const middle = innerHeight / 2;
    return (
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].find((li) => {
        const r = li.getBoundingClientRect();
        return r.top <= middle && r.bottom >= middle;
      })?.dataset.centreId ?? null
    );
  });

async function listLand(page: Page) {
  await page.setViewportSize(WIDE);
  await page.goto(`${ROUTE}#list`);
  await hydrated(page);
  const section = activeSections(page).first();
  await scrollMapToBoot(section.locator("[data-property-map]"));
  await expect(section.locator("[data-map-pin]").first()).toBeAttached({
    timeout: HYDRATION_TIMEOUT,
  });
  return section;
}

test("from lg the card on the middle of the window is garnet and its pin is active", async ({
  page,
}) => {
  const section = await listLand(page);
  const cards = section.locator("[data-centre-id]");
  const last = cards.last();
  const id = await last.getAttribute("data-centre-id");
  await last.evaluate((li) => li.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(() => centreCard(section)).toBe(id);
  await expect.poll(() => garnetCard(section)).toBe(id);
  await expect(section.locator(`[data-map-pin="${id}"]`)).toHaveAttribute("data-map-active", "");
});

test("from lg the camera follows the card on the middle of the window", async ({ page }) => {
  const section = await listLand(page);
  const last = section.locator("[data-centre-id]").last();
  const id = await last.getAttribute("data-centre-id");
  const offCentre = () =>
    section.evaluate((el, pinId) => {
      const map = el.querySelector("[data-property-map]")!.getBoundingClientRect();
      const pin = el.querySelector(`[data-map-pin="${pinId}"] svg`)?.getBoundingClientRect();
      if (!pin) return Infinity;
      const dx = (pin.left + pin.width / 2 - (map.left + map.width / 2)) / map.width;
      const dy = (pin.top + pin.height / 2 - (map.top + map.height / 2)) / map.height;
      return Math.hypot(dx, dy);
    }, id);
  await page.waitForTimeout(800);
  expect(
    await offCentre(),
    "premise: the listing starts away from the map's middle",
  ).toBeGreaterThan(0.25);
  await last.evaluate((li) => li.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(offCentre, { timeout: 10_000 }).toBeLessThan(0.1);
});

test("from lg a pin press brings its card to the middle of the window", async ({ page }) => {
  const section = await listLand(page);
  const pressable = () =>
    section.evaluate((el) => {
      const map = el.querySelector("[data-property-map]")!.getBoundingClientRect();
      for (const pin of el.querySelectorAll<HTMLElement>("[data-map-pin]:not([data-map-active])")) {
        const r = pin.querySelector("svg")!.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        if (x < map.left || x > map.right || y < map.top || y > map.bottom) continue;
        if (pin.contains(document.elementFromPoint(x, y))) return pin.dataset.mapPin!;
      }
      return null;
    });
  const zoomOut = section.getByRole("button", { name: /^Zoom out/ });
  let id: string | null = null;
  for (let press = 0; press < 6 && !id; press++) {
    await zoomOut.click();
    await page.waitForTimeout(600);
    id = await pressable();
  }
  expect(id, "a pin whose own centre is pressable").toBeTruthy();
  await section.locator(`[data-map-pin="${id}"]`).click();
  await expect.poll(() => centreCard(section)).toBe(id);
  await expect.poll(() => garnetCard(section)).toBe(id);
});

test("turning a tablet below lg drops the listing the centre line chose", async ({ page }) => {
  const section = await listLand(page);
  const cards = section.locator("[data-centre-id]");
  const first = await cards.first().getAttribute("data-centre-id");
  const last = cards.last();
  const id = await last.getAttribute("data-centre-id");
  await last.evaluate((li) => li.scrollIntoView({ block: "center", behavior: "instant" }));
  await expect.poll(() => garnetCard(section)).toBe(id);
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect.poll(() => garnetCard(section)).toBe(first);
});

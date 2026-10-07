import { expect, test, type Locator, type Page } from "@playwright/test";

import { hydrated, HYDRATION_TIMEOUT } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";

const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const ROUTE = PREVIEW ? "/properties" : "/dev/properties";

async function landSection(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE);
  await hydrated(page);
  const section = page.locator("section[aria-labelledby^='listing-']").first();
  const map = section.locator("[data-property-map]");
  await scrollMapToBoot(map);
  await expect(section.locator("[data-map-pin]").first()).toBeAttached({
    timeout: HYDRATION_TIMEOUT,
  });
  await expect(
    section.locator('[aria-roledescription="carousel"][data-carousel-ready]'),
  ).toBeAttached();
  return section;
}

const camera = (section: Locator) =>
  section.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-map-pin], [data-map-cluster]")]
      .map((p) => `${p.dataset.mapPin ?? `cluster${p.dataset.mapCluster}`}@${p.style.transform}`)
      .join("|"),
  );

const onStage = (section: Locator) =>
  section.evaluate(
    (el) =>
      [...el.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')].find(
        (s) => !s.hasAttribute("aria-hidden"),
      )?.dataset.centreId,
  );

const settle = (page: Page) => page.waitForTimeout(800);

test("from lg the map sits beside a one-listing panel, wider than the panel", async ({ page }) => {
  const section = await landSection(page);
  const map = await section.locator("[data-property-map]").boundingBox();
  const panel = await section.locator("[data-listing-carousel]").boundingBox();
  expect(map && panel).toBeTruthy();
  expect(panel!.x).toBeGreaterThanOrEqual(map!.x + map!.width - 1);
  expect(map!.width).toBeGreaterThan(panel!.width);
  expect(Math.abs(map!.y - panel!.y)).toBeLessThan(1);
});

test("an arrow changes the listing and the active pin, and the camera does not move", async ({
  page,
}) => {
  const section = await landSection(page);
  await settle(page);
  const before = await camera(section);
  expect(
    before.split("|").length,
    "pins are drawn, so the comparison measures something",
  ).toBeGreaterThan(1);
  const first = await onStage(section);

  await section.getByRole("button", { name: "Next slide" }).click();
  await settle(page);
  const second = await onStage(section);
  expect(second).not.toBe(first);
  expect(await camera(section)).toBe(before);

  const single = section.locator(`[data-map-pin="${second}"]`);
  if ((await single.count()) > 0) await expect(single).toHaveAttribute("data-map-active", "");

  await section.getByRole("button", { name: /^Zoom in/ }).click();
  await settle(page);
  expect(await camera(section), "control: a visitor's zoom does move the pins").not.toBe(before);
});

test("pressing a pin turns the panel to that listing without moving the camera", async ({
  page,
}) => {
  const section = await landSection(page);
  await settle(page);
  const before = await camera(section);
  const pin = section.locator("[data-map-pin]:not([data-map-active])").first();
  const id = await pin.getAttribute("data-map-pin");
  expect(id).toBeTruthy();
  await pin.click({ force: true });
  await settle(page);
  expect(await onStage(section)).toBe(id);
  await expect(section.locator(`[data-map-pin="${id}"]`)).toHaveAttribute("data-map-active", "");
  const others = section.locator(
    "[data-map-pin]:not([data-map-active]), [data-map-cluster]:not([data-map-active])",
  );
  expect(await others.count()).toBeGreaterThan(0);
  for (const other of await others.all())
    await expect(other).toHaveAttribute("data-map-dimmed", "");
  expect(await camera(section)).toBe(before);
});

test("the wheel over the map zooms the map and leaves the page where it was", async ({ page }) => {
  const section = await landSection(page);
  await settle(page);
  const box = (await section.locator("[data-property-map]").boundingBox())!;
  const spot = await section.evaluate((el) => {
    const r = el.querySelector("[data-property-map]")!.getBoundingClientRect();
    for (let y = r.top + 40; y < r.bottom - 60; y += 23)
      for (let x = r.left + 40; x < r.right - 80; x += 31) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.tagName === "CANVAS") return { x, y };
      }
    return null;
  });
  expect(spot, "bare canvas inside the map").not.toBeNull();
  expect(spot!.y).toBeGreaterThan(box.y);
  const before = await camera(section);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.mouse.move(spot!.x, spot!.y);
  await page.mouse.wheel(0, -300);
  await settle(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(y0);
  expect(await camera(section)).not.toBe(before);
});

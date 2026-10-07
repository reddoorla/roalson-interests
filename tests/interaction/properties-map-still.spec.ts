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

const pinsOf = (snapshot: string) =>
  new Map(
    snapshot
      .split("|")
      .filter((m) => !m.startsWith("cluster"))
      .map((m) => m.split("@") as [string, string]),
  );

const sameCamera = (a: string, b: string) => {
  const before = pinsOf(a);
  const after = pinsOf(b);
  const shared = [...before.keys()].filter((id) => after.has(id));
  expect(shared.length, "pins drawn in both, so the comparison measures something").toBeGreaterThan(
    0,
  );
  return shared.every((id) => before.get(id) === after.get(id));
};

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
  expect(sameCamera(before, await camera(section))).toBe(true);

  await expect(section.locator(`[data-map-pin="${second}"]`)).toHaveAttribute(
    "data-map-active",
    "",
  );

  await section.getByRole("button", { name: /^Zoom in/ }).click();
  await settle(page);
  expect(
    sameCamera(before, await camera(section)),
    "control: a visitor's zoom does move the pins",
  ).toBe(false);
});

test("every listing on stage has a pin of its own, never hidden in a cluster", async ({ page }) => {
  const section = await landSection(page);
  await settle(page);
  const pins = (await camera(section)).split("|").map((m) => m.split("@")[0]);
  const count = await section.locator('[aria-roledescription="slide"]').count();
  expect(count).toBeGreaterThan(1);
  const next = section.getByRole("button", { name: "Next slide" });
  for (let turn = 0; turn < count; turn++) {
    const id = await onStage(section);
    await expect(
      section.locator(`[data-map-pin="${id}"]`),
      `${id} has its own pin`,
    ).toHaveAttribute("data-map-active", "");
    await next.click();
    await settle(page);
  }
  expect(pins.length, "premise: the map drew markers").toBeGreaterThan(1);
});

test("pressing a pin turns the panel to that listing without moving the camera", async ({
  page,
}) => {
  const section = await landSection(page);
  await settle(page);
  const before = await camera(section);
  const id = await section.evaluate((el) => {
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
  expect(id, "a pin whose own centre is pressable").toBeTruthy();
  await section.locator(`[data-map-pin="${id}"]`).click();
  await settle(page);
  expect(await onStage(section)).toBe(id);
  await expect(section.locator(`[data-map-pin="${id}"]`)).toHaveAttribute("data-map-active", "");
  const others = section.locator(
    "[data-map-pin]:not([data-map-active]), [data-map-cluster]:not([data-map-active])",
  );
  expect(await others.count()).toBeGreaterThan(0);
  for (const other of await others.all())
    await expect(other).toHaveAttribute("data-map-dimmed", "");
  expect(sameCamera(before, await camera(section))).toBe(true);
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
  expect(sameCamera(before, await camera(section))).toBe(false);
});

test("on a short laptop window the panel grows to fit its text instead of spilling past the section", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 625 });
  await page.goto(ROUTE);
  await hydrated(page);
  const panels = page.locator('[aria-roledescription="carousel"][data-carousel-ready]');
  await expect(panels.first()).toBeAttached({ timeout: HYDRATION_TIMEOUT });
  const fits = await panels.evaluateAll((all) =>
    all.map((region) => {
      const list = region.querySelector("ul")!.getBoundingClientRect();
      const slides = [...region.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')];
      const deepest = Math.max(
        ...slides.flatMap((s) =>
          [...s.querySelectorAll("article > *")].map((c) => c.getBoundingClientRect().bottom),
        ),
      );
      const photo = slides[0]!.querySelector("article > div")!.getBoundingClientRect().height;
      return { overflow: deepest - list.bottom, photo };
    }),
  );
  expect(fits.length).toBeGreaterThan(0);
  for (const f of fits) {
    expect(f.overflow, "no slide's text runs past its panel").toBeLessThanOrEqual(1);
    expect(f.photo, "the photo keeps a real height").toBeGreaterThanOrEqual(190);
  }
});

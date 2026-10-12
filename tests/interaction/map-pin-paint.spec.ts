import { expect, test, type Locator } from "@playwright/test";

import { hydrated } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";

const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";

// Erik, 2026-10-12: no stroke round the dimmed pins, and the active pin is his
// Ri-Pin2. A scaffold check: both are design values a human may change.

async function expectNoOutline(pins: Locator) {
  expect(await pins.count(), "premise: dimmed pins to measure").toBeGreaterThan(0);
  for (const pin of await pins.all()) {
    const paint = await pin.evaluate((el) => {
      const style = getComputedStyle(el.querySelector(":scope > svg > path")!);
      return { stroke: style.stroke, fill: Number(style.fillOpacity) };
    });
    expect(paint.stroke, "no outline").toBe("none");
    expect(paint.fill, "premise: the fill is dimmed").toBeLessThan(1);
  }
}

/** How far the lowest painted point of `pin`'s drawing is from the point the
 *  pin is anchored at: its own box's bottom centre (`translate(-50%,-100%)`). */
async function tipOffset(pin: Locator) {
  return pin.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const shape = el.querySelector("[data-map-pin-mark] path, :scope > svg > path")!;
    const drawn = shape.getBoundingClientRect();
    return {
      x: drawn.left + drawn.width / 2 - (box.left + box.width / 2),
      y: drawn.bottom - box.bottom,
    };
  });
}

async function expectTipsOnTheirPoints(active: Locator, other: Locator) {
  for (const pin of [active, other]) {
    const off = await tipOffset(pin);
    expect(Math.abs(off.x), "the tip is on the point's x").toBeLessThan(0.5);
    expect(Math.abs(off.y), "and on its y").toBeLessThan(0.5);
  }
}

test("a dimmed pin is drawn with no outline, on the picture and on the live map", async ({
  page,
}) => {
  test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/properties");
  await hydrated(page);
  const all = page.locator('section[data-view-section="all"]');
  await expectNoOutline(all.locator("[data-map-home-pin][data-map-dimmed]"));

  const map = all.locator("[data-property-map]");
  await scrollMapToBoot(map);
  await expect(map, "the map booted").toHaveAttribute("data-map-ready", "", { timeout: 45_000 });
  await expectNoOutline(all.locator("[data-map-pin][data-map-dimmed]"));
});

test("the active pin's tip sits on its listing's point, as a dimmed pin's does", async ({
  page,
}) => {
  test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/properties");
  await hydrated(page);
  const all = page.locator('section[data-view-section="all"]');
  await expectTipsOnTheirPoints(
    all.locator("[data-map-home-pin][data-map-active]").first(),
    all.locator("[data-map-home-pin][data-map-dimmed]").first(),
  );

  const map = all.locator("[data-property-map]");
  await scrollMapToBoot(map);
  await expect(map, "the map booted").toHaveAttribute("data-map-ready", "", { timeout: 45_000 });
  await expectTipsOnTheirPoints(
    all.locator("[data-map-pin][data-map-active]").first(),
    all.locator("[data-map-pin][data-map-dimmed]").first(),
  );
});

// The gate's half: map-marker-contrast.test.ts proves DIMMED_PIN_FILL keeps
// 3:1, which holds only if a dimmed pin is painted at exactly its own
// `--map-dim`, with no ancestor opacity multiplied on top.
async function expectPaintedAtItsDim(pins: Locator) {
  expect(await pins.count(), "premise: dimmed pins to measure").toBeGreaterThan(0);
  for (const pin of await pins.all()) {
    const { painted, dim } = await pin.evaluate((el) => {
      const path = el.querySelector(":scope > svg > path")!;
      let chain = 1;
      for (let n: Element | null = path; n; n = n.parentElement)
        chain *= Number(getComputedStyle(n).opacity);
      return {
        painted: chain * Number(getComputedStyle(path).fillOpacity),
        dim: Number(getComputedStyle(el).getPropertyValue("--map-dim")),
      };
    });
    expect(dim, "premise: the pin is dimmed").toBeLessThan(1);
    expect(painted, "painted at its own dim, nothing more").toBeCloseTo(dim, 6);
  }
}

test(
  "a dimmed pin is painted at its own dim, on the picture and on the live map",
  { tag: "@smoke" },
  async ({ page }) => {
    test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/properties");
    await hydrated(page);
    const all = page.locator('section[data-view-section="all"]');
    await expectPaintedAtItsDim(all.locator("[data-map-home-pin][data-map-dimmed]"));

    const map = all.locator("[data-property-map]");
    await scrollMapToBoot(map);
    await expect(map, "the map booted").toHaveAttribute("data-map-ready", "", { timeout: 45_000 });
    await expectPaintedAtItsDim(all.locator("[data-map-pin][data-map-dimmed]"));
  },
);

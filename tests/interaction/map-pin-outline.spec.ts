import { expect, test, type Locator } from "@playwright/test";

import { hydrated } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";

const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";

// WCAG 1.4.11: a dimmed pin keeps 3:1 against the map by its outline, which
// map-marker-contrast.test.ts measures at full strength. This holds that the
// outline is in fact painted at full strength, on the picture and the live map.
async function expectSolidOutlines(pins: Locator) {
  expect(await pins.count(), "premise: dimmed pins to measure").toBeGreaterThan(0);
  for (const pin of await pins.all()) {
    const paint = await pin.evaluate((el) => {
      const path = el.querySelector(":scope > svg > path")!;
      let chain = 1;
      for (let n: Element | null = path; n; n = n.parentElement)
        chain *= Number(getComputedStyle(n).opacity);
      const style = getComputedStyle(path);
      return {
        stroke: style.stroke === "none" ? 0 : chain * Number(style.strokeOpacity),
        fill: chain * Number(style.fillOpacity),
      };
    });
    expect(paint.stroke, "the outline is painted at full strength").toBe(1);
    expect(paint.fill, "premise: the pin is dimmed").toBeLessThan(1);
  }
}

test(
  "a dimmed pin keeps its outline at full strength, on the picture and on the live map",
  { tag: "@smoke" },
  async ({ page }) => {
    test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/properties");
    await hydrated(page);
    const all = page.locator('section[data-view-section="all"]');
    await expectSolidOutlines(all.locator("[data-map-home-pin][data-map-dimmed]"));

    const map = all.locator("[data-property-map]");
    await scrollMapToBoot(map);
    await expect(map, "the map booted").toHaveAttribute("data-map-ready", "", { timeout: 45_000 });
    await expectSolidOutlines(all.locator("[data-map-pin][data-map-dimmed]"));
  },
);

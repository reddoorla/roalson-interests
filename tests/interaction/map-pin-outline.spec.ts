import { expect, test } from "@playwright/test";

import { hydrated } from "./hydrated";

const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";

test(
  "a dimmed pin fades its fill and paints its outline at full strength",
  { tag: "@smoke" },
  async ({ page }) => {
    test.skip(PREVIEW, "/dev/* 404s on a production build (#120)");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dev/properties");
    await hydrated(page);
    const all = page.locator('section[data-view-section="all"]');
    const dimmed = all.locator(
      "[data-map-home-pin][data-map-dimmed], [data-map-pin][data-map-dimmed]",
    );
    await expect(dimmed.first()).toBeAttached();
    for (const pin of await dimmed.all()) {
      const paint = await pin.evaluate((el) => {
        const path = el.querySelector(":scope > svg > path")!;
        let chain = 1;
        for (let n: Element | null = path; n; n = n.parentElement)
          chain *= Number(getComputedStyle(n).opacity);
        const style = getComputedStyle(path);
        return {
          stroke: chain * Number(style.strokeOpacity),
          fill: chain * Number(style.fillOpacity),
          width: parseFloat(style.strokeWidth),
        };
      });
      expect(paint.stroke, "the outline is painted at full strength").toBe(1);
      expect(paint.width, "the outline is drawn").toBeGreaterThan(0);
      expect(paint.fill, "premise: the fill is faded").toBeLessThan(1);
    }
  },
);

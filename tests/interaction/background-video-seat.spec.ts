import { expect, test } from "@playwright/test";
import { hydrated } from "./hydrated";

// VimeoBanner's WCAG 2.2.2 control (#81), in a real engine: its CORNER. jsdom
// resolves no stylesheets, so it cannot see the defect the hero's control
// shipped once — placement classes on the button, beaten by ARROW_SHAPE's
// `relative` in Tailwind's emission order, at (-80, -20). The seat ships
// whether or not a player ever beats, so this needs no third party; the button
// itself is VimeoBanner.test.ts's.
test("VimeoBanner seats its control 20px in from the banner's bottom-right", async ({ page }) => {
  await page.goto("/dev/a11y-fixtures");
  await hydrated(page);

  const seat = await page.evaluate(() => {
    const el = document.querySelector("[data-vimeo-banner-controls]")!;
    const s = el.getBoundingClientRect();
    const b = el.parentElement!.getBoundingClientRect();
    return {
      position: getComputedStyle(el).position,
      right: b.right - s.right,
      bottom: b.bottom - s.bottom,
      inside: s.left >= b.left && s.top >= b.top,
    };
  });
  expect(seat.position).toBe("absolute");
  expect(seat.right, "20 in from the banner's right edge").toBeCloseTo(20, 0);
  expect(seat.bottom, "20 up from the banner's foot").toBeCloseTo(20, 0);
  expect(seat.inside).toBe(true);
});

import { expect, test, type Page } from "@playwright/test";

import { forceStyle } from "./force-style";
import { hydrated } from "./hydrated";

// forceStyle (./force-style.ts), and the harness trap it exists for (#170).
//
// The first two cases are the CONTROL: they show the trap is real on this page
// under this harness, and that it is the reduce rule's and not the browser's.
// Without them the third case could pass on a page where nothing lags, and so
// would prove nothing about the helper.
//
// On /contact because it answers on both servers (its `load` touches no CMS)
// and carries the whole bar: wordmark, CTA and menu button.
const ROUTE = "/contact";
const BAR = 'nav[aria-label="Primary"]';

const motion = (page: Page) =>
  page.evaluate(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference",
  );

/** How many of the bar's descendants compute `visible`, read in ONE task. */
const stillVisible = (page: Page) =>
  page.evaluate((sel) => {
    const all = [...document.querySelector(sel)!.querySelectorAll("*")];
    return {
      descendants: all.length,
      visible: all.filter((el) => getComputedStyle(el).visibility === "visible").length,
    };
  }, BAR);

/** Hide the bar ALONE, as masthead-scrim.spec.ts's first draft did, and read
 *  its descendants in the same task. */
const hideBarOnly = (page: Page) =>
  page.evaluate((sel) => {
    const bar = document.querySelector<HTMLElement>(sel)!;
    bar.style.setProperty("transition", "none", "important");
    bar.style.setProperty("visibility", "hidden", "important");
    const all = [...bar.querySelectorAll("*")];
    return {
      bar: getComputedStyle(bar).visibility,
      descendants: all.length,
      visible: all.filter((el) => getComputedStyle(el).visibility === "visible").length,
    };
  }, BAR);

async function open(page: Page) {
  await page.goto(ROUTE);
  await hydrated(page);
  const before = await stillVisible(page);
  expect(before.descendants, "the bar has descendants to hide").toBeGreaterThan(3);
  expect(before.visible, "and they are visible to begin with").toBe(before.descendants);
}

test("under the harness's `reduce`, the bar's descendants are still visible in the task that hid it", async ({
  page,
}) => {
  await open(page);
  expect(await motion(page)).toBe("reduce");
  const read = await hideBarOnly(page);
  expect(read.bar).toBe("hidden");
  expect(read.visible, "descendants mid-transition to hidden").toBeGreaterThan(0);
});

test.describe("with motion allowed", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the same write hides every descendant at once: the lag is the reduce rule's", async ({
    page,
  }) => {
    await open(page);
    expect(await motion(page)).toBe("no-preference");
    const read = await hideBarOnly(page);
    expect(read.bar).toBe("hidden");
    expect(read.visible).toBe(0);
  });
});

test("forceStyle does not return until every descendant is hidden", async ({ page }) => {
  await open(page);
  expect(await motion(page)).toBe("reduce");
  await forceStyle(page, [[BAR, "visibility", "hidden"]], "the bar never hid");
  expect((await stillVisible(page)).visible).toBe(0);
});

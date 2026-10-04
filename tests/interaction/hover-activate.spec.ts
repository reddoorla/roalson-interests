import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";
import { GARNET } from "./palette";

const FIXTURE = "/dev/properties";
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const NO_FIXTURE = "/dev/* 404s on a production build (#120)";

const FM_1560 = "fm-1560-galm";
const POTRANCO = "potranco-road";

const DWELL_MS = 200;
const MOVE_TIMEOUT = 15_000;

async function at(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { context, page: await context.newPage() };
}

const land = (page: Page) => page.locator('section[aria-labelledby="listing-land"]');

const garnetIds = (sec: Locator) =>
  sec.evaluate(
    (el, garnet) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")]
        .filter((li) => getComputedStyle(li.querySelector("article")!).backgroundColor === garnet)
        .map((li) => li.dataset.centreId!),
    GARNET,
  );

const onCentreLine = (sec: Locator) =>
  sec.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const box = li.getBoundingClientRect();
      if (box.top <= mid && box.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

const underPoint = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x!, y!)?.closest<HTMLElement>("[data-centre-id]")?.dataset
        .centreId ?? null,
    [x, y],
  );

async function centreFirst(page: Page) {
  await page.evaluate(
    (id) =>
      document
        .querySelector(`[data-centre-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" }),
    FM_1560,
  );
  await expect(land(page).locator(`[data-centre-id="${FM_1560}"] article`)).toHaveCSS(
    "background-color",
    GARNET,
    { timeout: MOVE_TIMEOUT },
  );
}

async function middleOf(sec: Locator, id: string) {
  const box = (await sec.locator(`[data-centre-id="${id}"] article`).boundingBox())!;
  expect(box.y + box.height, `${id} is on screen`).toBeLessThan(900);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("hovering a listing card makes it the active listing", () => {
  test.skip(PREVIEW, NO_FIXTURE);

  test("a mouse resting on a card that is off the centre line turns it garnet, without scrolling", async ({
    browser,
  }) => {
    const { context, page } = await at(browser);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      await centreFirst(page);
      const sec = land(page);
      expect(await onCentreLine(sec)).toBe(FM_1560);
      const startY = await page.evaluate(() => window.scrollY);
      const { x, y } = await middleOf(sec, POTRANCO);
      await page.mouse.move(x, y, { steps: 5 });
      await expect(sec.locator(`[data-centre-id="${POTRANCO}"] article`)).toHaveCSS(
        "background-color",
        GARNET,
        { timeout: MOVE_TIMEOUT },
      );
      expect(await garnetIds(sec)).toEqual([POTRANCO]);
      expect(await onCentreLine(sec), "the page did not move to get there").toBe(FM_1560);
      expect(await page.evaluate(() => window.scrollY)).toBe(startY);
    } finally {
      await context.close();
    }
  });

  test("after a hover, a scroll still moves the highlight with the centre line", async ({
    browser,
  }) => {
    const { context, page } = await at(browser);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      await centreFirst(page);
      const sec = land(page);
      const { x, y } = await middleOf(sec, POTRANCO);
      await page.mouse.move(x, y, { steps: 5 });
      await expect(sec.locator(`[data-centre-id="${POTRANCO}"] article`)).toHaveCSS(
        "background-color",
        GARNET,
        { timeout: MOVE_TIMEOUT },
      );
      const before = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, 600);
      await page.waitForFunction((b) => scrollY > b, before);
      await page.waitForTimeout(DWELL_MS * 3);
      const centre = await onCentreLine(sec);
      const pointed = await underPoint(page, x, y);
      expect(centre, "a card is on the centre line").not.toBeNull();
      expect(pointed, "the scroll put a different card under the mouse").not.toBe(centre);
      await expect.poll(() => garnetIds(sec), { timeout: MOVE_TIMEOUT }).toEqual([centre]);
    } finally {
      await context.close();
    }
  });
});

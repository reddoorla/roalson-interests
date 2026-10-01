import { expect, test, type Page } from "@playwright/test";
import { hydrated } from "./hydrated";

// MarkUp, 2026-10-01: "When we toggle to Improved Projects the background
// changes and the title moves down. Can we match it to Land?" Under its own
// view Improved Projects is the page's first section, so it must be dressed
// exactly as Land is under Land's: same ground, same heading offset under the
// tab row, and a divider that does not pin. Under All it keeps its sand,
// its 100px strip and its pin.
const FIXTURE = "/dev/properties";
const WIDE = { width: 1440, height: 900 };

async function dress(page: Page, id: string) {
  return page.evaluate((sectionId) => {
    const section = document.querySelector(`section[aria-labelledby="listing-${sectionId}"]`)!;
    const divider = section.firstElementChild as HTMLElement;
    const strip = divider.firstElementChild as HTMLElement;
    const tabs = document.querySelector('[role="group"][aria-label="Show listings"]')!;
    const heading = section.querySelector("h2")!;
    return {
      ground: getComputedStyle(section).backgroundColor,
      dividerGround: getComputedStyle(divider).backgroundColor,
      position: getComputedStyle(divider).position,
      strip: strip.getBoundingClientRect().height,
      stripImage: getComputedStyle(strip).backgroundImage,
      headingBelowTabs: heading.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom,
      // The first card that is not the garnet one: a panel on its ground.
      card: (() => {
        const article = [...section.querySelectorAll("[data-centre-id] > article")].find(
          (el) => !el.classList.contains("bg-primary"),
        )!;
        // Only the ground: the fixture's Improved cards have no photo box to
        // compare (the live portfolio's do; checked on the deploy preview).
        return { ground: getComputedStyle(article).backgroundColor };
      })(),
    };
  }, id);
}

const pastStrip = (page: Page) =>
  page
    .locator("section[data-past] > div:first-child > div:first-child")
    .evaluate((el) => getComputedStyle(el).backgroundImage);

test("hydrated: Improved Projects on its own is dressed as Land is on its own", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto(FIXTURE);
  await hydrated(page);

  await page.locator('[data-view-tab="all"]').click();
  const underAll = await dress(page, "improved");
  expect(underAll.position, "premise: under All it pins").toBe("sticky");
  expect(underAll.strip, "premise: under All its strip is 100").toBe(100);

  await page.locator('[data-view-tab="land"]').click();
  await expect(page.locator('section[aria-labelledby="listing-improved"]')).toBeHidden();
  const land = await dress(page, "land");

  const pastUnderLand = await pastStrip(page);
  expect(pastUnderLand, "premise: Past Projects' strip is warmed under Land").toMatch(
    /^linear-gradient/,
  );

  await page.locator('[data-view-tab="improved"]').click();
  await expect(page.locator('section[aria-labelledby="listing-land"]')).toBeHidden();
  await expect.poll(() => dress(page, "improved")).toEqual(land);
  expect(await pastStrip(page), "and the seam into Past Projects is warmed as under Land").toBe(
    pastUnderLand,
  );
});

test("with no script: a shared #improved link is dressed as #land is, its map pinned as Land's", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 700 },
  });
  const page = await context.newPage();
  const mapTop = (id: string) =>
    page
      .locator(`section[aria-labelledby="listing-${id}"] [data-property-map]`)
      .evaluate((el) => getComputedStyle(el).top);
  await page.goto(`${FIXTURE}#land`);
  const land = await dress(page, "land");
  const landTop = await mapTop("land");
  await page.goto(`${FIXTURE}#improved`);
  expect(await dress(page, "improved")).toEqual(land);
  expect(await mapTop("improved")).toBe(landTop);
  await context.close();
});

test("hydrated: under Improved its map pins on the bar's usable top, as Land's does", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto(FIXTURE);
  await hydrated(page);
  const top = (id: string) =>
    page
      .locator(`section[aria-labelledby="listing-${id}"] > div:nth-child(2)`)
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--sticky-top"));
  await page.locator('[data-view-tab="land"]').click();
  await expect.poll(() => top("land")).toMatch(/px$/);
  const land = await top("land");
  await page.locator('[data-view-tab="improved"]').click();
  await expect.poll(() => top("improved")).toBe(land);
});

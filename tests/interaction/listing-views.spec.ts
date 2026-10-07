import { expect, test, type Browser, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";
import { scrollMapToBoot } from "./map-boot";
import { axe } from "./axe";

// THE PROPERTIES VIEW TABS (P5, client meeting 2026-09-25: "land / improved
// projects / all"). The tabs are fragment links and app.css filters by
// `:target` until the component hydrates, then by `data-view`. jsdom has no
// cascade, so everything that is a claim about CSS is here:
//
//  1. With no script a shared `#improved` link is filtered on first paint and
//     does not scroll; a tab press filters and Back restores.
//  2. Hydrated, a hidden section stays mounted: its map is still booted and
//     full-width when the view comes back.
//  3. The skip link's fragment does not reset the view (the `data-view` form).
//  4. A client navigation to `/properties#land` is filtered.
//  5. Axe passes on every view.
//
//   pnpm exec playwright test tests/interaction/listing-views.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/listing-views.spec.ts
const FIXTURE = "/dev/properties";
const LIVE = "/properties";
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const NO_FIXTURE = "/dev/* 404s on a production build (#120)";
const WIDE = { width: 1440, height: 900 };

const sectionOf = (page: Page, id: string) =>
  page.locator(`section[aria-labelledby="listing-${id}"]`);
const tabOf = (page: Page, id: string) => page.locator(`[data-view-tab="${id}"]`);

async function noScript(browser: Browser) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: WIDE });
  return { context, page: await context.newPage() };
}

async function expectView(page: Page, view: "land" | "improved" | "all" | "list") {
  for (const id of ["land", "improved"]) {
    const shown = view === "all" || view === "list" || view === id;
    await (shown
      ? expect(sectionOf(page, id), `${id} under ${view}`).toBeVisible()
      : expect(sectionOf(page, id), `${id} under ${view}`).toBeHidden());
  }
  // The live CMS has no past project yet; the fixture has three.
  if ((await sectionOf(page, "past").count()) > 0) {
    await expect(sectionOf(page, "past"), "Past Projects shows under every view").toBeVisible();
  }
  // Hydrated, aria-current says which tab is selected; with no script the
  // tab's name does, and listing-views-name.spec.ts reads that.
  if ((await page.locator("html[data-hydrated]").count()) === 0) return;
  for (const id of ["land", "improved", "list"]) {
    const message = `tab ${id} selected under ${view}`;
    await (id === view
      ? expect(tabOf(page, id), message).toHaveAttribute("aria-current", "true")
      : expect(tabOf(page, id), message).not.toHaveAttribute("aria-current"));
  }
}

test.describe("with no script", { tag: "@smoke" }, () => {
  test.skip(PREVIEW, NO_FIXTURE);

  test("a shared #improved link is filtered on first paint, and does not scroll", async ({
    browser,
  }) => {
    const { context, page } = await noScript(browser);
    await page.goto(`${FIXTURE}#improved`);
    await expectView(page, "improved");
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await context.close();
  });

  test("a tab press filters without scrolling, and Back restores the view", async ({ browser }) => {
    const { context, page } = await noScript(browser);
    await page.goto(`${FIXTURE}#improved`);
    await tabOf(page, "land").scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => scrollY);
    await tabOf(page, "land").click();
    await expect(page).toHaveURL(/#land$/);
    await expectView(page, "land");
    expect(await page.evaluate(() => scrollY)).toBe(before);
    await page.goBack();
    await expect(page).toHaveURL(/#improved$/);
    await expectView(page, "improved");
    await context.close();
  });
});

test.describe("hydrated", () => {
  test.skip(PREVIEW, NO_FIXTURE);
  test.use({ viewport: WIDE });

  test("a hidden section stays mounted: its map is booted and full-size when it returns", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    await hydrated(page);
    const landMap = sectionOf(page, "land").locator("[data-property-map]");
    // It cannot boot at the top since 2026-09-29 (./map-boot).
    await scrollMapToBoot(landMap);
    await expect(landMap).toHaveAttribute("data-map-ready", "", { timeout: 25_000 });
    // A mark on the element itself. `{#if}` would pass everything else here:
    // the section leaves the DOM (so `toBeHidden` holds) and a NEW map boots
    // and reports ready at the same width (#174, measured). Only the same node
    // coming back carries this.
    await landMap.evaluate((el) => el.setAttribute("data-mount-probe", ""));
    const before = (await landMap.locator("canvas").first().boundingBox())!.width;
    await tabOf(page, "improved").click();
    await expectView(page, "improved");
    await expect(tabOf(page, "improved")).toHaveAttribute("aria-current", "true");
    await expect(sectionOf(page, "land"), "hidden, not removed").toHaveCSS("display", "none");
    await page.goBack();
    await expectView(page, "all");
    await expect(landMap, "the same map element, not a new one").toHaveAttribute(
      "data-mount-probe",
      "",
    );
    await expect(landMap).toHaveAttribute("data-map-ready", "", { timeout: 25_000 });
    await expect(landMap.locator("canvas").first()).toBeVisible();
    const after = (await landMap.locator("canvas").first().boundingBox())!.width;
    expect(before, "the map drew at its column's width").toBeGreaterThan(300);
    expect(Math.abs(after - before), "and draws there again").toBeLessThan(1);
  });

  test("the skip link does not reset the view", { tag: "@smoke" }, async ({ page }) => {
    await page.goto(FIXTURE);
    await hydrated(page);
    await tabOf(page, "improved").click();
    await expectView(page, "improved");
    await page.locator('a[href="#main-content"]').focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expectView(page, "improved");
  });

  test("a client navigation to #land is filtered", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("/dev/a11y-fixtures");
    await hydrated(page);
    await page.evaluate((href) => {
      const a = document.createElement("a");
      a.href = href;
      a.id = "go-land";
      a.textContent = "go";
      a.style.cssText = "position:fixed;bottom:0;left:0;z-index:100;background:#fff";
      document.body.prepend(a);
    }, `${FIXTURE}#land`);
    await page.locator("#go-land").click();
    await expect(page).toHaveURL(new RegExp(`${FIXTURE}#land$`));
    await expectView(page, "land");
  });

  test("axe passes on every view", { tag: "@smoke" }, async ({ page }) => {
    await page.goto(FIXTURE);
    await hydrated(page);
    for (const view of ["land", "improved", "list"] as const) {
      await tabOf(page, view).click();
      await expectView(page, view);
      const result = await axe(page)
        .include("[data-listing]")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations.map((v) => `${view} ${v.id}: ${v.nodes.length}`),
        view,
      ).toEqual([]);
    }
  });
});

test.describe("live", { tag: "@smoke" }, () => {
  test.skip(!PREVIEW, "the real portfolio is read on the production build");

  test("/properties#land is filtered with no script", async ({ browser }) => {
    const { context, page } = await noScript(browser);
    const res = await page.goto(`${LIVE}#land`);
    expect(res?.status()).toBe(200);
    await expect(tabOf(page, "land")).toBeVisible();
    await expectView(page, "land");
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await context.close();
  });
});

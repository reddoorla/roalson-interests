import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";

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

/** A token as a COMPUTED colour, never a typed rgb(): the palette is moving. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement("div");
    probe.style.color = `var(${n})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, name);

async function noScript(browser: Browser) {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: WIDE });
  return { context, page: await context.newPage() };
}

async function expectView(page: Page, view: "land" | "improved" | "all") {
  const garnet = await token(page, "--color-primary");
  for (const id of ["land", "improved"]) {
    const shown = view === "all" || view === id;
    await (shown
      ? expect(sectionOf(page, id), `${id} under ${view}`).toBeVisible()
      : expect(sectionOf(page, id), `${id} under ${view}`).toBeHidden());
  }
  // The live CMS has no past project yet; the fixture has three.
  if ((await sectionOf(page, "past").count()) > 0) {
    await expect(sectionOf(page, "past"), "Past Projects shows under every view").toBeVisible();
  }
  for (const id of ["land", "improved", "all"]) {
    const bg = await tabOf(page, id).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg === garnet, `tab ${id} selected under ${view}`).toBe(id === view);
  }
}

test.describe("with no script", () => {
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
    await expect(landMap).toHaveAttribute("data-map-ready", "");
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
    await tabOf(page, "all").click();
    await expectView(page, "all");
    await expect(landMap, "the same map element, not a new one").toHaveAttribute(
      "data-mount-probe",
      "",
    );
    await expect(landMap).toHaveAttribute("data-map-ready", "");
    await expect(landMap.locator("canvas").first()).toBeVisible();
    const after = (await landMap.locator("canvas").first().boundingBox())!.width;
    expect(before, "the map drew at its column's width").toBeGreaterThan(300);
    expect(Math.abs(after - before), "and draws there again").toBeLessThan(1);
  });

  test("the skip link does not reset the view", async ({ page }) => {
    await page.goto(FIXTURE);
    await hydrated(page);
    await tabOf(page, "improved").click();
    await expectView(page, "improved");
    await page.locator('a[href="#main-content"]').focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
    await expectView(page, "improved");
  });

  test("a client navigation to #land is filtered", async ({ page }) => {
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

  test("axe passes on every view", async ({ page }) => {
    await page.goto(FIXTURE);
    await hydrated(page);
    for (const view of ["land", "improved", "all"] as const) {
      await tabOf(page, view).click();
      await expectView(page, view);
      const result = await new AxeBuilder({ page })
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

test.describe("live", () => {
  test.skip(!PREVIEW, "the real portfolio is read on the production build");

  test("/properties#land is filtered with no script", async ({ browser }) => {
    const { context, page } = await noScript(browser);
    const res = await page.goto(`${LIVE}#land`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("[data-view-tab]")).toHaveCount(3);
    await expectView(page, "land");
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await context.close();
  });
});

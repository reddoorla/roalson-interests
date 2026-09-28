import { expect, test, type Page } from "@playwright/test";
import { hydrated } from "./hydrated";

// THE REVISED HERO BAND ON THE ROUTE THE SITE SERVES (`/`), so it runs on a
// production build too:
//
//   pnpm exec playwright test tests/interaction/home-hero-live.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/home-hero-live.spec.ts
//
// home-hero.spec.ts measures the band on /dev/home, over the fixture, and
// /dev/* 404s on a production build (#28). Two of its claims depend on what
// only the shipped bundle decides — the CSS that reaches the page and the
// face the CSP lets load — so they are re-made here:
//
//  1. THE COLUMN. The band's text stands on the gutter (x=80 at 1440), its
//     buttons 20 apart with 65 of garnet under them, and NO list: the live
//     document was published with `specialty_label` and three `specialties`
//     and keeps them until the home page is re-staged, so on that document
//     this is the stale-content case exactly.
//  2. THE LINE WIDTHS the break threshold rests on (see the H1's note in
//     HomeHero). They are measured off the page's own H1 — its classes, the
//     served face — on a nowrap copy, because the live document's WORDS are
//     the editor's and may not be the revised ones yet. The rule is: the
//     revised second line fits the column at 1040, and the flowed first line
//     fits it at 1024.
//
// Nothing here asserts the CMS's words or the buttons' order; the seed's
// value test (scripts/seed/pages.test.ts) and the fixture spec hold those.

const HOME = "/";
const band = '[data-slice-type="home_hero"] [data-nav-gate]';

/** The webfont has ARRIVED, by name (partners.spec.ts has why): with the face
 *  blocked — a CSP that differs on the shipped path is exactly the case —
 *  every width below would be the fallback's, and this stops here, saying so. */
const fontsArrived = (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(
          () =>
            document.fonts.status === "loaded" &&
            [...document.fonts].some(
              (face) =>
                face.family.includes("Atkinson Hyperlegible Next") && face.status === "loaded",
            ),
        ),
      { message: "Atkinson Hyperlegible Next loaded", timeout: 20_000 },
    )
    .toBe(true);

/** The width `text` sets at in the band's own H1, on one line, and the width
 *  of the column the H1 stands in. */
const setWidth = (page: Page, text: string) =>
  page.evaluate(
    ([bandSel, words]) => {
      const h1 = document.querySelector(`${bandSel} h1`)!;
      const copy = h1.cloneNode(false) as HTMLElement;
      copy.textContent = words;
      copy.style.cssText =
        "position:absolute;visibility:hidden;white-space:nowrap;display:inline-block;margin:0";
      h1.parentElement!.appendChild(copy);
      const width = copy.getBoundingClientRect().width;
      copy.remove();
      return {
        width,
        column: h1.parentElement!.getBoundingClientRect().width,
        font: getComputedStyle(h1).font,
      };
    },
    [band, text] as const,
  );

test("the band is one column on the gutter, with no specialty list, on the route the site serves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1455, height: 900 });
  await page.goto(HOME);
  await hydrated(page);
  await expect(page.locator(`${band} h1`)).toHaveCount(1);
  await expect(page.locator(`${band} ul`)).toHaveCount(0);
  await expect(page.locator(`${band} h2`)).toHaveCount(0);

  const g = await page.evaluate((bandSel) => {
    const el = document.querySelector(bandSel)!;
    const r = (x: Element) => x.getBoundingClientRect();
    return {
      band: { left: r(el).left, width: r(el).width, bottom: r(el).bottom },
      h1: r(el.querySelector("h1")!).left,
      buttons: [...el.querySelectorAll("a")].map((a) => ({
        left: r(a).left,
        right: r(a).right,
        top: r(a).top,
        bottom: r(a).bottom,
      })),
    };
  }, band);
  expect(g.band.width, "laid out at 1440").toBe(1440);
  expect(g.h1 - g.band.left, "the headline stands on the gutter, not at 513").toBe(80);
  expect(g.buttons.length, "the document's buttons are drawn").toBeGreaterThan(0);
  expect(g.buttons[0].left).toBe(g.h1);
  if (g.buttons.length > 1) {
    expect(g.buttons[1].left - g.buttons[0].right, "20 between the buttons").toBeCloseTo(20, 1);
    expect(g.buttons[1].top, "one row").toBe(g.buttons[0].top);
  }
  expect(g.band.bottom - g.buttons.at(-1)!.bottom, "65 of garnet under them").toBeCloseTo(65, 1);
});

test("on the served face the revised lines fit the column either side of the 1040 break", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1040, height: 900 });
  await page.goto(HOME);
  await hydrated(page);
  await fontsArrived(page);

  // From 1040 the editor's break holds: the long line is the second.
  const forced = await setWidth(page, "Real Estate Experts Since 1983.");
  expect(forced.font).toContain("66px");
  expect(forced.font).toContain("Atkinson Hyperlegible Next");
  test.info().annotations.push({ type: "measured@1040", description: JSON.stringify(forced) });
  expect(forced.column, "961 at a 1040 viewport").toBe(961);
  expect(forced.width, "line two fits with a margin").toBeLessThan(forced.column - 10);
  const first = await setWidth(page, "San Antonio's Commercial");
  expect(first.width).toBeLessThan(first.column);

  // At 1024 there is no forced break and the text flows at 66px: the first
  // line it can make is "San Antonio's Commercial Real" and that must fit.
  await page.setViewportSize({ width: 1024, height: 900 });
  const brs = page.locator(`${band} h1 br`);
  if ((await brs.count()) > 0) await expect(brs.first()).toHaveCSS("display", "none");
  const flowed = await setWidth(page, "San Antonio's Commercial Real");
  test.info().annotations.push({ type: "measured@1024", description: JSON.stringify(flowed) });
  expect(flowed.font).toContain("66px");
  expect(flowed.column, "945 at a 1024 viewport").toBe(945);
  expect(flowed.width, "the flowed first line fits with a margin").toBeLessThan(flowed.column - 10);
  const rest = await setWidth(page, "Estate Experts Since 1983.");
  expect(rest.width).toBeLessThan(rest.column);
});

import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { gutter, measuresGutter, viewportFor } from "./gutter";
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

// The page lays out a scrollbar gutter narrower than its window, 15 or 0 by
// system setting (#124), so it is measured rather than typed.
measuresGutter();

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
  await page.setViewportSize(viewportFor(1440));
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
  // 961 under a classic scrollbar: the viewport, less the gutter, less 2 × 32.
  expect(forced.column, "the column at a 1040 viewport").toBe(1040 - gutter() - 64);
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
  expect(flowed.column, "the column at a 1024 viewport").toBe(1024 - gutter() - 64);
  expect(flowed.width, "the flowed first line fits with a margin").toBeLessThan(flowed.column - 10);
  const rest = await setWidth(page, "Estate Experts Since 1983.");
  expect(rest.width).toBeLessThan(rest.column);
});

// THE BAR OVER THE HERO'S PHOTOGRAPH. Until the gate passes, the homepage's bar
// floats over the hero, and with a poster filled that is a photograph with a
// sunlit sky at its top. Measured on the served `/` before the fix: the sand
// menu glyph at 1.09:1 against it at 390, 1.14:1 at 768, 1.18:1 at 1024, and
// CONTACT US at 1.15:1 and 1.10:1. The controls now carry a garnet ground there
// (Nav.svelte, `onPhoto`), so these read the page's own pixels: what is under
// each glyph pixel with the glyph taken away, against the glyph's computed
// colour. The shared harness forces reduced motion, so the video never plays
// here and the ground under the bar is the poster: that is the case measured.

type Rgb = [number, number, number];
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

/** Two screenshots of `clip` that agree, so a transition is not measured. */
async function still(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  let last = await page.screenshot({ clip, scale: "css" });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(150);
    const next = await page.screenshot({ clip, scale: "css" });
    if (next.equals(last)) return next;
    last = next;
  }
  return last;
}

const raw = (png: Buffer) => sharp(png).removeAlpha().raw().toBuffer();

/** The worst ratio between the control's glyph colour and whatever is under a
 *  glyph pixel, with `hide` taking the glyph (and only the glyph) away. */
async function glyphOnGround(page: Page, control: Locator, hide: string) {
  const at = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const glyph = el.querySelector("svg") ?? el;
    const rgb = getComputedStyle(glyph)
      .color.match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    return {
      clip: {
        x: Math.floor(r.left),
        y: Math.floor(r.top),
        width: Math.ceil(r.width),
        height: Math.ceil(r.height),
      },
      rgb: rgb as Rgb,
    };
  });
  const on = await raw(await still(page, at.clip));
  const style = await page.addStyleTag({ content: hide });
  const off = await raw(await still(page, at.clip));
  await style.evaluate((n: HTMLStyleElement) => n.remove());
  const ratios: number[] = [];
  for (let i = 0; i < on.length; i += 3) {
    const q: Rgb = [off[i]!, off[i + 1]!, off[i + 2]!];
    if (Math.abs(on[i]! - q[0]) + Math.abs(on[i + 1]! - q[1]) + Math.abs(on[i + 2]! - q[2]) <= 6)
      continue;
    ratios.push(contrast(at.rgb, q));
  }
  return { pixels: ratios.length, worst: ratios.length ? Math.min(...ratios) : 0 };
}

/** The focus ring as drawn: the pixels that change when the control takes
 *  keyboard focus, and how far each moved (indicatorOf, property-map.spec.ts). */
async function ringOf(page: Page, control: Locator) {
  const clip = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pad = 6;
    return {
      x: Math.floor(r.left - pad),
      y: Math.max(Math.floor(r.top - pad), 0),
      width: Math.ceil(r.width + 2 * pad),
      height: Math.ceil(r.height + 2 * pad),
    };
  });
  const showing = await control.evaluate((el: HTMLElement) => {
    el.focus({ preventScroll: true });
    return el.matches(":focus-visible");
  });
  expect(showing, "premise: a keyboard's focus").toBe(true);
  const on = await raw(await still(page, clip));
  await control.evaluate((el: HTMLElement) => el.blur());
  const off = await raw(await still(page, clip));
  const ratios: number[] = [];
  for (let i = 0; i < on.length; i += 3) {
    const p: Rgb = [on[i]!, on[i + 1]!, on[i + 2]!];
    const q: Rgb = [off[i]!, off[i + 1]!, off[i + 2]!];
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) <= 6) continue;
    ratios.push(contrast(p, q));
  }
  ratios.sort((m, n) => m - n);
  return {
    atThree: ratios.filter((c) => c >= 3).length,
    median: ratios.length ? ratios[ratios.length >> 1]! : 0,
  };
}

for (const [width, height] of [
  [390, 844],
  [768, 1024],
  [1024, 768],
] as const) {
  test(`over the hero's photograph the bar's controls hold their contrast, ring included (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(HOME);
    await hydrated(page);
    const bar = page.getByRole("navigation", { name: "Primary" });
    await expect(bar, "premise: the bar floats over the hero").toHaveAttribute("data-floating", "");
    const poster = page.locator('[data-slice-type="home_hero"] img').first();
    await expect
      .poll(
        () => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
        {
          message: "premise: the poster has loaded under the bar",
        },
      )
      .toBe(true);

    const menu = bar.getByRole("button", { name: "Open menu" });
    const glyph = await glyphOnGround(
      page,
      menu,
      'nav [aria-controls="nav-menu"] svg { visibility: hidden !important; }',
    );
    test.info().annotations.push({ type: `menu@${width}`, description: JSON.stringify(glyph) });
    expect(glyph.pixels, "the menu glyph was found").toBeGreaterThan(100);
    expect(glyph.worst, "the menu glyph against its ground (WCAG 1.4.11)").toBeGreaterThanOrEqual(
      3,
    );

    const cta = bar.getByRole("link", { name: "Contact us" });
    if (await cta.isVisible()) {
      const text = await glyphOnGround(
        page,
        cta,
        'nav a[href="/contact"] { color: transparent !important; }',
      );
      test.info().annotations.push({ type: `cta@${width}`, description: JSON.stringify(text) });
      expect(text.pixels, "the CTA's label was found").toBeGreaterThan(100);
      expect(text.worst, "CONTACT US against its ground (WCAG 1.4.3)").toBeGreaterThanOrEqual(4.5);
    } else expect(width, "the CTA is hidden only below sm").toBeLessThan(640);

    const ring = await ringOf(page, menu);
    test.info().annotations.push({ type: `ring@${width}`, description: JSON.stringify(ring) });
    expect(ring.atThree, "the menu's focus ring moves 40+ pixels by 3:1").toBeGreaterThanOrEqual(
      40,
    );
    expect(ring.median, "and most of what it changes").toBeGreaterThanOrEqual(3);
  });
}

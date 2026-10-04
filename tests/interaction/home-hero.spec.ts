import { expect, test, type Page } from "@playwright/test";
import { measuresGutter, viewportFor } from "./gutter";
import { hydrated } from "./hydrated";
import { DARK } from "./palette";

// The top of the homepage makes three promises jsdom cannot check (see
// src/lib/slices/HomeHero/index.svelte):
//
//  1. the hero PINS — 528px, `position: sticky` — while the garnet band slides
//     up over it;
//  2. the RI cutout rides ON THE BAND: its bottom edge is the band's top edge at
//     rest AND while the band moves, at 1440 and at 390;
//  3. the route opens on that dark band under a floating bar — even for a `home`
//     document with no hero slice in it;
//  4. the band is the REVISED comp's one column (7091:640): headline, sentence
//     and buttons on the gutter, 30 apart, and the headline two lines broken
//     after "Commercial" at every `lg` width.
//
// /dev/home is the home route's own markup over fixture data, through the real
// layout. /dev/* 404s on every production build, so nothing in THIS file runs
// there (issue #28). home-hero-live.spec.ts re-runs the column and the served
// face's line widths on `/`, which a production build does serve.
//
// Written to the lessons nav.spec.ts paid for: no x derived from the window
// (the runner lays out 15px narrower than its own innerWidth — every edge below
// is read from an element's own container); everything after a resize or a
// scroll auto-retries; hydration is waited for with positive evidence.
//
// The shared config forces `reducedMotion: "reduce"` on every test, and since
// #38 the pin is OFF under `reduce` (ruled once for the page: the photo band at
// its foot made that call first). This file used to say "a sticky box is not
// motion" and ran its pin cases under the forced setting; they now opt out with
// `test.use`, each asserts the media query it believes it is running under, and
// the `reduce` case is its own test. Under `no-preference` app.css makes
// scrollTo a smooth glide, so every scroll here is `behavior: "instant"`.
const HOME = "/dev/home";

const bar = 'nav[aria-label="Primary"]';
const section = '[data-slice-type="home_hero"]';
const pin = `${section} [data-home-hero-pin]`;
const band = `${section} [data-nav-gate]`;
const cutout = `${section} [data-home-hero-cutout]`;

/** The bar is `absolute` in the server's markup over a dark first band, and
 *  only mount pins it — so `fixed` is positive evidence that script has run. */
const adopted = hydrated;

/** Viewport rects of the three layers, plus how far the page has moved. */
const layers = (page: Page) =>
  page.evaluate(
    ([pinSel, bandSel, cutoutSel]) => {
      const rect = (selector: string) => {
        const r = document.querySelector(selector)!.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
      };
      return {
        scrollY: window.scrollY,
        pin: rect(pinSel),
        band: rect(bandSel),
        cutout: rect(cutoutSel),
      };
    },
    [pin, band, cutout],
  );

/** Scroll, then wait until the page has actually arrived — a read taken the
 *  instant scrollTo returns can still be the old frame. */
async function scrollTo(page: Page, y: number) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
}

const motion = (page: Page) =>
  page.evaluate(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference",
  );

test("under prefers-reduced-motion: reduce the hero does not pin — it leaves with the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.goto(HOME);
  await adopted(page);
  expect(await motion(page), "the shared config's forced setting").toBe("reduce");
  await expect(page.locator(pin)).toHaveCSS("position", "relative");

  const rest = await layers(page);
  expect(rest.pin.top).toBe(0);
  expect(rest.band.top, "the band starts where the hero ends").toBe(rest.pin.bottom);
  await scrollTo(page, 200);
  const moved = await layers(page);
  expect(moved.pin.top, "the hero went with the page").toBe(-200);
  expect(moved.band.top, "and the band still starts where it ends").toBe(moved.pin.bottom);
  expect(moved.cutout.bottom, "the cutout is still seated on the band").toBeCloseTo(
    moved.band.top,
    1,
  );
});

test.describe("with motion allowed, the hero pins", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the hero stays pinned while the band slides up over it", async ({ page }) => {
    // Short on purpose: the fixture page is one band tall, and the pin needs
    // room to be scrolled through.
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto(HOME);
    await adopted(page);
    expect(await motion(page)).toBe("no-preference");
    await expect(page.locator(pin)).toHaveCSS("position", "sticky");
    await expect(page.locator(pin)).toHaveCount(1);
    await expect(page.locator(band)).toHaveCount(1);

    const rest = await layers(page);
    expect(rest.scrollY).toBe(0);
    expect(rest.pin.top, "the hero starts at the very top, under the bar").toBe(0);
    expect(rest.pin.height).toBe(528);
    expect(rest.band.top, "the band starts where the hero ends").toBe(rest.pin.bottom);

    await scrollTo(page, 200);
    const moved = await layers(page);
    // Positive evidence, all three: the page moved, the band moved with it, and
    // the hero did NOT.
    expect(moved.scrollY).toBe(200);
    expect(rest.band.top - moved.band.top, "the band scrolls normally").toBe(200);
    expect(moved.pin.top, "the hero is pinned").toBe(0);
    expect(moved.band.top, "so the band now overlaps it").toBeLessThan(moved.pin.bottom);

    // …and it is the BAND that paints in the overlap, not the hero under it. The
    // probe point is inside both boxes, read from the band's own rect.
    const onTop = await page.evaluate(
      ([bandSel, x, y]) => {
        const hit = document.elementFromPoint(x as number, y as number);
        return Boolean(hit && hit.closest(bandSel as string));
      },
      [band, moved.band.left + moved.band.width / 2, moved.band.top + 10] as const,
    );
    expect(onTop, "the band slides OVER the hero").toBe(true);

    // The pin lasts exactly as long as the band is tall — sticky is bounded by
    // the section the two share — and then the hero leaves with it. The page has
    // to be able to scroll that far for this to say anything, so that is checked
    // rather than assumed: the fixture grows a band per batch, the footer changes.
    const release = Math.round(rest.band.height) + 40;
    const reach = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(reach, "the page scrolls past the end of the pin").toBeGreaterThanOrEqual(release);
    await scrollTo(page, release);
    const past = await layers(page);
    expect(past.pin.top, "released once the band has passed").toBeLessThan(0);
    expect(past.band.top, "and still under the band's top edge").toBeLessThanOrEqual(
      past.pin.bottom,
    );
  });

  for (const [name, width, height] of [
    ["1440", 1440, 600],
    ["390", 390, 500],
  ] as const) {
    test(`the cutout rides on the band's top edge at ${name}, at rest and as it moves`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto(HOME);
      await adopted(page);
      await expect(page.locator(cutout)).toHaveCount(1);

      // Auto-retrying: right after setViewportSize the old layout is still
      // measurable. Half the BAND, capped at the comp's 451 — read from the band,
      // never from the window.
      await expect
        .poll(async () => {
          const at = await layers(page);
          return at.cutout.width - Math.min(at.band.width / 2, 451);
        })
        .toBeCloseTo(0, 1);

      const rest = await layers(page);
      expect(rest.cutout.height, "a square").toBeCloseTo(rest.cutout.width, 1);
      expect(rest.cutout.left, "flush with the band's left edge").toBeCloseTo(rest.band.left, 1);
      expect(rest.cutout.bottom, "seated on the band at rest").toBeCloseTo(rest.band.top, 1);
      expect(rest.cutout.top, "over the hero, not over the band").toBeGreaterThanOrEqual(
        rest.pin.top,
      );

      // At rest a cutout INSIDE the pinned hero sits in exactly the same place.
      // Only movement tells the two apart: it must leave with the band.
      await scrollTo(page, 150);
      const moved = await layers(page);
      expect(await motion(page)).toBe("no-preference");
      expect(moved.pin.top, "the hero is still pinned").toBe(0);
      expect(rest.band.top - moved.band.top).toBe(150);
      expect(moved.cutout.bottom, "still seated on the band").toBeCloseTo(moved.band.top, 1);
    });
  }
});

// THE REVISED BAND ('Homepage - REVISED' 7091:640, 2026-09-26). One column on
// the gutter: headline, one sentence, two buttons, 30 apart; 20 between the
// buttons; 65 of garnet under them. Every number is read off an element's own
// box, never the window. The H1's box is its LINE boxes; the comp measures its
// cap box, and the ramp's trim is the difference (app.css `t-h1`: 18 at 66/80,
// `t-h2`: 11.5 at 38/48).
const H1_TRIM = 18;
const H2_TRIM = 11.5;

/** `viewportFor` (./gutter.ts) is the viewport that produces a given LAYOUT
 *  width: the page lays out a scrollbar gutter narrower than its window, and
 *  that gutter is 15 or 0 by system setting (#124), so it is measured. */
measuresGutter();

/** The webfont has ARRIVED, by name — every width below is the webfont's, and
 *  `display=swap` sets the fallback until then (partners.spec.ts has the
 *  measurement that made this a rule). */
const fontsArrived = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fonts.status === "loaded" &&
          [...document.fonts].some(
            (face) =>
              face.family.includes("Atkinson Hyperlegible Next") && face.status === "loaded",
          ),
      ),
    )
    .toBe(true);

/** Boxes of the band's parts, plus where the word "Real" starts — the first
 *  word the editor's break sends to line two. */
const revised = (page: Page) =>
  page.evaluate((bandSel) => {
    const bandEl = document.querySelector(bandSel)!;
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
    };
    const h1 = bandEl.querySelector("h1")!;
    // "Real" as a Range: its first client rect is where the browser set it.
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    let real: { top: number; left: number } | null = null;
    let san: { top: number; left: number } | null = null;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent ?? "";
      for (const [word, set] of [
        ["Real", (r: DOMRect) => (real = { top: r.top, left: r.left })],
        ["San", (r: DOMRect) => (san = { top: r.top, left: r.left })],
      ] as const) {
        const at = text.indexOf(word);
        if (at === -1) continue;
        const range = document.createRange();
        range.setStart(n, at);
        range.setEnd(n, at + word.length);
        set(range.getClientRects()[0]);
      }
    }
    const links = [...bandEl.querySelectorAll("a")];
    return {
      band: box(bandEl)!,
      h1: box(h1)!,
      sub: box(bandEl.querySelector("h1 + p")),
      buttons: links.map((a) => box(a)!),
      real: real as { top: number; left: number } | null,
      san: san as { top: number; left: number } | null,
    };
  }, band);

test("at 1440 the band is ONE column on the gutter: headline, sentence, buttons, 30 apart", async ({
  page,
}) => {
  await page.setViewportSize(viewportFor(1440));
  await page.goto(HOME);
  await adopted(page);
  await fontsArrived(page);
  await expect(page.locator(`${band} a`)).toHaveText(["Properties", "Contact us"]);
  await expect(page.locator(`${band} h1 + p`)).toHaveText("A placeholder for a sentence to come.");
  // The old band's left-hand column held an h2 and a list. Both are gone.
  await expect(page.locator(`${band} ul`)).toHaveCount(0);
  await expect(page.locator(`${band} h2`)).toHaveCount(0);

  await expect
    .poll(async () => {
      const { band: b } = await revised(page);
      return b.right - b.left;
    }, "laid out at 1440")
    .toBe(1440);
  const g = await revised(page);
  const near = (actual: number, expected: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
      0.5,
    );

  // On the gutter — NOT the site's right column at 513, where it stood.
  near(g.h1.left - g.band.left, 80, "headline x (7091:651)");
  near(g.sub!.left, g.h1.left, "sentence on the headline's edge");
  near(g.buttons[0].left, g.h1.left, "first button on the headline's edge");
  // Two lines, broken after "Commercial": "Real" opens line two, flush left.
  near(g.h1.height, 160, "two 80px lines");
  expect(g.real, "the word Real was found").not.toBeNull();
  near(g.real!.left, g.h1.left, '"Real" starts line two');
  near(g.real!.top - g.san!.top, 80, '"Real" is one line below "San"');
  // The rhythm, cap box to box: 80 · 124 · 30 · 24 · 30 · 40 · 65.
  near(g.h1.top + H1_TRIM - g.band.top, 80, "headline cap top");
  near(g.sub!.top - (g.h1.bottom - H1_TRIM), 30, "sentence under the headline (7091:903)");
  near(g.sub!.height, 24, "Body 1 is 24 tall, untrimmed");
  near(g.buttons[0].top - g.sub!.bottom, 30, "buttons under the sentence (7091:652)");
  near(g.buttons[1].left - g.buttons[0].right, 20, "20 between the buttons");
  near(g.buttons[1].top, g.buttons[0].top, "on one row");
  near(g.band.bottom - g.buttons[0].bottom, 65, "garnet under the buttons");
  near(g.band.height, 393, "the band (the comp shows 392 with a 39px button)");
});

test("at 390 the same three stack on the 20px gutter, 30 apart", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(HOME);
  await adopted(page);
  await fontsArrived(page);
  const g = await revised(page);
  const near = (actual: number, expected: number, what: string) =>
    expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(
      0.5,
    );
  near(g.h1.left - g.band.left, 20, "headline x");
  near(g.sub!.left, g.h1.left, "sentence on the headline's edge");
  near(g.buttons[0].left, g.h1.left, "first button on the headline's edge");
  near(g.sub!.top - (g.h1.bottom - H2_TRIM), 30, "sentence under the headline");
  near(g.buttons[0].top - g.sub!.bottom, 30, "buttons under the sentence");
  near(g.band.bottom - g.buttons.at(-1)!.bottom, 60, "garnet under the buttons");
  // No forced break on a phone: the text flows (the br is display:none).
  await expect(page.locator(`${band} h1 br`)).toHaveCSS("display", "none");
});

test("the headline is two lines at every lg width: broken after Commercial from 1040, flowing below it", async ({
  page,
}) => {
  // The forced break is `min-[1040px]:inline`, not `lg:inline`, and this is
  // why. Measured in this browser on the served face at 66px: "San Antonio's
  // Commercial" 779, "Real Estate Experts Since 1983." 943. At the narrowest
  // `lg` VIEWPORT, 1024, the column is 945 (15px of scrollbar, 2 × 32 of
  // gutter): two pixels of margin here and none at all under a 17px scrollbar.
  // So from 1040 (column 961) the editor's break holds; from 1024 to 1039 the
  // text flows at 66px as "…Commercial Real / Estate Experts Since 1983.",
  // which is two lines too. Viewports here are viewports, not layouts, on
  // purpose: the media queries read the viewport.
  const h1 = page.locator(`${band} h1`);
  const br = h1.locator("br");
  await page.setViewportSize({ width: 1455, height: 900 });
  await page.goto(HOME);
  await fontsArrived(page);
  for (const width of [1935, 1455, 1295, 1100, 1040]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(br, `${width}`).toHaveCSS("display", "inline");
    await expect(h1, `${width}`).toHaveCSS("line-height", "80px");
    await expect
      .poll(async () => (await h1.boundingBox())!.height, `${width}: two lines`)
      .toBe(160);
    const g = await revised(page);
    expect(Math.abs(g.real!.left - g.h1.left), `${width}: "Real" opens line two`).toBeLessThan(0.5);
    expect(g.real!.top - g.san!.top, `${width}: one line below "San"`).toBe(80);
  }
  // 1024–1039: `lg`, so still 66px, but no forced break — the text flows, and
  // "Real" stays on line one. Still two lines: no orphaned "1983.".
  for (const width of [1039, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(br, `${width}`).toHaveCSS("display", "none");
    await expect(h1, `${width}`).toHaveCSS("line-height", "80px");
    await expect
      .poll(async () => (await h1.boundingBox())!.height, `${width}: two lines`)
      .toBe(160);
    const g = await revised(page);
    expect(g.real!.top - g.san!.top, `${width}: "Real" flows on line one`).toBe(0);
  }
  // One below `lg`: the H2 flows.
  await page.setViewportSize({ width: 1023, height: 900 });
  await expect(br).toHaveCSS("display", "none");
  await expect(h1).toHaveCSS("line-height", "48px");
});

test("the hero's CMS buttons reach the filesystem routes", { tag: "@smoke" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(HOME);
  await adopted(page);

  // The fixture stores /contact the way the editor does — `https:///contact` —
  // so this is $lib/cms-href end to end, in a browser.
  const hrefs = await page
    .locator(`${band} a`)
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(expect.arrayContaining(["/properties", "/contact"]));
});

test("a home document with NO hero slice still opens on the dark ground the bar floats over", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${HOME}?bare`);
  await adopted(page);

  await expect(page.locator(band), "no slice, no band").toHaveCount(0);
  await expect(page.locator(pin)).toHaveCount(1);
  await expect(page.locator(pin)).toHaveCSS("height", "528px");
  await expect(page.locator(pin)).toHaveCSS("background-color", DARK);
  expect((await page.locator(pin).boundingBox())!.y).toBe(0);
  await expect(page.locator(bar)).toHaveAttribute("data-floating", "");
});

test("with scripting off the hero still pins — it is CSS, not behaviour", async ({ browser }) => {
  // Its own context, so it states its own motion setting: the pin is
  // motion-safe only (#38), and `newContext` inherits nothing from `test.use`.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    reducedMotion: "no-preference",
    viewport: { width: 1440, height: 600 },
  });
  try {
    const page = await context.newPage();
    await page.goto(HOME, { waitUntil: "domcontentloaded" });
    await expect(page.locator(pin)).toHaveCSS("position", "sticky");
    // Not adopted: the floating bar stays `absolute` and will leave with the page.
    // That alone is also true of a script-on page before mount; the <noscript>
    // stylesheet hiding `[data-js-only]` is what only script-off produces.
    await expect(page.locator(bar)).toHaveCSS("position", "absolute");
    await expect(page.locator("[data-js-only]").first()).toHaveCSS("display", "none");

    const bandAtRest = (await page.locator(band).boundingBox())!.y;
    await page.mouse.wheel(0, 200);
    await expect
      .poll(async () => (await page.locator(band).boundingBox())!.y, "the band moved")
      .toBeLessThan(bandAtRest);
    expect((await page.locator(pin).boundingBox())!.y, "and the hero did not").toBe(0);
    const cutoutBox = (await page.locator(cutout).boundingBox())!;
    const bandBox = (await page.locator(band).boundingBox())!;
    expect(cutoutBox.y + cutoutBox.height).toBeCloseTo(bandBox.y, 1);
  } finally {
    await context.close();
  }
});

import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { hydrated } from "./hydrated";

// THE GROUND PAST BOTH ENDS OF THE PAGE. A rubber-band overscroll on a Mac
// pulls the scrolling contents away from the viewport and shows what is behind
// them. Behind them was `body`'s off-white #f2efe9 at BOTH ends: a white flash
// above the homepage's dark garnet hero and a pale band under the footer's sand
// (the operator's report, 2026-09-21).
//
// THE FIRST FIX WAS THE RIGHT IDEA THE WRONG WAY ROUND, and this file is mostly
// the record of that. A canvas has exactly one colour and the top of the page
// has three, so the first build put the FOOT on the canvas (`html`, sand,
// the same everywhere) and painted the TOP with an element at negative
// coordinates — `.canvas-top`, `position: absolute; bottom: 100%`, a viewport
// of the route's own colour seated on the document's y=0.
//
// The argument for it was that scrollable overflow only ever grows DOWN and
// RIGHT, so the element cost no scroll range. That is true, and it is the same
// sentence that kills it: the scroll origin is clamped at 0, so anything above
// it is clipped out of the scrollable area and no overscroll ever reaches it.
// The operator pulled on a real Mac on 2026-09-22 and saw sand — the canvas —
// exactly where the hero's #3d0707 was supposed to be.
//
// So it is inverted, and the two halves are now:
//
//   - the TOP is the CANVAS — `html { background-color: var(--canvas-top,
//     var(--color-background)) }`, with `--canvas-top` declared on `:root` by a
//     rule the root layout renders into the document HEAD from the route's own
//     `canvasTop` claim ($lib/canvas-top). The top is the end that cannot be
//     painted any other way, so it gets the one colour there is;
//   - the FOOT is the ELEMENT — `.canvas-foot`, zero height, rendered after the
//     footer, laying 100vh of sand below the last thing drawn with a
//     `box-shadow`. Painting below the document's end is the direction that is
//     NOT clipped, and `box-shadow` is specified not to contribute to
//     scrollable overflow, so this end still costs no scroll range.
//
// WHAT THIS FILE CAN AND CANNOT MEASURE, stated plainly because the previous
// version of it measured the wrong half and said so honestly and was believed
// anyway:
//
//   - the TOP is now DIRECTLY OBSERVABLE and needs no proxy at all. The colour
//     an overscroll shows at the top IS the root element's background, so
//     `getComputedStyle(document.documentElement).backgroundColor` is the
//     answer rather than a stand-in for it. That is the single biggest gain
//     from the inversion, and it is why the top tests below take no screenshot.
//   - the FOOT still needs one: headless Chromium cannot rubber-band, there is
//     no API for an overscroll, and `window.scrollTo(0, -120)` clamps to 0. So
//     the foot tests use the DEFENSIBLE PROXY — a pull translates the scrolling
//     contents, so the contents are translated from script and the pixel a pull
//     would expose is sampled where it lands. The proxy is checked before it is
//     trusted: every pull assertion reads `body`'s own rect and fails unless it
//     moved by exactly the pull. That a REAL two-finger pull reveals the same
//     pixels at the FOOT is still the operator's to confirm.
//
// TWO THINGS THE SHARED HARNESS FORCES:
//
//  - `contextOptions.reducedMotion: "reduce"` on every test. Combined with
//    app.css's `@media (prefers-reduced-motion: reduce) { *, *::before, *::after
//    { transition-duration: 0.01ms !important } }` and a computed
//    `transition-property: all`, EVERY style written from script starts a
//    transition, and a synchronous read back gets the OLD value. Measured here:
//    `document.body.style.transform = "translateY(120px)"` then
//    `getComputedStyle(document.body).transform` returns
//    `matrix(1, 0, 0, 1, 0, 0)` in the same task, and the element's rect is
//    unmoved. The first draft of this file did exactly that and sampled the
//    hero's own garnet while believing it had sampled the ground above it — a
//    vacuous green of precisely the shape CLAUDE.md warns about. Every write
//    from script therefore goes through `writeStyle`, which suppresses the
//    transition and POLLS until the page is wearing the declaration.
//  - a window is not a layout width. Every viewport here is a round layout
//    width plus 15, because nav.spec.ts records headless Chromium laying the
//    page out 15px narrower than its window under `scrollbar-gutter: stable` —
//    and something sharper: on the Linux CI runner `window.innerWidth` AND
//    `documentElement.clientWidth` both report 1440 while the bar is laid out
//    at 1425, so neither number sees the gutter. No width here is a literal
//    compared to `clientWidth`; every sampled x comes from a real element rect.
//
// The routes are the /dev/* fixtures, as in photo-band.spec.ts: the real layout
// over static data, no network, and the same three `canvasTop` states the
// shipping routes have (`dark` → /, `primary` → /properties and /contact, and
// none → a listing detail). The real routes were checked by hand on a
// production build; see docs/workJournal.md for the head bytes.

/** #3d0707 — HomeHero's flat ground, the homepage's `canvasTop: "dark"`. */
const DARK = [61, 7, 7];
/** #652323 — PageMasthead's top gradient stop, `canvasTop: "primary"`. */
const GARNET = [101, 35, 35];
/** #e8e1d1 — sand: the footer's foot, and the ground past it. */
const SAND = [232, 225, 209];
/** #f2efe9 — the page ground. What BOTH ends used to show, and the defect. */
const OFF_WHITE = [242, 239, 233];

const rgb = (c: number[]) => `rgb(${c.join(", ")})`;

/** How far the contents are pulled. Any value inside the viewport will do; 120
 *  is roughly a firm two-finger pull and leaves room to sample well inside the
 *  exposed band rather than on its edge. */
const PULL = 120;

const FOOT = ".canvas-foot";

/** The RGB of the pixel at a viewport point, from a real screenshot. The clip is
 *  2×2 and the centre pixel is taken from the decoded raster, so this is right
 *  at any device scale factor rather than assuming 1. */
async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  const shot = await page.screenshot({ clip: { x: x - 1, y: y - 1, width: 2, height: 2 } });
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const at = ((info.height >> 1) * info.width + (info.width >> 1)) * info.channels;
  return [data[at], data[at + 1], data[at + 2]];
}

/**
 * Write a declaration from script and WAIT until the page is actually wearing
 * it. Both halves are needed under this harness.
 *
 * `transition: none !important` first, because app.css gives every element a
 * 0.01ms transition under `reduce` and the computed `transition-property` is
 * `all`: without it the write starts a transition, and a transition's value
 * beats even an inline `!important` for as long as it runs. A real rubber-band
 * is a compositor translation with no CSS in it at all, so the transition is an
 * artifact of the proxy, not of the thing under test — suppressing it makes the
 * proxy faithful rather than lenient. An inline `!important` is what it takes:
 * the app's rule is itself `!important`.
 *
 * Then poll, because "I wrote it" is not "it is applied" — two frames was
 * enough on four of this file's tests and not on the other two, which is how a
 * fixed frame count fails: intermittently, and silently, by measuring the page
 * at rest.
 */
async function writeStyle(page: Page, selector: string, prop: string, value: string, want: string) {
  await page.evaluate(
    ([sel, name, v]) => {
      const el = document.querySelector(sel as string) as HTMLElement;
      el.style.setProperty("transition", "none", "important");
      if (v === "") el.style.removeProperty(name as string);
      else el.style.setProperty(name as string, v as string, "important");
    },
    [selector, prop, value] as const,
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          ([sel, name]) =>
            getComputedStyle(document.querySelector(sel as string)!).getPropertyValue(
              name as string,
            ),
          [selector, prop] as const,
        ),
      `${selector} never took ${prop}: ${value}`,
    )
    .toBe(want);
}

/** The two backgrounds the fix is made of, the foot element's box, and the
 *  document's own extent. */
const measure = (page: Page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el?.getBoundingClientRect();
    const body = document.body.getBoundingClientRect();
    const root = document.documentElement;
    return {
      rootGround: getComputedStyle(root).backgroundColor,
      canvasTopVar: getComputedStyle(root).getPropertyValue("--canvas-top").trim(),
      bodyGround: getComputedStyle(document.body).backgroundColor,
      bodyBox: { top: body.top, height: body.height },
      footCount: document.querySelectorAll(sel).length,
      footRect: r ? { top: r.top, height: r.height, width: r.width } : null,
      footShadow: el ? getComputedStyle(el).boxShadow : null,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
      scrollHeight: root.scrollHeight,
      scrollWidth: root.scrollWidth,
      innerHeight: window.innerHeight,
    };
  }, FOOT);

/** Translate the scrolling contents by `by` (negative = a pull at the FOOT) and
 *  report how far `body` actually MOVED. Deltas, not absolute positions: at the
 *  foot of a 3706px page body's top is already -2806 before anything is pulled.
 *  Every caller asserts the delta before reading a pixel — without that, a
 *  transform that silently failed to apply leaves the page at rest and the
 *  sample measures whatever happened to be on screen. */
async function pull(page: Page, by: number) {
  const before = await page.evaluate(() => document.body.getBoundingClientRect().top);
  await writeStyle(
    page,
    "body",
    "transform",
    `translateY(${by}px)`,
    `matrix(1, 0, 0, 1, 0, ${by})`,
  );
  const after = await page.evaluate(() => ({
    top: document.body.getBoundingClientRect().top,
    transform: getComputedStyle(document.body).transform,
  }));
  return { ...after, bodyMoved: after.top - before };
}

async function open(page: Page, url: string, width = 1455, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await hydrated(page);
}

// ───────────────────────────────────────────────────────────────────────────
// THE TOP. No proxy: the colour an overscroll shows above the document IS the
// root element's background, so these read it directly.
// ───────────────────────────────────────────────────────────────────────────

test.describe("the ground ABOVE the top of the document", () => {
  const ROUTES = [
    { url: "/dev/home", claim: "dark", colour: DARK, theme: "#3d0707" },
    { url: "/dev/properties", claim: "primary", colour: GARNET, theme: "#652323" },
  ] as const;

  for (const route of ROUTES) {
    test(`${route.url} claims "${route.claim}", so the CANVAS is that band's own ground`, async ({
      page,
    }) => {
      await open(page, route.url);
      const at = await measure(page);

      // THE WHOLE FIX, IN ONE READ. This is the colour a rubber-band shows,
      // not a stand-in for it.
      expect(at.rootGround, "the root's background is the band's ground").toBe(rgb(route.colour));
      expect(at.rootGround, "not the off-white the operator reported").not.toBe(rgb(OFF_WHITE));
      expect(at.rootGround, "and not the sand they saw after the first fix").not.toBe(rgb(SAND));

      // And it got there from the route's claim, through the head rule.
      // NOTE the browser hands back the RESOLVED value, not the `var(…)` text
      // the rule was written with — custom properties substitute at
      // computed-value time. That is the more useful read anyway: comparing it
      // to `theme-color` proves the stylesheet and the meta tag, which are two
      // separate spellings of the same colour by necessity, actually agree.
      expect(at.canvasTopVar, "--canvas-top is declared on :root").toBe(route.theme);
      expect(at.themeColor, "and the browser's own chrome is told the same").toBe(route.theme);
      expect(at.canvasTopVar, "the two spellings have not drifted").toBe(at.themeColor);

      // THE MUTATION, KEPT. Delete the layout's own <style> and the canvas
      // falls back to the page ground — the white flash that started this.
      // Without this step the assertion above would pass on a page where the
      // head rule did nothing, if the theme happened to make the fallback the
      // same colour.
      //
      // It removes the ELEMENT rather than clearing an inline property,
      // because there is no inline property to clear: the declaration is a
      // `:root` rule in a stylesheet, and `style.removeProperty` on `html`
      // silently does nothing to it. The first draft did exactly that and hung
      // for 5s polling for a value that was never going to change — a mutation
      // that fails to mutate, which is the one kind that must never be read as
      // "the test is fine".
      const removed = await page.evaluate(() => {
        // The DECLARATION, not every mention: app.css's own
        // `background-color: var(--canvas-top, …)` carries the string too, and
        // under `vite dev` that sheet is a <style> tag as well. Matching the
        // substring found two and deleting both would have taken the fallback
        // with it — the test would still have gone to off-white, for the wrong
        // reason, and proved nothing about the layout's rule.
        const tags = [...document.querySelectorAll("style")].filter((s) =>
          /:root\s*\{\s*--canvas-top:/.test(s.textContent ?? ""),
        );
        tags.forEach((s) => s.remove());
        return tags.length;
      });
      expect(removed, "the layout ships exactly one rule for this").toBe(1);
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
        .toBe(rgb(OFF_WHITE));
    });
  }

  test("a route that claims nothing keeps the page ground, and says so out loud", async ({
    page,
  }) => {
    await open(page, "/dev/property");
    const at = await measure(page);
    // Nothing is the answer, not an omission: $lib/canvas-top returns undefined
    // and app.css's own fallback stands.
    expect(at.canvasTopVar, "no --canvas-top is declared at all").toBe("");
    expect(at.rootGround, "so the canvas is the page ground").toBe(rgb(OFF_WHITE));
    // theme-color, unlike the rule, still ships — a route that omitted the tag
    // would keep whatever the PREVIOUS route set across a client-side nav.
    expect(at.themeColor, "and the tag is present anyway").toBe("#f2efe9");
  });

  test("the two claiming routes do not agree — a hard-coded colour cannot pass", async ({
    page,
  }) => {
    // Belt and braces for the block above: if the mechanism were stuck, both
    // routes would read the same and every per-route assertion would still
    // pass on whichever colour it was stuck at.
    await open(page, "/dev/home");
    const home = (await measure(page)).rootGround;
    await open(page, "/dev/properties");
    const properties = (await measure(page)).rootGround;
    expect(home).not.toBe(properties);
    expect([home, properties]).toEqual([rgb(DARK), rgb(GARNET)]);
  });

  test("with scripting off the colour is already right — it is the server's", async ({
    browser,
  }) => {
    // The rule is rendered into the head by the layout, so it is in the HTML
    // the server sent. A browser that never runs the bundle still gets it.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1455, height: 900 });
    await page.goto("/dev/home");
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
    ).toBe(rgb(DARK));
    await context.close();
  });

  test("naming the canvas did not stop body painting the page ground", async ({ page }) => {
    // The risk in the fix: `body`'s background reaches the canvas only while
    // `html` has none. Giving `html` one takes body OUT of that propagation —
    // which is the point — but body must then still paint #f2efe9 in its own
    // box, or every page turns the colour of its first band.
    await open(page, "/dev/properties");
    const at = await measure(page);
    expect(at.bodyGround, "body keeps a background of its own").toBe(rgb(OFF_WHITE));
    expect(at.bodyBox.top, "and its box starts at the document's top").toBe(0);
    expect(
      Math.abs(at.bodyBox.height - at.scrollHeight),
      "and runs the whole document — no strip anywhere for the canvas to show through",
    ).toBeLessThan(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// THE FOOT. The half that still needs the pull proxy.
// ───────────────────────────────────────────────────────────────────────────

test.describe("the ground PAST THE FOOT of the document", () => {
  test("it is one element, it has no height, and its colour is a shadow", async ({ page }) => {
    await open(page, "/dev/home");
    const at = await measure(page);
    expect(at.footCount, "the layout renders exactly one").toBe(1);
    expect(at.footRect!.height, "zero height, so it moves nothing").toBe(0);
    expect(at.footShadow, "and 100vh of sand hangs off it").toContain(rgb(SAND));
  });

  test("it costs the page NO scroll range, in EITHER axis", async ({ page }) => {
    // The trap this rule is shaped to avoid. A 100vh element here would paint
    // the right pixels and add a viewport of scroll to every page — overflow
    // DOWN is the half that is NOT clipped, which is the whole reason the foot
    // can be an element at all. `box-shadow` is specified not to contribute to
    // scrollable overflow; the shadow also runs 50vh wide of both edges, so the
    // horizontal axis is measured too.
    for (const url of ["/dev/home", "/dev/properties"]) {
      await open(page, url);
      const withIt = await measure(page);
      await page.evaluate((sel) => document.querySelector(sel)!.remove(), FOOT);
      const without = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(withIt.scrollHeight, `${url}: it added scroll height`).toBe(without.scrollHeight);
      expect(withIt.scrollWidth, `${url}: it added scroll width`).toBe(without.scrollWidth);
      expect(without.scrollWidth, `${url}: the page scrolls sideways`).toBeLessThanOrEqual(
        withIt.scrollWidth,
      );
    }
  });

  test("a pull at the foot exposes the footer's sand, seamlessly", async ({ page }) => {
    await open(page, "/dev/home");
    const at = await measure(page);

    // To the end of the page, then pull the contents UP.
    const reach = at.scrollHeight - at.innerHeight;
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), reach);
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBe(Math.round(reach));

    const footer = await page.locator("footer").boundingBox();
    expect(footer!.height, "a real footer").toBeGreaterThan(400);
    const x = Math.round(footer!.x + footer!.width / 2);

    const pulled = await pull(page, -PULL);
    expect(pulled.transform).toBe(`matrix(1, 0, 0, 1, 0, ${-PULL})`);
    expect(pulled.bodyMoved, "the contents were pulled up").toBe(-PULL);

    const exposed = await pixel(page, x, at.innerHeight - PULL / 2);
    expect(exposed, "the ground past the foot is sand").toEqual(SAND);
    expect(exposed, "not the off-white band the operator reported").not.toEqual(OFF_WHITE);
    // And it is SEAMLESS: the last row the footer actually paints is the same
    // colour, which is the whole reason sand is the right foot.
    const foot = await page.locator("footer").boundingBox();
    expect(await pixel(page, x, Math.round(foot!.y + foot!.height) - 3)).toEqual(SAND);

    // THE MUTATION, kept: take the shadow away and the exposed band falls back
    // to the CANVAS — which is now the homepage's dark garnet, not off-white.
    // Without this step the assertion above would pass on a page where the rule
    // did nothing, because sand is also what a lot of the footer is.
    await writeStyle(page, FOOT, "box-shadow", "none", "none");
    expect(
      await pixel(page, x, at.innerHeight - PULL / 2),
      "and with the shadow gone, the canvas shows through instead",
    ).toEqual(DARK);
  });
});

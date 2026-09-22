import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { hydrated } from "./hydrated";

// THE GROUND PAST BOTH ENDS OF THE PAGE. A rubber-band overscroll on a Mac
// pulls the scrolling contents away from the viewport and shows what is behind
// them. Behind them was `body`'s off-white #f2efe9 at BOTH ends: a white flash
// above the homepage's dark garnet hero and a pale band under the footer's sand
// (the operator's report, 2026-09-21).
//
// The fix is two halves, because a canvas has exactly one colour and the top of
// the page has three:
//
//   - the FOOT is the canvas — `html { background-color: var(--color-light) }`
//     in app.css, sand, the same on every route, because the footer is the last
//     band everywhere. Naming it there also takes `body` OUT of the root's
//     background propagation, so body paints #f2efe9 in its own box instead;
//   - the TOP is an ELEMENT at negative coordinates — `.canvas-top` in app.css,
//     rendered once by the root layout, coloured by the route's own `canvasTop`
//     claim ($lib/canvas-top). It sits entirely above the document's y=0, so it
//     adds nothing to the scroll range, while remaining part of the scrolling
//     CONTENTS — which is the layer a pull translates, and the whole reason it
//     is revealed by one.
//
// WHAT THIS FILE CANNOT DO, stated plainly because a test that implies more
// than it measures is worse than none: headless Chromium cannot rubber-band.
// There is no API for an overscroll, and `window.scrollTo(0, -120)` clamps to
// 0. So every test here uses the DEFENSIBLE PROXY: a pull translates the
// scrolling contents, so the contents are translated from script and the pixel
// that a pull would expose is sampled where it lands. The proxy is checked
// before it is trusted — the pull assertions read `body`'s own rect and the
// element's, and fail unless both moved by exactly the pull. That a REAL
// two-finger pull on a Mac reveals the same pixels is the operator's to
// confirm, and nothing in this file should be read as having confirmed it.
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
//    hero's own garnet while believing it had sampled `.canvas-top` — a
//    vacuous green of precisely the shape CLAUDE.md warns about. Every write
//    from script therefore goes through `writeStyle`, which suppresses the
//    transition and POLLS until the page is wearing the declaration.
//  - a window is not a layout width, and NEITHER IS `clientWidth`. Every
//    viewport here is a round layout width plus 15 because nav.spec.ts records
//    headless Chromium laying the page out 15px narrower than its window under
//    `scrollbar-gutter: stable` — and it records something sharper: on the
//    Linux CI runner `window.innerWidth` AND `documentElement.clientWidth` both
//    report 1440 while the bar is laid out at 1425, so neither number sees the
//    gutter. Measured on this machine at a 1455 window, all three agree at 1455
//    (an overlay scrollbar reserving nothing), which is exactly the pair of
//    behaviours an assertion must survive. So no width here is a literal and
//    none is compared to `clientWidth`: the element's width is compared to
//    `body`'s and to the root's own rect, boxes laid out against the same
//    containing block, which is right under either. Every sampled x likewise
//    comes from the element's own rect.
//
// The routes are the /dev/* fixtures, as in photo-band.spec.ts: the real layout
// over static data, no network, and the same three `canvasTop` states the
// shipping routes have (`dark` → /, `primary` → /properties and /contact, and
// none → a listing detail). A production build was checked by hand against
// `pnpm preview` on the real routes; see docs/workJournal.md for the numbers.

/** #3d0707 — HomeHero's flat ground, the homepage's `canvasTop: "dark"`. */
const DARK = [61, 7, 7];
/** #652323 — PageMasthead's top gradient stop, `canvasTop: "primary"`. */
const GARNET = [101, 35, 35];
/** #e8e1d1 — sand: the footer's foot, and now the canvas at both ends. */
const SAND = [232, 225, 209];
/** #f2efe9 — the page ground. What BOTH ends used to show, and the defect. */
const OFF_WHITE = [242, 239, 233];

/** How far the contents are pulled. Any value inside the viewport will do; 120
 *  is roughly a firm two-finger pull and leaves room to sample well inside the
 *  exposed band rather than on its edge. */
const PULL = 120;

const TOP = ".canvas-top";

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

/** Where `body` and `.canvas-top` are, in viewport coordinates. */
const boxes = (page: Page) =>
  page.evaluate(() => {
    const top = document.querySelector(".canvas-top")?.getBoundingClientRect();
    return {
      body: document.body.getBoundingClientRect().top,
      transform: getComputedStyle(document.body).transform,
      top: top ? { top: top.top, bottom: top.bottom, height: top.height } : null,
    };
  });

/**
 * The pull proxy, and its own evidence. Translates the scrolling contents by
 * `by` (positive = a pull at the TOP, negative = at the FOOT) and reports how
 * far `body` and `.canvas-top` actually MOVED. Deltas, not absolute positions:
 * `getBoundingClientRect()` is viewport-relative, so at the foot of a 3706px
 * page body's top is already -2806 before anything is pulled — the first draft
 * asserted the absolute -120 and went red at -2926, which is the mechanism
 * working exactly as intended.
 *
 * Every caller asserts these before reading a pixel. Without that, a transform
 * that silently failed to apply leaves the page at rest and the sample measures
 * whatever happened to be on screen.
 */
async function pull(page: Page, by: number) {
  const before = await boxes(page);
  await writeStyle(
    page,
    "body",
    "transform",
    `translateY(${by}px)`,
    `matrix(1, 0, 0, 1, 0, ${by})`,
  );
  const after = await boxes(page);
  return {
    ...after,
    bodyMoved: after.body - before.body,
    topMoved: after.top && before.top ? after.top.bottom - before.top.bottom : null,
  };
}

/** The element's box, the page's, and the two backgrounds the fix is made of. */
const measure = (page: Page) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("no .canvas-top");
    const r = el.getBoundingClientRect();
    const body = document.body.getBoundingClientRect();
    return {
      style: el.getAttribute("style"),
      ground: getComputedStyle(el).backgroundColor,
      position: getComputedStyle(el).position,
      rect: { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height },
      rootGround: getComputedStyle(document.documentElement).backgroundColor,
      bodyGround: getComputedStyle(document.body).backgroundColor,
      bodyBox: { top: body.top, height: body.height, width: body.width },
      docWidth: document.documentElement.getBoundingClientRect().width,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  }, TOP);

async function open(page: Page, url: string, width = 1455, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await hydrated(page);
  await expect(page.locator(TOP), "the layout renders exactly one").toHaveCount(1);
}

test.describe("the ground ABOVE the top of the document", () => {
  test("at rest it is one viewport tall, seated on y=0, and as wide as the page", async ({
    page,
  }) => {
    await open(page, "/dev/home");
    const at = await measure(page);

    expect(at.position).toBe("absolute");
    expect(at.scrollY, "measured at the top of the page").toBe(0);
    // The three numbers the mechanism is: its foot is the document's y=0, it is
    // a whole viewport tall, and it spans the layout width (NOT the window's —
    // 1455 here is 1440 of layout plus the 15px stable scrollbar gutter).
    expect(at.rect.bottom, "its foot is the document's own top edge").toBe(0);
    expect(at.rect.height, "a whole viewport tall").toBe(at.innerHeight);
    expect(at.rect.top, "so all of it lies above y=0").toBe(-at.innerHeight);
    expect(at.rect.left).toBe(0);
    expect(at.rect.width, "as wide as the page's own content box").toBe(at.bodyBox.width);
    expect(at.rect.width, "which is the root's box too").toBe(at.docWidth);

    // …and it follows the viewport, not one remembered size. The assertion is
    // against the page's OWN layout width and height, never the window's.
    await page.setViewportSize({ width: 405, height: 844 });
    await expect
      .poll(async () => (await measure(page)).innerHeight, "the phone viewport arrived")
      .toBe(844);
    const phone = await measure(page);
    expect(phone.rect.height, "still exactly one viewport").toBe(phone.innerHeight);
    expect(phone.rect.height, "which is a different number from before").not.toBe(at.rect.height);
    expect(phone.rect.width, "and still the full layout width").toBe(phone.bodyBox.width);
    expect(phone.rect.width).not.toBe(at.rect.width);
    expect(phone.rect.bottom, "still seated on y=0").toBe(0);
  });

  test("a pull at the top exposes the HOMEPAGE hero's garnet, not the page ground", async ({
    page,
  }) => {
    await open(page, "/dev/home");
    const at = await measure(page);
    // The route's claim, resolved: `canvasTop: "dark"` → HomeHero's flat #3d0707.
    expect(at.style).toBe("--canvas-top: var(--color-dark)");
    expect(at.ground).toBe(`rgb(${DARK.join(", ")})`);

    const pulled = await pull(page, PULL);
    // The proxy's own evidence, before any pixel is read: the contents really
    // moved, and the element moved WITH them — which is the property that makes
    // a rubber-band reveal it at all.
    expect(pulled.transform).toBe(`matrix(1, 0, 0, 1, 0, ${PULL})`);
    expect(pulled.bodyMoved, "the scrolling contents were pulled down").toBe(PULL);
    expect(pulled.topMoved, "and the ground came with them").toBe(PULL);
    expect(pulled.top!.bottom, "so its foot now sits inside the viewport").toBe(PULL);
    expect(pulled.top!.height, "without being relaid out").toBe(at.rect.height);

    // The exposed band is now viewport y ∈ [0, 120). Sample its middle, in the
    // element's own column.
    const x = Math.round(at.rect.left + at.rect.width / 2);
    const y = PULL / 2;
    expect(await pixel(page, x, y), "the hero's own dark garnet").toEqual(DARK);

    // THE DISCRIMINATOR. On this route the first band is the same colour, so
    // "it is garnet" alone would pass with no element at all. Take the element
    // away and the same pixel must change — to the canvas, which is sand.
    await page.evaluate((sel) => document.querySelector(sel)!.remove(), TOP);
    await expect(page.locator(TOP), "it really is gone for this reading").toHaveCount(0);
    const without = await pixel(page, x, y);
    expect(without, "with the element gone it is the bare canvas").toEqual(SAND);
    expect(without, "and never the off-white that caused the report").not.toEqual(OFF_WHITE);
  });

  test("on a masthead route it exposes the gradient's TOP stop", async ({ page }) => {
    await open(page, "/dev/properties");
    const at = await measure(page);
    // PageMasthead is `bg-gradient-to-b from-primary to-dark`: the pixel a pull
    // exposes continues `from-primary`, not the `to-dark` it ends on.
    expect(at.style).toBe("--canvas-top: var(--color-primary)");
    expect(at.ground).toBe(`rgb(${GARNET.join(", ")})`);

    const pulled = await pull(page, PULL);
    expect(pulled.bodyMoved).toBe(PULL);
    expect(pulled.topMoved).toBe(PULL);
    expect(pulled.top!.bottom).toBe(PULL);

    const x = Math.round(at.rect.left + at.rect.width / 2);
    expect(await pixel(page, x, PULL / 2)).toEqual(GARNET);
    await page.evaluate((sel) => document.querySelector(sel)!.remove(), TOP);
    await expect(page.locator(TOP)).toHaveCount(0);
    expect(await pixel(page, x, PULL / 2)).toEqual(SAND);
  });

  test("a route that claims nothing keeps the page ground — no declaration at all", async ({
    page,
  }) => {
    // A listing detail opens under a SOLID bar, so the layout pads <main> by
    // 70/80px and the thing above its y=0 is the page ground already. Claiming
    // nothing is the answer, not an omission: $lib/canvas-top returns undefined
    // and the CSS default `var(--color-background)` stands.
    await open(page, "/dev/property");
    const at = await measure(page);
    expect(at.style, "no --canvas-top is written at all").toBeNull();
    expect(at.ground).toBe(`rgb(${OFF_WHITE.join(", ")})`);

    const pulled = await pull(page, PULL);
    expect(pulled.bodyMoved).toBe(PULL);
    expect(pulled.topMoved).toBe(PULL);
    const x = Math.round(at.rect.left + at.rect.width / 2);
    expect(await pixel(page, x, PULL / 2), "the ground it already showed").toEqual(OFF_WHITE);
  });

  test("it costs the page NO scroll range, at either height", async ({ page }) => {
    // The claim written into app.css: scrollable overflow only ever grows down
    // and right, so a box entirely above y=0 adds nothing. Measured rather than
    // reasoned — with the element in the page and with it taken out.
    await open(page, "/dev/home");
    for (const height of [900, 400]) {
      await page.setViewportSize({ width: 1455, height });
      await expect.poll(async () => (await measure(page)).innerHeight).toBe(height);
      const both = await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        const withIt = document.documentElement.scrollHeight;
        const present = document.querySelectorAll(sel).length;
        const parent = el.parentNode!;
        const next = el.nextSibling;
        el.remove();
        const without = document.documentElement.scrollHeight;
        const absent = document.querySelectorAll(sel).length;
        parent.insertBefore(el, next);
        return {
          withIt,
          without,
          restored: document.documentElement.scrollHeight,
          present,
          absent,
        };
      }, TOP);
      // Not vacuous: the element was really there for one reading and really
      // gone for the other.
      expect(both.present, `one element at ${height}`).toBe(1);
      expect(both.absent, `and none for the second reading at ${height}`).toBe(0);
      expect(both.without, `the page is the same height without it at ${height}`).toBe(both.withIt);
      expect(both.restored, "and putting it back changes nothing").toBe(both.withIt);
    }

    // The other half of "no scroll range": the top of the page is still the top.
    await page.evaluate(() => window.scrollTo({ top: -400, behavior: "instant" }));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("with scripting off it is already there — the colour is the server's", async ({
    browser,
  }) => {
    // Nothing here needs script: the layout writes the custom property into the
    // style attribute server-side, and the rest is CSS. A browser that never
    // runs the bundle gets the same ground.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: "reduce",
      viewport: { width: 1455, height: 900 },
    });
    try {
      const page = await context.newPage();
      await page.goto("/dev/home", { waitUntil: "domcontentloaded" });
      await expect(page.locator(TOP)).toHaveCount(1);
      const at = await measure(page);
      expect(at.style).toBe("--canvas-top: var(--color-dark)");
      expect(at.ground).toBe(`rgb(${DARK.join(", ")})`);
      expect(at.rect.bottom).toBe(0);
      expect(at.rect.height).toBe(at.innerHeight);
      expect(at.rootGround).toBe(`rgb(${SAND.join(", ")})`);
    } finally {
      await context.close();
    }
  });
});

test.describe("the ground PAST THE FOOT of the document", () => {
  test("the canvas is the footer's sand, and a pull at the foot exposes it", async ({ page }) => {
    await open(page, "/dev/home");
    const at = await measure(page);
    expect(at.rootGround, "the root's own background is the canvas").toBe(
      `rgb(${SAND.join(", ")})`,
    );

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
    expect(exposed, "the canvas past the foot is sand").toEqual(SAND);
    expect(exposed, "not the off-white band the operator reported").not.toEqual(OFF_WHITE);
    // And it is SEAMLESS: the last row the footer actually paints is the same
    // colour, which is the whole reason sand is the right canvas.
    const foot = await page.locator("footer").boundingBox();
    expect(await pixel(page, x, Math.round(foot!.y + foot!.height) - 3)).toEqual(SAND);

    // THE MUTATION, kept: take the `html` background away and the exposed band
    // falls back to body's #f2efe9 — the pale strip under the sand that started
    // this. Without this step the assertion above would pass on a page where
    // the rule did nothing, because sand is also what a lot of the footer is.
    await writeStyle(page, "html", "background-color", "transparent", "rgba(0, 0, 0, 0)");
    expect(
      await pixel(page, x, at.innerHeight - PULL / 2),
      "and with the rule gone, the operator's pale band is back",
    ).toEqual(OFF_WHITE);
  });

  test("naming the canvas did not stop body painting the page ground", async ({ page }) => {
    // The risk in the fix: `body`'s background reaches the canvas only while
    // `html` has none. Giving `html` one takes body OUT of that propagation —
    // which is the point — but body must then still paint #f2efe9 in its own
    // box, or every page turns sand.
    await open(page, "/dev/properties");
    const at = await measure(page);
    expect(at.bodyGround, "body keeps a background of its own").toBe(
      `rgb(${OFF_WHITE.join(", ")})`,
    );
    expect(at.bodyBox.top, "and its box starts at the document's top").toBe(0);
    expect(
      Math.abs(at.bodyBox.height - at.scrollHeight),
      "and runs the whole document — no strip anywhere for the canvas to show through",
    ).toBeLessThan(1);
    expect(at.bodyBox.width, "and the full layout width").toBe(at.docWidth);

    // Measured, not reasoned: how much of what is on screen is body's paint.
    // Count the off-white pixels, then take body's background away and count
    // how many of those turned sand. Anything body was painting must change;
    // anything with a ground of its own must not.
    const raster = async () => {
      const { data, info } = await sharp(await page.screenshot())
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, step: info.channels, pixels: info.width * info.height };
    };
    const before = await raster();
    await writeStyle(page, "body", "background-color", "transparent", "rgba(0, 0, 0, 0)");
    const after = await raster();

    let ground = 0;
    let turned = 0;
    let changed = 0;
    const same = (b: Uint8Array | Buffer, i: number, c: number[]) =>
      b[i] === c[0] && b[i + 1] === c[1] && b[i + 2] === c[2];
    for (let i = 0; i < before.data.length; i += before.step) {
      const wasGround = same(before.data, i, OFF_WHITE);
      if (wasGround) ground++;
      if (wasGround && same(after.data, i, SAND)) turned++;
      if (!same(after.data, i, [before.data[i], before.data[i + 1], before.data[i + 2]])) changed++;
    }
    // Measured on this fixture at 1455×900 (1,309,500 px): 476,782 off-white,
    // of which 416,145 turn sand, out of 416,395 pixels that change at all —
    // the other ~250 are text antialiased against the ground. The thresholds
    // are loose enough for the fixture to grow a slice and tight enough that a
    // body with no background at all cannot pass.
    expect(ground, "a large part of the page really is the off-white ground").toBeGreaterThan(
      50_000,
    );
    expect(turned, "and body is what paints it").toBeGreaterThan(50_000);
    expect(changed - turned, "body's background does nothing else here").toBeLessThan(
      ground * 0.05,
    );
  });
});

import { readFileSync } from "node:fs";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { cameraAtRest, cameraProbeInstalled, watchCamera } from "./camera-probe";
import { hydrated } from "./hydrated";
import { GARNET, SAND } from "./palette";

// THE PER-SECTION MAP (#13), in the only place its promises can be checked.
//
// Five of them cannot be seen from jsdom, and two of those cannot be seen from
// a dev server either:
//
//  1. THE GEOMETRY. The comp's 397 x 595 panel top-aligned with the first card
//     on a 36.0 gap; 350 x 200 twenty below the divider and twenty above the
//     first card at 390; 512 x 827 and 390 x 200 full-bleed on the homepage
//     band, the phone one FIRST in the band and flush on the card.
//  2. THE PIN. S = 48 on every 1440 map, S = 22 on every 390 map, and the
//     comp's aspect either way (an element 0.901019 S tall, because the
//     viewBox stops at the tip).
//  3. THE EXPAND AFFORDANCE. Drawn at 390 and on neither 1440 map, painted
//     20.884 x 20.880 exactly 10.0 from the map's right and bottom edges,
//     inside a 44 x 44 target (WCAG 2.5.8).
//  4. THE LAZINESS. 426 KB of engine must not be in the first-paint path.
//     Measured as resource timings, before and after the box comes on screen.
//  5. THE ATTRIBUTION. OpenStreetMap data is ODbL; the comp has none anywhere
//     and this deliberately departs from it. The evidence is the string on the
//     page, never "no error appeared".
//
// /dev/properties and /dev/home are the fixtures the rest of tests/interaction
// measures on, for the same reason: they render the real components through
// the real layout over fixture data. /dev/a11y-fixtures is NOT used for any
// geometry here — its `max-w-3xl` wrapper squeezes every band (#87) — and its
// two map entries run with `engine="off"` so the axe gate never waits on a
// tile host.
//
// WHAT NEEDS THE NETWORK, AND WHAT DOES NOT. Everything above except (5) and
// the "pins are drawn" case is measured on markup and layout the app itself
// produces. The two that do reach tiles.openfreemap.org are their own tests,
// so a provider outage names itself instead of taking the file down.
const PROPERTIES = "/dev/properties";
const HOME = "/dev/home";
/** The live routes, for the cases that must also hold on a production build:
 *  under `REDDOOR_GATE_SERVER=preview` every /dev/* route 404s (#120). The
 *  control column, the credit and the licence line are measured here, since
 *  nothing about them depends on the fixture's listings — both pages open
 *  their first map on a section with pins (Land; the band's three picks).
 *
 *    pnpm exec playwright test tests/interaction/property-map.spec.ts
 *    REDDOOR_GATE_SERVER=preview pnpm exec playwright test \
 *      tests/interaction/property-map.spec.ts --grep "control column|credit|attribution" */
const LIVE_PROPERTIES = "/properties";
const LIVE_HOME = "/";

const MAP = "[data-property-map]";
/** The credit's OpenStreetMap link — the licence line itself. */
const OSM = 'a[href="https://www.openstreetmap.org/copyright"]';

/** Positive evidence the engine drew a frame: `data-map-ready` is set by
 *  MapLibre's own `load`, not by the import resolving. */
const drawn = (page: Page, nth = 0) =>
  expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", { timeout: 25_000 });

async function at(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  return { context, page };
}

const rect = (page: Page, selector: string, nth = 0) =>
  page
    .locator(selector)
    .nth(nth)
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
        w: r.width,
        h: r.height,
      };
    });

test.describe("the no-JS state is the content, not a blank box", () => {
  test("the server ships one Google Maps link per listing, on both pages", async ({ page }) => {
    // Asserted on the SSR bytes: the whole claim is that this is in the
    // response, not added by the client.
    //
    // The ATTRIBUTE, not the bare name: PropertyMap's scoped `<style>` block
    // carries `[data-map-ready] [data-map-link]:focus`, and Svelte inlines
    // that selector into the page's own stylesheet — so a count of the plain
    // string reads one too many (7 for six links, 4 for three) and would have
    // been quietly "right" the day someone deleted a link.
    const listing = await (await page.request.get(PROPERTIES)).text();
    const links = listing.match(/data-map-link=""/g) ?? [];
    // The fixture portfolio: 4 land + 2 improved active listings with pins.
    // Past Projects gets no map at all, which is the next assertion, and the
    // archived land listing gets no pin (a leak reads 7).
    expect(links.length, `${PROPERTIES} server-renders a link per pin`).toBe(6);
    expect(listing).toContain("https://www.google.com/maps/search/?api=1&amp;query=");

    const home = await (await page.request.get(HOME)).text();
    expect((home.match(/data-map-link=""/g) ?? []).length).toBe(3);
  });

  test("the Past Projects section gets no map, as the comp says of Sold", async ({ page }) => {
    await page.goto(PROPERTIES);
    const past = page.locator('section[aria-labelledby="listing-past"]');
    await expect(past).toHaveCount(1);
    await expect(past.locator(MAP)).toHaveCount(0);
  });

  // WHAT THIS CASE ASSERTED UNTIL #122, and why it no longer can. It read
  // "with scripting off the links are visible": every listing's title drawn as
  // a link, 40px wide or more, on the tone's ground. That WAS the no-JS state,
  // and #13's definition of done — "not a blank box" — was met by it.
  //
  // It is not a blank box now either; it is a MAP. The committed raster of
  // MAP_HOME is painted from the server with this section's real pins over it,
  // so the list would be drawn ON TOP of a picture of the thing it describes,
  // and it goes `sr-only` exactly as it does once the canvas arrives. The
  // claim below is the same promise moved: nothing is unreachable, because
  // every pin is a link to the same Google Maps URL its row carries.
  //
  // THE COST, SAID PLAINLY, because it is a real one: a sighted visitor with
  // scripting off no longer gets a readable list of listing NAMES in this box,
  // and a CLUSTERED listing has no pin of its own to press. They keep the
  // cards below, which carry every listing with its own link. The journal
  // entry for #122 records this as the trade it is.
  test("with scripting off the box is a map with pressable pins, and the list is its equivalent", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    try {
      const page = await context.newPage();
      await page.goto(PROPERTIES, { waitUntil: "domcontentloaded" });

      // The picture, and the frame a 200px box takes.
      const picture = page.locator(`${MAP} [data-map-home-box]`).first();
      await expect(picture).toHaveCount(1);
      const compact = picture.locator('[data-map-home-frame="compact"]');
      await expect(compact).toHaveCSS("display", "block");
      await expect(picture.locator('[data-map-home-frame="full"]')).toHaveCSS("display", "none");

      // The list is still complete and still named — visually hidden, not
      // removed. Six listings in this section, as before.
      const links = page.locator(`${MAP} [data-map-link]`);
      await expect(links).toHaveCount(6);
      const rows = await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")));

      // And every pin the picture draws is a link to one of those same places,
      // really on screen rather than clipped: this is what replaces the "40px
      // wide" non-vacuity check above.
      const pins = compact.locator("[data-map-home-pin]");
      const count = await pins.count();
      expect(count, "the picture drew pressable pins").toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        const box = await pins.nth(i).boundingBox();
        expect(box!.width, `pin ${i} width with scripting off`).toBeGreaterThan(10);
        expect(box!.height, `pin ${i} height with scripting off`).toBeGreaterThan(10);
        expect(rows).toContain(await pins.nth(i).getAttribute("href"));
      }

      // `data-js-only` in app.html's <noscript> block: a control whose whole
      // job needs script is not offered to a browser that has declared it
      // will never run any.
      await expect(page.locator("[data-map-expand]")).toBeHidden();
    } finally {
      await context.close();
    }
  });
});

test.describe("where the comp draws it", () => {
  test("1440: a 595-tall panel top-aligned with the first card, 36 away", async ({ browser }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const map = await rect(page, MAP);
      const card = await rect(page, "article");
      expect(map.h, "the comp's 595, never stretched to the list").toBe(595);
      expect(card.left - map.right, "the comp's 36.0 gap").toBeCloseTo(36, 0);
      expect(map.top - card.top, "top-aligned with the first card").toBeCloseTo(0, 0);
      // The section's list is far taller than 595; a stretched map would be
      // as tall as it. This is the assertion `h-full` would have failed.
      // `:not([data-map-list])` because the map's OWN list is a <ul> inside a
      // <section> too, and it is first in the DOM — reading that one measured
      // the map's height against itself and passed for the wrong reason.
      const list = await rect(page, "section ul:not([data-map-list])");
      expect(list.h, "the list is taller than the map").toBeGreaterThan(map.h + 200);
      // M1: expand on every map, 1440 included (it used to be phone-only).
      expect(await page.locator(`${MAP} [data-map-expand]`).count(), "expand at 1440").toBe(
        await page.locator(MAP).count(),
      );
    } finally {
      await context.close();
    }
  });

  test("390: 200 tall on the page gutter, 20 under the divider and 20 over the card", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const map = await rect(page, MAP);
      const card = await rect(page, "article");
      const divider = await rect(page, "section .border-t-2");
      expect(map.h, "the comp's 200").toBe(200);
      expect(map.left, "the page's own px-5 gutter").toBeCloseTo(20, 0);
      expect(card.top - map.bottom, "20 above the first card").toBeCloseTo(20, 0);

      // 20 BELOW THE DIVIDER BLOCK, WHICH MEASURES 10.6 BETWEEN THE BOXES, and
      // the 9.4 is not slack. `t-h3` carries `margin-block: -9.4px` (app.css,
      // the (34.8 − 16) / 2 line-height trim that puts the label's cap where
      // the comp draws it). That bottom margin has no padding or border
      // between it and the divider block's outer edge, so it collapses all the
      // way out and pulls the next block up by exactly 9.4 — the LAYOUT gap is
      // the comp's 20, the gap between the two rects is 20 − 9.4. Asserting 20
      // here would have meant deleting the trim.
      expect(map.top - divider.bottom, "the comp's 20, less the t-h3 trim").toBeCloseTo(10.6, 0);
      const wrapper = await rect(page, "section .lg\\:grid");
      expect(map.top - wrapper.top, "…and 20 from the layout box").toBeCloseTo(20, 0);

      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        "nothing pushed the page sideways",
      ).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });

  test("the homepage band: full bleed at both widths, and FIRST on the phone", async ({
    browser,
  }) => {
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      const { context, page } = await at(browser, width, height);
      try {
        await page.goto(HOME);
        await hydrated(page);
        const slot = await rect(page, "[data-map-slot]");
        const card = await rect(page, "[data-featured-card]");
        const band = await rect(page, ".featured-band");
        expect(slot.left, `${width}: flush to the left edge`).toBeCloseTo(0, 0);
        expect(slot.top - band.top, `${width}: at the top of the band`).toBeCloseTo(0, 0);
        if (width >= 1024) {
          expect(slot.h, "1440: the band's whole height").toBeCloseTo(band.h, 0);
          expect(card.left - slot.right, "1440: no gap to the card").toBeCloseTo(0, 0);
        } else {
          expect(slot.h, "390: the comp's 200").toBe(200);
          // The map is LAST in the DOM and first on the phone — `order`, so a
          // screen reader still meets the card's content first.
          expect(card.top - slot.bottom, "390: flush on top of the card").toBeCloseTo(0, 0);
          const domOrder = await page.evaluate(() => {
            const band = document.querySelector(".featured-band")!;
            return [...band.children].map((c) =>
              c.hasAttribute("data-map-slot") ? "map" : "card",
            );
          });
          expect(domOrder, "the card is first in the DOM").toEqual(["card", "map"]);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          `${width}: no horizontal overflow`,
        ).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }
  });
});

test.describe("the expand affordance", () => {
  test("is the comp's box at 10.0 from two edges, inside a 44px target", async ({ browser }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const button = page.locator(`${MAP} [data-map-expand]`).first();
      await expect(button).toBeVisible();
      const map = await rect(page, MAP);
      const target = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      const painted = await button
        .locator("span")
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            w: r.width,
            h: r.height,
            right: r.right,
            bottom: r.bottom,
            bg: cs.backgroundColor,
          };
        });
      // WCAG 2.5.8 is the 44; the comp's 20.88 is what is painted inside it.
      expect(target.w, "target width").toBeGreaterThanOrEqual(44);
      expect(target.h, "target height").toBeGreaterThanOrEqual(44);
      expect(painted.w, "the comp's 20.884").toBeCloseTo(20.884, 1);
      expect(painted.h, "the comp's 20.880").toBeCloseTo(20.88, 1);
      expect(map.right - painted.right, "10.0 from the right edge").toBeCloseTo(10, 1);
      expect(map.bottom - painted.bottom, "10.0 from the bottom edge").toBeCloseTo(10, 1);
      expect(painted.bg, "solid garnet").toBe(GARNET);
    } finally {
      await context.close();
    }
  });

  // M1 (operator call 2026-09-28): expanded is one full-window overlay at every
  // width, above the nav, with the page held still behind it.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`at ${viewport.width} it fills the window over the nav, holds the page, traps focus, and Escape comes back`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, viewport.width, viewport.height);
      try {
        await page.goto(PROPERTIES);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        const before = await rect(page, MAP);
        const card = await rect(page, "article");
        const y0 = await page.evaluate(() => window.scrollY);
        const button = map.locator("[data-map-expand]");

        await button.click();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await expect(button).toHaveAttribute("aria-label", /Collapse/);
        await expect
          .poll(() =>
            map.evaluate((el) => {
              const r = el.getBoundingClientRect();
              // The WINDOW, strip included: the scroll lock releases app.css's
              // `scrollbar-gutter: stable` so the overlay covers a classic
              // scrollbar's 15px (#172; overlay-gutter.spec.ts has the pixels).
              return [r.left, r.top, r.width - innerWidth, r.height - innerHeight];
            }),
          )
          .toEqual([0, 0, 0, 0]);
        expect(
          await map.evaluate((el) => el.contains(document.elementFromPoint(innerWidth / 2, 10))),
          "the map, not the nav, is on top",
        ).toBe(true);
        const still = await rect(page, "article");
        expect(still.top, "the spacer holds the slot: the first card did not move").toBeCloseTo(
          card.top,
          1,
        );

        for (let i = 0; i < 10; i++) {
          await page.keyboard.press("Tab");
          expect(
            await map.evaluate((el) => el.contains(document.activeElement)),
            `Tab ${i + 1} stays in the map`,
          ).toBe(true);
        }
        await page.keyboard.press("End");
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => window.scrollY), "the page behind is held").toBe(y0);

        await page.keyboard.press("Escape");
        await expect(button).toHaveAttribute("aria-expanded", "false");
        await expect.poll(() => button.evaluate((el) => el === document.activeElement)).toBe(true);
        await expect.poll(async () => (await rect(page, MAP)).h).toBe(before.h);
      } finally {
        await context.close();
      }
    });
  }
});

// M1 + P3, and option two (operator call 2026-09-29, "happy not to have the
// zoom buttons on mobile since we've thumbs"): + above − above expand on a
// FULL frame, expand alone on a COMPACT one, bottom-right either way. The
// frame is the map's own height (`frameFor`), so at 390 both the Properties
// map and the band's are compact (200 tall) and at 1440 both are full.
test.describe("the control column", () => {
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const)
    for (const { viewport, column } of [
      { viewport: { width: 390, height: 844 }, column: ["expand"] },
      { viewport: { width: 1440, height: 900 }, column: ["zoom-in", "zoom-out", "expand"] },
    ])
      test(`${where} at ${viewport.width}: ${column.join(", ")} — garnet boxes 10 from the right, 44px targets that hit-test to themselves`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, viewport.width, viewport.height);
        try {
          await page.goto(route);
          await hydrated(page);
          await page.locator(MAP).first().scrollIntoViewIfNeeded();
          // Drawn FIRST: + and − wait for `ready` on every frame, so a map
          // that had not drawn would show expand alone for the wrong reason.
          await drawn(page);
          await page.locator(`${MAP} [data-map-control="expand"]`).first().scrollIntoViewIfNeeded();
          const read = await page
            .locator(MAP)
            .first()
            .evaluate((map) => {
              const m = map.getBoundingClientRect();
              return [...map.querySelectorAll("[data-map-control]")].map((b) => {
                const t = b.getBoundingClientRect();
                const span = b.querySelector("span")!;
                const p = span.getBoundingClientRect();
                const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
                return {
                  which: b.getAttribute("data-map-control"),
                  target: t.width >= 44 && t.height >= 44,
                  right: Math.round((m.right - p.right) * 10) / 10,
                  bottom: Math.round((m.bottom - p.bottom) * 10) / 10,
                  hits: !!hit && b.contains(hit),
                  bg: getComputedStyle(span).backgroundColor,
                };
              });
            });
          expect(read.map((r) => r.which)).toEqual(column);
          // Expand is at the comp's 10 on both frames: with + and − gone the
          // column is shorter, and its bottom-anchored last button is where it
          // was — nothing jumps when a map changes frame.
          expect(
            read.map((r) => r.bottom),
            "stacked 44 apart from the comp's 10",
          ).toEqual([98, 54, 10].slice(-column.length));
          for (const r of read) {
            expect(r.right, `${r.which} 10 from the right`).toBe(10);
            expect(r.target, `${r.which} 44 x 44`).toBe(true);
            expect(r.hits, `${r.which} is what a press there hits`).toBe(true);
            expect(r.bg, `${r.which} garnet`).toBe(GARNET);
          }
        } finally {
          await context.close();
        }
      });

  // WCAG 2.5.1: a pinch is two pointers and a double-tap only zooms IN, so
  // the one-pointer way out of a zoom on a phone is expand, then −. The
  // expanded overlay is the window — a full frame — so it has all three.
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const)
    test(`${where} at 390, expanded: + and − come back and − zooms out; collapsed, they go`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 390, 844);
      try {
        await watchCamera(page);
        await page.goto(route);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        expect(await cameraProbeInstalled(page)).toBe(true);
        const column = () =>
          map.evaluate((el) =>
            [...el.querySelectorAll("[data-map-control]")].map((b) =>
              b.getAttribute("data-map-control"),
            ),
          );
        const zoom = () =>
          map.evaluate((el) => {
            const m = (
              window.__camera.maps as unknown as {
                getContainer(): HTMLElement;
                getZoom(): number;
              }[]
            ).find((x) => el.contains(x.getContainer()))!;
            return m.getZoom();
          });
        expect(await column(), "inline, compact: expand alone").toEqual(["expand"]);

        await map.locator("[data-map-expand]").click();
        await expect(map).toHaveAttribute("data-expanded", "true");
        await expect
          .poll(column, { message: "expanded: the whole column" })
          .toEqual(["zoom-in", "zoom-out", "expand"]);
        // At rest first: expanding changes the frame, and the camera re-homes
        // to the full frame's MAP_HOME (or flies to the band's slide) — a
        // read inside that move is not the zoom − steps from.
        await cameraAtRest(page);
        const z0 = await zoom();
        await map.locator('[data-map-control="zoom-out"]').click();
        await expect.poll(zoom, { message: "one press, one level out" }).toBeCloseTo(z0 - 1, 2);

        await page.keyboard.press("Escape");
        await expect(map).not.toHaveAttribute("data-expanded", "true");
        await expect.poll(column, { message: "collapsed: expand alone again" }).toEqual(["expand"]);
      } finally {
        await context.close();
      }
    });

  test("+ zooms one whole level and − comes back, and the page does not move", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await watchCamera(page);
      await page.goto(PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      expect(await cameraProbeInstalled(page)).toBe(true);
      const zoom = () =>
        map.evaluate((el) => {
          const m = (
            window.__camera.maps as unknown as {
              getContainer(): HTMLElement;
              getZoom(): number;
            }[]
          ).find((x) => el.contains(x.getContainer()))!;
          return m.getZoom();
        });
      const z0 = await zoom();
      const y0 = await page.evaluate(() => window.scrollY);
      await map.locator('[data-map-control="zoom-in"]').click();
      await expect.poll(zoom).toBeCloseTo(z0 + 1, 2);
      await map.locator('[data-map-control="zoom-out"]').click();
      await expect.poll(zoom).toBeCloseTo(z0, 2);
      expect(await page.evaluate(() => window.scrollY)).toBe(y0);
    } finally {
      await context.close();
    }
  });

  // #154. Measured on the real engine: Shift+arrows used to turn it.
  test("the keyboard cannot rotate the map; a plain arrow still pans it — the control", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await watchCamera(page);
      await page.goto(PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      const read = () =>
        map.evaluate((el) => {
          const m = (
            window.__camera.maps as unknown as {
              getContainer(): HTMLElement;
              getBearing(): number;
              getCenter(): { lng: number };
            }[]
          ).find((x) => el.contains(x.getContainer()))!;
          return { bearing: m.getBearing(), lng: m.getCenter().lng };
        });
      await map.locator("canvas").focus();
      const start = await read();
      for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(600);
      expect((await read()).bearing, "no rotation").toBe(0);
      await page.keyboard.press("ArrowLeft");
      await expect.poll(async () => (await read()).lng).not.toBeCloseTo(start.lng, 5);
    } finally {
      await context.close();
    }
  });

  // The band's `cream` ground made the floor ring off-white on the off-white
  // map, and the root's overflow clipped it. The ring is on the painted box now.
  test("the band's focused expand shows a garnet ring, at least 3:1 on the map ground", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(HOME);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      const expand = page.locator(`${MAP} [data-map-expand]`).first();
      await expect(expand).toBeVisible();
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          expand.evaluate((el) => {
            (el as HTMLElement).focus();
            const cs = getComputedStyle(el.querySelector("span")!);
            return {
              showing: el.matches(":focus-visible"),
              color: cs.outlineColor,
              style: cs.outlineStyle,
              width: cs.outlineWidth,
            };
          }),
        )
        .toEqual({ showing: true, color: GARNET, style: "solid", width: "2px" });
      const ground = /MAP_HOME_GROUND = "(#[0-9a-f]{6})"/i.exec(
        readFileSync("src/lib/map-home.ts", "utf-8"),
      )![1]!;
      expect(contrast(GARNET, ground), `garnet on ${ground}`).toBeGreaterThanOrEqual(3);
    } finally {
      await context.close();
    }
  });

  // D4: a pin pressed in the expanded /properties map closes it onto the card.
  test("a pin pressed in the expanded Properties map closes it and leaves the page on the card", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      const button = map.locator("[data-map-expand]");
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      const pin = map.locator("[data-map-pin]").first();
      const id = (await pin.getAttribute("data-map-pin"))!;
      await pin.click();
      await expect(button).toHaveAttribute("aria-expanded", "false");
      const centred = () =>
        page.evaluate((id) => {
          const r = document.querySelector(`[data-centre-id="${id}"]`)!.getBoundingClientRect();
          return r.top < innerHeight && r.bottom > 0;
        }, id);
      await expect.poll(centred, { message: `${id}'s card is on screen` }).toBe(true);
      const y = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(500);
      expect(
        await page.evaluate(() => window.scrollY),
        "focus going back did not scroll away",
      ).toBe(y);
      expect(await centred()).toBe(true);
    } finally {
      await context.close();
    }
  });
});

/** WCAG contrast of two colours, `rgb(r, g, b)` or `#rrggbb`. */
function contrast(a: string, b: string) {
  const rgb = (c: string) =>
    c.startsWith("#")
      ? [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
      : c.match(/\d+/g)!.slice(0, 3).map(Number);
  const lum = (c: string) => {
    const [r, g, b2] = rgb(c).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// THE CREDIT, BY FRAME (operator call 2026-09-29, option two: "plus the (i)
// credit"). A full frame keeps the whole chip; a compact one gets MapLibre's
// own collapsed (i), which opens onto the same line. Both boxes are the no-pin
// zones plan guard 2i walks in src/lib/property-map.test.ts, so the geometry
// asserted here is that guard's transcription, held to the rendered page.
//
// 768 IS THE CASE MAPLIBRE'S OWN RULE GETS WRONG. Its `compact` reading is "the
// container is 640 or narrower", and a 768 window's compact map is 689 wide: a
// control built `compact: false` there loses the compact classes on the next
// `resize` and shows the whole chip on a 200px map. So the frame decides the
// option at construction, and this width is what can tell.
test.describe("the credit", () => {
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const) {
    test(`${where} at 1440: the whole chip, OpenStreetMap on it with no press, inside guard 2i's box`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 1440);
      try {
        await page.goto(route);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        await expect(map.locator(OSM), "no press needed on a full frame").toBeVisible();
        await expect(map.locator(".maplibregl-ctrl-attrib summary")).toBeHidden();
        const chip = await map.evaluate((el) => {
          const m = el.getBoundingClientRect();
          const c = el.querySelector(".maplibregl-ctrl-attrib")!;
          const r = c.getBoundingClientRect();
          return {
            compact: c.classList.contains("maplibregl-compact"),
            left: r.left - m.left,
            bottom: m.bottom - r.bottom,
            w: r.width,
            h: r.height,
          };
        });
        expect(chip.compact, "the whole chip").toBe(false);
        expect(chip.left, "flush left").toBeCloseTo(0, 1);
        expect(chip.bottom, "flush bottom").toBeCloseTo(0, 1);
        // Guard 2i's full-frame chip is 224 x 18, measured here in Chromium.
        // The width is the credit's TEXT, so it is a font's: if this goes red
        // on a machine that sets it wider, widen the guard's box to match.
        expect(chip.w, "no wider than guard 2i's chip").toBeLessThanOrEqual(224.5);
        expect(chip.h, "no taller than guard 2i's chip").toBeLessThanOrEqual(18.5);
      } finally {
        await context.close();
      }
    });

    for (const width of [320, 390, 768])
      test(`${where} at ${width}: the (i), 24 x 24 at 10 from two edges; a press or Enter opens it onto OpenStreetMap`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, width, 844);
        try {
          await page.goto(route);
          await hydrated(page);
          const map = page.locator(MAP).first();
          await map.scrollIntoViewIfNeeded();
          await drawn(page);
          const summary = map.locator(".maplibregl-ctrl-attrib summary");
          // Visible first, so the hidden line below is COLLAPSED and not a
          // credit that never arrived.
          await expect(summary, "the (i) is drawn").toBeVisible();
          await expect(map.locator(OSM), "collapsed at rest: no line").toBeHidden();
          const geometry = () =>
            map.evaluate((el) => {
              const m = el.getBoundingClientRect();
              const c = el.querySelector(".maplibregl-ctrl-attrib")!;
              const r = c.getBoundingClientRect();
              const s = c.querySelector("summary")!.getBoundingClientRect();
              const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
              return {
                compact: c.classList.contains("maplibregl-compact"),
                left: r.left - m.left,
                bottom: m.bottom - r.bottom,
                right: r.right - m.left,
                w: r.width,
                h: r.height,
                target: [s.width, s.height],
                hits: !!hit && c.querySelector("summary")!.contains(hit),
                strip: m.width - 54,
              };
            });
          const rest = await geometry();
          expect(rest.compact).toBe(true);
          // Guard 2i's compact credit, exactly: 24 x 24, 10 from the left and
          // the bottom — and a 24 x 24 target, WCAG 2.5.8's minimum.
          expect([rest.left, rest.bottom, rest.w, rest.h]).toEqual([10, 10, 24, 24]);
          expect(rest.target, "a 24 x 24 target").toEqual([24, 24]);
          expect(rest.hits, "the (i) is what a press there hits").toBe(true);

          await summary.click();
          await expect(map.locator(OSM), "a press opens it onto the licence line").toBeVisible();
          await expect(map.locator(".maplibregl-ctrl-attrib")).toContainText(
            "OpenStreetMap contributors",
          );
          const open = await geometry();
          // Open, it stays out of the control column's strip, so expand is
          // never painted over the end of the line (at 320 it wraps instead).
          expect(open.right, "clear of the control column").toBeLessThanOrEqual(open.strip);
          expect(
            await map.locator(OSM).evaluate((a) => {
              const r = a.getBoundingClientRect();
              const found = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!found && (found === a || a.contains(found));
            }),
            "the OpenStreetMap link is what a press on it hits",
          ).toBe(true);
          await summary.click();
          await expect(map.locator(OSM), "a second press closes it").toBeHidden();

          // The keyboard: a native <summary>, in the tab order, garnet ring.
          await summary.focus();
          await page.keyboard.press("Enter");
          await expect(map.locator(OSM), "Enter opens it").toBeVisible();
          // POLLED, because the site's reduced-motion reset gives every element
          // a 0.01ms `transition: all` — the ring's width transitions from
          // maplibre's `outline: none` (medium, 3px) to 2px, and a read in the
          // same frame as the key press sees the 3px it started from.
          await expect
            .poll(
              () =>
                summary.evaluate((el) => {
                  const cs = getComputedStyle(el);
                  return { style: cs.outlineStyle, color: cs.outlineColor, width: cs.outlineWidth };
                }),
              { message: "the column's ring" },
            )
            .toEqual({ style: "solid", color: GARNET, width: "2px" });
          await page.keyboard.press("Enter");
          await expect(map.locator(OSM), "and Enter closes it").toBeHidden();
        } finally {
          await context.close();
        }
      });
  }
});

test.describe("the engine, and what it costs", () => {
  test("is not in the first-paint path, and arrives when the box is", async ({ browser }) => {
    // A short window so the homepage band is clear of the fold — the
    // non-vacuity guard below is the point: if the map were on screen,
    // "not loaded yet" would be meaningless. Measured at 390 x 640 on
    // /dev/home: the map slot's top is y=921 with the revised one-column hero
    // (2026-09-28; the band is 393 tall under the 528px photo), 281px below
    // the fold. It was 1149 under the old two-column band.
    const { context, page } = await at(browser, 390, 640);
    try {
      await page.goto(HOME);
      await hydrated(page);

      // TWO CHANNELS, BECAUSE ONE OF THEM ONLY WORKS HERE. The name test is
      // the readable one and it is DEV-ONLY: this suite runs against
      // `vite dev` (package.json sets no `reddoor.gateServer`), where the
      // engine is served as /node_modules/.vite/deps/maplibre-gl.js. On a
      // production build the chunk is content-hashed — measured,
      // `_app/immutable/chunks/DxiPY6e9.js` — and NOTHING a visitor fetches is
      // named maplibre except the worker, which is requested when a Map is
      // constructed rather than when the module is imported. So on a built
      // site the name test would report "not loaded" even if the engine were
      // statically imported into the route entry: a guard that cannot fail.
      //
      // The WEIGHT test is the one that transfers. It counts bytes actually
      // fetched, which is the property being claimed, and it would fail the
      // same way in either environment.
      const weigh = () =>
        page.evaluate(() => {
          const js = performance
            .getEntriesByType("resource")
            .filter((r) => (r as PerformanceResourceTiming).initiatorType === "script");
          return {
            bytes: js.reduce((n, r) => n + ((r as PerformanceResourceTiming).transferSize || 0), 0),
            named: js.some((r) => /maplibre/.test(r.name)),
          };
        });

      const before = {
        ...(await weigh()),
        ...(await page.evaluate(() => ({
          top: document.querySelector("[data-map-slot]")!.getBoundingClientRect().top,
          fold: window.innerHeight,
        }))),
      };
      // Non-vacuity: if the map were on screen, "not loaded yet" would be
      // meaningless. NOT ONE PIXEL of the slot may be on screen at rest, which
      // is stricter than what the lazy gate needs to stay shut (half of the
      // box, or of the window if that is smaller — PropertyMap.svelte), and
      // does not depend on that fraction.
      //
      // This read `640 + 300` until 2026-09-28. The 300 was the observer's
      // first `rootMargin: "300px 0px"` LEAD, which the half-visible gate
      // replaced inside the same PR that wrote this test (#107; the conflict
      // it caused is issue #103), so the margin guarded a mechanism that never
      // shipped — and when the revised hero put the slot at 921, it failed a
      // correct page by 19px.
      expect(before.top, `the band is below the fold (${before.fold})`).toBeGreaterThan(
        before.fold,
      );
      expect(before.named, "no maplibre chunk before it is needed (dev-only read)").toBe(false);

      await page.locator("[data-map-slot]").scrollIntoViewIfNeeded();
      await drawn(page);
      const after = await weigh();
      expect(after.named, "…and it is there once the box is (dev-only read)").toBe(true);
      // The engine is 426 KB gzipped across two chunks. 200 KB is a floor no
      // amount of ordinary page script reaches, and one an engine that failed
      // to arrive could not clear.
      expect(
        after.bytes - before.bytes,
        `scrolling the box in pulled ${after.bytes - before.bytes} bytes of script`,
      ).toBeGreaterThan(200_000);
    } finally {
      await context.close();
    }
  });

  test("draws the comp's pin at S=48 and S=22, and clusters what would collide", async ({
    browser,
  }) => {
    for (const [width, size] of [
      [1440, 48],
      [390, 22],
    ] as const) {
      const { context, page } = await at(browser, width, width === 1440 ? 900 : 844);
      try {
        await page.goto(PROPERTIES);
        await hydrated(page);
        await page.locator(MAP).first().scrollIntoViewIfNeeded();
        await drawn(page);

        const markers = await page
          .locator(MAP)
          .first()
          .evaluate((box) => {
            const pins = [...box.querySelectorAll("[data-map-pin]")].map((el) => {
              const r = el.getBoundingClientRect();
              const path = el.querySelector("path")!;
              return { w: r.width, h: r.height, fill: getComputedStyle(path).fill };
            });
            const clusters = [...box.querySelectorAll("[data-map-cluster]")].map((el) =>
              Number(el.getAttribute("data-map-cluster")),
            );
            return {
              pins,
              clusters,
              hidden: box.querySelector("[data-map-pin]")?.getAttribute("aria-hidden"),
            };
          });

        // The fixture's land section is four listings, two of them 0.589 km
        // apart — so there is always something to measure and always at least
        // one grouping.
        expect(markers.pins.length + markers.clusters.length, `${width}: markers`).toBeGreaterThan(
          0,
        );
        const listed = markers.pins.length + markers.clusters.reduce((n, c) => n + c, 0);
        expect(listed, `${width}: every listing is on the map exactly once`).toBe(4);

        for (const pin of markers.pins) {
          expect(pin.w, `${width}: pin box`).toBeCloseTo(size, 1);
          // The viewBox stops at the tip, so the element is 0.901019 S tall.
          expect(pin.h / pin.w, `${width}: pin aspect`).toBeCloseTo(0.901019, 3);
          expect(pin.fill, `${width}: the comp's garnet`).toBe(GARNET);
        }
        // The markers are a drawing of the list above them, so they are not a
        // second set of tab stops.
        expect(markers.hidden, "pins are out of the accessibility tree").toBe("true");
      } finally {
        await context.close();
      }
    }
  });

  test("keeps OpenStreetMap's attribution, which the comp does not have", async ({ browser }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(LIVE_PROPERTIES);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      await drawn(page);
      const attribution = page.locator(`${MAP} .maplibregl-ctrl-attrib`).first();
      // The string itself. ODbL requires the credit, so the evidence has to be
      // that it is rendered — not that the control was constructed.
      await expect(attribution).toContainText("OpenStreetMap");
      await expect(
        attribution.locator(OSM),
        "and it is on screen, not merely in the DOM",
      ).toBeVisible();
      const tone = await attribution.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const box = el.closest("[data-property-map]")!.getBoundingClientRect();
        return { color: getComputedStyle(el).color, clipped: r.left < box.left - 0.5 };
      });
      expect(tone.color, "toned to the brand's garnet").toBe(GARNET);
      expect(tone.clipped, "not half off the frame").toBe(false);

      // AND IT SURVIVES A PIN SHEET OPENING OVER IT. The sheet is
      // `inset-x-0 bottom-0`; at 390 on a 200px map it covers the bottom
      // third, and it used to sit ABOVE both the credit and the expand
      // control — measured, sheet 471..536 against attribution 522..536, with
      // `elementFromPoint` at the credit's centre returning the sheet. A
      // licence condition that a UI state can hide is not being met, so the
      // hit test is the assertion, not the presence of the element.
      //
      // ON THE HOMEPAGE BAND, not on Properties, and that moved with #112.
      // Properties now passes `onselect` to PropertyMap: there the CARD is the
      // detail, so a pin press scrolls its card to the centre instead of
      // opening a second copy of it over the map. The band has no card beside
      // the map, so the sheet is still the only detail there is — and its 390
      // map is the same 200px full-bleed box this case was written against
      // (measured 375 x 200, three single pins, no clusters, expand drawn).
      // Since 2026-09-29 that box is a COMPACT frame, so its credit is the
      // collapsed (i) and its column is expand alone — and the licence line
      // is asserted after the (i) is pressed, over the open sheet. And the
      // case reads the LIVE routes since then, so it also runs on a production
      // build; the pin it presses is whichever the live band draws first.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(LIVE_HOME);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      await drawn(page);
      await page.locator(`${MAP} [data-map-pin]`).first().click();
      await expect(page.locator(`${MAP} [data-map-sheet]`)).toBeVisible();

      const onTop = await page.evaluate(() => {
        const hit = (el: Element) => {
          const r = el.getBoundingClientRect();
          const found = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!found && (found === el || el.contains(found) || found.contains(el));
        };
        const attrib = document.querySelector(".maplibregl-ctrl-attrib");
        const close = document.querySelector("[data-map-sheet] button");
        return {
          attrib: attrib ? hit(attrib) : null,
          close: close ? hit(close) : null,
          controls: [
            ...document
              .querySelector("[data-property-map]")!
              .querySelectorAll("[data-map-control]"),
          ].map(hit),
        };
      });
      expect(onTop.attrib, "the OpenStreetMap credit is still hit-testable").toBe(true);
      expect(onTop.close, "and so is the sheet's ×, clear of the control column").toBe(true);
      expect(onTop.controls, "and so is every control").toEqual([true]);

      const band = page.locator(MAP).first();
      await expect(band.locator(OSM), "premise: collapsed, the line is not shown").toBeHidden();
      await band.locator(".maplibregl-ctrl-attrib summary").click();
      await expect(band.locator(OSM), "the (i) opens onto the licence line").toBeVisible();
      expect(
        await band.locator(OSM).evaluate((a) => {
          const r = a.getBoundingClientRect();
          const found = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!found && (found === a || a.contains(found));
        }),
        "and the OpenStreetMap link is what a press on it hits, sheet open",
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  // THE INTERACTIVE SURFACE, WHICH HAD NO TEST OF ANY KIND. The review of
  // #107 found `press()`, the pin sheet, the cluster `easeTo` and the window
  // Escape handler entirely unguarded — and the unit harness building an
  // `eases` recorder it never read was the tell. These are the two behaviours
  // a visitor actually performs.
  test("pressing a cluster splits it, and on Properties a pin press opens no sheet", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      await drawn(page);

      const markers = () => page.locator(`${MAP} [data-map-pin], ${MAP} [data-map-cluster]`);
      const clusters = page.locator(`${MAP} [data-map-cluster]`).first();
      // Non-vacuity: a section that never clusters would make the split
      // assertion below meaningless. Land clusters at the panel's fit zoom.
      await expect(clusters, "the land section clusters at rest").toBeVisible();
      const before = await markers().count();
      const grouped = Number(await clusters.getAttribute("data-map-cluster"));
      expect(grouped, "and the cluster stands for more than one listing").toBeGreaterThan(1);

      // `press()` on a cluster eases to `expansionZoom` — the zoom at which
      // THAT cluster comes apart, not the map's maxZoom. The observable is
      // that it does come apart.
      await clusters.click();
      await expect
        .poll(() => markers().count(), { message: "the cluster split", timeout: 10_000 })
        .toBeGreaterThan(before);
      // …and a cluster press never opens a sheet: it is not one listing.
      await expect(page.locator(`${MAP} [data-map-sheet]`)).toHaveCount(0);

      // AND A PIN PRESS OPENS NO SHEET HERE EITHER — which is a change, not
      // an oversight. With #112 this page passes `onselect`: the card beside
      // the map already carries the listing's title and its two links, so a
      // sheet would be a second, smaller copy of it drawn on top, and a second
      // place a listing can be "open". The press scrolls that card to the
      // middle of the window instead, and the centre rule makes it active —
      // measured in tests/interaction/property-map-camera.spec.ts.
      await page.locator(`${MAP} [data-map-pin]`).first().click();
      await expect(page.locator(`${MAP} [data-map-sheet]`)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  // THE SHEET, where it still is the behaviour: the homepage band, which draws
  // no card beside its map. Same two claims this used to make on Properties —
  // a pin press opens a sheet that names its listing, and the window's Escape
  // handler closes it. That handler is on the window because the box is a
  // <div> with no role, so a key handler on IT is the non-interactive-element
  // interaction the compiler refuses; it is exactly the kind of thing that
  // stops working unnoticed.
  test("on the homepage band a pin press opens its sheet, and Escape closes it", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(HOME);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      await drawn(page);
      // Non-vacuity: the band's three slides stand alone at its fit zoom, so
      // there is a single pin to press. (Measured at 1440x900: 3 pins, 0
      // clusters, in a 508.2 x 820.5 box.)
      await expect(page.locator(`${MAP} [data-map-pin]`)).toHaveCount(3);
      await page.locator(`${MAP} [data-map-pin]`).first().click();
      const sheet = page.locator(`${MAP} [data-map-sheet]`);
      await expect(sheet).toBeVisible();
      await expect(sheet, "the sheet names its listing").not.toBeEmpty();
      await page.keyboard.press("Escape");
      await expect(sheet, "Escape closes it").toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("a focused link comes back from sr-only as a visible chip (WCAG 2.4.7)", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1440);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      await drawn(page);

      const link = page.locator(`${MAP} [data-map-link]`).first();
      // Hidden while the map is drawn…
      const before = await link.boundingBox();
      expect(before!.width, "sr-only while unfocused").toBeLessThan(3);

      // …and a real, legible chip the moment it takes focus — READ BY POLLING,
      // which is expect-ring.ts's lesson paid for a second time and for a
      // subtler reason than that file gives. Read ONCE straight after the
      // focus, this reported a 184px-wide, 40px-tall element with
      // `background-color: rgba(0, 0, 0, 0)` — two halves of a single CSS
      // declaration block disagreeing, which cannot happen. It can be read
      // that way, though: `getBoundingClientRect()` forces a layout, so the
      // layout half of the newly-focused element's style was current while the
      // PAINT half was still the pre-focus value. Screenshotted at the same
      // moment, the chip is garnet. An inline `background-color: #652323
      // !important` read back transparent too, which is what finally ruled out
      // a cascade problem.
      await link.focus();
      await expect
        .poll(
          () =>
            link.evaluate((el) => {
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return {
                focused: el.matches(":focus"),
                wide: r.width > 60,
                tall: r.height > 16,
                background: cs.backgroundColor,
                color: cs.color,
              };
            }),
          { message: "the focused chip never became a legible garnet box" },
        )
        .toEqual({
          focused: true,
          wide: true,
          tall: true,
          background: GARNET,
          // Sand on garnet: 9.38:1, the pair app.css's table already measures.
          color: SAND,
        });
    } finally {
      await context.close();
    }
  });
});

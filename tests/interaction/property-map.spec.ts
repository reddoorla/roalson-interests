import { expect, test, type Browser, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";

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

const MAP = "[data-property-map]";
const GARNET = "rgb(101, 35, 35)";

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
    // Sold gets no map at all, which is the next assertion.
    expect(links.length, `${PROPERTIES} server-renders a link per pin`).toBe(6);
    expect(listing).toContain("https://www.google.com/maps/search/?api=1&amp;query=");

    const home = await (await page.request.get(HOME)).text();
    expect((home.match(/data-map-link=""/g) ?? []).length).toBe(3);
  });

  test("the Sold section gets no map, as the comp says", async ({ page }) => {
    await page.goto(PROPERTIES);
    const sold = page.locator('section[aria-labelledby="listing-sold"]');
    await expect(sold).toHaveCount(1);
    await expect(sold.locator(MAP)).toHaveCount(0);
  });

  test("with scripting off the links are visible, and the expand button is not", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    try {
      const page = await context.newPage();
      await page.goto(PROPERTIES, { waitUntil: "domcontentloaded" });
      const links = page.locator(`${MAP} [data-map-link]`);
      await expect(links).toHaveCount(6);
      // Non-vacuity first, then the claim: every one of them is really on
      // screen, not clipped to a 1px sr-only box.
      for (let i = 0; i < 6; i += 1) {
        const box = await links.nth(i).boundingBox();
        expect(box!.width, `link ${i} width with scripting off`).toBeGreaterThan(40);
        expect(box!.height, `link ${i} height with scripting off`).toBeGreaterThan(10);
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
      expect(await page.locator(`${MAP} [data-map-expand]`).count(), "no expand at 1440").toBe(0);
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
      expect(painted.bg, "solid #652323").toBe(GARNET);
    } finally {
      await context.close();
    }
  });

  test("grows the map in place and comes back, and says so while it does", async ({ browser }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const button = page.locator(`${MAP} [data-map-expand]`).first();
      await expect(button).toHaveAttribute("aria-expanded", "false");
      expect((await rect(page, MAP)).h).toBe(200);

      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(button).toHaveAttribute("aria-label", /Collapse/);
      await expect
        .poll(async () => (await rect(page, MAP)).h, { message: "the map grew" })
        .toBeGreaterThan(400);

      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect.poll(async () => (await rect(page, MAP)).h).toBe(200);
    } finally {
      await context.close();
    }
  });
});

test.describe("the engine, and what it costs", () => {
  test("is not in the first-paint path, and arrives when the box is", async ({ browser }) => {
    // A short window so the homepage band is well clear of the fold — the
    // non-vacuity guard below is the point: if the map were on screen,
    // "not loaded yet" would be meaningless.
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
        top: await page.evaluate(
          () => document.querySelector("[data-map-slot]")!.getBoundingClientRect().top,
        ),
      };
      // Non-vacuity: if the map were on screen, "not loaded yet" would be
      // meaningless.
      expect(before.top, "the band is below the fold").toBeGreaterThan(640 + 300);
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
          expect(pin.fill, `${width}: the comp's #652323`).toBe(GARNET);
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
      await page.goto(PROPERTIES);
      await hydrated(page);
      await page.locator(MAP).first().scrollIntoViewIfNeeded();
      await drawn(page);
      const attribution = page.locator(`${MAP} .maplibregl-ctrl-attrib`).first();
      // The string itself. ODbL requires the credit, so the evidence has to be
      // that it is rendered — not that the control was constructed.
      await expect(attribution).toContainText("OpenStreetMap");
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
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(HOME);
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
        const expand = document.querySelector("[data-map-expand]");
        return { attrib: attrib ? hit(attrib) : null, expand: expand ? hit(expand) : null };
      });
      expect(onTop.attrib, "the OpenStreetMap credit is still hit-testable").toBe(true);
      expect(onTop.expand, "and so is the expand control").toBe(true);
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
          // Sand on garnet: 8.87:1, the pair app.css's table already measures.
          color: "rgb(232, 225, 209)",
        });
    } finally {
      await context.close();
    }
  });
});

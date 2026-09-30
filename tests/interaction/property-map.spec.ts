import { readFileSync } from "node:fs";

import { expect, test, type Browser, type Locator, type Page, type Route } from "@playwright/test";
import sharp from "sharp";

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
 *  a production build 404s every /dev/* route (#120). The control column, the
 *  credit and the licence line are measured here, since nothing about them
 *  depends on the fixture's listings — both pages open their first map on a
 *  section with pins (Land; the band's three picks).
 *
 *  On a production build the /dev cases need the build that serves the
 *  fixtures (VITE_REDDOOR_GATE_FIXTURES=1, #219 — the a11y gate's own flag;
 *  the preview server's build inherits it). Then every case runs but one:
 *  "is not in the first-paint path" reads the engine's chunk by NAME, which
 *  only the dev server gives it (see that case).
 *
 *    pnpm exec playwright test tests/interaction/property-map.spec.ts
 *    VITE_REDDOOR_GATE_FIXTURES=1 REDDOOR_GATE_SERVER=preview \
 *      pnpm exec playwright test tests/interaction/property-map.spec.ts \
 *      --grep-invert "first-paint path" */
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

/** MAP_CREDIT_OPEN_MS in src/lib/property-map.ts, which a spec cannot import
 *  (that module pulls in $lib/prismicio). Typed again on purpose: it is the
 *  OSMF safe harbour's five seconds, and a change to it should go red here. */
const CREDIT_OPEN_MS = 5_000;

/** The first map's credit, watched from INSIDE the page and in the page's own
 *  clock: when `data-map-ready` appeared (MapLibre's `load`, which is when the
 *  credit's clock starts), when the credit first showed its whole line, and
 *  when that line first collapsed. A poll from Playwright would measure its
 *  own latency as much as the page's, and "collapsed at once" and "collapsed
 *  after five seconds" are exactly the difference a poll can blur. Installed
 *  before the page's own scripts, so nothing is missed. */
async function watchCredit(page: Page) {
  await page.addInitScript(() => {
    const at: { ready?: number; shown?: number; collapsed?: number } = {};
    (window as unknown as { __credit: typeof at }).__credit = at;
    new MutationObserver(() => {
      const map = document.querySelector("[data-property-map]");
      if (!map) return;
      const now = performance.now();
      if (at.ready === undefined && map.hasAttribute("data-map-ready")) at.ready = now;
      const credit = map.querySelector(".maplibregl-ctrl-attrib");
      if (!credit) return;
      const line = credit.classList.contains("maplibregl-compact-show");
      if (line) at.shown ??= now;
      else if (at.shown !== undefined && credit.classList.contains("maplibregl-compact"))
        at.collapsed ??= now;
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-map-ready", "class"],
    });
  });
}
const creditTimes = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __credit: { ready?: number; shown?: number; collapsed?: number } })
        .__credit,
  );

/** Guard 2i's open line (src/lib/property-map.test.ts, "what the open window
 *  covers"): 10 from the left and the bottom, one line 248 x 24 where 248 fits
 *  between its margins and the control column's strip, else two lines 32 tall
 *  as wide as that room. */
const openLineBox = (mapWidth: number) => {
  const width = Math.min(248, mapWidth - 54 - 20);
  return { width, height: width < 248 ? 32 : 24 };
};

/** The drawn pin's size — 22 on a compact frame, 48 on a full one: which frame
 *  the map is, read off what it draws. */
const pinSize = (page: Page, nth = 0) =>
  page
    .locator(MAP)
    .nth(nth)
    .locator("[data-map-pin]:not([data-map-active]) svg")
    .first()
    .getAttribute("width");

/** Every link and button in the first map's pin sheet, and how many of 12
 *  points along its midline hit something else — the whole width, because
 *  the collapsed (i) covered the START of "View listing", and a hit test at
 *  the centre walks past that. */
const sheetCovered = (page: Page) =>
  page
    .locator(MAP)
    .first()
    .evaluate((map) =>
      [...map.querySelectorAll("[data-map-sheet] a, [data-map-sheet] button")].map((el) => {
        const r = el.getBoundingClientRect();
        let covered = 0;
        for (let i = 0; i < 12; i++) {
          const x = r.left + (r.width * (i + 0.5)) / 12;
          const found = document.elementFromPoint(x, r.top + r.height / 2);
          if (!found || !(found === el || el.contains(found))) covered += 1;
        }
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 14);
        return `${name}: ${covered} of 12 covered`;
      }),
    );

/** What has focus, for a failure message: BODY, or the element. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "BODY";
    const what = a.getAttribute("data-map-control") ?? a.getAttribute("href") ?? a.className;
    return `${a.tagName} ${what}`;
  });

/** What Chrome's accessibility tree says of the focused element. An
 *  `aria-hidden` pin holding focus is `button` with the name "". */
async function focusedAx(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const held = await cdp.send("Runtime.evaluate", { expression: "document.activeElement" });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      objectId: held.result.objectId,
      fetchRelatives: false,
    });
    const node = nodes[0]!;
    return { role: node.role?.value, name: node.name?.value ?? "", ignored: node.ignored };
  } finally {
    await cdp.detach();
  }
}

const luminance = ([r, g, b]: number[]) => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
};

/** Two animation frames: the state just set has been drawn. */
const frames = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

/** A FOCUS INDICATOR, IN PIXELS: the box round `target` keyboard-focused and
 *  blurred, and every pixel that changed held against the one it covered.
 *  `:focus-visible` alone stayed true with the pin's ring deleted, and with it
 *  drawn off-white over the tiles (0 of 80 changed pixels at 3:1). A pin's
 *  own drawing is left out, since its dim lifts on focus: what is left is the
 *  ring. Shot again after focusing back; a map that changed in between (a
 *  tile landing) is shot again rather than read as a ring. So is a reading
 *  where nothing changed at all: once in a 124-case run the canvas's three
 *  shots came back identical though it passed every run alone, and a ring
 *  that is really missing reads the same five times. */
async function indicatorOf(page: Page, target: Locator) {
  let last: { seen: boolean; numbers: string; on: Buffer; off: Buffer; at: unknown } | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const at = await target.evaluate((el: HTMLElement) => {
      el.focus({ preventScroll: true });
      const box = el.closest("[data-property-map]")!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const pad = 8;
      const x = Math.max(Math.floor(r.left - pad), Math.ceil(box.left), 0);
      const y = Math.max(Math.floor(r.top - pad), Math.ceil(box.top), 0);
      const right = Math.min(Math.ceil(r.right + pad), Math.floor(box.right), innerWidth);
      const bottom = Math.min(Math.ceil(r.bottom + pad), Math.floor(box.bottom), innerHeight);
      const s = el.matches("[data-map-pin], [data-map-home-pin]")
        ? el.querySelector("svg")!.getBoundingClientRect()
        : null;
      return {
        showing: el.matches(":focus-visible"),
        clip: { x, y, width: right - x, height: bottom - y },
        drawing: s && {
          l: s.left - x - 1,
          t: s.top - y - 1,
          r: s.right - x + 1,
          b: s.bottom - y + 1,
        },
      };
    });
    expect(at.showing, "premise: a keyboard's focus").toBe(true);
    await frames(page);
    const on = await page.screenshot({ clip: at.clip, scale: "css" });
    await target.evaluate((el: HTMLElement) => el.blur());
    await frames(page);
    const off = await page.screenshot({ clip: at.clip, scale: "css" });
    await target.evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
    await frames(page);
    const again = await page.screenshot({ clip: at.clip, scale: "css" });
    if (!on.equals(again)) {
      await page.waitForTimeout(300);
      continue;
    }
    const [a, b] = await Promise.all(
      [on, off].map((png) => sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })),
    );
    const { width } = a.info;
    const ratios: number[] = [];
    for (let i = 0, k = 0; i < a.data.length; i += 3, k++) {
      const p = [a.data[i]!, a.data[i + 1]!, a.data[i + 2]!];
      const q = [b.data[i]!, b.data[i + 1]!, b.data[i + 2]!];
      if (Math.abs(p[0]! - q[0]!) + Math.abs(p[1]! - q[1]!) + Math.abs(p[2]! - q[2]!) <= 6)
        continue;
      const [px, py] = [k % width, Math.floor(k / width)];
      const d = at.drawing;
      if (d && px >= d.l && px <= d.r && py >= d.t && py <= d.b) continue;
      const [hi, lo] = [luminance(p), luminance(q)].sort((m, n) => n - m);
      ratios.push((hi! + 0.05) / (lo! + 0.05));
    }
    ratios.sort((m, n) => m - n);
    const atThree = ratios.filter((c) => c >= 3).length;
    const median = ratios.length ? Math.round(ratios[ratios.length >> 1]! * 100) / 100 : 0;
    last = {
      /** At least 40 pixels at 3:1, and most of what changed. */
      seen: atThree >= 40 && median >= 3,
      numbers: `${atThree} of ${ratios.length} changed pixels at 3:1, median ${median}`,
      on,
      off,
      at,
    };
    if (ratios.length > 0) break;
    await page.waitForTimeout(300);
  }
  if (!last) throw new Error("the map never held still round the target in five attempts");
  if (!last.seen) {
    const name = `unseen-${Date.now()}`;
    await test.info().attach(`${name}-focused.png`, { body: last.on, contentType: "image/png" });
    await test.info().attach(`${name}-blurred.png`, { body: last.off, contentType: "image/png" });
    await test.info().attach(`${name}.json`, {
      body: JSON.stringify(last.at),
      contentType: "application/json",
    });
  }
  return { seen: last.seen, numbers: last.numbers };
}

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

// THE PICTURE'S CREDIT, WITH SCRIPTING OFF. The raster is a picture of
// OpenStreetMap data, rendered with MapLibre's credit switched off, and until
// 2026-09-29 nothing put one back: every map on the site was an uncredited
// map for a visitor without script. A picture has no gesture and no clock to
// collapse it on, so the whole line is drawn — the style's own
// (`MAP_HOME_CREDIT`, held to static/map-style.json by scripts/map-home.test.ts).
// On the LIVE routes, so the preview run reads it on a production build.
test.describe("with scripting off the picture carries the whole credit", () => {
  for (const [route, where, width] of [
    [LIVE_PROPERTIES, "Properties", 390],
    [LIVE_PROPERTIES, "Properties", 1440],
    [LIVE_HOME, "the homepage band", 390],
  ] as const)
    test(`${where} at ${width}: the whole credit line on the picture, nothing to press`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        javaScriptEnabled: false,
      });
      try {
        const page = await context.newPage();
        await page.goto(route, { waitUntil: "domcontentloaded" });
        const map = page.locator(MAP).first();
        await expect(map.locator("[data-map-home-box]"), "premise: the picture").toHaveCount(1);
        await map.scrollIntoViewIfNeeded();
        // The box is measured in the page's own font: before it arrives the
        // line is set in the fallback, and was measured 254.3 wide on the band.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const credit = map.locator("[data-map-home-credit]");
        await expect(credit).toHaveText("© OpenMapTiles © OpenStreetMap contributors");
        await expect(credit.locator(OSM), "the licence link, on screen").toBeVisible();
        await expect(credit.locator('a[href="https://www.openmaptiles.org/"]')).toBeVisible();
        const got = await map.evaluate((el, osm) => {
          const m = el.getBoundingClientRect();
          const c = el.querySelector("[data-map-home-credit]")!.getBoundingClientRect();
          const a = el.querySelector(`[data-map-home-credit] ${osm}`)!;
          const r = a.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            left: c.left - m.left,
            bottom: m.bottom - c.bottom,
            right: c.right - m.left,
            w: c.width,
            h: c.height,
            strip: m.width - 54,
            hits: !!hit && (hit === a || a.contains(hit)),
            summaries: el.querySelectorAll("summary").length,
          };
        }, OSM);
        expect(got.hits, "the licence link is what a press on it hits").toBe(true);
        expect(got.summaries, "nothing collapsed, nothing to open").toBe(0);
        expect([got.left, got.bottom], "flush bottom-left, where the live chip is").toEqual([0, 0]);
        expect(got.right, "clear of the control column's strip").toBeLessThanOrEqual(got.strip);
        // The live chip's box exactly, which guard 2i's full-frame chip is.
        expect(got.w, "no wider than guard 2i's chip").toBeLessThanOrEqual(224.5);
        expect(got.h, "no taller than guard 2i's chip").toBeLessThanOrEqual(18.5);
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
  // expanded overlay has all three at any window height (`fullControls`).
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

  // A LANDSCAPE PHONE. The overlay is the window, and a window under 300 tall
  // is a COMPACT frame (the 22px pin) — which drew expand alone and the
  // compact credit, leaving no single-pointer zoom-out anywhere.
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const)
    test(`${where} expanded in an 800 x 280 window: + and − and expand, − zooms out, and the whole chip`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 800, 280);
      try {
        await watchCamera(page);
        await page.goto(route);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        expect(await cameraProbeInstalled(page)).toBe(true);
        await map.locator("[data-map-expand]").click();
        await expect(map).toHaveAttribute("data-expanded", "true");
        await expect
          .poll(async () => {
            const r = await rect(page, MAP);
            return [r.w, r.h];
          })
          .toEqual([800, 280]);
        await expect.poll(() => pinSize(page), { message: "premise: a compact frame" }).toBe("22");
        const read = await map.evaluate((el) =>
          [...el.querySelectorAll("[data-map-control]")].map((b) => {
            const t = b.getBoundingClientRect();
            const hit = document.elementFromPoint(t.left + t.width / 2, t.top + t.height / 2);
            return { which: b.getAttribute("data-map-control"), hits: !!hit && b.contains(hit) };
          }),
        );
        expect(read.map((r) => r.which)).toEqual(["zoom-in", "zoom-out", "expand"]);
        for (const r of read) expect(r.hits, `${r.which} is what a press there hits`).toBe(true);

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
        await cameraAtRest(page);
        const z0 = await zoom();
        await map.locator('[data-map-control="zoom-out"]').click();
        await expect.poll(zoom, { message: "one press, one level out" }).toBeCloseTo(z0 - 1, 2);

        await expect(map.locator(OSM), "the whole chip: the licence line, no press").toBeVisible();
        expect(
          await map
            .locator(".maplibregl-ctrl-attrib")
            .evaluate((c) => c.classList.contains("maplibregl-compact")),
          "not the compact credit",
        ).toBe(false);
      } finally {
        await context.close();
      }
    });

  // …and a resize across 300 while it is open takes nothing away: a focused −
  // or a focused licence link is still focused, not dropped to <body> inside
  // the dialog.
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const)
    test(`${where} expanded at 390: a resize under 300 tall and back keeps focus on − and on the chip's link`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 390, 844);
      try {
        await page.goto(route);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        await map.locator("[data-map-expand]").click();
        await expect(map).toHaveAttribute("data-expanded", "true");
        const minus = map.locator('[data-map-control="zoom-out"]');
        await minus.focus();
        const held = await minus.elementHandle();
        for (const height of [280, 844]) {
          await page.setViewportSize({ width: 390, height });
          await expect
            .poll(() => pinSize(page), { message: `premise: the frame at 390 x ${height}` })
            .toBe(height < 300 ? "22" : "48");
          expect(
            await page.evaluate((el) => el === document.activeElement, held),
            `− still has focus at 390 x ${height} (${await focused(page)})`,
          ).toBe(true);
        }

        const link = await map.locator(`.maplibregl-ctrl-attrib ${OSM}`).elementHandle();
        await link!.focus();
        await page.setViewportSize({ width: 390, height: 280 });
        await expect.poll(() => pinSize(page), { message: "premise: compact again" }).toBe("22");
        expect(
          await page.evaluate((el) => el === document.activeElement, link),
          `the chip's licence link still has focus (${await focused(page)})`,
        ).toBe(true);
      } finally {
        await context.close();
      }
    });

  // + and − go when a map crosses `lg` downwards; a keyboard on one lands on
  // expand rather than on <body>, and one on expand stays there. UNDER REDUCED
  // MOTION, set here and not left to the harness: app.css's reset gave the
  // band's root a 0.01ms height transition from `lg:h-full` to `h-50`, a
  // frame 0 tall below lg, and the column went with it (with motion allowed
  // there is no transition and no such frame).
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const)
    for (const [control, name] of [
      ["zoom-out", "−"],
      ["expand", "expand"],
    ] as const)
      test(`${where} crossing lg under reduced motion: a keyboard on ${name} lands on expand`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width: 1100, height: 900 },
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        try {
          await page.goto(route);
          await hydrated(page);
          expect(
            await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
            "premise: reduced motion",
          ).toBe(true);
          const map = page.locator(MAP).first();
          await map.scrollIntoViewIfNeeded();
          await drawn(page);
          await map.locator(`[data-map-control="${control}"]`).focus();
          await page.setViewportSize({ width: 1000, height: 900 });
          await expect
            .poll(() =>
              map.evaluate((el) =>
                [...el.querySelectorAll("[data-map-control]")].map((b) =>
                  b.getAttribute("data-map-control"),
                ),
              ),
            )
            .toEqual(["expand"]);
          expect(
            await map.locator("[data-map-expand]").evaluate((b) => b === document.activeElement),
            `expand has focus (${await focused(page)})`,
          ).toBe(true);
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
// own compact credit, which opens onto the same line. Both boxes are the no-pin
// zones plan guard 2i walks in src/lib/property-map.test.ts, so the geometry
// asserted here is that guard's transcription, held to the rendered page.
//
// AND WHEN (operator call the same day, "option A"). A compact credit is the
// WHOLE LINE at the first frame, with nothing pressed, and collapses to the (i)
// CREDIT_OPEN_MS after it or on the visitor's first pan, zoom or press,
// whichever is first — the OSMF safe harbour's three ways to collapse a
// credit (quoted on MAP_CREDIT_OPEN_MS). The (i) opens it again. Every case
// below that reads "the whole line at the first frame" reads it without
// polling: a line that only appears later is not a line shown at load.
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
      test(`${where} at ${width}: the whole line at the first frame, the (i) after the window — 24 x 24 at 10 from two edges; a press or Enter opens it onto OpenStreetMap`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, width, 844);
        try {
          await watchCredit(page);
          await page.goto(route);
          await hydrated(page);
          const map = page.locator(MAP).first();
          await map.scrollIntoViewIfNeeded();
          await drawn(page);
          const summary = map.locator(".maplibregl-ctrl-attrib summary");

          // THE OPEN WINDOW. At the first frame, pressed by nobody: the whole
          // line, inside guard 2i's open-line box, on top at the licence link.
          const first = await map.evaluate((el, osm) => {
            const m = el.getBoundingClientRect();
            const c = el.querySelector(".maplibregl-ctrl-attrib")!;
            const r = c.getBoundingClientRect();
            const a = el.querySelector<HTMLElement>(osm);
            const ar = a?.getBoundingClientRect();
            const hit =
              ar && document.elementFromPoint(ar.left + ar.width / 2, ar.top + ar.height / 2);
            return {
              line: c.classList.contains("maplibregl-compact-show"),
              osm: !!ar && ar.width > 0 && ar.height > 0 && !!a?.checkVisibility(),
              hits: !!hit && (hit === a || a!.contains(hit)),
              left: r.left - m.left,
              bottom: m.bottom - r.bottom,
              right: r.right - m.left,
              w: r.width,
              h: r.height,
              mapWidth: m.width,
            };
          }, OSM);
          expect(first.line, "the first frame shows the whole line, nothing pressed").toBe(true);
          expect(first.osm, "OpenStreetMap on it, visible").toBe(true);
          expect(first.hits, "and the licence link is what a press there hits").toBe(true);
          expect([first.left, first.bottom], "10 from the left and the bottom").toEqual([10, 10]);
          const model = openLineBox(first.mapWidth);
          expect(first.w, "no wider than guard 2i's open line").toBeLessThanOrEqual(
            model.width + 0.5,
          );
          expect(first.h, "no taller than guard 2i's open line").toBeLessThanOrEqual(
            model.height + 0.5,
          );
          expect(first.right, "clear of the control column").toBeLessThanOrEqual(
            first.mapWidth - 54,
          );

          // …and it closes BY ITSELF, CREDIT_OPEN_MS after the first frame.
          await expect(map.locator(OSM), "the (i) once the window is over").toBeHidden({
            timeout: CREDIT_OPEN_MS + 10_000,
          });
          const times = await creditTimes(page);
          const after = times.collapsed! - times.ready!;
          // The low side is the clock (setTimeout never fires early; the
          // ready attribute lands a flush after `load`, ~30ms); the high side
          // is this container's load, which can hold a timer back.
          expect(after, `closed ${after.toFixed(0)}ms after the first frame`).toBeGreaterThan(
            CREDIT_OPEN_MS - 500,
          );
          expect(after, `closed ${after.toFixed(0)}ms after the first frame`).toBeLessThan(
            CREDIT_OPEN_MS + 3_000,
          );
          test.info().annotations.push({ type: "window", description: `${after.toFixed(1)}ms` });

          // Visible first, so the hidden line below is COLLAPSED and not a
          // credit that never arrived.
          await expect(summary, "the (i) is drawn").toBeVisible();
          await expect(map.locator(OSM), "collapsed at rest: no line").toBeHidden();
          expect(
            await map
              .locator(".maplibregl-ctrl-attrib")
              .evaluate((d) => (d as HTMLDetailsElement).open),
            "and the disclosure says so",
          ).toBe(false);
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

  // THE VISITOR'S FIRST GESTURE ENDS THE WINDOW AT ONCE. Measured before this
  // was written (maplibre-gl 6.10.0, /properties at 390): maplibre's compact
  // credit collapses on a drag of its own and on NOTHING else — a wheel and a
  // double-click left the line open, it has no clock, and its drag leaves
  // `open` on the <details>. So each way in is its own case, and each names the
  // hook it proves: the tagged `movestart` (drag, keyboard zoom), the wheel
  // listener, maplibre's `click` (a press that neither pans nor zooms), and
  // `press` (a pin, which maplibre never sees). "At once" is read in the page's
  // clock: within 1.5s of the gesture and well inside the window, so the
  // clock cannot be what closed it.
  for (const gesture of ["drag", "wheel zoom", "keyboard zoom", "tap", "pin press"] as const)
    test(`Properties at 390: a first ${gesture} collapses the whole line to the (i) at once`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 390, 844);
      try {
        await watchCredit(page);
        await page.goto(LIVE_PROPERTIES);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        await expect(map.locator(OSM), "premise: the whole line, before the gesture").toBeVisible({
          timeout: 1,
        });
        // A point on bare canvas — no pin, no control, no credit — for the
        // gestures that must land on the map itself.
        const bare = await map.evaluate((el) => {
          const r = el.getBoundingClientRect();
          for (let y = r.top + 30; y < r.bottom - 60; y += 8)
            for (let x = r.left + 30; x < r.right - 60; x += 8) {
              const hit = document.elementFromPoint(x, y);
              if (hit?.classList.contains("maplibregl-canvas")) return { x, y };
            }
          return null;
        });
        expect(bare, "premise: some bare canvas to press").not.toBeNull();
        const sent = await page.evaluate(() => performance.now());
        const { ready } = await creditTimes(page);
        expect(
          sent - ready!,
          "premise: the gesture comes early enough that the clock cannot be what closes it",
        ).toBeLessThan(CREDIT_OPEN_MS - 2_000);

        if (gesture === "drag") {
          await page.mouse.move(bare!.x, bare!.y);
          await page.mouse.down();
          await page.mouse.move(bare!.x + 40, bare!.y + 10, { steps: 6 });
          await page.mouse.up();
        } else if (gesture === "wheel zoom") {
          await page.mouse.move(bare!.x, bare!.y);
          await page.mouse.wheel(0, -120);
        } else if (gesture === "keyboard zoom") {
          await map.locator("canvas.maplibregl-canvas").focus();
          await page.keyboard.press("Equal");
        } else if (gesture === "tap") {
          await page.mouse.click(bare!.x, bare!.y);
        } else {
          // A pin the open line is not over (Dove Canyon is, at 335): its own
          // centre is what a press there hits.
          const pin = await map.evaluate((el) => {
            for (const p of el.querySelectorAll("[data-map-pin]")) {
              const r = p.getBoundingClientRect();
              const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
              const hit = document.elementFromPoint(x, y);
              if (hit && (hit === p || p.contains(hit))) return { x, y };
            }
            return null;
          });
          expect(pin, "premise: a pin clear of the line").not.toBeNull();
          await page.mouse.click(pin!.x, pin!.y);
        }

        await expect
          .poll(async () => (await creditTimes(page)).collapsed, {
            message: "the line collapsed",
            timeout: 1_500,
          })
          .toBeDefined();
        const { collapsed } = await creditTimes(page);
        expect(collapsed! - sent, "at once: within 1.5s of the gesture").toBeLessThan(1_500);
        expect(collapsed! - ready!, "and inside the window, so not by the clock").toBeLessThan(
          CREDIT_OPEN_MS - 500,
        );
        await expect(map.locator(OSM), "the line is gone").toBeHidden({ timeout: 1 });
        // Collapsed AND closed: maplibre's own drag leaves `open` on, so the
        // (i) would still report itself expanded over a hidden line.
        expect(
          await map
            .locator(".maplibregl-ctrl-attrib")
            .evaluate((d) => (d as HTMLDetailsElement).open),
          "the disclosure is closed with it",
        ).toBe(false);

        // AND THE (i) OPENS IT AGAIN, and it stays the visitor's.
        const summary = map.locator(".maplibregl-ctrl-attrib summary");
        await summary.click();
        await expect(map.locator(OSM), "the (i) re-opens the line").toBeVisible();
        await summary.click();
        await expect(map.locator(OSM), "and shuts it").toBeHidden();
      } finally {
        await context.close();
      }
    });

  // A PRESS ON THE (i) IS THE SAFE HARBOUR'S "DISMISS", and from then on the
  // credit is the visitor's: shut inside the window and opened again, it must
  // not be shut again by the clock that was still running.
  test("Properties at 390: the (i) pressed twice inside the window stays open past it", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await watchCredit(page);
      await page.goto(LIVE_PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      const summary = map.locator(".maplibregl-ctrl-attrib summary");
      await expect(map.locator(OSM), "premise: the whole line at first").toBeVisible({
        timeout: 1,
      });
      await summary.click();
      await expect(map.locator(OSM), "a press shuts it: the dismiss").toBeHidden();
      await summary.click();
      await expect(map.locator(OSM), "a second press opens it").toBeVisible();
      const { ready } = await creditTimes(page);
      expect(
        (await page.evaluate(() => performance.now())) - ready!,
        "premise: both presses inside the window",
      ).toBeLessThan(CREDIT_OPEN_MS - 1_000);
      // Past the window, with a second to spare.
      await page.waitForFunction(
        ([r, ms]) => performance.now() - r > ms,
        [ready!, CREDIT_OPEN_MS + 1_000] as const,
        { timeout: CREDIT_OPEN_MS + 10_000 },
      );
      await expect(map.locator(OSM), "still open: the clock did not shut it").toBeVisible({
        timeout: 1,
      });
    } finally {
      await context.close();
    }
  });

  // THE CLOCK STARTS WHEN THE MAP IS SHOWN, NOT WHEN THE PAGE LOADS. The band
  // is below the fold at 390 x 640 (its top at 921, measured) and a map boots
  // only once half of it is on screen (#103), so a visitor who reads the hero
  // for longer than the window still gets the whole line when they reach the
  // map. Until then the band is its picture, and the picture carries the line
  // itself (`MAP_HOME_CREDIT`).
  test("the homepage band at 390: a map scrolled to after the window still opens on the whole line", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 640);
    try {
      await watchCredit(page);
      await page.goto(LIVE_HOME);
      await hydrated(page);
      const map = page.locator(MAP).first();
      const notBooted = async () => {
        expect(await map.getAttribute("data-map-ready"), "premise: not drawn yet").toBeNull();
        expect(
          await map.locator(".maplibregl-ctrl-attrib").count(),
          "premise: no live credit yet",
        ).toBe(0);
      };
      await notBooted();
      // Until it boots, the picture's own credit: the whole line, on it.
      const picture = map.locator("[data-map-home-credit]");
      await expect(picture.locator(OSM), "the picture carries the whole line").toBeVisible();
      await page.waitForTimeout(CREDIT_OPEN_MS + 1_000);
      await notBooted();

      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      await expect(
        map.locator(".maplibregl-ctrl-attrib").locator(OSM),
        "the whole line at the first frame, however long the page was open",
      ).toBeVisible({ timeout: 1 });
      await expect(picture, "and the picture's credit went with the picture").toHaveCount(0);
      await expect(map.locator(OSM), "then the (i)").toBeHidden({
        timeout: CREDIT_OPEN_MS + 10_000,
      });
      const { ready, collapsed } = await creditTimes(page);
      expect(
        collapsed! - ready!,
        "CREDIT_OPEN_MS after the first frame, not after page load",
      ).toBeGreaterThan(CREDIT_OPEN_MS - 500);
    } finally {
      await context.close();
    }
  });

  // A KEYBOARD ON THE PICTURE'S CREDIT WHEN THE PICTURE GOES. Its two links are
  // real and in the tab order — until `load` it is the whole attribution — and
  // the hand-over removes them. So focus is moved to the live credit's same
  // link first, and on a compact map, when the window closes the line under
  // it, to the (i). Reached as a keyboard reaches it: Tab from the map's last
  // list link, on a map below the fold, which that Tab brings on screen and
  // boots. Both hand-overs: `transitionend` with motion allowed, the same tick
  // under reduced motion. "Same" is read off both links: the motion-allowed
  // cases stand on the first (OpenMapTiles), the reduced-motion ones on the
  // second (OpenStreetMap), so a hand-over to the first link, or to the last,
  // whatever was held goes red.
  for (const { route, where, width, height, nth } of [
    { route: LIVE_HOME, where: "the homepage band", width: 1440, height: 900, nth: 0 },
    { route: LIVE_HOME, where: "the homepage band", width: 390, height: 640, nth: 0 },
    { route: LIVE_PROPERTIES, where: "Properties' second map", width: 390, height: 844, nth: 1 },
  ])
    for (const motion of ["no-preference", "reduce"] as const)
      test(`${where} at ${width}, motion ${motion}: a keyboard on the picture's credit is on the live credit's same link after the hand-over`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width, height },
          reducedMotion: motion,
        });
        const page = await context.newPage();
        try {
          await page.goto(route);
          await hydrated(page);
          expect(
            await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
            "premise: the motion setting",
          ).toBe(motion === "reduce");
          const map = page.locator(MAP).nth(nth);
          await map.locator("[data-map-link]").last().focus();
          const [link, name, tabs] =
            motion === "reduce"
              ? [OSM, "OpenStreetMap", 2]
              : ['a[href="https://www.openmaptiles.org/"]', "OpenMapTiles", 1];
          for (let i = 0; i < tabs; i++) await page.keyboard.press("Tab");
          const picture = map.locator("[data-map-home-credit]");
          expect(
            await picture.locator(link).evaluate((a) => a === document.activeElement),
            `premise: Tab lands on the picture's ${name} link (${await focused(page)})`,
          ).toBe(true);
          expect(await map.getAttribute("data-map-ready"), "premise: not drawn yet").toBeNull();

          await drawn(page, nth);
          await expect(picture, "the picture's credit went with the picture").toHaveCount(0);
          const live = map.locator(".maplibregl-ctrl-attrib");
          expect(
            await live.locator(link).evaluate((a) => a === document.activeElement),
            `on the live credit's ${name} link (${await focused(page)})`,
          ).toBe(true);

          if (width >= 1024) return;
          await expect(map.locator(OSM), "the window closes").toBeHidden({
            timeout: CREDIT_OPEN_MS + 10_000,
          });
          expect(
            await live.locator("summary").evaluate((s) => s === document.activeElement),
            `and the (i) holds it (${await focused(page)})`,
          ).toBe(true);
        } finally {
          await context.close();
        }
      });

  // SETTLED IS FOR GOOD. Once the window has closed, a compact credit placed
  // later — the phone map expanded and collapsed, a /properties map crossing
  // `lg` — starts as the (i), and the line does not come back over the
  // downtown cluster (#188).
  const collapsed = (page: Page) =>
    page
      .locator(MAP)
      .first()
      .locator(".maplibregl-ctrl-attrib")
      .evaluate((d) => ({
        compact: d.classList.contains("maplibregl-compact"),
        line: d.classList.contains("maplibregl-compact-show"),
        open: (d as HTMLDetailsElement).open,
      }));
  for (const [route, where] of [
    [LIVE_PROPERTIES, "Properties"],
    [LIVE_HOME, "the homepage band"],
  ] as const)
    test(`${where} at 390: after the window, expanded and Escape, the credit is the (i) again`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 390, 844);
      try {
        await page.goto(route);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        await expect(map.locator(OSM), "the window closes").toBeHidden({
          timeout: CREDIT_OPEN_MS + 10_000,
        });
        await map.locator("[data-map-expand]").click();
        await expect(map.locator(OSM), "premise: the overlay's whole chip").toBeVisible();
        await page.keyboard.press("Escape");
        await expect(map).not.toHaveAttribute("data-expanded", "true");
        await expect(map.locator(".maplibregl-ctrl-attrib summary"), "the (i)").toBeVisible();
        expect(await collapsed(page)).toEqual({ compact: true, line: false, open: false });
        await expect(map.locator(OSM), "no line").toBeHidden();
      } finally {
        await context.close();
      }
    });

  test("Properties crossing lg after the window: the credit comes back as the (i)", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1000, 900);
    try {
      await page.goto(LIVE_PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      await expect(map.locator(OSM), "the window closes").toBeHidden({
        timeout: CREDIT_OPEN_MS + 10_000,
      });
      await page.setViewportSize({ width: 1100, height: 900 });
      await expect(map.locator(OSM), "premise: over lg, the whole chip").toBeVisible();
      await page.setViewportSize({ width: 1000, height: 900 });
      await expect(map.locator(".maplibregl-ctrl-attrib summary"), "the (i)").toBeVisible();
      expect(await collapsed(page)).toEqual({ compact: true, line: false, open: false });
      await expect(map.locator(OSM), "no line").toBeHidden();
    } finally {
      await context.close();
    }
  });

  // A /properties map crossing `lg` downwards swaps the chip for the compact
  // credit, inside the window here, so its line is open: a keyboard on the
  // chip's licence link is on the line's.
  test("Properties crossing lg: a keyboard on the chip's licence link stays on the credit's", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 1100, 900);
    try {
      await watchCredit(page);
      await page.goto(LIVE_PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      await map.locator(`.maplibregl-ctrl-attrib ${OSM}`).focus();
      await page.setViewportSize({ width: 1000, height: 900 });
      await expect.poll(() => collapsed(page)).toEqual({ compact: true, line: true, open: true });
      const { ready } = await creditTimes(page);
      expect(
        (await page.evaluate(() => performance.now())) - ready!,
        "premise: inside the window",
      ).toBeLessThan(CREDIT_OPEN_MS - 1_000);
      expect(
        await map
          .locator(`.maplibregl-ctrl-attrib ${OSM}`)
          .evaluate((a) => a === document.activeElement && a.checkVisibility()),
        `the line's licence link has focus (${await focused(page)})`,
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  // …and UPWARDS, the compact credit swapped for the chip: a keyboard on the
  // line's licence link is on the chip's, and one on the (i) — which the chip
  // does not have — is on the chip's first link.
  for (const on of ["the line's licence link", "the (i)"] as const)
    test(`Properties crossing lg upwards: a keyboard on ${on} stays on the credit`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, 1000, 900);
      try {
        await watchCredit(page);
        await page.goto(LIVE_PROPERTIES);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        const credit = map.locator(".maplibregl-ctrl-attrib");
        let target = OSM;
        if (on === "the (i)") {
          // Enter on the (i) shuts the line: the safe harbour's dismiss.
          await credit.locator("summary").focus();
          await page.keyboard.press("Enter");
          await expect
            .poll(() => collapsed(page))
            .toEqual({
              compact: true,
              line: false,
              open: false,
            });
          target = 'a[href="https://www.openmaptiles.org/"]';
        } else {
          await credit.locator(OSM).focus();
          const { ready } = await creditTimes(page);
          expect(
            (await page.evaluate(() => performance.now())) - ready!,
            "premise: inside the window, the line open",
          ).toBeLessThan(CREDIT_OPEN_MS - 1_000);
        }
        const before = await focused(page);
        expect(before, "premise: a keyboard on the compact credit").not.toBe("BODY");
        await page.setViewportSize({ width: 1100, height: 900 });
        await expect
          .poll(() => credit.evaluate((c) => c.classList.contains("maplibregl-compact")), {
            message: "premise: over lg, the chip",
          })
          .toBe(false);
        expect(
          await credit
            .locator(target)
            .evaluate((a) => a === document.activeElement && a.checkVisibility()),
          `from ${before}, the chip's link has focus (${await focused(page)})`,
        ).toBe(true);
      } finally {
        await context.close();
      }
    });

  // EVERY DRAG, NOT ONLY THE FIRST. maplibre's own drag hides an open line and
  // leaves `open` on the <details>, so after the window a line the visitor
  // opened and then dragged away from left the (i) reporting "expanded" over
  // nothing, and its next press opened rather than closed. A keyboard on the
  // line's link when a finger drags it away is handed to the (i).
  test("Properties at 390: after the window, a drag closes an opened line and its disclosure", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(LIVE_PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      const bare = await map.evaluate((el) => {
        const r = el.getBoundingClientRect();
        for (let y = r.top + 30; y < r.bottom - 60; y += 8)
          for (let x = r.left + 30; x < r.right - 60; x += 8)
            if (document.elementFromPoint(x, y)?.classList.contains("maplibregl-canvas"))
              return { x, y };
        return null;
      });
      expect(bare, "premise: some bare canvas to press").not.toBeNull();
      // A tap ends the window: the first gesture, which the cases above hold.
      await page.mouse.click(bare!.x, bare!.y);
      await expect.poll(() => collapsed(page)).toEqual({ compact: true, line: false, open: false });
      const summary = map.locator(".maplibregl-ctrl-attrib summary");

      await summary.click();
      await expect
        .poll(() => collapsed(page), { message: "premise: opened" })
        .toEqual({
          compact: true,
          line: true,
          open: true,
        });
      await page.mouse.move(bare!.x, bare!.y);
      await page.mouse.down();
      await page.mouse.move(bare!.x + 40, bare!.y + 10, { steps: 6 });
      await page.mouse.up();
      await expect
        .poll(() => collapsed(page), { message: "a mouse drag: closed, and says so" })
        .toEqual({ compact: true, line: false, open: false });
      await summary.click();
      await expect(map.locator(OSM), "the next press opens it").toBeVisible();

      // The keyboard's half: focus on the open line's licence link, and a
      // finger drags the map (a touch moves no focus).
      await map.locator(OSM).focus();
      const cdp = await context.newCDPSession(page);
      const touch = (type: "touchStart" | "touchMove" | "touchEnd", i = 0) =>
        cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: type === "touchEnd" ? [] : [{ x: bare!.x + i * 8, y: bare!.y + i * 2 }],
        });
      await touch("touchStart");
      for (let i = 1; i <= 6; i++) await touch("touchMove", i);
      await touch("touchEnd");
      await expect
        .poll(() => collapsed(page), { message: "a touch drag: closed, and says so" })
        .toEqual({ compact: true, line: false, open: false });
      expect(
        await summary.evaluate((el) => el === document.activeElement),
        `and the (i) holds the keyboard (${await focused(page)})`,
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  // THE PICTURE'S CREDIT IS THE LIVE ONE'S BOX, on every frame: on a compact
  // map, where the live credit opens as maplibre's line, the picture's is that
  // line (with scripting on — off, it keeps the chip; see above), so the
  // hand-over swaps like for like. It used to be the chip there, and for the
  // ~300ms of the canvas's fade both were on screen, then the credit jumped
  // 16 up and 10 right. Read in the page's own frames, from before the first
  // frame to after the picture is gone, in both motion settings.
  for (const { route, where, width, height } of [
    { route: LIVE_HOME, where: "the homepage band", width: 390, height: 844 },
    { route: LIVE_PROPERTIES, where: "Properties", width: 390, height: 844 },
    { route: LIVE_PROPERTIES, where: "Properties", width: 320, height: 640 },
    { route: LIVE_HOME, where: "the homepage band", width: 1440, height: 900 },
  ])
    for (const motion of ["no-preference", "reduce"] as const)
      test(`${where} at ${width}, motion ${motion}: the picture's credit and the live one are the same box across the hand-over`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width, height },
          reducedMotion: motion,
        });
        const page = await context.newPage();
        try {
          await page.addInitScript(() => {
            const frames: { picture: string | null; live: string | null; ready: boolean }[] = [];
            (window as unknown as { __frames: typeof frames }).__frames = frames;
            const box = (el: Element | null | undefined, m: DOMRect) => {
              if (!el?.checkVisibility({ opacityProperty: false })) return null;
              const r = el.getBoundingClientRect();
              return [r.left - m.left, m.bottom - r.bottom, r.width, r.height]
                .map((v) => v.toFixed(1))
                .join(",");
            };
            const tick = () => {
              const map = document.querySelector("[data-property-map]");
              if (map) {
                const m = map.getBoundingClientRect();
                const live = map.querySelector("[data-map-canvas] .maplibregl-ctrl-attrib");
                const shown = Number(
                  getComputedStyle(map.querySelector("[data-map-canvas]")!).opacity,
                );
                frames.push({
                  picture: box(map.querySelector("[data-map-home-credit]"), m),
                  live: shown > 0 ? box(live, m) : null,
                  ready: map.hasAttribute("data-map-ready"),
                });
              }
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
          await page.goto(route);
          await hydrated(page);
          const map = page.locator(MAP).first();
          await map.scrollIntoViewIfNeeded();
          await drawn(page);
          await expect(map.locator("[data-map-home-credit]")).toHaveCount(0);
          await page.waitForTimeout(200);
          const frames = await page.evaluate(
            () =>
              (
                window as unknown as {
                  __frames: { picture: string | null; live: string | null; ready: boolean }[];
                }
              ).__frames,
          );
          const pictures = frames.filter((f) => f.picture);
          const lives = frames.filter((f) => f.live && f.ready);
          expect(pictures.length, "premise: the picture's credit was on screen").toBeGreaterThan(0);
          expect(lives.length, "premise: and then the live one").toBeGreaterThan(0);
          const last = pictures.at(-1)!.picture;
          const first = lives[0]!.live;
          expect(first, `the live credit took over in the picture's box (${last})`).toBe(last);
          const both = frames.filter((f) => f.picture && f.live);
          for (const f of both) expect(f.live, "a frame with both on screen").toBe(f.picture);
          test.info().annotations.push({
            type: "hand-over",
            description: `${both.length} frames with both, box ${last}`,
          });
          if (motion === "no-preference")
            expect(both.length, "premise: the fade put both on screen").toBeGreaterThan(0);
          expect(
            frames.filter((f) => f.ready && !f.picture && !f.live),
            "and no frame after the first had neither",
          ).toEqual([]);
        } finally {
          await context.close();
        }
      });

  // NO TAB STOP UNDER A TRANSPARENT CANVAS. Until `load` the canvas host is
  // `opacity-0` over the picture, but the engine already built its canvas and
  // its credit in it — three or four stops a keyboard landed on and could not
  // see. The tiles are held here, so `load` cannot come while the keys go:
  // the credit's text is in (the TileJSON is not held), the frame is not.
  for (const [route, where, width, height] of [
    [LIVE_HOME, "the homepage band", 390, 844],
    [LIVE_PROPERTIES, "Properties", 390, 844],
    [LIVE_HOME, "the homepage band", 1440, 900],
  ] as const)
    test(`${where} at ${width}: before the first frame, Tab goes from the picture's credit to expand`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, width, height);
      try {
        const held: Route[] = [];
        await page.route(/\.pbf(\?|$)/, (r) => void held.push(r));
        await page.goto(route);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await expect
          .poll(
            () =>
              map.evaluate(
                (el) =>
                  el.querySelectorAll(
                    "[data-map-canvas] canvas, [data-map-canvas] .maplibregl-ctrl-attrib a",
                  ).length,
              ),
            {
              message: "premise: the engine built its canvas and its credit's links",
              timeout: 20_000,
            },
          )
          .toBeGreaterThanOrEqual(3);
        await map.locator(`[data-map-home-credit] ${OSM}`).focus();
        await page.keyboard.press("Tab");
        expect(await map.getAttribute("data-map-ready"), "premise: not drawn yet").toBeNull();
        expect(
          await map.locator("[data-map-expand]").evaluate((b) => b === document.activeElement),
          `expand has focus, not the canvas host (${await focused(page)})`,
        ).toBe(true);
        await page.unroute(/\.pbf(\?|$)/);
        for (const r of held) await r.continue().catch(() => undefined);
        await drawn(page);
      } finally {
        await context.close();
      }
    });
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
      // Under option A the band's line is open at the first frame, and it is
      // the PIN PRESS that collapses it (`press` settles the window) — read in
      // the page's clock, so the five-second clock cannot pass for it.
      await watchCredit(page);
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
      // …and the sheet's own links and ×, along their whole width: on a
      // compact frame the collapsed (i) is 24 × 24 at 10 in, and it sat over
      // the start of "View listing" until the sheet made room for it.
      const items = await sheetCovered(page);
      expect(items.length, "premise: the sheet's links and ×").toBeGreaterThanOrEqual(2);
      for (const item of items) expect(item, "clear of the (i)").toMatch(/: 0 of 12/);

      const band = page.locator(MAP).first();
      await expect(band.locator(OSM), "premise: collapsed, the line is not shown").toBeHidden({
        timeout: 1,
      });
      const { ready, collapsed } = await creditTimes(page);
      expect(collapsed! - ready!, "collapsed by the pin press, inside the window").toBeLessThan(
        CREDIT_OPEN_MS - 500,
      );
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

// THE BAND'S PIN SHEET, on a compact frame and when it closes. The homepage
// band is the one map with a sheet: /properties passes `onselect`, so a pin
// press there scrolls to its card and opens nothing (the first case says so
// at 390, so the (i) has no sheet to sit on there).
test.describe("the band's pin sheet", () => {
  /** Presses the first pin whose centre is what a press there hits. */
  async function openSheet(page: Page) {
    const map = page.locator(MAP).first();
    const pin = await map.evaluate((el) => {
      for (const p of el.querySelectorAll("[data-map-pin]")) {
        const r = p.getBoundingClientRect();
        const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === p || p.contains(hit)))
          return { x, y, id: p.getAttribute("data-map-pin")! };
      }
      return null;
    });
    expect(pin, "premise: a pin to press").not.toBeNull();
    await page.mouse.click(pin!.x, pin!.y);
    await expect(map.locator("[data-map-sheet]")).toBeVisible();
    return pin!.id;
  }

  test("Properties at 390: a pin press opens no sheet", async ({ browser }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(LIVE_PROPERTIES);
      await hydrated(page);
      const map = page.locator(MAP).first();
      await map.scrollIntoViewIfNeeded();
      await drawn(page);
      await expect(map.locator("[data-map-pin]").first()).toBeVisible();
      await map.locator("[data-map-pin]").first().click();
      await page.waitForTimeout(500);
      await expect(page.locator(`${MAP} [data-map-sheet]`)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  // THE (i) HAS ITS OWN STRIP. The press that opens a sheet collapses the
  // credit to the (i), 24 × 24 at 10 from the left and the bottom, and it sat
  // over the first ~18px of "View listing": the label read "(i) w listing",
  // and a tap there opened the licence line instead of the listing. A compact
  // sheet now starts its content 44 in. The line the visitor opens from the
  // (i) may lie over the links (a second press shuts it); it leaves the ×
  // alone. The overlay has the whole chip, flush, at any height.
  for (const { width, height, expand } of [
    { width: 390, height: 844, expand: false },
    { width: 320, height: 640, expand: false },
    { width: 800, height: 280, expand: false },
    { width: 390, height: 844, expand: true },
  ])
    test(`the homepage band at ${width} x ${height}${expand ? ", expanded" : ""}: the sheet's links and × are clear of the credit`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, width, height);
      try {
        await page.goto(LIVE_HOME);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        if (expand) {
          await map.locator("[data-map-expand]").click();
          await expect(map).toHaveAttribute("data-expanded", "true");
        }
        await openSheet(page);
        const compact = await map
          .locator(".maplibregl-ctrl-attrib")
          .evaluate((c) => [c.classList.contains("maplibregl-compact"), c.checkVisibility()]);
        expect(compact, "premise: the credit is drawn, and which kind").toEqual([!expand, true]);
        const items = await sheetCovered(page);
        expect(items.length, "premise: the sheet's links and ×").toBeGreaterThanOrEqual(2);
        for (const item of items) expect(item, "clear of the credit").toMatch(/: 0 of 12/);
        if (expand) return;

        await map.locator(".maplibregl-ctrl-attrib summary").click();
        await expect(map.locator(OSM), "premise: the line, opened").toBeVisible();
        const x = (await sheetCovered(page)).at(-1)!;
        expect(x, "the × is clear of the opened line").toMatch(/^Close .*: 0 of 12/);
      } finally {
        await context.close();
      }
    });

  // CLOSING IT HANDS FOCUS ON. The sheet is removed with whatever in it had
  // focus, which dropped a keyboard to <body> — inside the overlay's dialog
  // too. A keyboard goes to the listing's own link in the list: it has a name,
  // and its chip is the ring. It went to the pin that opened the sheet, which
  // is `aria-hidden` (a button with no name) and whose ring was off-white over
  // the tiles, and a `:focus-visible` read passed both. A pointer's close goes
  // to the pin, with no ring (a focus on the list link would draw its chip).
  for (const { width, height, expand } of [
    { width: 390, height: 844, expand: false },
    { width: 390, height: 844, expand: true },
    { width: 1440, height: 900, expand: false },
  ])
    test(`the homepage band at ${width}${expand ? ", expanded" : ""}: × and Escape hand a keyboard to the listing's named link, drawn at 3:1; a pointer's × leaves it on the pin`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, width, height);
      try {
        await page.goto(LIVE_HOME);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        await drawn(page);
        if (expand) {
          await map.locator("[data-map-expand]").click();
          await expect(map).toHaveAttribute("data-expanded", "true");
        }
        const holder = () =>
          map.evaluate((el) => {
            const a = document.activeElement;
            return {
              pin: a?.getAttribute("data-map-pin") ?? null,
              ring: !!a?.matches(":focus-visible"),
              listLink: a?.matches("[data-map-link]") ? a.textContent!.trim() : null,
              inside: !!a && el.contains(a),
              dialog: el.getAttribute("role"),
            };
          });
        const dialog = expand ? "dialog" : null;
        const sheet = map.locator("[data-map-sheet]");
        const close = sheet.locator("button");

        for (const how of ["× and Enter", "Escape"] as const) {
          await openSheet(page);
          const title = (await sheet.locator("p").first().textContent())!.trim();
          const named = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
          // A keyboard in the sheet: Tab from its first link, so the focus is
          // the keyboard's (a ring), not the pointer's that opened it.
          await sheet.locator("a").first().focus();
          await page.keyboard.press("Tab");
          if (how === "Escape") await page.keyboard.press("Escape");
          else {
            await close.focus();
            await page.keyboard.press("Enter");
          }
          await expect(sheet, `${how} closes it`).toHaveCount(0);
          expect(await holder(), `${how}: the listing's link (${await focused(page)})`).toEqual({
            pin: null,
            ring: true,
            listLink: expect.stringMatching(named),
            inside: true,
            dialog,
          });
          expect(await focusedAx(page), `${how}: what a screen reader hears`).toEqual({
            role: "link",
            name: expect.stringMatching(named),
            ignored: false,
          });
          const n = await map.evaluate((el) =>
            [...el.querySelectorAll("[data-map-link]")].indexOf(document.activeElement!),
          );
          const shown = await indicatorOf(page, map.locator("[data-map-link]").nth(n));
          console.log(`${width}${expand ? " expanded" : ""}, ${how}: its chip, ${shown.numbers}`);
          expect(shown.seen, `${how}: its chip, ${shown.numbers}`).toBe(true);
        }

        const id = await openSheet(page);
        await close.click();
        await expect(sheet).toHaveCount(0);
        expect(await holder(), `a pointer's ×: the pin, no ring (${await focused(page)})`).toEqual({
          pin: id,
          ring: false,
          listLink: null,
          inside: true,
          dialog,
        });
      } finally {
        await context.close();
      }
    });

  // EVERY FOCUS ON THE BAND'S MAP CAN BE SEEN. The root's `bg-dark` handed an
  // off-white ring to all that is drawn on the tiles or on sand (the pins, the
  // picture's pins, the sheet, both credits), and the root's `overflow-hidden`
  // clipped the canvas's whole ring. Each target is measured in pixels, and
  // each state names the kinds it must reach, so a selector that stops
  // matching goes red instead of measuring fewer.
  for (const { width, height, expand, picture, kinds } of [
    {
      width: 390,
      height: 844,
      expand: false,
      picture: false,
      kinds: ["canvas", "control", "credit (i)", "list link", "pin", "sheet link", "sheet ×"],
    },
    {
      width: 390,
      height: 844,
      expand: true,
      picture: false,
      kinds: ["canvas", "control", "credit link", "list link", "pin", "sheet link", "sheet ×"],
    },
    {
      width: 1440,
      height: 900,
      expand: false,
      picture: false,
      kinds: ["canvas", "control", "credit link", "list link", "pin", "sheet link", "sheet ×"],
    },
    {
      width: 390,
      height: 844,
      expand: false,
      picture: true,
      kinds: ["control", "credit link", "list link", "picture pin"],
    },
  ])
    test(`the homepage band at ${width}${expand ? ", expanded" : ""}${picture ? ", its picture" : ", a sheet open"}: every focus on the map is drawn at 3:1 against what it covers`, async ({
      browser,
    }) => {
      const { context, page } = await at(browser, width, height);
      try {
        // No style, no `load`: the picture stays up.
        if (picture) await page.route(/\/map-style\.json/, (route) => route.abort());
        await page.goto(LIVE_HOME);
        await hydrated(page);
        const map = page.locator(MAP).first();
        await map.scrollIntoViewIfNeeded();
        if (picture) await expect(map.locator("[data-map-home-pin]:visible").first()).toBeVisible();
        else {
          await drawn(page);
          if (expand) {
            await map.locator("[data-map-expand]").click();
            await expect(map).toHaveAttribute("data-expanded", "true");
          }
          await openSheet(page);
        }
        await page.keyboard.press("Shift");
        const targets = await map.evaluate((root) => {
          const box = root.getBoundingClientRect();
          const DRAWN_OVER =
            "[data-map-sheet], [data-map-controls], .maplibregl-ctrl, [data-map-home-credit]";
          const MARKER = "[data-map-pin], [data-map-cluster], [data-map-home-pin]";
          // A marker whose ring's box is in the map and under nothing else.
          const clear = (el: Element) => {
            const r = (el.querySelector("svg") ?? el).getBoundingClientRect();
            return [
              [r.left - 5, r.top - 5],
              [r.right + 5, r.top - 5],
              [r.left - 5, r.bottom + 5],
              [r.right + 5, r.bottom + 5],
            ].every(([x, y]) => {
              if (x! < box.left || x! > box.right || y! < box.top || y! > box.bottom) return false;
              const hit = document.elementFromPoint(x!, y!);
              return (
                !!hit &&
                root.contains(hit) &&
                !hit.closest(DRAWN_OVER) &&
                (!hit.closest(MARKER) || hit.closest(MARKER) === el)
              );
            });
          };
          const out: { kind: string; label: string; n: number }[] = [];
          const one = new Set(["list link", "pin", "cluster", "picture pin"]);
          root
            .querySelectorAll<HTMLElement>("a[href], button, summary, [tabindex]")
            .forEach((el, n) => {
              if ((el as HTMLButtonElement).disabled || el.closest("[inert]")) return;
              const kind = el.matches("[data-map-link]")
                ? "list link"
                : el.tagName === "CANVAS"
                  ? "canvas"
                  : el.matches("[data-map-pin]")
                    ? "pin"
                    : el.matches("[data-map-cluster]")
                      ? "cluster"
                      : el.matches("[data-map-home-pin]")
                        ? "picture pin"
                        : el.closest("[data-map-sheet]")
                          ? el.tagName === "BUTTON"
                            ? "sheet ×"
                            : "sheet link"
                          : el.tagName === "SUMMARY"
                            ? "credit (i)"
                            : el.closest(".maplibregl-ctrl-attrib, [data-map-home-credit]")
                              ? "credit link"
                              : el.matches("[data-map-control]")
                                ? "control"
                                : "other";
              if (kind !== "list link") {
                if (!el.checkVisibility({ visibilityProperty: true })) return;
                const r = el.getBoundingClientRect();
                if (r.right <= box.left || r.left >= box.right) return;
                if (r.bottom <= box.top || r.top >= box.bottom) return;
              }
              if (
                one.has(kind) &&
                (out.some((t) => t.kind === kind) || (kind !== "list link" && !clear(el)))
              )
                return;
              el.setAttribute("data-focus-target", String(n));
              const name =
                el.getAttribute("aria-label") ??
                el.getAttribute("data-map-pin") ??
                el.getAttribute("data-map-home-pin") ??
                el.textContent;
              out.push({ kind, label: `${kind} ${(name ?? "").trim().slice(0, 24)}`, n });
            });
          return out;
        });
        expect(
          kinds.filter((k) => !targets.some((t) => t.kind === k)),
          `premise: every kind reached (${targets.map((t) => t.label).join(", ")})`,
        ).toEqual([]);
        const unseen: string[] = [];
        for (const t of targets) {
          const shown = await indicatorOf(page, map.locator(`[data-focus-target="${t.n}"]`));
          console.log(`${t.label}: ${shown.numbers}`);
          if (!shown.seen) unseen.push(`${t.label}: ${shown.numbers}`);
        }
        expect(unseen).toEqual([]);
        if (picture)
          expect(await map.getAttribute("data-map-ready"), "premise: never drawn").toBeNull();
      } finally {
        await context.close();
      }
    });

  // …AND SO DOES THE LOCK. Under reduced motion nothing runs, so the band is
  // interactive; the preference turning off makes the slideshow eligible, and
  // an unpaused one locks the map: pins disabled, canvas out of the tab order,
  // the sheet closed. Chrome blurs a focused element the moment it is
  // disabled or loses its tabindex, so each is handed on first: from the
  // sheet or a pin to the listing's own link in the list (its chip), from the
  // canvas to expand — and a pointer's focus (the pin a press focused) to
  // expand too, since a focus on the list link would draw its chip.
  for (const from of ["the sheet", "a pin", "a pin, by pointer", "the canvas"] as const)
    for (const expand of [false, true])
      test(`the homepage band at 390${expand ? ", expanded" : ""}: the lock moves focus off ${from}, and not to <body>`, async ({
        browser,
      }) => {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        try {
          await page.goto(LIVE_HOME);
          await hydrated(page);
          const map = page.locator(MAP).first();
          await map.scrollIntoViewIfNeeded();
          await drawn(page);
          if (expand) {
            await map.locator("[data-map-expand]").click();
            await expect(map).toHaveAttribute("data-expanded", "true");
          }
          let title: string | null = null;
          if (from === "the canvas") {
            await map.locator("canvas").focus();
          } else if (from === "a pin, by pointer") {
            const id = await openSheet(page);
            expect(await focused(page), "premise: the press focused its pin").toMatch(/^BUTTON/);
            expect(
              await page.evaluate(() => document.activeElement?.getAttribute("data-map-pin")),
            ).toBe(id);
          } else {
            await openSheet(page);
            title = await map.locator("[data-map-sheet] p").first().textContent();
            if (from === "a pin") {
              // The press focused the pin; a key makes that focus a keyboard's.
              await page.keyboard.press("Shift");
              expect(
                await page.evaluate(() =>
                  document.activeElement?.matches("[data-map-pin]:focus-visible"),
                ),
                "premise: a keyboard's focus on the pin",
              ).toBe(true);
            } else {
              await map.locator("[data-map-sheet] a").first().focus();
              await page.keyboard.press("Tab");
            }
          }
          const before = await focused(page);
          expect(await map.getAttribute("data-map-locked"), "premise: unlocked").toBeNull();
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await expect(map, "premise: the lock").toHaveAttribute("data-map-locked", "");
          const after = await map.evaluate((el) => {
            const a = document.activeElement;
            return {
              inside: !!a && el.contains(a),
              expand: !!a?.matches("[data-map-expand]"),
              listLink: a?.matches("[data-map-link]") ? a.textContent!.trim() : null,
              dialog: el.getAttribute("role"),
            };
          });
          expect(after.inside, `from ${before}, still in the map (${await focused(page)})`).toBe(
            true,
          );
          expect(after.dialog).toBe(expand ? "dialog" : null);
          if (title === null) expect(after.expand, `${from}: on expand`).toBe(true);
          else
            expect(after.listLink, "on the listing's own link in the list").toMatch(
              new RegExp(`^${title.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
            );
        } finally {
          await context.close();
        }
      });
});

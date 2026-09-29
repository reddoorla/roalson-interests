import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

import { forceStyle, type StyleWrite } from "./force-style";
import { hydrated } from "./hydrated";
import { GARNET, OFF_WHITE } from "./palette";

// THE MASTHEAD'S SCRIM, AS PAINTED (P1, 2026-09-28) — AND THE SOLID BAR ABOVE
// IT (2026-09-29).
//
// PageMasthead.test.ts computes the same ratios from the stops it parses out
// of app.css — fast, and blind to whether any of it reaches a pixel: a renamed
// class, a stacking change that put the photo ON TOP of the scrim, or a
// Tailwind arbitrary value (`object-[50%_70%]`) that never made it into the
// production CSS would all leave that file green. This one screenshots the band
// and reads the pixels, so it is the only evidence that the CSS actually paints.
//
// THE BAR. Until 2026-09-29 the nav floated over this band on /properties and a
// second layer, `.masthead-shade`, darkened the band's top for its sand
// controls; this spec measured them too. The client asked for the solid bar
// from the top and the "dark cloud" gone (Discord, 2026-09-29), so no control
// sits on the photo now, and what is asserted about the bar is where it is:
// solid, pinned and garnet-marked at scroll 0, with the masthead starting at
// or below its bottom edge — in the server's markup as well as once mounted.
//
// HOW. The h1 is hidden (`visibility: hidden`) so the screenshot holds only
// what is UNDER it. Then, per case:
//
//  - OVER A PURE-WHITE GROUND. The photo is hidden and the band's own ground
//    set to #fff, so every pixel is exactly 255 × (1 − darkening) and the
//    darkening can be read back row by row. This is the ground the scrim is
//    sized against (the brightest a photograph can present), so the floor, the
//    ceiling, the photo window and the undarkened top below are the unit
//    test's own claims, re-made on paint. Runs on /properties on both servers,
//    and on the fixture under `vite dev`.
//  - OVER THE PHOTO AS DRAWN. Nothing is forced, so this is the stack as
//    shipped, and a photo painted ABOVE the scrim fails here. A photo that
//    never painted would PASS — the garnet ground under the scrim clears the
//    floor — so each case first proves the pixels under the h1 are the
//    photo's, by comparing them with the same band with the photo hidden
//    (`assertPhotoPainted`). On /dev/properties the photo is a near-white
//    drawing whose sky is pure white under the title
//    (PROPERTIES_MASTHEAD_FIXTURE), so it is the worst case; on /properties it
//    is whatever the CMS holds, and its numbers are the ones a visitor gets.
//
// The INK is read off the rendered page (computed `color`), never written
// here, so a palette change re-measures itself.
//
//   pnpm exec playwright test tests/interaction/masthead-scrim.spec.ts --workers=1
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/masthead-scrim.spec.ts --workers=1
//
// Under `preview` the fixture cases SKIP, keyed on that setting and never on
// seeing a 404: /dev/* 404s on a production build (#120), and a fixture route
// that broke on dev has to fail, not vanish.
//
// /properties HAS TO CARRY A PHOTO for its cases to mean anything: with the
// `page_media.properties_masthead` field empty, PageMasthead draws no scrim.
// That is asserted, not skipped — a green over a band with no layer would be a
// green from the absence of the thing under test.

const FIXTURE = "/dev/properties";
const LIVE = "/properties";
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const NO_FIXTURE = "/dev/* 404s on a production build (#120)";

const BAR = 'nav[aria-label="Primary"]';
const BAND = "main header";

/** WCAG 1.4.3, large text (24px and up at weight 500): the h1. */
const LARGE = 3;
const LARGE_TEXT_MIN_PX = 24;
/** PageMasthead.test.ts's ceilings — see there for the reasoning. */
const TITLE_CEILING = 0.55;
const WINDOW_CEILING = 0.35;
/** How far down the band the photo window runs: app.css's "Nothing above
 *  36%". Held to WINDOW_CEILING there, not to zero — zero is the top strip's. */
const PHOTO_TO = 0.36;
/** "Undarkened", read off an 8-bit screenshot: one level of 255 of slack. */
const UNDARKENED = 1 / 255;

/** What the bar draws at each width: the CTA, whose wrapper in Nav.svelte is
 *  `hidden sm:block`, at 1440 but not at 390. DECLARED per viewport, never
 *  inferred from a breakpoint: Tailwind v4 ignores `--screen-*`, so the shipped
 *  `sm:` is 40rem, 640px, and the band measures 15px narrower than the
 *  viewport (html has `scrollbar-gutter: stable`). A viewport added here has to
 *  say what its bar shows. */
const VIEWPORTS = [
  { width: 1440, height: 900, cta: true },
  { width: 390, height: 844, cta: false },
];
type Viewport = (typeof VIEWPORTS)[number];

/** How much of what is under the h1 must be the photo, for an as-drawn case
 *  to count as having measured it. See `assertPhotoPainted`. */
const PHOTO_SHARE_MIN = 0.5;
/** A device pixel "differs" when some channel moved by more than this. */
const PHOTO_DIFF_LEVELS = 8;

/** WCAG 2.x relative luminance / contrast. */
const luminance = ([r, g, b]: number[]) => {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parseRgb = (css: string) => {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(css);
  if (!m) throw new Error(`cannot read colour "${css}"`);
  if (m[4] !== undefined && Number(m[4]) !== 1) throw new Error(`"${css}" is not opaque`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

type Box = { x: number; y: number; width: number; height: number };
type Ink = { what: string; box: Box; color: number[] };

async function at(browser: Browser, { width, height }: Viewport, javaScriptEnabled = true) {
  const context = await browser.newContext({ viewport: { width, height }, javaScriptEnabled });
  return { context, page: await context.newPage() };
}

/** The bar as it stands, and where the band starts under it — one read. The
 *  wordmark is the home link's two lockups: the garnet one first, the reverse
 *  one (for a floating bar) second. */
const barState = (page: Page) =>
  page.evaluate(
    ([barSel, bandSel]) => {
      const bar = document.querySelector(barSel)!;
      const band = document.querySelector(bandSel)!;
      const [garnet, reverse] = [...bar.querySelectorAll('a[href="/"] img')].map((img) => ({
        opacity: Number(getComputedStyle(img).opacity),
        width: img.getBoundingClientRect().width,
      }));
      // The bar's own CTA — not the <noscript> list's "Contact Us", which a
      // browser with scripting off lays out in the bar at 390.
      const cta = [...bar.querySelectorAll("a")].find(
        (a) =>
          !a.closest("noscript") &&
          a.textContent!.trim().toLowerCase() === "contact us" &&
          a.checkVisibility(),
      );
      return {
        scrollY: window.scrollY,
        floating: bar.hasAttribute("data-floating"),
        position: getComputedStyle(bar).position,
        ground: getComputedStyle(bar).backgroundColor,
        garnet,
        reverse,
        cta: cta ? getComputedStyle(cta).color : null,
        barBottom: bar.getBoundingClientRect().bottom,
        bandTop: band.getBoundingClientRect().top,
      };
    },
    [BAR, BAND] as const,
  );

/** The solid bar, from the top: no float, the page's off-white ground, the
 *  garnet wordmark showing and the reverse one not, CONTACT US garnet where the
 *  bar draws it — and the masthead starting at or below the bar's bottom. */
async function assertSolidBarAbove(page: Page, viewport: Viewport, where: string) {
  const s = await barState(page);
  const seen = JSON.stringify(s);
  expect(s.scrollY, `${where}: at the top of the page`).toBe(0);
  expect(s.floating, `${where}: the bar does not float: ${seen}`).toBe(false);
  expect(s.position, `${where}: pinned: ${seen}`).toBe("fixed");
  expect(s.ground, `${where}: on the page's off-white: ${seen}`).toBe(OFF_WHITE);
  expect(s.garnet, `${where}: the garnet wordmark shows: ${seen}`).toEqual(
    expect.objectContaining({ opacity: 1 }),
  );
  expect(s.garnet!.width, `${where}: and has a box: ${seen}`).toBeGreaterThan(0);
  expect(s.reverse?.opacity ?? 0, `${where}: the reverse one does not: ${seen}`).toBe(0);
  expect(s.cta, `${where}: CONTACT US (${viewport.cta ? "drawn" : "not drawn"}): ${seen}`).toBe(
    viewport.cta ? GARNET : null,
  );
  expect(
    s.bandTop,
    `${where}: the masthead's top edge is at or below the bar's bottom edge: ${seen}`,
  ).toBeGreaterThanOrEqual(s.barBottom);
}

/** Everything the measurement needs, read off the page BEFORE anything is
 *  hidden: the band, the bar's height, the h1, the band's layers, the photo. */
const read = (page: Page) =>
  page.evaluate(
    ([barSel, bandSel]) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const band = document.querySelector(bandSel)!;
      const bar = document.querySelector(barSel)!;
      const h1 = band.querySelector("h1")!;
      const img = band.querySelector("img");
      return {
        band: box(band),
        barHeight: bar.getBoundingClientRect().height,
        title: {
          what: "the h1",
          box: box(h1),
          color: getComputedStyle(h1).color,
          fontSize: parseFloat(getComputedStyle(h1).fontSize),
        },
        // Every decorative box in the band, not one class: the shade that
        // used to sit here would come back under any name.
        layers: {
          scrim: band.querySelectorAll(".masthead-scrim").length,
          decorative: band.querySelectorAll('[aria-hidden="true"]').length,
        },
        photo: img ? { objectPosition: getComputedStyle(img).objectPosition } : null,
      };
    },
    [BAR, BAND] as const,
  );

/** Hide the h1 — and, for the white ground, the photo — and WAIT until the
 *  page wears it, descendants included, through ./force-style (under the
 *  harness's `reduce` a child inherits `hidden` through a transition of its
 *  own, #170). */
async function strip(page: Page, ground: "white" | "photo") {
  const writes: StyleWrite[] = [[`${BAND} h1`, "visibility", "hidden"]];
  if (ground === "white") {
    writes.push([`${BAND} img`, "visibility", "hidden"]);
    writes.push([BAND, "background-image", "none"]);
    writes.push([BAND, "background-color", "#fff", "rgb(255, 255, 255)"]);
  }
  await forceStyle(page, writes, "the ink or the photo never hid");
}

/** The band as pixels, with helpers in CSS px. */
async function shoot(page: Page, band: Box) {
  const clip = { x: band.x, y: band.y, width: Math.floor(band.width), height: band.height };
  const png = await page.screenshot({ clip });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const scale = info.width / clip.width;
  const px = (x: number, y: number) => {
    const at = (y * info.width + x) * info.channels;
    return [data[at], data[at + 1], data[at + 2]];
  };
  /** Every device pixel whose centre lies in `box` (viewport coords). */
  const within = (box: Box) => {
    const out: number[][] = [];
    const x0 = Math.max(0, Math.ceil((box.x - clip.x) * scale));
    const x1 = Math.min(info.width, Math.floor((box.x - clip.x + box.width) * scale));
    const y0 = Math.max(0, Math.ceil((box.y - clip.y) * scale));
    const y1 = Math.min(info.height, Math.floor((box.y - clip.y + box.height) * scale));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push(px(x, y));
    if (out.length === 0) throw new Error(`no pixels in ${JSON.stringify(box)}`);
    return out;
  };
  /** Black laid over white, per CSS row: [darkest, lightest] across the row. */
  const darkening = (y: number) => {
    const row = Math.min(info.height - 1, Math.floor((y - clip.y) * scale));
    let lo = 255;
    let hi = 0;
    for (let x = 0; x < info.width; x++) {
      const v = Math.max(...px(x, row));
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return { darkest: 1 - lo / 255, lightest: 1 - hi / 255 };
  };
  return { within, darkening };
}

const brightest = (pixels: number[][]) =>
  pixels.reduce((a, b) => (luminance(b) > luminance(a) ? b : a));

/** The worst ratio an ink gets over what is under its own box. */
const worstUnder = (pixels: number[][], ink: Ink) => {
  const ground = brightest(pixels);
  return { ratio: contrast(ink.color, ground), ground };
};

async function measure(page: Page, ground: "white" | "photo") {
  await hydrated(page);
  const seen = await read(page);
  expect(
    seen.layers,
    "PageMasthead's layers over the photo are exactly one scrim. No scrim: is there a photo " +
      "on this route? /properties needs one in page_media.properties_masthead for this spec to " +
      "measure anything. A second decorative box: the shade is back, under whatever name.",
  ).toEqual({ scrim: 1, decorative: 1 });
  expect(seen.title.fontSize).toBeGreaterThanOrEqual(LARGE_TEXT_MIN_PX);

  await strip(page, ground);
  const shot = await shoot(page, seen.band);
  const title: Ink = { ...seen.title, color: parseRgb(seen.title.color) };

  // Over the photo, the same band again with the photo hidden: what these
  // pixels would be had the photo not painted (the garnet ground under the
  // scrim). `assertPhotoPainted` reads the share of the h1's box that differs.
  let photo = NaN;
  if (ground === "photo") {
    await forceStyle(page, [[`${BAND} img`, "visibility", "hidden"]], "the photo never hid");
    const bare = await shoot(page, seen.band);
    const drawn = shot.within(title.box);
    const without = bare.within(title.box);
    const moved = drawn.filter((p, i) =>
      p.some((c, k) => Math.abs(c - without[i][k]) > PHOTO_DIFF_LEVELS),
    );
    photo = moved.length / drawn.length;
  }
  return {
    seen,
    title: { ink: title, ...worstUnder(shot.within(title.box), title), photo },
    darkening: shot.darkening,
  };
}

/** The as-drawn cases' positive evidence that they measured a PHOTO. Loaded,
 *  decoded and not broken still is not painted — and with no photo pixels the
 *  ground under the scrim is the band's garnet gradient, which clears the
 *  floor. So a case goes green only if most of what is under the h1 differs
 *  from the same band with the photo hidden. Measured 2026-09-28: 100% under
 *  every ink on both routes at both widths; with `opacity-0` on the masthead
 *  img (loaded, decoded, never visible) 0%. */
function assertPhotoPainted(m: Awaited<ReturnType<typeof measure>>, where: string) {
  const { ink, photo } = m.title;
  expect(
    photo,
    `${where}: only ${(photo * 100).toFixed(0)}% of the pixels under ${ink.what} differ from ` +
      `the band with its photo hidden — the photo has not painted, so this measured the ` +
      `garnet ground, not the photo.`,
  ).toBeGreaterThanOrEqual(PHOTO_SHARE_MIN);
}

function assertFloor(m: Awaited<ReturnType<typeof measure>>, where: string) {
  const { ink, ratio, ground } = m.title;
  expect(
    ratio,
    `${where}: the h1 (rgb ${ink.color.join(" ")}) over the brightest pixel in its line box ` +
      `(rgb ${ground.join(" ")}) is ${ratio.toFixed(2)}:1, below ${LARGE}:1.`,
  ).toBeGreaterThanOrEqual(LARGE);
}

/** Only on the white ground, where a pixel IS the darkening. Soft, so a
 *  regression that trips more than one of the three reports all of them. */
function assertCeilings(m: Awaited<ReturnType<typeof measure>>, where: string) {
  const { band, barHeight, title } = m.seen;
  const rows = (y0: number, y1: number) =>
    Array.from({ length: Math.floor(y1) - Math.ceil(y0) }, (_, i) => Math.ceil(y0) + i);

  // The "dark cloud" (Discord, 2026-09-29): the band's first bar-height of
  // rows is the photo itself, darkened by nothing.
  const top = Math.max(...rows(band.y, band.y + barHeight).map((y) => m.darkening(y).darkest));
  expect
    .soft(
      top,
      `${where}: the band's first ${barHeight}px sit under ${top.toFixed(3)} black at their ` +
        `darkest; nothing sits on the photo there, so nothing may darken it.`,
    )
    .toBeLessThanOrEqual(UNDARKENED);

  const t = Math.max(
    ...rows(title.box.y, title.box.y + title.box.height).map((y) => m.darkening(y).darkest),
  );
  expect
    .soft(
      t,
      `${where}: the h1's line box sits under ${t.toFixed(3)} black at its darkest; the ceiling ` +
        `is ${TITLE_CEILING}.`,
    )
    .toBeLessThanOrEqual(TITLE_CEILING);

  // The window: from under that strip to PHOTO_TO of the band, the photo
  // shows. Not "somewhere above the h1" — the strip above is held at zero, so
  // that could only ever pass (a flat 0.44 haze from 31% of the band was green
  // on it).
  const span = rows(band.y + barHeight, band.y + PHOTO_TO * band.height);
  // `Math.max()` of no rows is -Infinity, which clears any ceiling.
  expect(span.length, `${where}: the photo window holds no rows`).toBeGreaterThan(0);
  const window = Math.max(...span.map((y) => m.darkening(y).darkest));
  expect
    .soft(
      window,
      `${where}: between the band's first ${barHeight}px and ${PHOTO_TO * 100}% of it the scrim ` +
        `reaches ${window.toFixed(3)} black; the photo has to show there (<= ${WINDOW_CEILING}).`,
    )
    .toBeLessThanOrEqual(WINDOW_CEILING);
}

for (const route of [FIXTURE, LIVE]) {
  test.describe(`${route}: the solid bar from the top, and the masthead below it`, () => {
    test.skip(route === FIXTURE && PREVIEW, NO_FIXTURE);

    for (const viewport of VIEWPORTS) {
      test(`${viewport.width}: solid, pinned and garnet-marked at scroll 0, with the masthead at or below its bottom edge`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, viewport);
        try {
          await page.goto(route);
          await hydrated(page);
          await assertSolidBarAbove(page, viewport, `${route} at ${viewport.width}`);
        } finally {
          await context.close();
        }
      });

      // The server's answer, which is the only one a visitor without script
      // gets and the first paint for everyone else: the bar is pinned and
      // solid in the markup, not re-toned by an effect.
      //
      // `load`, not `domcontentloaded`: `barState` is one read, and all of it
      // but `floating` is the stylesheet's. `vite dev` inlines the CSS in a
      // <style>; a production build LINKS it (two sheets on /properties), so
      // on a preview server a read at DOMContentLoaded raced them and got an
      // unstyled page: a `static` bar, a transparent ground, a link-blue CTA.
      // Measured 2026-09-29: 18/40 reads at a reviewer's load, 4/60 here at
      // 2-5; with the sheets held back 1.5s, `static` 30/30 at
      // DOMContentLoaded and `fixed` 30/30 at `load`, which waits for them.
      test(`${viewport.width}, scripting off: the server's bar is already the solid one`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, viewport, false);
        try {
          await page.goto(route);
          expect(
            await page.evaluate(() => document.documentElement.hasAttribute("data-hydrated")),
            "positive evidence script is off: the root layout never mounted",
          ).toBe(false);
          await assertSolidBarAbove(page, viewport, `${route} at ${viewport.width}, no script`);
        } finally {
          await context.close();
        }
      });
    }
  });
}

for (const route of [FIXTURE, LIVE]) {
  test.describe(`${route}: the masthead's scrim over a pure-white ground`, () => {
    test.skip(route === FIXTURE && PREVIEW, NO_FIXTURE);

    for (const viewport of VIEWPORTS) {
      test(`${viewport.width}: the h1 clears its floor, the scrim stays under its ceilings, and the band's top is undarkened`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, viewport);
        try {
          await page.goto(route);
          const m = await measure(page, "white");
          // The comp's crop, as COMPUTED — which proves Tailwind emitted the
          // arbitrary `object-[50%_70%]` into the CSS this server ships, a
          // thing the unit test's class-list check cannot see.
          expect(
            m.seen.photo?.objectPosition,
            "the photo's computed object-position — the comp's crop is 50% 70%",
          ).toBe("50% 70%");
          const where = `${route} at ${viewport.width}, white ground`;
          assertFloor(m, where);
          assertCeilings(m, where);
          test.info().annotations.push({
            type: "measured",
            description: `${where}: h1 ${m.title.ratio.toFixed(2)}:1`,
          });
        } finally {
          await context.close();
        }
      });
    }
  });
}

for (const route of [FIXTURE, LIVE]) {
  const photo = route === FIXTURE ? "the fixture's near-white photo" : "the CMS photo";
  test.describe(`${route}: the masthead over ${photo}, as drawn`, () => {
    test.skip(route === FIXTURE && PREVIEW, NO_FIXTURE);

    for (const viewport of VIEWPORTS) {
      test(`${viewport.width}: the photo is UNDER the scrim and the h1 clears its floor`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, viewport);
        try {
          await page.goto(route);
          // Loaded and not broken (`naturalWidth`: a broken image is
          // `complete` too), then decoded — the img is `decoding="async"`, so
          // decode can trail load. Neither proves the photo PAINTED; that is
          // `assertPhotoPainted`'s job. The CMS photo comes over the network,
          // hence the longer wait.
          await expect
            .poll(
              () =>
                page.locator(`${BAND} img`).evaluate(async (i: HTMLImageElement) => {
                  if (!i.complete || i.naturalWidth === 0) return false;
                  try {
                    await i.decode();
                    return true;
                  } catch {
                    return false;
                  }
                }),
              { message: `${photo} never loaded and decoded`, timeout: 30_000 },
            )
            .toBe(true);
          const m = await measure(page, "photo");
          const where = `${route} at ${viewport.width}, ${photo}`;
          assertPhotoPainted(m, where);
          assertFloor(m, where);
          test.info().annotations.push({
            type: "measured",
            description:
              `${where}: h1 ${m.title.ratio.toFixed(2)}:1 over rgb ` +
              `${m.title.ground.join(" ")} (photo ${(m.title.photo * 100).toFixed(0)}%)`,
          });
        } finally {
          await context.close();
        }
      });
    }
  });
}

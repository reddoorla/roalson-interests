import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

import { hydrated } from "./hydrated";

// THE MASTHEAD'S TWO DARKENING LAYERS, AS PAINTED (P1, 2026-09-28).
//
// PageMasthead.test.ts computes the same ratios from the stops it parses out
// of app.css — fast, and blind to whether any of it reaches a pixel: a renamed
// class, a stacking change that put the photo ON TOP of the layers, or a
// Tailwind arbitrary value (`object-[50%_70%]`) that never made it into the
// production CSS would all leave that file green. This one screenshots the band
// and reads the pixels, so it is the only evidence that the CSS actually paints.
//
// HOW. The ink is hidden (`visibility: hidden` on the bar and the h1) so the
// screenshot holds only what is UNDER each piece of text. Then, per case:
//
//  - OVER A PURE-WHITE GROUND. The photo is hidden and the band's own ground
//    set to #fff, so every pixel is exactly 255 × (1 − darkening) and the
//    darkening can be read back row by row. This is the ground the layers are
//    sized against (the brightest a photograph can present), so the floors,
//    the ceilings and the photo window below are the unit test's own claims,
//    re-made on paint. Runs on /properties on both servers, and on the fixture
//    under `vite dev`.
//  - OVER THE PHOTO AS DRAWN. Nothing is forced, so this is the stack as
//    shipped, and a photo painted ABOVE the layers fails here (measured: 1.30:1
//    for the CTA with `z-10` on the img). A photo that never painted would
//    PASS — the garnet ground under the layers clears every floor — so each
//    case first proves the pixels under every ink are the photo's, by
//    comparing them with the same band with the photo hidden
//    (`assertPhotoPainted`). On /dev/properties the photo is a
//    near-white drawing whose sky is pure white under the bar and the title
//    (PROPERTIES_MASTHEAD_FIXTURE), so it is the worst case; on /properties it
//    is whatever the CMS holds, and its numbers are the ones a visitor gets.
//
// The INKS are read off the rendered page (computed `color`), never written
// here, so a palette change (sand #e8e1d1 → #eae7e4) re-measures itself.
//
//   pnpm exec playwright test tests/interaction/masthead-scrim.spec.ts --workers=1
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/masthead-scrim.spec.ts --workers=1
//
// Under `preview` the fixture cases SKIP, keyed on that setting and never on
// seeing a 404: /dev/* 404s on a production build (#120), and a fixture route
// that broke on dev has to fail, not vanish.
//
// /properties HAS TO CARRY A PHOTO for its cases to mean anything: with the
// `page_media.properties_masthead` field empty, PageMasthead draws neither
// layer. That is asserted, not skipped — a green over a band with no layers
// would be a green from the absence of the thing under test.

const FIXTURE = "/dev/properties";
const LIVE = "/properties";
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const NO_FIXTURE = "/dev/* 404s on a production build (#120)";

const BAR = 'nav[aria-label="Primary"]';
const BAND = "main header";

/** WCAG 1.4.3: the bar's CTA label is t-h6, 12px — normal text. */
const AA = 4.5;
/** WCAG 1.4.3, large text (24px and up at weight 500): the h1. */
const LARGE = 3;
const LARGE_TEXT_MIN_PX = 24;
/** PageMasthead.test.ts's ceilings — see there for the reasoning. */
const BAR_CEILING = 0.7;
const TITLE_CEILING = 0.55;
const WINDOW_CEILING = 0.35;

/** What the bar draws at each width: the menu trigger always, and the CTA,
 *  whose wrapper in Nav.svelte is `hidden sm:block`, at 1440 but not at 390.
 *  DECLARED per viewport, never inferred from a breakpoint. This spec used to
 *  expect the CTA from a band 560px wide, the `--screen-sm` app.css declared —
 *  but Tailwind v4 ignores `--screen-*`, so the shipped `sm:` is 40rem, 640px.
 *  The band measures 15px narrower than the viewport (545 at 560, 624 at 639;
 *  html has `scrollbar-gutter: stable`), so the guess expected a CTA the page
 *  does not draw at viewports 575 to 639 — measured: no CTA through 639,
 *  "Contact us" from 640, and the old check red at 600. A viewport added here
 *  has to say what its bar shows. */
const VIEWPORTS = [
  { width: 1440, height: 900, cta: true },
  { width: 390, height: 844, cta: false },
];
type Viewport = (typeof VIEWPORTS)[number];

/** How much of what is under an ink must be the photo, for an as-drawn case
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

async function at(browser: Browser, { width, height }: Viewport) {
  const context = await browser.newContext({ viewport: { width, height } });
  return { context, page: await context.newPage() };
}

/** Everything the measurement needs, read off the page BEFORE anything is
 *  hidden: the band, the bar's height, every visible control in the bar with
 *  its computed colour (the wordmark is a logo, exempt, and left out) and
 *  whether it is the menu trigger (the one control with `aria-expanded` once
 *  script runs), the h1, and the photo. */
const read = (page: Page) =>
  page.evaluate(
    ([barSel, bandSel]) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      };
      const band = document.querySelector(bandSel)!;
      const bar = document.querySelector(barSel)!;
      const controls = [...bar.querySelectorAll("a, button")]
        .filter((el) => el.getAttribute("href") !== "/")
        .filter((el) => el.checkVisibility() && el.getBoundingClientRect().width > 0)
        .map((el) => ({
          what: el.getAttribute("aria-label") ?? el.textContent!.trim(),
          trigger: el.matches("button[aria-expanded]"),
          box: box(el),
          color: getComputedStyle(el).color,
        }));
      const h1 = band.querySelector("h1")!;
      const img = band.querySelector("img");
      return {
        band: box(band),
        barHeight: bar.getBoundingClientRect().height,
        controls,
        title: {
          what: "the h1",
          box: box(h1),
          color: getComputedStyle(h1).color,
          fontSize: parseFloat(getComputedStyle(h1).fontSize),
        },
        layers: {
          shade: band.querySelectorAll(".masthead-shade").length,
          scrim: band.querySelectorAll(".masthead-scrim").length,
        },
        photo: img ? { objectPosition: getComputedStyle(img).objectPosition } : null,
      };
    },
    [BAR, BAND] as const,
  );

/** Hide the ink — and, for the white ground, the photo — and WAIT until the
 *  page wears it: "I wrote it" is not "it is applied" (canvas-ground.spec.ts
 *  learned that the intermittent way). Every write is `!important` with
 *  `transition: none` beside it, on the element AND each of its descendants,
 *  and the wait polls every one of them. Measured on the first run: with the
 *  write on the bar alone, the bar computed `hidden` at once but its CTA and
 *  menu button still computed `visible` a frame later (hidden by 100ms), and
 *  the screenshot caught the glyph — 1.00:1, sand over sand. That lag exists
 *  only under the harness's `reducedMotion: "reduce"`; with motion allowed the
 *  children hid in the same frame. The likeliest cause is app.css's reduce
 *  block, which gives EVERY element a 0.01ms transition-duration — and an
 *  element's transition-property defaults to `all`. */
async function strip(page: Page, ground: "white" | "photo") {
  const writes: Write[] = [
    [BAR, "visibility", "hidden"],
    [`${BAND} h1`, "visibility", "hidden"],
  ];
  if (ground === "white") {
    writes.push([`${BAND} img`, "visibility", "hidden"]);
    writes.push([BAND, "background", "#fff"]);
  }
  await apply(page, writes, "the ink or the photo never hid");
}

type Write = [selector: string, property: string, value: string];

/** Make `writes`, then poll until every target computes them (see `strip`). */
async function apply(page: Page, writes: Write[], message: string) {
  const applied = (list: Write[]) =>
    page.evaluate((list) => {
      const targets = (sel: string, deep: boolean) => {
        const el = document.querySelector(sel) as HTMLElement;
        return deep ? [el, ...el.querySelectorAll<HTMLElement>("*")] : [el];
      };
      return list.every(([sel, prop, value]) =>
        targets(sel, prop === "visibility").every((el) => {
          const cs = getComputedStyle(el);
          if (prop === "background") {
            return cs.backgroundImage === "none" && cs.backgroundColor === "rgb(255, 255, 255)";
          }
          return cs.getPropertyValue(prop) === value;
        }),
      );
    }, list);
  await page.evaluate((list) => {
    for (const [sel, prop, value] of list) {
      const el = document.querySelector(sel) as HTMLElement;
      const all = prop === "visibility" ? [el, ...el.querySelectorAll<HTMLElement>("*")] : [el];
      for (const node of all) {
        node.style.setProperty("transition", "none", "important");
        node.style.setProperty(prop, value, "important");
      }
    }
  }, writes);
  await expect.poll(() => applied(writes), message).toBe(true);
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

async function measure(page: Page, ground: "white" | "photo", viewport: Viewport) {
  await hydrated(page);
  const seen = await read(page);
  expect(
    seen.layers,
    "PageMasthead drew no darkening layers — is there a photo on this route? /properties " +
      "needs one in page_media.properties_masthead for this spec to measure anything.",
  ).toEqual({ shade: 1, scrim: 1 });
  // Positive evidence of what is being measured: a bar with exactly the
  // controls VIEWPORTS says it draws at this width — the menu trigger always,
  // the CTA where Nav draws it — and a title in large type. A selector
  // that stopped matching fails here rather than auditing nothing.
  const listed = JSON.stringify(seen.controls);
  expect(
    seen.controls.filter((c) => c.trigger).length,
    `the menu trigger is in the bar at ${viewport.width}: ${listed}`,
  ).toBe(1);
  expect(
    seen.controls.filter((c) => !c.trigger).length,
    `the bar draws ${viewport.cta ? "its CTA" : "no CTA"} at ${viewport.width} (VIEWPORTS): ${listed}`,
  ).toBe(viewport.cta ? 1 : 0);
  expect(seen.title.fontSize).toBeGreaterThanOrEqual(LARGE_TEXT_MIN_PX);

  await strip(page, ground);
  const shot = await shoot(page, seen.band);
  const inks: Ink[] = seen.controls.map((c) => ({ ...c, color: parseRgb(c.color) }));
  const title: Ink = { ...seen.title, color: parseRgb(seen.title.color) };

  // Over the photo, the same band again with the photo hidden: what these
  // pixels would be had the photo not painted (the garnet ground under the
  // layers). `assertPhotoPainted` reads the share of each ink's box that
  // differs from it.
  let photoShare = (_: Box) => NaN;
  if (ground === "photo") {
    await apply(page, [[`${BAND} img`, "visibility", "hidden"]], "the photo never hid");
    const bare = await shoot(page, seen.band);
    photoShare = (box) => {
      const drawn = shot.within(box);
      const without = bare.within(box);
      const moved = drawn.filter((p, i) =>
        p.some((c, k) => Math.abs(c - without[i][k]) > PHOTO_DIFF_LEVELS),
      );
      return moved.length / drawn.length;
    };
  }
  return {
    seen,
    bar: inks.map((ink) => ({
      ink,
      ...worstUnder(shot.within(ink.box), ink),
      photo: photoShare(ink.box),
    })),
    title: {
      ink: title,
      ...worstUnder(shot.within(title.box), title),
      photo: photoShare(title.box),
    },
    darkening: shot.darkening,
  };
}

/** The as-drawn cases' positive evidence that they measured a PHOTO. Loaded,
 *  decoded and not broken still is not painted — and with no photo pixels the
 *  ground under the layers is the band's garnet gradient, which clears every
 *  floor. So a case goes green only if most of what is under each ink differs
 *  from the same band with the photo hidden. Measured 2026-09-28: 100% under
 *  every ink on both routes at both widths; with `opacity-0` on the masthead
 *  img (loaded, decoded, never visible) 0% under the first ink checked, red in
 *  all four cases — which the spec before this check passed. */
function assertPhotoPainted(m: Awaited<ReturnType<typeof measure>>, where: string) {
  for (const { ink, photo } of [...m.bar, m.title]) {
    expect(
      photo,
      `${where}: only ${(photo * 100).toFixed(0)}% of the pixels under ${ink.what} differ from ` +
        `the band with its photo hidden — the photo has not painted, so this measured the ` +
        `garnet ground, not the photo.`,
    ).toBeGreaterThanOrEqual(PHOTO_SHARE_MIN);
  }
}

function assertFloors(m: Awaited<ReturnType<typeof measure>>, where: string) {
  for (const { ink, ratio, ground } of m.bar) {
    expect(
      ratio,
      `${where}: ${ink.what} (rgb ${ink.color.join(" ")}) over the brightest pixel under it ` +
        `(rgb ${ground.join(" ")}) is ${ratio.toFixed(2)}:1, below ${AA}:1.`,
    ).toBeGreaterThanOrEqual(AA);
  }
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

  const bar = Math.max(...rows(band.y, band.y + barHeight).map((y) => m.darkening(y).darkest));
  expect
    .soft(
      bar,
      `${where}: the bar's ${barHeight}px sit under ${bar.toFixed(3)} black at their darkest; the ` +
        `ceiling is ${BAR_CEILING}.`,
    )
    .toBeLessThanOrEqual(BAR_CEILING);

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

  const window = Math.min(
    ...rows(band.y + barHeight, title.box.y).map((y) => m.darkening(y).lightest),
  );
  expect
    .soft(
      window,
      `${where}: between the bar and the h1 the layers never drop below ${window.toFixed(3)} ` +
        `black; the photo has to show somewhere there (<= ${WINDOW_CEILING}).`,
    )
    .toBeLessThanOrEqual(WINDOW_CEILING);
}

for (const route of [FIXTURE, LIVE]) {
  test.describe(`${route}: the masthead's layers over a pure-white ground`, () => {
    test.skip(route === FIXTURE && PREVIEW, NO_FIXTURE);

    for (const viewport of VIEWPORTS) {
      test(`${viewport.width}: inks clear their floors, the layers stay under their ceilings, and the photo shows between`, async ({
        browser,
      }) => {
        const { context, page } = await at(browser, viewport);
        try {
          await page.goto(route);
          const m = await measure(page, "white", viewport);
          // The comp's crop, as COMPUTED — which proves Tailwind emitted the
          // arbitrary `object-[50%_70%]` into the CSS this server ships, a
          // thing the unit test's class-list check cannot see.
          expect(
            m.seen.photo?.objectPosition,
            "the photo's computed object-position — the comp's crop is 50% 70%",
          ).toBe("50% 70%");
          const where = `${route} at ${viewport.width}, white ground`;
          assertFloors(m, where);
          assertCeilings(m, where);
          test.info().annotations.push({
            type: "measured",
            description:
              `${where}: ` +
              m.bar.map((b) => `${b.ink.what} ${b.ratio.toFixed(2)}:1`).join(", ") +
              `, h1 ${m.title.ratio.toFixed(2)}:1`,
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
      test(`${viewport.width}: the photo is UNDER both layers and every ink clears its floor`, async ({
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
          const m = await measure(page, "photo", viewport);
          const where = `${route} at ${viewport.width}, ${photo}`;
          assertPhotoPainted(m, where);
          assertFloors(m, where);
          test.info().annotations.push({
            type: "measured",
            description:
              `${where}: ` +
              [...m.bar, m.title]
                .map(
                  (b) =>
                    `${b.ink.what} ${b.ratio.toFixed(2)}:1 (photo ${(b.photo * 100).toFixed(0)}%)`,
                )
                .join(", "),
          });
        } finally {
          await context.close();
        }
      });
    }
  });
}

import { readFileSync } from "node:fs";

import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { axe } from "./axe";
import { nextTurn } from "./band-turn";
import { hydrated } from "./hydrated";
import { GARNET } from "./palette";

// THE ACTIVE LISTING'S MARKER, FEATURED (operator, 2026-09-29): "whatever the
// active pin is should stay full opacity and the rest should be slightly
// reduced opacity so it's featured".
//
// PropertyMap decides a marker's opacity by writing `--map-dim` on it, and the
// unit tests read that decision. Everything below is what jsdom cannot see:
//
//  1. THAT THE PAGE PAINTS IT. The opacity each marker's garnet is painted
//     at — every `opacity` from the painting element to the map's root, not
//     the marker's own — on the markers a real MapLibre map drew, on routes
//     the site really serves.
//  2. THAT IT FOLLOWS THE PAGE — the garnet card on /properties, the slide on
//     stage on the homepage band — and features a CLUSTER holding the active
//     listing when it has no pin of its own (#115).
//  3. THAT HOVER AND KEYBOARD FOCUS TAKE A MARKER BACK TO 1, focus ring and
//     all, and so do its list link's focus (the keyboard's way to a pin) and
//     the band's sheet naming it after a press.
//  4. THAT THE CHANGE FADES ON THE GARNET CARD'S OWN CLOCK — the live markers
//     and the placeholder picture's — and that reduced motion starts no fade
//     and shows the new value at once. Read as the CSS transitions that
//     actually START, never as a configured property.
//  5. THAT NOTHING IS DIMMED WHERE NOTHING IS ACTIVE: below `lg` on
//     /properties, loaded there or narrowed to it, and in /properties' server
//     markup.
//  6. THAT AXE STILL PASSES THE MAPS' OWN TEXT WHILE MARKERS ARE DIMMED —
//     a no-regression audit, not a measurement of the markers (see 6).
//  7. THAT THE ACTIVE PIN GROWS AND THE ONE IT LEAVES SHRINKS — through
//     intermediate sizes, on the dim's clock, about the tip, the grower on top
//     — read off the painted boxes on every frame, in the picture and live;
//     and in one frame under reduced motion (operator, 2026-09-29: "the pin
//     scale change needs a transition").
//  8. THAT THE PICTURE'S PINS STAY UNDER THE LIVE MAP through the cross-fade,
//     now that 7 gives pins a z-index: the picture's active pin is z 2, and
//     only the picture being its own stacking context keeps that inside it.
//
// Every route here is one a production build serves, so this runs either way:
//
//   pnpm exec playwright test tests/interaction/map-featured-pin.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/map-featured-pin.spec.ts
//
// NOTHING HERE HARD-CODES A LISTING: the ids are Prismic's, discovered from
// the DOM (as property-map-camera-prod.spec.ts does).

const PROPERTIES = "/properties";
const HOME = "/";
const MAP = "[data-property-map]";
const BAND = '[data-slice-type="featured_properties"]';
const MARKERS = "[data-map-pin],[data-map-cluster],[data-map-home-pin],[data-map-home-cluster]";
const WIDE = 1440;

/** The constant, READ OUT OF $lib/property-map rather than copied: a
 *  Playwright spec does not resolve `$lib`, and a copy is what would let this
 *  file go on asserting last month's number. */
const SOURCE = readFileSync(new URL("../../src/lib/property-map.ts", import.meta.url), "utf8");
const declared = (name: string) => {
  const m = new RegExp(`^export const ${name} = (\\d*\\.?\\d+);$`, "m").exec(SOURCE);
  if (!m) throw new Error(`src/lib/property-map.ts no longer declares \`${name} = <number>;\``);
  return Number(m[1]);
};
/** Pins and clusters alike: src/lib/map-marker-contrast.test.ts derives one
 *  floor for both. */
const DIM = declared("DIMMED_MARKER_OPACITY");

/** The fleet's own emulation, `reducedMotion: "reduce"` (inherited). */
async function at(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  return { context, page: await context.newPage() };
}
/** Motion allowed — without it every fade here is absent and a fade test
 *  asserts nothing. */
async function moving(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "no-preference",
  });
  return { context, page: await context.newPage() };
}

const land = (page: Page) => page.locator("section[aria-labelledby='listing-land']");

/** MapLibre's own `load` has fired: the only evidence the canvas drew. */
const drawn = (map: Locator) =>
  expect(map, "the map never finished booting").toHaveAttribute("data-map-ready", "", {
    timeout: 45_000,
  });

interface Marker {
  /** The listing a single pin draws, or null for a cluster. */
  id: string | null;
  count: number;
  /** The opacity its garnet is PAINTED at — see `markersOf`. */
  opacity: number;
  active: boolean;
  dimmed: boolean;
  /** The centre of the marker's PAINTED box, as an offset from the map box's
   *  centre. */
  dx: number;
  dy: number;
  /** Whole painted marker inside the map box, and its centre hit-tests to it. */
  pointable: boolean;
}

/**
 * Every marker the map draws, with the opacity its garnet is PAINTED at: the
 * product of `opacity` on every element from the one that paints the garnet
 * (the pin's path, the cluster's disc) up to the map's root, times that
 * element's `fill-opacity`. Not the marker's own `opacity` — reading only that
 * let `[data-map-pin] > svg { opacity: 0.6 }` through with every case here
 * green, the active pin painted at 0.6 and the rest at 0.49 (review,
 * 2026-09-29). The painting element is found by the colour it paints, not by a
 * class name, and a marker with none throws rather than measuring nothing.
 */
const markersOf = (map: Locator) =>
  map.evaluate(
    (el, { selector, garnet }): Marker[] => {
      const box = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>(selector)].map((m) => {
        // THE PAINTED BOX. A pin's element is laid out at its frame's size and
        // the active one is drawn larger by a transform on its SVG, so the
        // element's own box stopped being the drawing on 2026-09-29; a
        // cluster has no SVG and its disc is its box.
        const r = (m.querySelector("svg") ?? m).getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const inside =
          r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
        const hit = inside ? document.elementFromPoint(cx, cy) : null;
        const paints = [m, ...m.querySelectorAll("*")].find((e) => {
          const cs = getComputedStyle(e);
          return cs.fill === garnet || cs.backgroundColor === garnet;
        });
        if (!paints) throw new Error(`nothing in this marker paints garnet: ${m.outerHTML}`);
        let painted = Number(getComputedStyle(paints).fillOpacity);
        for (let at: Element | null = paints; at; at = at === el ? null : at.parentElement)
          painted *= Number(getComputedStyle(at).opacity);
        return {
          id: m.dataset.mapPin ?? m.dataset.mapHomePin ?? null,
          count: Number(m.dataset.mapCluster ?? m.dataset.mapHomeCluster ?? "1"),
          opacity: painted,
          active: m.hasAttribute("data-map-active"),
          dimmed: m.hasAttribute("data-map-dimmed"),
          dx: Math.round(cx - (box.left + box.width / 2)),
          dy: Math.round(cy - (box.top + box.height / 2)),
          pointable: inside && hit !== null && m.contains(hit),
        };
      });
    },
    { selector: MARKERS, garnet: GARNET },
  );

/** The painted opacity of the one marker `pick` finds. */
const paintedOf = async (map: Locator, pick: (m: Marker) => boolean) => {
  const found = (await markersOf(map)).filter(pick);
  expect(found, "premise: exactly one marker to read").toHaveLength(1);
  return found[0]!.opacity;
};

const cardIds = (section: Locator) =>
  section.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => li.dataset.centreId!),
  );

const centre = (page: Page, id: string) =>
  page.evaluate(
    (id) =>
      document
        .querySelector(`[data-centre-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" }),
    id,
  );

/** The card is garnet — the page's own statement that it is the active one. */
const garnet = (section: Locator, id: string) =>
  expect(section.locator(`[data-centre-id="${id}"] article`)).toHaveCSS(
    "background-color",
    GARNET,
    { timeout: 15_000 },
  );

/** Card ids ordered from the middle of the list outward — "a mid-list card". */
const fromTheMiddle = (ids: string[]) => {
  const mid = Math.floor(ids.length / 2);
  return [...ids].sort((a, b) => Math.abs(ids.indexOf(a) - mid) - Math.abs(ids.indexOf(b) - mid));
};

/**
 * Make a mid-list land card active, and return it once the map has settled on
 * it: its pin marked active if it has one of its own at that camera
 * (`hasPin`), or else the camera at rest with no pin marked. `want` says which
 * kind the case needs; null takes the first mid-list card whatever it is.
 */
async function activate(page: Page, want: "pin" | "cluster" | null) {
  const section = land(page);
  const map = section.locator(MAP);
  const ids = await cardIds(section);
  expect(ids.length, "listings to walk").toBeGreaterThan(2);
  for (const id of fromTheMiddle(ids)) {
    await centre(page, id);
    await garnet(section, id);
    await drawn(map);
    // The camera jumps (reduced motion) or flies to the listing; either way
    // the marker set settles within a flight. Wait for the ACTIVE listing to
    // be featured by the page's own geometry: some marker within 40px of the
    // box's centre (the camera puts the tip at centre + 4px; a cluster's disc
    // sits within half a cluster radius of it).
    await expect
      .poll(async () => (await markersOf(map)).some((m) => Math.hypot(m.dx, m.dy) < 40), {
        message: `the camera settled on ${id}`,
        timeout: 15_000,
      })
      .toBe(true);
    const hasPin = (await map.locator(`[data-map-pin="${id}"]`).count()) === 1;
    if (want === null || (want === "pin") === hasPin) return { id, hasPin, map, ids };
  }
  return null;
}

// ── 1 and 2: the stylesheet applies it, and it follows the page ────────────

test.describe("on /properties at 1440, the garnet card's marker is the featured one", () => {
  test.setTimeout(120_000);

  test("its pin computes to 1, and every other marker to the dimmed value", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, "pin");
      expect(got, "a mid-list land listing with a pin of its own at its camera").not.toBeNull();
      const { id, map } = got!;
      const all = await markersOf(map);
      const mine = all.filter((m) => m.id === id);
      expect(mine, "exactly one pin for the active listing").toHaveLength(1);
      expect(mine[0]!.active, "and it is the marked one").toBe(true);
      expect(mine[0]!.opacity, "the active pin is at full opacity").toBe(1);
      const rest = all.filter((m) => m.id !== id);
      expect(rest.length, "premise: other markers to compare").toBeGreaterThan(1);
      expect(
        rest.filter((m) => m.opacity !== DIM).map((m) => `${m.id ?? m.count}:${m.opacity}`),
        `every other marker painted at ${DIM}`,
      ).toEqual([]);

      // AND IT MOVES: another listing active, the old pin down, the new one up.
      const next = (await cardIds(land(page))).find(
        (other) => other !== id && all.some((m) => m.id === other),
      );
      expect(next, "premise: another listing with its own pin").toBeDefined();
      await centre(page, next!);
      await garnet(land(page), next!);
      await expect
        .poll(async () => {
          const now = await markersOf(map);
          return {
            next: now.find((m) => m.id === next)?.opacity,
            was: now.find((m) => m.id === id)?.opacity,
          };
        })
        .toEqual({ next: 1, was: DIM });
    } finally {
      await context.close();
    }
  });

  test("a CLUSTER holding the active listing is the featured marker (#115)", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, "cluster");
      test.skip(
        got === null,
        "no land listing is inside a cluster at its own camera in today's CMS content",
      );
      const { map } = got!;
      // Which marker holds the active listing is decided HERE, by geometry the
      // component does not report: the camera centred the listing, so the
      // marker nearest the box's centre is the one standing for it — a disc,
      // since the listing has no pin of its own at this zoom. Polled until the
      // camera has arrived there.
      const nearestOf = (all: Marker[]) =>
        all.reduce((a, b) => (Math.hypot(b.dx, b.dy) < Math.hypot(a.dx, a.dy) ? b : a));
      await expect
        .poll(async () => {
          const n = nearestOf(await markersOf(map));
          return n.count > 1 && Math.hypot(n.dx, n.dy) < 40;
        })
        .toBe(true);
      const all = await markersOf(map);
      const nearest = nearestOf(all);
      expect(nearest.opacity, "the cluster holding it is at full opacity").toBe(1);
      const rest = all.filter((m) => m !== nearest);
      expect(rest.length, "premise: other markers to compare").toBeGreaterThan(0);
      expect(rest.filter((m) => m.opacity !== DIM)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

/**
 * The focus ring a pin draws, and whether it is round the pin AS PAINTED.
 *
 * The active pin is drawn larger by a transform on its SVG, so the pin
 * element's own box is the frame's size and the drawing is 1.5x it. An
 * outline on the element would wrap the smaller box and cut across the top
 * third of the pin; one on the SVG would be scaled with it, to 3px at 3px.
 * So the element draws no outline and its `::after`, sized from the same
 * `--pin-scale`, carries the site's 2px-at-2px ring. `drawn` compares that box
 * — worked out from its computed size and the rule's own anchoring (bottom
 * edge, horizontally centred) — with the SVG's painted rect, all four edges.
 */
const ringOf = (pin: Locator) =>
  pin.evaluate((el) => {
    const own = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    const box = el.getBoundingClientRect();
    const svg = el.querySelector("svg")!.getBoundingClientRect();
    const w = parseFloat(after.width);
    const h = parseFloat(after.height);
    const ring = {
      left: box.left + box.width / 2 - w / 2,
      right: box.left + box.width / 2 + w / 2,
    };
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.1;
    return {
      element: own.outlineStyle,
      ring: [after.outlineStyle, after.outlineWidth, after.outlineOffset, after.outlineColor],
      drawn:
        near(ring.left, svg.left) &&
        near(ring.right, svg.right) &&
        near(box.bottom, svg.bottom) &&
        near(box.bottom - h, svg.top),
    };
  });
const RING = { element: "none", ring: ["solid", "2px", "2px", GARNET], drawn: true };

// ── 3: hover, keyboard focus, the list link, the overlay ───────────────────

test.describe("a marker being pointed at or focused is not drawn disabled", () => {
  test.setTimeout(120_000);

  test("hover, keyboard focus (ring included) and its link's focus take it to 1", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, null);
      expect(got).not.toBeNull();
      const { id, map } = got!;
      // Bring the neighbours into the box: three steps out from the listing's
      // z12. A press is the visitor driving, so the camera stays there.
      const out = map.locator("[data-map-control='zoom-out']");
      for (let i = 0; i < 3; i++) await out.click();
      await page.mouse.move(2, 2);
      let target: Marker | undefined;
      await expect
        .poll(
          async () => {
            target = (await markersOf(map)).find(
              (m) => m.pointable && m.count === 1 && m.id !== id && m.opacity === DIM,
            );
            return target !== undefined;
          },
          { message: "a dimmed pin in the box, pointable", timeout: 15_000 },
        )
        .toBe(true);
      const pin = map.locator(`[data-map-pin="${target!.id}"]`);
      const opacity = () => paintedOf(map, (m) => m.id === target!.id);

      // HOVER.
      await pin.hover();
      await expect.poll(opacity, { message: "hovered" }).toBe(1);
      await page.mouse.move(2, 2);
      await expect.poll(opacity, { message: "and back once the pointer leaves" }).toBe(DIM);

      // KEYBOARD FOCUS ON THE PIN ITSELF. The pins are `tabindex="-1"`, so the
      // only keyboard focus one can hold is one moved to it by script after a
      // key press — which Chromium draws as `:focus-visible`. Premise first,
      // or this measures a pin that was never keyboard-focused.
      await page.keyboard.press("Tab");
      await pin.evaluate((el: HTMLElement) => el.focus());
      expect(await pin.evaluate((el) => el.matches(":focus-visible")), "premise").toBe(true);
      await expect.poll(opacity, { message: "keyboard-focused" }).toBe(1);
      // The ring is drawn inside the element whose opacity this is (its
      // `::after`, sized to the drawn pin — see ringOf), so at 1 it is drawn
      // at full strength: 2px solid, in garnet, round the pin as painted.
      expect(await ringOf(pin)).toEqual(RING);
      await pin.evaluate((el: HTMLElement) => el.blur());
      await expect.poll(opacity).toBe(DIM);

      // ITS LINK IN THE MAP'S LIST — the keyboard's real way to a listing. The
      // link and the pin share nothing but the listing, so the pairing is by
      // the card's title, which the link's text starts with.
      const title = (
        await land(page).locator(`[data-centre-id="${target!.id}"] article h3`).first().innerText()
      ).trim();
      const link = map.locator("[data-map-link]", { hasText: title });
      expect(await link.count(), `premise: one list link for "${title}"`).toBe(1);
      await page.keyboard.press("Tab");
      await link.focus();
      await expect.poll(opacity, { message: "its link has keyboard focus" }).toBe(1);
      await link.blur();
      await expect.poll(opacity).toBe(DIM);
    } finally {
      await context.close();
    }
  });

  test("keyboard focus on the ACTIVE pin rings the pin as drawn, not its frame-size box", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, "pin");
      expect(got).not.toBeNull();
      const { id, map } = got!;
      const pin = map.locator(`[data-map-pin="${id}"]`);
      // Premise: the drawing IS larger than the element, or a ring on the
      // element would pass this too.
      const scale = await pin.evaluate(
        (el) =>
          el.querySelector("svg")!.getBoundingClientRect().width / el.getBoundingClientRect().width,
      );
      expect(scale, "premise: the active pin is drawn 1.5x its element").toBeCloseTo(1.5, 2);
      await page.keyboard.press("Tab");
      await pin.evaluate((el: HTMLElement) => el.focus());
      expect(await pin.evaluate((el) => el.matches(":focus-visible")), "premise").toBe(true);
      expect(await ringOf(pin)).toEqual(RING);
    } finally {
      await context.close();
    }
  });

  test("the expanded overlay is the same map, featured the same way", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, "pin");
      expect(got).not.toBeNull();
      const { id, map } = got!;
      await map.locator("[data-map-control='expand']").click();
      await expect(map).toHaveAttribute("data-expanded", "true");
      await expect
        .poll(async () => {
          const all = await markersOf(map);
          return {
            active: all.find((m) => m.id === id)?.opacity,
            wrong: all.filter((m) => m.id !== id && m.opacity !== DIM).length,
            others: all.filter((m) => m.id !== id).length > 0,
          };
        })
        .toEqual({ active: 1, wrong: 0, others: true });
      // And drawn larger in the overlay too: its PAINTED width against its
      // element's, which is laid out at the frame's size (the overlay is the
      // full frame's, whatever the box was before).
      await expect
        .poll(() =>
          map
            .locator(`[data-map-pin="${id}"]`)
            .evaluate(
              (el) =>
                Math.round(
                  (el.querySelector("svg")!.getBoundingClientRect().width /
                    el.getBoundingClientRect().width) *
                    100,
                ) / 100,
            ),
        )
        .toBe(1.5);
    } finally {
      await context.close();
    }
  });
});

// ── 4: the fade, on the card's clock, and none under reduced motion ────────

interface Fade {
  on: string;
  property: string;
  ms: number;
  easing: string;
}

/** A marker whose state the move changed: its computed opacity at the
 *  instant of the change, and what it changed TO. */
interface Changed {
  instant: number;
  dimmed: boolean;
  /** One of the placeholder picture's markers rather than a live one. */
  picture: boolean;
}

/**
 * Move the garnet card to `to` and return every CSS transition that STARTED
 * on the map's markers, and on the arriving card's own ground, at the instant
 * the markers' state changed — read from a MutationObserver a microtask after
 * Svelte wrote it, so no frame can pass first (`getAnimations()` flushes
 * style, which is what starts them). Also returns each changed marker's
 * computed opacity at that same instant, read AFTER that flush: a transition
 * that started reports its from-value there, so a marker still at its OLD
 * value is one that is fading, however short the fade.
 */
const fadesAsActiveMoves = (page: Page, to: string) =>
  page.evaluate(
    ({ to, selector }) =>
      new Promise<{ markers: Fade[]; card: Fade[]; changed: Changed[] }>((resolve, reject) => {
        const sec = document.querySelector("section[aria-labelledby='listing-land']")!;
        const map = sec.querySelector("[data-property-map]")!;
        const target = sec.querySelector<HTMLElement>(`[data-centre-id="${to}"]`);
        if (!target) return reject(new Error(`no card ${to}`));
        const fades = (els: Element[], on: string): Fade[] =>
          els.flatMap((el) =>
            el
              .getAnimations()
              .filter((a) => "transitionProperty" in a)
              .map((a) => {
                const t = a as Animation & { transitionProperty: string };
                const effect = t.effect as KeyframeEffect;
                const frames = effect.getKeyframes();
                return {
                  on,
                  property: t.transitionProperty,
                  ms: Number(effect.getTiming().duration),
                  easing: String(frames[0]?.easing ?? effect.getTiming().easing),
                };
              }),
          );
        const mo = new MutationObserver((records) => {
          mo.disconnect();
          const els = [...new Set(records.map((r) => r.target as HTMLElement))].filter((el) =>
            el.matches(selector),
          );
          const markers = fades(els, "marker");
          resolve({
            markers,
            card: fades([target.querySelector("article")!], "card"),
            changed: els.map((el) => ({
              instant: Number(getComputedStyle(el).opacity),
              dimmed: el.hasAttribute("data-map-dimmed"),
              picture: el.matches("[data-map-home-pin],[data-map-home-cluster]"),
            })),
          });
        });
        mo.observe(map, { subtree: true, attributes: true, attributeFilter: ["data-map-dimmed"] });
        target.scrollIntoView({ block: "center", behavior: "instant" });
        setTimeout(() => reject(new Error(`no marker changed state within 15s of ${to}`)), 15_000);
      }),
    { to, selector: MARKERS },
  );

/** Every opacity fade `markers` holds is on the card's own clock, and the
 *  card's clock is the 150ms active-card-highlight.spec.ts pins. */
function onTheCardsClock(markers: Fade[], card: Fade[]) {
  const opacity = markers.filter((f) => f.property === "opacity");
  expect(opacity.length, "an opacity fade started on a marker").toBeGreaterThan(0);
  const ground = card.find((f) => f.property === "background-color");
  expect(ground, "premise: the card's own fade started too").toBeDefined();
  for (const f of opacity) {
    expect(f.ms, "the card's duration").toBe(ground!.ms);
    expect(f.easing, "the card's easing").toBe(ground!.easing);
  }
  expect(ground!.ms).toBe(150);
}

/** Reduced motion: nothing fades, and each changed marker already reads its
 *  NEW value — the old one would mean a fade was running. */
function atOnce(markers: Fade[], changed: Changed[]) {
  expect(changed.length, "premise: markers changed state").toBeGreaterThan(0);
  expect(
    markers.filter((f) => f.property === "opacity"),
    "no opacity fade at all",
  ).toEqual([]);
  expect(
    changed.map((c) => c.instant),
    "each marker at its new value the instant it changed",
  ).toEqual(changed.map((c) => (c.dimmed ? DIM : 1)));
  // Non-vacuity: the move took some marker down AND some other up, so an
  // old value cannot pass as a new one on either side.
  expect(new Set(changed.map((c) => c.dimmed))).toEqual(new Set([true, false]));
}

/**
 * /properties with MapLibre's style held back, so the map never finishes
 * loading and the placeholder picture stays — where a visitor is while the
 * map loads, and for good where it cannot. Returns the land map and a card to
 * move to whose own pin in the picture is dimmed now, so the move is sure to
 * change the picture.
 */
async function pictureOnly(page: Page) {
  await page.route("**/map-style.json", () => {
    /* never answered */
  });
  await page.goto(PROPERTIES);
  await hydrated(page);
  const section = land(page);
  const map = section.locator(MAP);
  const ids = await cardIds(section);
  await centre(page, ids[0]!);
  await garnet(section, ids[0]!);
  await expect
    .poll(() => map.locator("[data-map-home-pin][data-map-dimmed]").count(), {
      message: "the picture features the first card",
    })
    .toBeGreaterThan(0);
  // At rest before the move. A marker caught mid-fade REVERSES, and a reversed
  // transition is shortened to the part already run — before this wait, this
  // case once read a 4.96ms opacity fade where 150ms was due.
  await expect
    .poll(
      () =>
        map.evaluate(
          (el, selector) =>
            [...el.querySelectorAll(selector)].flatMap((m) => m.getAnimations()).length,
          MARKERS,
        ),
      { message: "the picture's first fades have finished" },
    )
    .toBe(0);
  for (const id of [...ids].reverse()) {
    if ((await map.locator(`[data-map-home-pin="${id}"][data-map-dimmed]`).count()) > 0)
      return { map, to: id };
  }
  throw new Error("no listing has a dimmed pin of its own in the picture");
}

test.describe("the change of featured marker", () => {
  test.setTimeout(120_000);

  test("motion allowed: fades opacity on the garnet card's own clock", async ({ browser }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, "pin");
      expect(got).not.toBeNull();
      const { id, ids } = got!;
      // Far along the list, so it is not the same marker as the one active now.
      const to = ids[ids.indexOf(id) > 0 ? 0 : ids.length - 1]!;
      const { markers, card } = await fadesAsActiveMoves(page, to);
      onTheCardsClock(markers, card);
    } finally {
      await context.close();
    }
  });

  test("reduced motion: no fade starts, and the new value is there at once", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, "pin");
      expect(got).not.toBeNull();
      const { id, ids } = got!;
      const to = ids[ids.indexOf(id) > 0 ? 0 : ids.length - 1]!;
      const { markers, changed } = await fadesAsActiveMoves(page, to);
      atOnce(markers, changed);
    } finally {
      await context.close();
    }
  });
});

// The placeholder picture carries its own copy of every marker, and the card
// can move while it is still up. Every case above waits for the live map
// first, so none of them ever watched the picture's copies change.
test.describe("the placeholder picture's markers, while the map is still loading", () => {
  test.setTimeout(120_000);

  test("motion allowed: they fade on the garnet card's own clock too", async ({ browser }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      const { map, to } = await pictureOnly(page);
      const { markers, card, changed } = await fadesAsActiveMoves(page, to);
      expect(changed.length, "premise: markers changed state").toBeGreaterThan(0);
      expect(
        changed.filter((c) => !c.picture),
        "premise: only the picture's markers exist to change",
      ).toEqual([]);
      onTheCardsClock(markers, card);
      await expect(map, "premise: the map never loaded").not.toHaveAttribute("data-map-ready");
    } finally {
      await context.close();
    }
  });

  test("reduced motion: no fade starts, and the new value is there at once", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      const { map, to } = await pictureOnly(page);
      const { markers, changed } = await fadesAsActiveMoves(page, to);
      expect(
        changed.filter((c) => !c.picture),
        "premise: only the picture's markers",
      ).toEqual([]);
      atOnce(markers, changed);
      await expect(map, "premise: the map never loaded").not.toHaveAttribute("data-map-ready");
    } finally {
      await context.close();
    }
  });
});

// ── 5: nothing active, nothing dimmed ──────────────────────────────────────

test.describe("where nothing is active, nothing is dimmed", () => {
  test.setTimeout(120_000);

  test("/properties below lg: the centre rule does not run, so every marker is at 1", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, 390, 844);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const map = land(page).locator(MAP);
      await map.scrollIntoViewIfNeeded();
      await drawn(map);
      const all = await markersOf(map);
      expect(all.length, "premise: markers").toBeGreaterThan(0);
      expect(all.filter((m) => m.active).length, "premise: nothing is active").toBe(0);
      expect(all.filter((m) => m.opacity !== 1)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("/properties crossing below lg: the listing held from above it is forgotten", async ({
    browser,
  }) => {
    // An iPad turned from landscape to portrait, or a window narrowed: the
    // centre rule stops below `lg`, and the carousel shows its own card. The
    // listing the rule last reported up there must not stay featured on the
    // map, dimming the marker of the card the carousel is showing.
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, null);
      expect(got).not.toBeNull();
      const { map } = got!;
      expect(
        (await markersOf(map)).filter((m) => m.dimmed).length,
        "premise: dimmed at 1440",
      ).toBeGreaterThan(0);
      await page.setViewportSize({ width: 768, height: 1024 });
      await expect(
        land(page).locator("[data-carousel-ready]"),
        "premise: the carousel took over",
      ).toHaveCount(1);
      await expect
        .poll(
          async () => {
            const all = await markersOf(map);
            return {
              markers: all.length > 0,
              dimmed: all.filter((m) => m.dimmed).length,
              active: all.filter((m) => m.active).length,
              belowFull: all.filter((m) => m.opacity !== 1).length,
            };
          },
          { timeout: 15_000 },
        )
        .toEqual({ markers: true, dimmed: 0, active: 0, belowFull: 0 });
    } finally {
      await context.close();
    }
  });

  test("/properties' server markup dims nothing — its no-JS picture", async ({ page }) => {
    // ATTRIBUTES, not substrings: the dev server inlines the component's
    // scoped CSS, whose `[data-map-dimmed]` selector a substring test finds.
    const attr = (name: string) => new RegExp(`\\s${name}(?:=|[\\s>])`, "g");
    const count = (html: string, name: string) => (html.match(attr(name)) ?? []).length;
    // The pattern finds real attributes: the homepage's picture HAS them.
    const home = await (await page.request.get(HOME)).text();
    expect(count(home, "data-map-dimmed"), "premise: the pattern matches").toBeGreaterThan(0);
    const res = await page.request.get(PROPERTIES);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(count(html, "data-map-home-pin"), "premise: a picture").toBeGreaterThan(0);
    expect(count(html, "data-map-active")).toBe(0);
    expect(count(html, "data-map-dimmed")).toBe(0);
  });
});

// ── the homepage band ───────────────────────────────────────────────────────

test.describe("on the homepage band at 1440, the slide on stage is featured", () => {
  test.setTimeout(120_000);

  test("its pin at 1, the rest dimmed, and the feature moves — fading — when the band turns", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      await page.goto(HOME);
      await hydrated(page);
      const band = page.locator(BAND);
      const map = band.locator(MAP);
      await band.scrollIntoViewIfNeeded();
      await drawn(map);
      await expect(band.locator("[data-map-home-box]")).toHaveCount(0, { timeout: 15_000 });

      const read = async () => {
        const all = await markersOf(map);
        const active = all.filter((m) => m.active);
        return {
          active: active.map((m) => m.id),
          activeAt: active.map((m) => m.opacity),
          wrong: all.filter((m) => !m.active && m.opacity !== DIM).length,
          others: all.filter((m) => !m.active).length,
        };
      };
      const before = await read();
      expect(before.active, "one pin is the slide on stage's").toHaveLength(1);
      expect(before.activeAt).toEqual([1]);
      expect(before.others, "premise: others to dim").toBeGreaterThan(0);
      expect(before.wrong).toBe(0);

      // The turn, watched for the fade it starts on the markers.
      const fades = map.evaluate(
        (el, selector) =>
          new Promise<{ property: string; ms: number }[]>((resolve) => {
            const mo = new MutationObserver((records) => {
              mo.disconnect();
              resolve(
                [...new Set(records.map((r) => r.target as Element))]
                  .filter((t) => t.matches(selector))
                  .flatMap((t) => t.getAnimations())
                  .filter((a) => "transitionProperty" in a)
                  .map((a) => ({
                    property: (a as Animation & { transitionProperty: string }).transitionProperty,
                    ms: Number(a.effect!.getTiming().duration),
                  })),
              );
            });
            mo.observe(el, {
              subtree: true,
              attributes: true,
              attributeFilter: ["data-map-dimmed"],
            });
          }),
        MARKERS,
      );
      await nextTurn(band);
      const started = await fades;
      expect(
        started.filter((f) => f.property === "opacity").length,
        "a fade started",
      ).toBeGreaterThan(0);
      for (const f of started.filter((f) => f.property === "opacity")) expect(f.ms).toBe(150);

      await expect.poll(read, { timeout: 5_000 }).toMatchObject({ activeAt: [1], wrong: 0 });
      const after = await read();
      expect(after.active, "the feature moved to another pin").not.toEqual(before.active);
    } finally {
      await context.close();
    }
  });

  test("scripting off, the picture features slide 0's pin — the one the card shows", async ({
    browser,
  }) => {
    // The band's `active` is slide 0 on the server, where the card is slide
    // 0's — so its no-JS picture HAS an active pin (already drawn 1.5x), and
    // featuring it is the same rule, not an exception.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: WIDE, height: 900 },
    });
    const page = await context.newPage();
    try {
      await page.goto(HOME);
      const map = page.locator(`${BAND} ${MAP}`);
      await map.scrollIntoViewIfNeeded();
      const all = await markersOf(map);
      const active = all.filter((m) => m.active);
      expect(active.length, "premise: slide 0's pin, in each frame's layer").toBeGreaterThan(0);
      for (const m of active) expect(m.opacity).toBe(1);
      const rest = all.filter((m) => !m.active);
      expect(rest.length).toBeGreaterThan(0);
      expect(rest.filter((m) => m.opacity !== DIM)).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("the pin a visitor presses is drawn at 1 while the sheet names it", async ({ browser }) => {
    // The band passes no `onselect`, so a press opens the map's own sheet and
    // leaves `active` on the slide on stage. Reduced motion (inherited): the
    // band does not autoplay, so its map is the visitor's to drive at once —
    // the state "Pause slides" gives with motion allowed.
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(HOME);
      await hydrated(page);
      const band = page.locator(BAND);
      const map = band.locator(MAP);
      await band.scrollIntoViewIfNeeded();
      await drawn(map);
      await expect(band.locator("[data-map-home-box]")).toHaveCount(0, { timeout: 15_000 });
      // The other slides' pins lie outside the box at the band's own camera.
      const out = map.locator("[data-map-control='zoom-out']");
      for (let i = 0; i < 3; i++) await out.click();
      await page.mouse.move(2, 2);
      let target: Marker | undefined;
      await expect
        .poll(
          async () => {
            target = (await markersOf(map)).find(
              (m) => m.pointable && m.count === 1 && !m.active && m.dimmed,
            );
            return target !== undefined;
          },
          { message: "a dimmed pin in the box, pointable", timeout: 15_000 },
        )
        .toBe(true);
      const pin = map.locator(`[data-map-pin="${target!.id}"]`);
      const opacity = () => paintedOf(map, (m) => m.id === target!.id);

      await pin.click();
      await page.mouse.move(2, 2);
      await expect(map.locator("[data-map-sheet]"), "premise: the sheet opened").toBeVisible();
      // Premise: neither restore rule is what holds it — the pointer has
      // left, and a mouse press does not match :focus-visible.
      expect(
        await pin.evaluate((el) => ({
          hover: el.matches(":hover"),
          focusVisible: el.matches(":focus-visible"),
        })),
      ).toEqual({ hover: false, focusVisible: false });
      await expect.poll(opacity, { message: "the listing the sheet names" }).toBe(1);
      expect(await pin.getAttribute("data-map-dimmed")).toBeNull();
      // The slide on stage is still the featured one.
      expect((await markersOf(map)).filter((m) => m.active).map((m) => m.opacity)).toEqual([1]);

      // Closed, it is one of the rest again.
      await map.locator("[data-map-sheet] button[aria-label^='Close']").click();
      await page.mouse.move(2, 2);
      await expect(map.locator("[data-map-sheet]")).toHaveCount(0);
      await expect.poll(opacity, { message: "dimmed again once the sheet closed" }).toBe(DIM);
    } finally {
      await context.close();
    }
  });
});

// ── 6: axe, on the maps' own text ──────────────────────────────────────────
//
// A NO-REGRESSION AUDIT of the text a map draws — the attribution, the
// controls — in the state a visitor meets it, a listing active and the other
// markers dimmed, so a dim that leaked onto that text would show here. It is
// NOT evidence about the dimmed markers: axe has no non-text-contrast rule, so
// it never measures a pin, and it measures a dimmed cluster's count wrongly
// (below). The markers' contrast is src/lib/map-marker-contrast.test.ts's, and
// what the page paints is the `markersOf` checks above.

/** A rule that THROWS is filed under `incomplete` with an `error-occurred`
 *  check and reports no violation (tests/a11y/fixtures.spec.ts). */
type Axe = Awaited<ReturnType<ReturnType<typeof axe>["analyze"]>>;
type AxeNode = Axe["passes"][number]["nodes"][number];
const crashed = (r: Axe) =>
  r.incomplete.flatMap((rule) =>
    rule.nodes.flatMap((node) =>
      [...node.any, ...node.all, ...node.none]
        .filter((check) => check.id === "error-occurred")
        .map((check) => `${rule.id}: ${check.message}`),
    ),
  );
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Left out of the CONTRAST results only: axe applies a dimmed cluster's
 *  group opacity to its count but not to its disc (#d1c1bf on #885655,
 *  3.44:1, where the page painted 4.86:1), so this audit went red on correct
 *  code whenever the camera had a dimmed cluster in the box. */
const CLUSTERS = "[data-map-cluster], [data-map-home-cluster]";

async function auditMap(page: Page, scope: string) {
  const result = await axe(page).include(scope).withTags(TAGS).analyze();
  expect(crashed(result), "axe rules crashed, so they measured nothing").toEqual([]);
  const contrast = (rules: Axe["passes"]) =>
    rules.filter((r) => r.id === "color-contrast").flatMap((r) => r.nodes);
  const outsideClusters = async (nodes: AxeNode[]) => {
    const inside = await page.evaluate(
      ({ targets, clusters }) =>
        targets.map((t) => t !== null && document.querySelector(t)?.closest(clusters) != null),
      {
        targets: nodes.map((n) => (typeof n.target[0] === "string" ? n.target[0] : null)),
        clusters: CLUSTERS,
      },
    );
    return nodes.filter((_, i) => !inside[i]).map((n) => n.target.join(" "));
  };
  expect(result.violations.filter((v) => v.id !== "color-contrast").map((v) => v.id)).toEqual([]);
  expect(await outsideClusters(contrast(result.violations)), "contrast violations").toEqual([]);
  expect(
    await outsideClusters(contrast(result.incomplete)),
    "contrast axe could not settle",
  ).toEqual([]);
  // Positive evidence it audited the map's own text and not nothing: the
  // attribution is in every drawn map.
  expect(
    (await outsideClusters(contrast(result.passes))).length,
    "axe measured the map's own text",
  ).toBeGreaterThan(0);
}

test.describe("axe, on the maps' own text", () => {
  test.setTimeout(120_000);

  test("/properties at 1440, a mid-list card active — and zoomed out onto dimmed clusters", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, null);
      expect(got).not.toBeNull();
      const { map } = got!;
      expect(
        (await markersOf(map)).some((m) => m.dimmed),
        "premise: the dimmed state",
      ).toBe(true);
      const scope = "section[aria-labelledby='listing-land'] [data-property-map]";
      await auditMap(page, scope);

      // THE SAME AUDIT WHERE THE CAMERA HOLDS A DIMMED CLUSTER, so its answer
      // does not depend on where today's listings happen to sit.
      const out = map.locator("[data-map-control='zoom-out']");
      let inView = false;
      for (let i = 0; i < 5 && !inView; i++) {
        await out.click();
        inView = await expect
          .poll(
            async () => (await markersOf(map)).some((m) => m.count > 1 && m.dimmed && m.pointable),
            { timeout: 3_000 },
          )
          .toBe(true)
          .then(
            () => true,
            () => false,
          );
      }
      expect(inView, "premise: a dimmed cluster wholly in the box").toBe(true);
      await page.mouse.move(2, 2);
      await auditMap(page, scope);
    } finally {
      await context.close();
    }
  });

  test("the homepage band", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(HOME);
      await hydrated(page);
      const band = page.locator(BAND);
      const map = band.locator(MAP);
      await band.scrollIntoViewIfNeeded();
      await drawn(map);
      await expect(band.locator("[data-map-home-box]")).toHaveCount(0, { timeout: 15_000 });
      expect(
        (await markersOf(map)).some((m) => m.dimmed),
        "premise: the dimmed state",
      ).toBe(true);
      await auditMap(page, `${BAND} [data-property-map]`);
    } finally {
      await context.close();
    }
  });
});

// ── 7: the active pin grows, about its tip ─────────────────────────────────
//
// "the pin scale change needs a transition" (operator, 2026-09-29). The pin
// was drawn larger by its SVG's width/height attributes, and an attribute
// swap does not transition: on a production build the incoming pin was
// already 72 x 64.86 and the outgoing already 48 x 43.23 in the
// MutationObserver callback that saw `data-map-active` move, before a frame
// was drawn. It is now a transform about the tip, eased with the dim.
//
// READ OFF PAINTED BOXES, EVERY FRAME, from the instant the attribute moves:
// the SVG's `getBoundingClientRect`, which includes its transform. Checking
// that a transition was CONFIGURED would pass a stylesheet whose transition
// names the wrong property; checking only the end state would pass the snap.

const SCALE = declared("ACTIVE_PIN_SCALE");

interface PinAt {
  w: number;
  h: number;
  /** The tip as painted: the SVG's bottom centre, in page coordinates. */
  tipX: number;
  tipY: number;
  /** The point the pin marks: live, the projected point the per-frame loop
   *  wrote (its first `translate()`), in page coordinates; null in the
   *  picture, whose camera never moves, so the tip's own first position is
   *  the reference there. */
  markX: number | null;
  markY: number | null;
  z: number;
}

interface Grow {
  from: string;
  to: string;
  /** The first entry is the MutationObserver's instant, after a style flush
   *  and before any frame; the rest are one per animation frame. */
  frames: { t: number; out: PinAt; inc: PinAt; rest: PinAt }[];
  /** The pins read were the same nodes on every frame — a keyed pin that was
   *  re-created would start at its end state and prove nothing. */
  sameNodes: boolean;
  /** Every CSS transition that STARTED at the instant, on the two pins and
   *  on their SVGs. */
  started: { on: "out" | "in"; el: "pin" | "svg"; property: string; ms: number; easing: string }[];
}

/**
 * Move the garnet card to `to` and watch the two pins that change — the one
 * leaving (`out`), the one arriving (`inc`) — and one that does neither
 * (`rest`), on every frame for 450ms from the instant `data-map-active` moves.
 * `where` picks the picture's painted layer or the live map.
 */
const growAsActiveMoves = (page: Page, to: string, where: "picture" | "live", rate = 1) =>
  page.evaluate(
    ({ to, where, window }) =>
      new Promise<Grow>((resolve, reject) => {
        const sec = document.querySelector("section[aria-labelledby='listing-land']")!;
        const map = sec.querySelector("[data-property-map]")!;
        const attr = where === "picture" ? "data-map-home-pin" : "data-map-pin";
        // The picture draws each pin once per frame layer and the container
        // query paints one; a `display: none` layer's boxes are all zeros.
        const scope = () =>
          where === "picture"
            ? [...map.querySelectorAll("[data-map-home-frame]")].find(
                (el) => getComputedStyle(el).display !== "none",
              )!
            : map;
        const pin = (id: string) => scope().querySelector<HTMLElement>(`[${attr}="${id}"]`);
        const outEl = scope().querySelector<HTMLElement>(`[${attr}][data-map-active]`);
        if (!outEl) return reject(new Error("premise: an active pin to move away from"));
        const from = outEl.getAttribute(attr)!;
        const inEl = pin(to);
        if (!inEl) return reject(new Error(`premise: ${to} has a pin of its own`));
        const restEl = [...scope().querySelectorAll<HTMLElement>(`[${attr}]`)].find(
          (el) => el !== outEl && el !== inEl,
        );
        if (!restEl) return reject(new Error("premise: a third pin"));
        const read = (el: HTMLElement): PinAt => {
          const s = el.querySelector("svg")!.getBoundingClientRect();
          const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el.style.transform);
          const o = el.parentElement!.getBoundingClientRect();
          const live = where === "live" && m !== null;
          return {
            w: s.width,
            h: s.height,
            tipX: s.left + s.width / 2,
            tipY: s.bottom,
            markX: live ? o.left + Number(m[1]) : null,
            markY: live ? o.top + Number(m[2]) : null,
            z: Number(getComputedStyle(el).zIndex) || 0,
          };
        };
        const frames: Grow["frames"] = [];
        let sameNodes = true;
        let t0 = 0;
        const sample = () => {
          if (pin(from) !== outEl || pin(to) !== inEl) sameNodes = false;
          frames.push({
            t: performance.now() - t0,
            out: read(outEl),
            inc: read(inEl),
            rest: read(restEl),
          });
        };
        const mo = new MutationObserver(() => {
          if (!inEl.hasAttribute("data-map-active")) return;
          mo.disconnect();
          t0 = performance.now();
          const started: Grow["started"] = [];
          for (const [on, el] of [
            ["out", outEl],
            ["in", inEl],
          ] as const) {
            for (const [kind, target] of [
              ["pin", el],
              ["svg", el.querySelector("svg")!],
            ] as const) {
              for (const a of target.getAnimations()) {
                if (!("transitionProperty" in a)) continue;
                const effect = a.effect as KeyframeEffect;
                started.push({
                  on,
                  el: kind,
                  property: (a as Animation & { transitionProperty: string }).transitionProperty,
                  ms: Number(effect.getTiming().duration),
                  easing: String(effect.getKeyframes()[0]?.easing ?? effect.getTiming().easing),
                });
              }
            }
          }
          sample();
          const step = () => {
            sample();
            if (performance.now() - t0 < window) requestAnimationFrame(step);
            else resolve({ from, to, frames, sameNodes, started });
          };
          requestAnimationFrame(step);
        });
        mo.observe(map, { subtree: true, attributes: true, attributeFilter: ["data-map-active"] });
        sec
          .querySelector(`[data-centre-id="${to}"]`)!
          .scrollIntoView({ block: "center", behavior: "instant" });
        setTimeout(() => reject(new Error(`the active pin did not move to ${to} in 15s`)), 15_000);
      }),
    { to, where, window: 450 / rate },
  );

/**
 * THE ANIMATION CLOCK, SLOWED — DevTools' own control, the one its Animations
 * panel drives — so that the frames a loaded machine draws still land several
 * times inside a 150ms run. It is a microscope and not a change of subject:
 * the run's DURATION is read off the transition itself (`started`), which the
 * rate does not touch, and a snap is one step at any rate. Measured before it
 * was added, at a load average of 10 on 4 CPUs: 9 frames in 450ms, the live
 * pin's widths 48.0 48.0 48.0 68.1 71.8 72.0 — one intermediate size, red, on
 * code that eases.
 */
const SLOW = 0.25;
async function slowAnimations(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: SLOW });
}

/** The pin nearest `from`'s tip, among `ids`, wholly inside the map box —
 *  so a live move is a short ease at one zoom and nothing re-clusters. */
const nearestPin = (map: Locator, from: string, ids: string[], where: "picture" | "live") =>
  map.evaluate(
    (el, { from, ids, where }) => {
      const attr = where === "picture" ? "data-map-home-pin" : "data-map-pin";
      const scope =
        where === "picture"
          ? [...el.querySelectorAll("[data-map-home-frame]")].find(
              (l) => getComputedStyle(l).display !== "none",
            )!
          : el;
      const box = el.getBoundingClientRect();
      const tip = (p: Element) => {
        const r = p.querySelector("svg")!.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.bottom, r };
      };
      const a = tip(scope.querySelector(`[${attr}="${from}"]`)!);
      return (
        [...scope.querySelectorAll<HTMLElement>(`[${attr}]`)]
          .map((p) => ({ id: p.getAttribute(attr)!, ...tip(p) }))
          .filter((p) => p.id !== from && ids.includes(p.id))
          .filter(
            (p) =>
              p.r.left >= box.left &&
              p.r.right <= box.right &&
              p.r.top >= box.top &&
              p.r.bottom <= box.bottom,
          )
          .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0]
          ?.id ?? null
      );
    },
    { from, ids, where },
  );

/** How far the painted tip ever got from the point the pin marks. */
const tipDrift = (g: Grow, pick: "out" | "inc") => {
  const first = g.frames[0]![pick];
  return Math.max(
    ...g.frames.map(({ [pick]: p }) =>
      Math.hypot(p.tipX - (p.markX ?? first.tipX), p.tipY - (p.markY ?? first.tipY)),
    ),
  );
};

/** Motion allowed: the incoming pin grows and the outgoing one shrinks, each
 *  through intermediate sizes, on the dim's own transition, about the tip,
 *  with the grower on top of the shrinker and the shrinker on top of the rest
 *  for as long as it is larger than them. */
function grewAboutTheTip(g: Grow) {
  const { frames } = g;
  expect(g.sameNodes, "premise: the same two pins throughout").toBe(true);
  expect(frames.length, "premise: frames sampled").toBeGreaterThan(5);
  const base = frames[0]!.rest.w;
  const big = base * SCALE;
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.05;

  // Both ends. At the instant the attribute moved, nothing has been drawn:
  // the incoming pin is still at the frame's size and the outgoing one still
  // 1.5x it. A snap reads the END sizes here.
  expect(
    near(frames[0]!.inc.w, base) && near(frames[0]!.out.w, big),
    `at the instant: the OLD sizes (in ${frames[0]!.inc.w}, out ${frames[0]!.out.w}, base ${base})`,
  ).toBe(true);
  const last = frames.at(-1)!;
  expect(near(last.inc.w, big) && near(last.out.w, base), "at the end: the NEW sizes").toBe(true);

  // Through the middle, one way each, never a step.
  const inW = frames.map((f) => f.inc.w);
  const outW = frames.map((f) => f.out.w);
  const between = (w: number) => w > base + 0.5 && w < big - 0.5;
  expect(
    new Set(inW.filter(between).map((w) => w.toFixed(2))).size,
    `the incoming pin's widths ${inW.map((w) => w.toFixed(1)).join(" ")}: intermediate sizes`,
  ).toBeGreaterThanOrEqual(3);
  expect(
    new Set(outW.filter(between).map((w) => w.toFixed(2))).size,
    `the outgoing pin's widths ${outW.map((w) => w.toFixed(1)).join(" ")}: intermediate sizes`,
  ).toBeGreaterThanOrEqual(3);
  expect(
    inW.every((w, i) => i === 0 || w >= inW[i - 1]! - 0.01),
    "grows, never back",
  ).toBe(true);
  expect(
    outW.every((w, i) => i === 0 || w <= outW[i - 1]! + 0.01),
    "shrinks, never back",
  ).toBe(true);

  // On the dim's clock: the size transition that started on each SVG is the
  // opacity transition that started on its pin, duration and easing — the
  // grow and the fade move together — and that is the card's 150ms.
  for (const on of ["in", "out"] as const) {
    const size = g.started.filter(
      (s) => s.on === on && s.el === "svg" && s.property === "transform",
    );
    const fade = g.started.filter((s) => s.on === on && s.el === "pin" && s.property === "opacity");
    expect(size, `${on}: one transform transition started on its SVG`).toHaveLength(1);
    expect(fade, `${on}: premise, its fade started too`).toHaveLength(1);
    expect([size[0]!.ms, size[0]!.easing], `${on}: the fade's clock`).toEqual([
      fade[0]!.ms,
      fade[0]!.easing,
    ]);
    expect(size[0]!.ms).toBe(150);
  }

  // About the tip: the painted tip never leaves the point the pin marks.
  expect(tipDrift(g, "inc"), "the incoming tip, px from its point").toBeLessThanOrEqual(0.1);
  expect(tipDrift(g, "out"), "the outgoing tip, px from its point").toBeLessThanOrEqual(0.1);

  // The measurement itself, in the run's output: what the numbers above were
  // (each width once, in order — the tail at rest is one entry).
  const steps = (ws: number[]) =>
    ws
      .map((w) => w.toFixed(1))
      .filter((w, i, all) => i === 0 || w !== all[i - 1])
      .join(" ");
  console.log(
    `pin grow ${g.from} -> ${g.to}: ${frames.length} samples over ` +
      `${frames.at(-1)!.t.toFixed(0)}ms; in ${steps(inW)}; out ${steps(outW)}; tip drift in ` +
      `${tipDrift(g, "inc").toFixed(3)}px, out ${tipDrift(g, "out").toFixed(3)}px`,
  );

  // Stacking, every frame: the grower above everything, and the shrinker
  // above the rest for as long as it is still larger than them.
  for (const f of frames) {
    expect(f.inc.z, `${f.t.toFixed(0)}ms: the incoming pin on top`).toBeGreaterThan(f.out.z);
    expect(f.inc.z).toBeGreaterThan(f.rest.z);
    if (f.out.w > base + 0.05)
      expect(f.out.z, `${f.t.toFixed(0)}ms: the shrinking pin above the rest`).toBeGreaterThan(
        f.rest.z,
      );
  }
}

/** Reduced motion: both pins are at their new sizes at the instant the
 *  attribute moved, and no size transition started at all. */
function grewAtOnce(g: Grow) {
  const base = g.frames[0]!.rest.w;
  expect(g.frames[0]!.inc.w, "the incoming pin, already at its new size").toBeCloseTo(
    base * SCALE,
    2,
  );
  expect(g.frames[0]!.out.w, "the outgoing pin, already back").toBeCloseTo(base, 2);
  expect(g.started.filter((s) => s.property === "transform")).toEqual([]);
  expect(tipDrift(g, "inc")).toBeLessThanOrEqual(0.1);
}

/** The picture, never handed over: an active pin in the painted layer, and
 *  the nearest other listing with a pin to move to. */
async function pictureMove(page: Page) {
  await page.route("**/map-style.json", () => {
    /* never answered */
  });
  await page.goto(PROPERTIES);
  await hydrated(page);
  const section = land(page);
  const map = section.locator(MAP);
  const ids = await cardIds(section);
  for (const id of fromTheMiddle(ids)) {
    await centre(page, id);
    await garnet(section, id);
    const painted = await map.evaluate(
      (el, id) =>
        [...el.querySelectorAll("[data-map-home-frame]")]
          .find((l) => getComputedStyle(l).display !== "none")
          ?.querySelector(`[data-map-home-pin="${id}"]`)
          ?.hasAttribute("data-map-active") ?? false,
      id,
    );
    if (!painted) continue;
    // At rest before the move (see `pictureOnly`).
    await expect
      .poll(() =>
        map.evaluate(
          (el, selector) =>
            [...el.querySelectorAll(selector)].flatMap((m) => [
              ...m.getAnimations(),
              ...(m.querySelector("svg")?.getAnimations() ?? []),
            ]).length,
          MARKERS,
        ),
      )
      .toBe(0);
    const to = await nearestPin(map, id, ids, "picture");
    if (to !== null) return { map, to };
  }
  throw new Error("no listing has an active pin of its own in the picture");
}

/** The live map, settled on a listing with its own pin, and the nearest other
 *  listing whose pin is wholly in the box. */
async function liveMove(page: Page) {
  await page.goto(PROPERTIES);
  await hydrated(page);
  const got = await activate(page, "pin");
  expect(got, "a mid-list land listing with a pin of its own at its camera").not.toBeNull();
  const { id, map, ids } = got!;
  // The camera has landed and nothing is mid-transition.
  await expect
    .poll(() =>
      map.evaluate(
        (el) =>
          [...el.querySelectorAll("[data-map-pin] > svg")].flatMap((s) => s.getAnimations()).length,
      ),
    )
    .toBe(0);
  const to = await nearestPin(map, id, ids, "live");
  expect(to, "premise: another listing's pin in the box").not.toBeNull();
  return { map, to: to! };
}

test.describe("the active pin grows, and the one it leaves shrinks, about their tips", () => {
  test.setTimeout(120_000);

  test("the picture, motion allowed: through intermediate sizes, on the dim's clock", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      const { map, to } = await pictureMove(page);
      await slowAnimations(page);
      const g = await growAsActiveMoves(page, to, "picture", SLOW);
      grewAboutTheTip(g);
      await expect(map, "premise: the map never loaded").not.toHaveAttribute("data-map-ready");
    } finally {
      await context.close();
    }
  });

  test("the live map, motion allowed: the tip rides its point through the camera's ease", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      const { map, to } = await liveMove(page);
      await slowAnimations(page);
      const g = await growAsActiveMoves(page, to, "live", SLOW);
      grewAboutTheTip(g);
      expect(g.frames[0]!.inc.markX, "premise: the live pin's point was read").not.toBeNull();
      await expect(map).toHaveAttribute("data-map-ready", "");
    } finally {
      await context.close();
    }
  });

  test("reduced motion: both pins at their new sizes in the same frame, picture and live", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      const picture = await pictureMove(page);
      grewAtOnce(await growAsActiveMoves(page, picture.to, "picture"));
      // A page of its own: the picture's route holds MapLibre's style back.
      const second = await context.newPage();
      const live = await liveMove(second);
      grewAtOnce(await growAsActiveMoves(second, live.to, "live"));
    } finally {
      await context.close();
    }
  });
});

// ── 8: the picture's pins stay under the live map ──────────────────────────
//
// The picture stays up until the canvas's own fade ends (MAP_HOME_FADE_MS),
// and the canvas comes up OVER it — a placeholder that stays fully opaque
// underneath — so through that fade the canvas and the live overlay are drawn
// over the picture. Section 7 gave every pin a z-index (0, 1 while shrinking,
// 2 active). The picture box is `isolate`, so those numbers rank its pins only
// against each other; without it the picture's ACTIVE pin, at z 2, rises out
// of the picture over the canvas (z auto, later in the tree) and over the live
// overlay (`z-[1]`): drawn over the live map, and taking its presses — it is a
// link to Google Maps — for the whole fade.
//
// The fade is 300ms, so the ANIMATION clock is frozen (playback rate 0) before
// MapLibre's style is let through: the canvas's fade starts and holds at its
// first frame. The picture's other exit, a timer at ten times the fade, is a
// setTimeout the freeze does not stop, so the stack is read IN the page, one
// frame after `data-map-ready` appears — never by a poll from here.

interface MidFade {
  /** What `elementFromPoint` finds at the picture's active pin's head. */
  top: string;
  pictureUp: boolean;
  /** Opacity transitions running on the canvas host: its fade, held. */
  fading: number;
  liveMarkers: number;
}

test.describe("through the cross-fade, the picture's pins stay under the live map", () => {
  test.setTimeout(120_000);

  test("the picture's ACTIVE pin does not rise over the canvas coming up on top of it", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/map-style.json", async (route) => {
        await held;
        await route.continue();
      });
      await page.goto(PROPERTIES);
      await hydrated(page);
      const section = land(page);
      const map = section.locator(MAP);
      const ids = await cardIds(section);
      // A listing whose OWN pin is the picture's active one, wholly in the
      // box; the point read is its head, well inside the drawing.
      let head: { x: number; y: number } | null = null;
      for (const id of fromTheMiddle(ids)) {
        await centre(page, id);
        await garnet(section, id);
        head = await map.evaluate((el, id) => {
          const layer = [...el.querySelectorAll("[data-map-home-frame]")].find(
            (l) => getComputedStyle(l).display !== "none",
          );
          const pin = layer?.querySelector(`[data-map-home-pin="${id}"][data-map-active]`);
          if (!pin) return null;
          const r = pin.querySelector("svg")!.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          const inside =
            r.left >= box.left &&
            r.right <= box.right &&
            r.top >= box.top &&
            r.bottom <= box.bottom;
          return inside ? { x: r.left + r.width / 2, y: r.top + r.height * 0.3 } : null;
        }, id);
        if (head) break;
      }
      expect(head, "premise: a listing whose own pin is the picture's active one").not.toBeNull();
      // Grown and at rest before anything is read.
      await expect
        .poll(() =>
          map.evaluate(
            (el, selector) =>
              [...el.querySelectorAll(selector)].flatMap((m) => [
                ...m.getAnimations(),
                ...(m.querySelector("svg")?.getAnimations() ?? []),
              ]).length,
            MARKERS,
          ),
        )
        .toBe(0);

      // Arm the reading, and take the premise with the same instrument: while
      // the map is still loading, the point IS the picture's pin — so what is
      // read mid-fade is a spot that pin covers.
      const loading = await map.evaluate((el, { x, y }) => {
        const top = () => {
          const e = document.elementFromPoint(x, y);
          if (!e) return "nothing";
          if (e.closest("[data-map-home-pin]")) return "the picture's pin";
          if (e.closest("[data-map-pin],[data-map-cluster]")) return "a live marker";
          if (e.closest("[data-map-canvas]")) return "the live canvas";
          return e.tagName.toLowerCase();
        };
        (window as unknown as { midFade: Promise<MidFade> }).midFade = new Promise(
          (resolve, reject) => {
            const mo = new MutationObserver(() => {
              if (!el.hasAttribute("data-map-ready")) return;
              mo.disconnect();
              requestAnimationFrame(() => {
                const canvas = el.querySelector("[data-map-canvas]")!;
                resolve({
                  top: top(),
                  pictureUp: el.querySelector("[data-map-home-box]") !== null,
                  fading: canvas
                    .getAnimations()
                    .filter(
                      (a) =>
                        (a as Animation & { transitionProperty?: string }).transitionProperty ===
                        "opacity",
                    ).length,
                  liveMarkers: el.querySelectorAll("[data-map-pin],[data-map-cluster]").length,
                });
              });
            });
            mo.observe(el, { attributes: true, attributeFilter: ["data-map-ready"] });
            setTimeout(() => reject(new Error("the map was not ready within 45s")), 45_000);
          },
        );
        return top();
      }, head!);
      expect(loading, "premise: while the map loads, the point is the picture's pin").toBe(
        "the picture's pin",
      );

      const cdp = await context.newCDPSession(page);
      await cdp.send("Animation.enable");
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
      release();
      const mid = await page.evaluate(
        () => (window as unknown as { midFade: Promise<MidFade> }).midFade,
      );
      console.log(
        `mid-fade at the picture's active pin: ${mid.top} on top; picture up ${mid.pictureUp}; ` +
          `${mid.fading} fade held on the canvas; ${mid.liveMarkers} live markers`,
      );
      expect(mid.pictureUp, "premise: the picture has not retired").toBe(true);
      expect(mid.fading, "premise: the canvas's fade started, and is held").toBe(1);
      expect(
        ["the live canvas", "a live marker"],
        `on top at the picture's active pin, mid-fade (${mid.liveMarkers} live markers drawn)`,
      ).toContain(mid.top);
    } finally {
      await context.close();
    }
  });
});

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
//  1. THAT THE STYLESHEET APPLIES IT. Computed `opacity`, on the markers a
//     real MapLibre map drew, on routes the site really serves.
//  2. THAT IT FOLLOWS THE PAGE — the garnet card on /properties, the slide on
//     stage on the homepage band — and features a CLUSTER holding the active
//     listing when it has no pin of its own (#115).
//  3. THAT HOVER AND KEYBOARD FOCUS TAKE A MARKER BACK TO 1, focus ring and
//     all, and so does its list link's focus (the keyboard's way to a pin).
//  4. THAT THE CHANGE FADES ON THE GARNET CARD'S OWN CLOCK, and that reduced
//     motion starts no fade at all. Read as the CSS transitions that actually
//     START, never as a configured property.
//  5. THAT NOTHING IS DIMMED WHERE NOTHING IS ACTIVE: below `lg` on
//     /properties, and in /properties' server markup.
//  6. THAT AXE PASSES THE MAPS WITH MARKERS DIMMED.
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

/** The two constants, READ OUT OF $lib/property-map rather than copied: a
 *  Playwright spec does not resolve `$lib`, and a copy is what would let this
 *  file go on asserting last month's number. */
const SOURCE = readFileSync(new URL("../../src/lib/property-map.ts", import.meta.url), "utf8");
const declared = (name: string) => {
  const m = new RegExp(`^export const ${name} = (\\d*\\.?\\d+);$`, "m").exec(SOURCE);
  if (!m) throw new Error(`src/lib/property-map.ts no longer declares \`${name} = <number>;\``);
  return Number(m[1]);
};
const PIN_DIM = declared("DIMMED_PIN_OPACITY");
const CLUSTER_DIM = declared("DIMMED_CLUSTER_OPACITY");

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
  opacity: number;
  active: boolean;
  /** The marker's centre, as an offset from the map box's centre. */
  dx: number;
  dy: number;
  /** Whole marker inside the map box, and its centre hit-tests to it. */
  pointable: boolean;
}

/** Every marker the map draws, with the opacity the browser COMPUTED for it. */
const markersOf = (map: Locator) =>
  map.evaluate((el, selector): Marker[] => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>(selector)].map((m) => {
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const inside =
        r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom;
      const hit = inside ? document.elementFromPoint(cx, cy) : null;
      return {
        id: m.dataset.mapPin ?? m.dataset.mapHomePin ?? null,
        count: Number(m.dataset.mapCluster ?? m.dataset.mapHomeCluster ?? "1"),
        opacity: Number(getComputedStyle(m).opacity),
        active: m.hasAttribute("data-map-active"),
        dx: Math.round(cx - (box.left + box.width / 2)),
        dy: Math.round(cy - (box.top + box.height / 2)),
        pointable: inside && hit !== null && m.contains(hit),
      };
    });
  }, MARKERS);

/** What a marker that is NOT the featured one must compute to. */
const dimmedValue = (m: Marker) => (m.count > 1 ? CLUSTER_DIM : PIN_DIM);

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
        rest
          .filter((m) => m.opacity !== dimmedValue(m))
          .map((m) => `${m.id ?? m.count}:${m.opacity}`),
        `every other marker at ${PIN_DIM} (pin) / ${CLUSTER_DIM} (cluster)`,
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
        .toEqual({ next: 1, was: PIN_DIM });
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
      expect(rest.filter((m) => m.opacity !== dimmedValue(m))).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

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
              (m) => m.pointable && m.count === 1 && m.id !== id && m.opacity === PIN_DIM,
            );
            return target !== undefined;
          },
          { message: "a dimmed pin in the box, pointable", timeout: 15_000 },
        )
        .toBe(true);
      const pin = map.locator(`[data-map-pin="${target!.id}"]`);
      const opacity = () => pin.evaluate((el) => Number(getComputedStyle(el).opacity));

      // HOVER.
      await pin.hover();
      await expect.poll(opacity, { message: "hovered" }).toBe(1);
      await page.mouse.move(2, 2);
      await expect.poll(opacity, { message: "and back once the pointer leaves" }).toBe(PIN_DIM);

      // KEYBOARD FOCUS ON THE PIN ITSELF. The pins are `tabindex="-1"`, so the
      // only keyboard focus one can hold is one moved to it by script after a
      // key press — which Chromium draws as `:focus-visible`. Premise first,
      // or this measures a pin that was never keyboard-focused.
      await page.keyboard.press("Tab");
      await pin.evaluate((el: HTMLElement) => el.focus());
      expect(await pin.evaluate((el) => el.matches(":focus-visible")), "premise").toBe(true);
      await expect.poll(opacity, { message: "keyboard-focused" }).toBe(1);
      // The ring is on the element whose opacity this is, so at 1 it is drawn
      // at full strength: 2px solid, in garnet.
      expect(
        await pin.evaluate((el) => {
          const cs = getComputedStyle(el);
          return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor];
        }),
      ).toEqual(["solid", "2px", GARNET]);
      await pin.evaluate((el: HTMLElement) => el.blur());
      await expect.poll(opacity).toBe(PIN_DIM);

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
      await expect.poll(opacity).toBe(PIN_DIM);
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
            wrong: all.filter((m) => m.id !== id && m.opacity !== dimmedValue(m)).length,
            others: all.filter((m) => m.id !== id).length > 0,
          };
        })
        .toEqual({ active: 1, wrong: 0, others: true });
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

/**
 * Move the garnet card to `to` and return every CSS transition that STARTED
 * on the map's markers, and on the arriving card's own ground, at the instant
 * the markers' state changed — read from a MutationObserver a microtask after
 * Svelte wrote it, so no frame can pass first (`getAnimations()` flushes
 * style, which is what starts them). Also returns each changed marker's
 * computed opacity at that same instant.
 */
const fadesAsActiveMoves = (page: Page, to: string) =>
  page.evaluate(
    ({ to, selector }) =>
      new Promise<{ markers: Fade[]; card: Fade[]; instant: number[] }>((resolve, reject) => {
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
          const changed = [...new Set(records.map((r) => r.target as HTMLElement))].filter((el) =>
            el.matches(selector),
          );
          resolve({
            markers: fades(changed, "marker"),
            card: fades([target.querySelector("article")!], "card"),
            instant: changed.map((el) => Number(getComputedStyle(el).opacity)),
          });
        });
        mo.observe(map, { subtree: true, attributes: true, attributeFilter: ["data-map-dimmed"] });
        target.scrollIntoView({ block: "center", behavior: "instant" });
        setTimeout(() => reject(new Error(`no marker changed state within 15s of ${to}`)), 15_000);
      }),
    { to, selector: MARKERS },
  );

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
      const opacity = markers.filter((f) => f.property === "opacity");
      expect(opacity.length, "an opacity fade started on a marker").toBeGreaterThan(0);
      const ground = card.find((f) => f.property === "background-color");
      expect(ground, "premise: the card's own fade started too").toBeDefined();
      for (const f of opacity) {
        expect(f.ms, "the card's duration").toBe(ground!.ms);
        expect(f.easing, "the card's easing").toBe(ground!.easing);
      }
      // And that clock is the 150ms active-card-highlight.spec.ts pins.
      expect(ground!.ms).toBe(150);
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
      const { markers, instant } = await fadesAsActiveMoves(page, to);
      expect(instant.length, "premise: markers changed state").toBeGreaterThan(0);
      expect(
        markers.filter((f) => f.property === "opacity"),
        "no opacity fade at all",
      ).toEqual([]);
      // Positive: at the very instant of the change each marker already
      // computes to one of its two end states, never a value between.
      for (const v of instant) expect([1, PIN_DIM, CLUSTER_DIM]).toContain(v);
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

  test("/properties' server markup dims nothing — its no-JS picture", async ({ page }) => {
    const res = await page.request.get(PROPERTIES);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect((html.match(/data-map-home-pin=/g) ?? []).length, "premise: a picture").toBeGreaterThan(
      0,
    );
    expect(html).not.toContain("data-map-active");
    expect(html).not.toContain("data-map-dimmed");
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
          wrong: all.filter((m) => !m.active && m.opacity !== dimmedValue(m)).length,
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
      expect(rest.filter((m) => m.opacity !== dimmedValue(m))).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

// ── 6: axe, with markers dimmed ─────────────────────────────────────────────

/** A rule that THROWS is filed under `incomplete` with an `error-occurred`
 *  check and reports no violation (tests/a11y/fixtures.spec.ts). */
type Axe = Awaited<ReturnType<ReturnType<typeof axe>["analyze"]>>;
const crashed = (r: Axe) =>
  r.incomplete.flatMap((rule) =>
    rule.nodes.flatMap((node) =>
      [...node.any, ...node.all, ...node.none]
        .filter((check) => check.id === "error-occurred")
        .map((check) => `${rule.id}: ${check.message}`),
    ),
  );
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function auditMap(page: Page, scope: string) {
  const result = await axe(page).include(scope).withTags(TAGS).analyze();
  expect(crashed(result), "axe rules crashed, so they measured nothing").toEqual([]);
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  expect(
    result.incomplete.filter((r) => r.id === "color-contrast").map((r) => r.nodes.length),
    "contrast axe could not settle",
  ).toEqual([]);
  // Positive evidence it audited the map and not nothing: the attribution's
  // text is in every drawn map.
  expect(
    result.passes.find((p) => p.id === "color-contrast")?.nodes.length ?? 0,
    "axe measured text inside the map",
  ).toBeGreaterThan(0);
}

test.describe("axe, with markers dimmed", () => {
  test.setTimeout(120_000);

  test("/properties at 1440, a mid-list card active", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(PROPERTIES);
      await hydrated(page);
      const got = await activate(page, null);
      expect(got).not.toBeNull();
      const dimmed = await markersOf(got!.map);
      expect(
        dimmed.some((m) => m.opacity < 1),
        "premise: dimmed markers",
      ).toBe(true);
      await auditMap(page, "section[aria-labelledby='listing-land'] [data-property-map]");
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
      const all = await markersOf(map);
      expect(
        all.some((m) => m.opacity < 1),
        "premise: dimmed markers",
      ).toBe(true);
      await auditMap(page, `${BAND} [data-property-map]`);
    } finally {
      await context.close();
    }
  });
});

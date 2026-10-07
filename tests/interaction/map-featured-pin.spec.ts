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
  /** Px from the painted marker to the nearest edge of the map box, which
   *  clips what the overlay draws — negative when it is cut. */
  room: number;
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
          room: Math.min(
            r.left - box.left,
            box.right - r.right,
            r.top - box.top,
            box.bottom - r.bottom,
          ),
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

const onStage = (section: Locator) =>
  section.evaluate(
    (el) =>
      [...el.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')].find(
        (s) => !s.hasAttribute("aria-hidden"),
      )?.dataset.centreId,
  );

const centre = async (page: Page, id: string) => {
  const section = page.locator("section[aria-labelledby^='listing-']").filter({
    has: page.locator(`[data-centre-id="${id}"]`),
  });
  await section.locator("[data-property-map]").scrollIntoViewIfNeeded();
  const next = section.getByRole("button", { name: "Next slide" });
  const count = await section.locator("[data-centre-id]").count();
  for (let turns = 0; turns < count && (await onStage(section)) !== id; turns++) await next.click();
};

/** The card is garnet — the page's own statement that it is the active one. */
const garnet = (section: Locator, id: string) =>
  expect.poll(() => onStage(section), { timeout: 15_000 }).toBe(id);

/** Card ids ordered from the middle of the list outward — "a mid-list card". */
const fromTheMiddle = (ids: string[]) => {
  const mid = Math.floor(ids.length / 2);
  return [...ids].sort((a, b) => Math.abs(ids.indexOf(a) - mid) - Math.abs(ids.indexOf(b) - mid));
};

// ── 5: nothing active, nothing dimmed ──────────────────────────────────────

test.describe("where nothing is active, nothing is dimmed", () => {
  test.setTimeout(120_000);

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

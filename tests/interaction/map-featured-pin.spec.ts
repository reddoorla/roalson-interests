import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";

// THE ACTIVE LISTING'S MARKER, FEATURED (operator, 2026-09-29): "whatever the
// active pin is should stay full opacity and the rest should be slightly
// reduced opacity so it's featured".
//
// PropertyMap decides a marker's opacity by writing `--map-dim` on it, and the
// unit tests read that decision. This file held eight browser claims about
// what jsdom cannot see; two are left, and they keep their numbers. The
// /properties camera-follows-cards cases were cut when that map began to hold
// still (2026-10-07, Properties map Option 1; the dimmed markers beside the
// active one are properties-map-still.spec.ts's now), and the homepage band's
// — the slide on stage featured as the band turns, its no-JS picture, the
// sheet's pin at 1, axe on the band's map — went with the band's map
// (2026-10-09, Erik: "lose map entirely").
//
//  5. THAT NOTHING IS DIMMED WHERE NOTHING IS ACTIVE: in /properties' server
//     markup.
//  8. THAT THE PICTURE'S PINS STAY UNDER THE LIVE MAP through the cross-fade,
//     now that the active pin has a z-index: the picture's active pin is z 2,
//     and only the picture being its own stacking context keeps that inside it.
//
// Every route here is one a production build serves, so this runs either way:
//
//   pnpm exec playwright test tests/interaction/map-featured-pin.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/map-featured-pin.spec.ts
//
// NOTHING HERE HARD-CODES A LISTING: the ids are Prismic's, discovered from
// the DOM (as property-map-camera-prod.spec.ts does).

const PROPERTIES = "/properties";
const MAP = "[data-property-map]";
const MARKERS = "[data-map-pin],[data-map-cluster],[data-map-home-pin],[data-map-home-cluster]";
const WIDE = 1440;

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
    // The pattern finds real attributes: it finds the picture's pins in this
    // same response (the premise below). It used to be shown finding
    // `data-map-dimmed` itself on the homepage band's picture, which had a
    // slide active on the server; that picture went with the band's map.
    const res = await page.request.get(PROPERTIES);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(count(html, "data-map-home-pin"), "premise: a picture").toBeGreaterThan(0);
    expect(count(html, "data-map-active")).toBe(0);
    expect(count(html, "data-map-dimmed")).toBe(0);
  });
});

// ── 8: the picture's pins stay under the live map ──────────────────────────
//
// The picture stays up until the canvas's own fade ends (MAP_HOME_FADE_MS),
// and the canvas comes up OVER it — a placeholder that stays fully opaque
// underneath — so through that fade the canvas and the live overlay are drawn
// over the picture. The pin-scale change (2026-09-29) gave every pin a
// z-index (0, 1 while shrinking, 2 active). The picture box is `isolate`, so
// those numbers rank its pins only against each other; without it the
// picture's ACTIVE pin, at z 2, rises out of the picture over the canvas
// (z auto, later in the tree) and over the live overlay (`z-[1]`): drawn over
// the live map, and taking its presses — it is a link to Google Maps — for the
// whole fade.
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

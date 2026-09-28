import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { hydrated } from "./hydrated";
import { placedPin } from "./placed-markers";

// THE GARNET CARD FOLLOWS THE CENTRE LINE (operator, 2026-09-23: "please
// change the highlighted box as we scroll").
//
// The decision is one expression in PropertyListing.svelte and is unit-tested
// there. jsdom cannot see anything this file measures:
//
//  1. THAT THE HIGHLIGHT REALLY TRACKS THE WINDOW, and is the listing the map's
//     camera is on. The unit test drives the observer by hand and can only
//     say "when told X, it draws X". Here the card on the line is computed
//     from boxes, independently of the component, and the camera is read
//     off the map.
//  2. THAT NOTHING MOVES. `featured` is colour only, and every card's box is
//     recorded either side of a move. A 1px pad on `featured` turns it red.
//  3. THAT THE FADE RUNS, ON EVERY TONED SURFACE, AND REDUCED MOTION KILLS IT.
//     The fade is app.css's, by selector, so it is read as the CSS transitions
//     that actually START on each element at the instant its tone changes,
//     not as a configured property on one of them.
//  4. THAT AXE PASSES WITH A MID-LIST CARD GARNET. The gate's own audit sees
//     only the server's state, card 0.
//  5. THAT A PHONE IS UNTOUCHED. `centreWatch` is gated at `minWidth: 1024`.
//
// TWO ROUTES. /dev/properties is the hermetic fixture (known ids, a card with
// a photo AND a badge, the two land listings that never cluster on the map).
// /dev/* 404s on a production build (#120), so the last block re-runs the
// server, follow, geometry, axe and fade claims on /properties, discovering
// everything from the DOM. The camera and phone claims stay on the fixture:
// "the pin at the map's middle" needs listings that never cluster, which only
// the fixture guarantees (property-map-camera-prod.spec.ts measures the
// camera's flights on /properties, not where it centres), and the phone case
// reads nothing the CMS writes.
//
//   pnpm exec playwright test tests/interaction/active-card-highlight.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/active-card-highlight.spec.ts
//
// Under `preview` the fixture blocks SKIP, keyed on that setting and never on
// seeing a 404: a fixture route that broke on dev has to fail, not vanish.
const FIXTURE = "/dev/properties";
const LIVE = "/properties";
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const NO_FIXTURE = "/dev/* 404s on a production build (#120)";

/** The fixture's land listings, by role. Potranco Road has a photo AND a
 *  status badge ("Under Contract"), so it carries every toned surface a card
 *  has; FM 1560, card 0, has neither ("Available" draws no badge).
 *  Castroville and New Braunfels are 83 km apart and never cluster, so each has
 *  a pin of its own to find at the middle of the map
 *  (property-map-camera.spec.ts). */
const FM_1560 = "fm-1560-galm";
const POTRANCO = "potranco-road";
const CASTROVILLE = "hwy-90-castroville";
const NEW_BRAUNFELS = "ih-35-new-braunfels";

const MAP = "[data-property-map]";

/** Brand tokens as COMPUTED colours (app.css `@theme`). Never a class name: a
 *  guard that greps `bg-primary` passes a token rename by measuring nothing. */
const GARNET = "rgb(101, 35, 35)"; // --color-primary
const OFF_WHITE = "rgb(242, 239, 233)"; // --color-background
const SAND = "rgb(232, 225, 209)"; // --color-light
const DARK = "rgb(61, 7, 7)"; // --color-dark

const WIDE = 1440;
const PHONE = 390;

/**
 * How long a scroll may take to turn a card garnet. The wait is an
 * auto-retrying assertion, so a green run returns the moment the tone lands
 * and pays nothing for the margin. Measured on /properties at 1440x900, 120
 * instant scrolls with other agents' suites on the same 8 cores (load 22-25):
 * median 23-47ms, worst 2479ms. At load ~40, Playwright's default 5s lost
 * once in 192 runs. That was starvation, not a missed report: the same probe
 * never saw a scroll whose card crossed the line and did not turn garnet.
 */
const MOVE_TIMEOUT = 15_000;

/** A context under the fleet's OWN emulation, `reducedMotion: "reduce"`:
 *  `browser.newContext()` inherits the shared `contextOptions` (measured in
 *  property-map-camera.spec.ts). This is the state CI runs in. */
async function at(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  return { context, page: await context.newPage() };
}

/** A context where motion is allowed. Without it every fade below is 0.01ms
 *  and a test of the fade asserts nothing. */
async function moving(browser: Browser, width: number, height = 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "no-preference",
  });
  return { context, page: await context.newPage() };
}

const sectionOf = (page: Page, id: string) =>
  page.locator(`section[aria-labelledby="listing-${id}"]`);

const cardIds = (sec: Locator) =>
  sec.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => li.dataset.centreId!),
  );

/** Which card the window's middle is crossing, computed HERE from boxes rather
 *  than read out of the component, so this measures the rule instead of
 *  agreeing with it. (property-map-camera.spec.ts carries the same helper;
 *  Playwright will not let one spec import another.) */
const onCentreLine = (sec: Locator) =>
  sec.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const box = li.getBoundingClientRect();
      if (box.top <= mid && box.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

/** The listings whose card is drawn garnet, by computed background. */
const garnetIds = (sec: Locator) =>
  sec.evaluate(
    (el, garnet) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")]
        .filter((li) => getComputedStyle(li.querySelector("article")!).backgroundColor === garnet)
        .map((li) => li.dataset.centreId!),
    GARNET,
  );

/**
 * Every card's geometry, to 2dp, in a frame a SCROLL cannot move: each top is
 * relative to the list's own top. Widths and heights are absolute, and the
 * photo box is read on its own because "the photo does not resize" is a claim
 * of its own.
 */
const geometry = (sec: Locator) =>
  sec.evaluate((el) => {
    const r = (n: number) => Math.round(n * 100) / 100;
    const list = el.querySelector<HTMLElement>("ul:not([data-map-list])")!;
    const base = list.getBoundingClientRect();
    return {
      list: { w: r(base.width), h: r(base.height) },
      cards: [...list.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => {
        const box = li.getBoundingClientRect();
        const article = li.querySelector("article")!.getBoundingClientRect();
        const photo = li.querySelector("article > div:has(> img)")?.getBoundingClientRect();
        return {
          id: li.dataset.centreId!,
          top: r(box.top - base.top),
          w: r(box.width),
          h: r(box.height),
          article: { w: r(article.width), h: r(article.height) },
          photo: photo ? { w: r(photo.width), h: r(photo.height) } : null,
        };
      }),
    };
  });

/** Put a listing's card across the middle of the window. `instant`: what is
 *  measured here is where things END UP. */
const centre = (page: Page, id: string) =>
  page.evaluate(
    (id) =>
      document
        .querySelector(`[data-centre-id="${id}"]`)
        ?.scrollIntoView({ block: "center", behavior: "instant" }),
    id,
  );

const cardOf = (sec: Locator, id: string) => sec.locator(`[data-centre-id="${id}"] article`);

/** A card's toned surfaces, by computed colour. `photo` and `badge` are null
 *  when the listing has none. */
const surfaces = (sec: Locator, id: string) =>
  sec.locator(`[data-centre-id="${id}"] article`).evaluate((article) => {
    const css = (el: Element | null) =>
      el ? { bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color } : null;
    const button = article.querySelector("a");
    return {
      card: css(article),
      photo: css(article.querySelector(":scope > div:has(> img)")),
      badge: css(article.querySelector('[aria-label="Listing status"] > li')),
      button: button
        ? { border: getComputedStyle(button).borderTopColor, fg: getComputedStyle(button).color }
        : null,
    };
  });

/** One CSS transition that started on a card, named by the surface it is on. */
interface Fade {
  on: string;
  property: string;
  ms: number;
}

/**
 * Move the highlight to `to` and return every CSS transition that STARTED on
 * the card taking it and on the card giving it up, read at the instant each
 * card's class changed.
 *
 * WHY THIS AND NOT `transition-duration`. A configured duration says a fade
 * WOULD run. A `CSSTransition` in `getAnimations()` is the browser saying one
 * DID start, on that element, for that property, and it names the property
 * the fade is on. It is read from a MutationObserver on the card's class, a
 * microtask after Svelte writes it, so no animation frame can pass before the
 * read. `getAnimations()` flushes style, which is what starts the
 * transitions. That makes it independent of how loaded the machine is,
 * including a 0.01ms fade under reduced motion, which is still a `CSSTransition`
 * until the next frame.
 */
const fadesAsHighlightMoves = (page: Page, sectionId: string, to: string) =>
  page.evaluate(
    ({ sectionId, to, garnet }) =>
      new Promise<{ arriving: Fade[]; leaving: Fade[] }>((resolve, reject) => {
        const sec = document.querySelector(`section[aria-labelledby="listing-${sectionId}"]`)!;
        const cards = [...sec.querySelectorAll<HTMLElement>("[data-centre-id]")];
        const isGarnet = (li: HTMLElement) =>
          getComputedStyle(li.querySelector("article")!).backgroundColor === garnet;
        const from = cards.find(isGarnet);
        const target = cards.find((li) => li.dataset.centreId === to);
        if (!from || !target || from === target) {
          reject(new Error(`no move to make: garnet ${from?.dataset.centreId}, target ${to}`));
          return;
        }
        const name = (el: Element, article: Element) =>
          el === article
            ? "card"
            : el.matches("a")
              ? "button"
              : el.closest('[aria-label="Listing status"]')
                ? "badge"
                : el.parentElement === article && el.querySelector(":scope > img")
                  ? "photo"
                  : `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
        const read = (li: HTMLElement): Fade[] => {
          const article = li.querySelector("article")!;
          return article
            .getAnimations({ subtree: true })
            .filter((a) => "transitionProperty" in a)
            .map((a) => {
              const t = a as Animation & { transitionProperty: string };
              const target = (t.effect as KeyframeEffect).target!;
              return {
                on: name(target, article),
                property: t.transitionProperty,
                ms: Number(t.effect!.getTiming().duration),
              };
            })
            .sort((x, y) => `${x.on}:${x.property}`.localeCompare(`${y.on}:${y.property}`));
        };
        const got: { arriving?: Fade[]; leaving?: Fade[] } = {};
        const watch = (li: HTMLElement, key: "arriving" | "leaving") => {
          const mo = new MutationObserver(() => {
            mo.disconnect();
            got[key] = read(li);
            if (got.arriving && got.leaving)
              resolve({ arriving: got.arriving, leaving: got.leaving });
          });
          mo.observe(li.querySelector("article")!, {
            attributes: true,
            attributeFilter: ["class"],
          });
        };
        watch(target, "arriving");
        watch(from, "leaving");
        target.scrollIntoView({ block: "center", behavior: "instant" });
        setTimeout(
          () => reject(new Error(`the highlight had not moved to ${to} after 15s`)),
          15_000,
        );
      }),
    { sectionId, to, garnet: GARNET },
  );

/** The fades a card needs, surface by surface, for the parts it has. The photo
 *  box also fades `color`, which it inherits from the card, and has no text
 *  to show it. */
const needed = (parts: { photo: boolean; badge: boolean }) =>
  [
    "button:border-color",
    "button:color",
    "card:background-color",
    "card:color",
    ...(parts.photo ? ["photo:background-color", "photo:color"] : []),
    ...(parts.badge ? ["badge:background-color", "badge:color"] : []),
  ].sort();

/** `surface:property`, deduplicated and sorted. A `CSSTransition` names a
 *  LONGHAND, so a border colour arrives as four sides and is folded to one. */
const named = (fades: Fade[]) =>
  [
    ...new Set(
      fades.map(
        (f) => `${f.on}:${f.property.replace(/^border-(top|right|bottom|left)-/, "border-")}`,
      ),
    ),
  ].sort();

// ── the state with no script, which is the one the comp draws ───────────────

/** On the RESPONSE BYTES, not a rendered page: this is what the server sends,
 *  so it is what a reader sees before hydration, with scripting off, and at
 *  every width below `lg`. Split per section, so "first" means the section's
 *  first. A highlight that leaked across a divider would show up here. */
async function serverFeaturesFirstCards(page: Page, route: string) {
  const res = await page.request.get(route);
  expect(res.status(), `${route} answered`).toBe(200);
  const html = await res.text();
  const chunks = html.split('<section aria-labelledby="listing-').slice(1);
  const featuredIn = (chunk: string) => {
    const out: string[] = [];
    for (const m of chunk.matchAll(/data-centre-id="([^"]+)"/g)) {
      const article = /<article class="([^"]*)"/.exec(chunk.slice(m.index))?.[1] ?? "";
      if (/\bbg-primary\b/.test(article)) out.push(m[1]!);
    }
    return out;
  };
  const idsIn = (chunk: string) =>
    [...chunk.matchAll(/data-centre-id="([^"]+)"/g)].map((m) => m[1]!);
  const labels = chunks.map((c) => c.slice(0, c.indexOf('"')));
  const active = chunks.filter((c) => idsIn(c).length > 0);
  expect(active.length, "active sections to read").toBeGreaterThan(0);
  for (const chunk of active) {
    expect(featuredIn(chunk), "one garnet card, and it is the first").toEqual([idsIn(chunk)[0]]);
  }
  // Sold is not watched and nothing in it is garnet.
  const sold = chunks[labels.indexOf("sold")];
  if (sold !== undefined) {
    expect(idsIn(sold)).toEqual([]);
    expect(sold).not.toMatch(/<article class="[^"]*\bbg-primary\b/);
  }
  return labels;
}

test.describe("the server still features the first card, and that is the whole no-JS state", () => {
  test("fixture: one garnet card per active section, and it is that section's first listing", async ({
    page,
  }) => {
    test.skip(PREVIEW, NO_FIXTURE);
    expect(await serverFeaturesFirstCards(page, FIXTURE)).toEqual(["land", "improved", "sold"]);
  });
});

// ── the highlight travels ───────────────────────────────────────────────────

test.describe("the garnet card is the listing on the centre line", () => {
  test.skip(PREVIEW, NO_FIXTURE);

  test("it moves to whichever card the window's middle is crossing", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const land = sectionOf(page, "land");
      const improved = sectionOf(page, "improved");
      const ids = await cardIds(land);
      expect(ids, "the fixture's land listings, in order").toEqual([
        FM_1560,
        POTRANCO,
        CASTROVILLE,
        NEW_BRAUNFELS,
      ]);
      expect(await garnetIds(land), "before any scroll, the comp's state").toEqual([FM_1560]);

      // From the back, so the first move is a long one, and back to the start,
      // so a highlight that only ever moved forward would fail.
      for (const id of [NEW_BRAUNFELS, POTRANCO, CASTROVILLE, FM_1560]) {
        await centre(page, id);
        await expect(cardOf(land, id)).toHaveCSS("background-color", GARNET, {
          timeout: MOVE_TIMEOUT,
        });
        // The independent box test agrees this is the card the window is on,
        // so this cannot pass a component that simply highlighted whatever
        // `scrollIntoView` was last called with.
        expect(await onCentreLine(land), `${id} is on the centre line`).toBe(id);
        expect(await garnetIds(land), `only ${id} is garnet`).toEqual([id]);
      }

      // `activeIds` is keyed per section: the improved highlight stayed put.
      const improvedIds = await cardIds(improved);
      expect(await garnetIds(improved)).toEqual([improvedIds[0]]);
    } finally {
      await context.close();
    }
  });

  test("and it is the listing the map's camera has centred", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const land = sectionOf(page, "land");
      const map = land.locator(MAP).first();
      await expect(map).toHaveAttribute("data-map-ready", "", { timeout: 25_000 });

      for (const id of [CASTROVILLE, NEW_BRAUNFELS, CASTROVILLE]) {
        await centre(page, id);
        await expect(cardOf(land, id)).toHaveCSS("background-color", GARNET, {
          timeout: MOVE_TIMEOUT,
        });
        // The camera puts the active listing's pin tip at the map's middle,
        // 4px below it (the frame pads 52 top against 44 bottom; see
        // property-map-camera.spec.ts). Polled, because the camera answers a
        // frame or two after the card does; the poll has to reach [0, 0].
        await expect
          .poll(
            async () => {
              const pin = (await placedPin(map, id, `${id}'s pin`))?.point;
              const box = await map.evaluate((el) => el.getBoundingClientRect().toJSON());
              // `+ 0`: Math.round(-0.3) is -0, which toEqual tells from 0.
              return pin
                ? [
                    Math.round(pin.x - box.width / 2) + 0,
                    Math.round(pin.y - (box.height / 2 + 4)) + 0,
                  ]
                : "no pin of its own";
            },
            { message: `the map is centred on ${id}, the garnet card`, timeout: 15_000 },
          )
          .toEqual([0, 0]);
        expect(await garnetIds(land), "and nothing else is garnet").toEqual([id]);
      }
    } finally {
      await context.close();
    }
  });

  test("the whole card re-tones: ground, photo box, badge and LEARN MORE", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const land = sectionOf(page, "land");

      // Section 0's flat card is sand (its ground is off-white), with an
      // off-white photo box and a garnet badge. Read BEFORE the move, so the
      // after-state is a change and not a coincidence.
      const flat = {
        card: { bg: SAND, fg: GARNET },
        photo: { bg: OFF_WHITE, fg: GARNET },
        badge: { bg: GARNET, fg: SAND },
        button: { border: GARNET, fg: GARNET },
      };
      expect(await surfaces(land, POTRANCO)).toEqual(flat);

      await centre(page, POTRANCO);
      await expect(cardOf(land, POTRANCO)).toHaveCSS("background-color", GARNET, {
        timeout: MOVE_TIMEOUT,
      });
      expect(await surfaces(land, POTRANCO), "every surface took the garnet tone").toEqual({
        card: { bg: GARNET, fg: OFF_WHITE },
        photo: { bg: DARK, fg: OFF_WHITE },
        badge: { bg: OFF_WHITE, fg: GARNET },
        button: { border: OFF_WHITE, fg: OFF_WHITE },
      });
      // …and the card it left went back to flat, button included.
      expect(await surfaces(land, FM_1560)).toEqual({ ...flat, photo: null, badge: null });
    } finally {
      await context.close();
    }
  });

  test("nothing moves: the same boxes before and after, to 2dp", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const land = sectionOf(page, "land");
      const ids = await cardIds(land);

      const before = await geometry(land);
      expect(before.cards.map((c) => c.id)).toEqual(ids);
      // Positive evidence the reading measured real boxes, not zeros.
      expect(before.list.h, "the list has a height to compare").toBeGreaterThan(400);
      for (const card of before.cards) expect(card.h).toBeGreaterThan(100);
      expect(
        before.cards.filter((c) => c.photo !== null).length,
        "a photo box to compare",
      ).toBeGreaterThan(0);

      // Card 0 gives the highlight up and a card with a photo takes it, so
      // both directions of the tone change are in the one reading.
      await centre(page, POTRANCO);
      await expect(cardOf(land, POTRANCO)).toHaveCSS("background-color", GARNET, {
        timeout: MOVE_TIMEOUT,
      });
      expect(await geometry(land), "the highlight moved and the column did not").toEqual(before);
    } finally {
      await context.close();
    }
  });
});

// ── the fade, and the setting that must kill it ─────────────────────────────

test.describe("the tone change is a fade, and reduced motion suppresses it", () => {
  test.skip(PREVIEW, NO_FIXTURE);

  test("motion allowed: every toned surface fades, on the button's 150ms clock", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const { arriving, leaving } = await fadesAsHighlightMoves(page, "land", POTRANCO);
      // EXACTLY these, not "at least": a selector widened to every element in
      // the card would start a second `color` fade on each line of text, each
      // chasing the colour it inherits, and would show up here as extra names.
      expect(named(arriving), "Potranco Road: photo and badge").toEqual(
        needed({ photo: true, badge: true }),
      );
      expect(named(leaving), "FM 1560: no photo, no badge").toEqual(
        needed({ photo: false, badge: false }),
      );
      for (const f of [...arriving, ...leaving]) expect(f.ms, `${f.on}:${f.property}`).toBe(150);
    } finally {
      await context.close();
    }
  });

  test("reduced motion: the same fades start, and last 0.01ms", async ({ browser }) => {
    // The shared config's own emulation, the state CI runs in. app.css's
    // `@layer base` block zeroes durations with `!important`, which beats the
    // unlayered fade rule. The list must be NON-EMPTY, or this passes by
    // reading nothing. It is a superset here, not the exact list: that block
    // gives EVERY element 0.01ms over the initial `transition-property: all`,
    // so the text inside the card starts 0.01ms fades of its own.
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const { arriving, leaving } = await fadesAsHighlightMoves(page, "land", POTRANCO);
      expect(named(arriving)).toEqual(expect.arrayContaining(needed({ photo: true, badge: true })));
      for (const f of [...arriving, ...leaving]) expect(f.ms, `${f.on}:${f.property}`).toBe(0.01);
    } finally {
      await context.close();
    }
  });
});

// ── the phone, deliberately unchanged ───────────────────────────────────────

test.describe("below lg the highlight does not travel, because nothing there follows it", () => {
  test.skip(PREVIEW, NO_FIXTURE);

  test("the first card stays garnet however far the page is scrolled", async ({ browser }) => {
    const { context, page } = await at(browser, PHONE, 844);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      const land = sectionOf(page, "land");
      const ids = await cardIds(land);
      expect(await garnetIds(land)).toEqual([ids[0]]);

      // Scroll every later card across the middle. At `lg` each of these
      // moves the highlight; here none may.
      for (const id of ids.slice(1)) {
        await centre(page, id);
        // Positive evidence the scroll really put that card on the line —
        // otherwise this passes by never having asked the question.
        expect(await onCentreLine(land), `${id} crossed the middle`).toBe(id);
        expect(await garnetIds(land), "the phone keeps card 0").toEqual([ids[0]]);
      }
    } finally {
      await context.close();
    }
  });
});

// ── the audit the gate cannot reach ─────────────────────────────────────────

/**
 * AN EMPTY `violations` IS NOT A PASS FOR CONTRAST. Mutating the featured tone
 * to `bg-primary text-primary` (garnet on garnet, 1:1) left `violations`
 * EMPTY: axe-core files an exact foreground/background match under
 * `incomplete` ("Element has a 1:1 contrast ratio with the background"), since
 * matching colours usually mean decorative or hidden text. So this denies on
 * contrast incompletes too, and requires a floor of nodes it actually measured
 * on the moved card. Either half alone passes that mutation.
 */
const contrastIncompletes = (r: { incomplete: { id: string; nodes: unknown[] }[] }) =>
  r.incomplete.filter((rule) => rule.id === "color-contrast").map((rule) => rule.nodes.length);

/** A rule that THROWS is filed under `incomplete` with an `error-occurred`
 *  check and reports no violation; tests/a11y/fixtures.spec.ts has the story. */
const crashed = (r: {
  incomplete: {
    id: string;
    nodes: {
      any: { id: string; message: string }[];
      all: { id: string; message: string }[];
      none: { id: string; message: string }[];
    }[];
  }[];
}) =>
  r.incomplete.flatMap((rule) =>
    rule.nodes.flatMap((node) =>
      [...node.any, ...node.all, ...node.none]
        .filter((check) => check.id === "error-occurred")
        .map((check) => `${rule.id}: ${check.message}`),
    ),
  );

/** Move the highlight to `id` in the land section, then audit that card alone
 *  and the whole card column (the card it left changed too). The map is
 *  outside both: its canvas and attribution chip are audited in
 *  featured-properties.spec.ts. The gate's own audit only ever sees card 0
 *  garnet, because that is the server's state. */
async function auditMovedCard(page: Page, id: string) {
  const land = sectionOf(page, "land");
  await centre(page, id);
  await expect(cardOf(land, id)).toHaveCSS("background-color", GARNET, {
    timeout: MOVE_TIMEOUT,
  });
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
  const moved = await new AxeBuilder({ page })
    .include(`[data-centre-id="${id}"]`)
    .withTags(tags)
    .analyze();
  const column = await new AxeBuilder({ page })
    .include('section[aria-labelledby="listing-land"] ul:not([data-map-list])')
    .withTags(tags)
    .analyze();

  expect(crashed(moved), "axe rules crashed, so they measured nothing").toEqual([]);
  expect(crashed(column), "axe rules crashed, so they measured nothing").toEqual([]);
  expect(moved.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  expect(column.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  expect(contrastIncompletes(moved), "contrast axe could not settle").toEqual([]);
  expect(contrastIncompletes(column), "contrast axe could not settle").toEqual([]);
  // Measured: 6 nodes on the fixture's Potranco Road (badge, size line,
  // title, two highlights, LEARN MORE) and 7 on the live middle card. Garnet
  // text on the garnet card leaves only the parts with a colour of their own.
  const onMoved = moved.passes.find((p) => p.id === "color-contrast")?.nodes.length ?? 0;
  expect(onMoved, "axe read the newly-garnet card's own text").toBeGreaterThanOrEqual(4);
}

test.describe("axe, with a mid-list card garnet", () => {
  test.skip(PREVIEW, NO_FIXTURE);

  test("no violations, no unmeasurable contrast, and the moved card really audited", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(FIXTURE);
      await hydrated(page);
      await auditMovedCard(page, POTRANCO);
    } finally {
      await context.close();
    }
  });
});

// ── and all of it on the route the site actually serves ─────────────────────

test.describe("on /properties, the route a production build ships", () => {
  test("the server features each active section's first card", async ({ page }) => {
    const labels = await serverFeaturesFirstCards(page, LIVE);
    expect(labels, "the live portfolio has a land section").toContain("land");
  });

  test("the highlight follows the centre line over the real portfolio, and nothing moves", async ({
    browser,
  }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(LIVE);
      await hydrated(page);
      const land = sectionOf(page, "land");
      await expect(land, "the live portfolio has a land section").toHaveCount(1);
      const ids = await cardIds(land);
      expect(ids.length, "listings to walk").toBeGreaterThan(2);
      expect(await garnetIds(land), "before any scroll, the first card").toEqual([ids[0]]);

      // Nothing hard-coded: whatever the CMS publishes today, far card first.
      for (const id of [ids[ids.length - 1]!, ids[1]!, ids[0]!]) {
        await centre(page, id);
        await expect(cardOf(land, id)).toHaveCSS("background-color", GARNET, {
          timeout: MOVE_TIMEOUT,
        });
        expect(await onCentreLine(land), `${id} is on the centre line`).toBe(id);
        expect(await garnetIds(land)).toEqual([id]);
      }

      const before = await geometry(land);
      await centre(page, ids[1]!);
      await expect(cardOf(land, ids[1]!)).toHaveCSS("background-color", GARNET, {
        timeout: MOVE_TIMEOUT,
      });
      expect(await geometry(land), "the column did not move").toEqual(before);
    } finally {
      await context.close();
    }
  });

  test("axe passes with a mid-list card garnet", async ({ browser }) => {
    const { context, page } = await at(browser, WIDE);
    try {
      await page.goto(LIVE);
      await hydrated(page);
      const ids = await cardIds(sectionOf(page, "land"));
      await auditMovedCard(page, ids[Math.floor(ids.length / 2)]!);
    } finally {
      await context.close();
    }
  });

  test("the fade runs on the shipped CSS, and reduced motion kills it there too", async ({
    browser,
  }) => {
    for (const motion of ["no-preference", "reduce"] as const) {
      const { context, page } =
        motion === "reduce" ? await at(browser, WIDE) : await moving(browser, WIDE);
      try {
        await page.goto(LIVE);
        await hydrated(page);
        const ids = await cardIds(sectionOf(page, "land"));
        const to = ids[1]!;
        const parts = await sectionOf(page, "land")
          .locator(`[data-centre-id="${to}"] article`)
          .evaluate((a) => ({
            photo: a.querySelector(":scope > div:has(> img)") !== null,
            badge: a.querySelector('[aria-label="Listing status"] > li') !== null,
          }));
        const { arriving } = await fadesAsHighlightMoves(page, "land", to);
        expect(named(arriving), `${to} (${motion})`).toEqual(expect.arrayContaining(needed(parts)));
        const ms = motion === "reduce" ? 0.01 : 150;
        for (const f of arriving) expect(f.ms, `${motion} ${f.on}:${f.property}`).toBe(ms);
      } finally {
        await context.close();
      }
    }
  });
});

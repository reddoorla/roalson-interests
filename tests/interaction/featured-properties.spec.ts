import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { expectRing, GARNET } from "./expect-ring";
import { FEATURED_DISSOLVE, FEATURED_DWELL } from "./featured-dwell";
import { HYDRATION_TIMEOUT } from "./hydrated";

// The homepage's featured band (src/lib/slices/FeaturedProperties) is the
// headless carousel's first consumer, and makes promises jsdom cannot check:
//
//  1. THE CHROME SITS WHERE THE COMP DRAWS IT — inside the card's panel —
//     WITHOUT being inside a slide in the DOM. That is done by grid placement,
//     and it broke exactly once already: `lg:row-span-2` is the `grid-row`
//     shorthand, it reset the chrome's row start inside the `lg` block, and the
//     eyebrow and arrows were auto-placed UNDER the slides. The card measured
//     1086 tall for the comp's 827 and every unit test was green.
//  2. IT ROTATES, on its clock (DWELL + the comp's 500 dissolve — the
//     operator's 8000 since 2026-09-23, where the comp's is 4000), and Pause
//     holds it — slide and bar together; a pointer resting on it does not
//     (operator call, 2026-09-23);
//  3. turning a slide never drops keyboard focus on <body> (#34);
//  4. ONE listing is a card and NONE is no band at all.
//
// House rules, paid for in nav.spec.ts and footer.spec.ts: no x derived from
// the window (headless Chromium lays this site out 15px narrower than its
// viewport) — every position is relative to the card or to another element;
// sizes read after a viewport change are auto-retrying; nothing is pressed
// before script has provably adopted the carousel.
//
// The shared config forces `reducedMotion: "reduce"`, under which this band
// never rotates and draws no Pause. Every test about rotation opens its OWN
// context; inheriting the default would time a band that is standing still.
const HOME = "/dev/home";
const BAND = '[data-slice-type="featured_properties"]';
const CARD = "[data-featured-card]";

/** The band's dwell and dissolve, READ OUT OF THE SLICE (./featured-dwell.ts
 *  says why). This was `const DWELL = 4000` until the operator doubled the
 *  time on each listing (2026-09-23): every timing below follows DWELL now. */
const DWELL = FEATURED_DWELL;
const DISSOLVE = FEATURED_DISSOLVE;
/** How long to WAIT for a turn before calling it a failure — a ceiling, never
 *  a measurement. What a lap actually took is stamped in the page by
 *  `stampTurns` and asserted from those numbers, so this only decides how
 *  patient the wait is, and being patient costs a green run nothing. Raised
 *  from `DWELL + 2000` when the homepage band gained its map (#13, #103): a
 *  426 KB MapLibre boot lands inside the first dwell on a cold dev server and
 *  pushed one turn past 6s, which read as "the carousel never turned". */
const TURN_CEILING = DWELL + DISSOLVE + 6000;
/** Half the leading the ramp trims off `t-h4` (25.2 line, 9 cap box). The comp
 *  measures from the CAP box, CSS from the line box. */
const H4_TRIM = 8.1;

/** Headless Chromium keeps `scrollbar-gutter: stable`'s 15px and hides the
 *  scrollbar that would fill it, so the page lays out 15px NARROWER than the
 *  viewport — and than `clientWidth`, which still reports the viewport. Every
 *  width in this file is the layout width the comp is drawn at; this is the
 *  one place that turns it into the viewport that produces it. Asked for 1440
 *  directly, the card measures 916.8 where the comp says 927, and four
 *  assertions here read as defects in the band. */
const GUTTER = 15;
const viewportFor = (layoutWidth: number, height = 900) => ({
  width: layoutWidth + GUTTER,
  height,
});

async function moving(browser: Browser, viewport = viewportFor(1440)) {
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport });
  const page = await context.newPage();
  return { context, page };
}

/** Script has adopted the carousel: `hydrated`, which only an effect sets.
 *  20s, not the default 5: the config's server warms /dev/a11y-fixtures, not
 *  this route, so the FIRST test here pays vite's cold compile of the homepage
 *  (it failed at 5s on exactly that, and only ever as the first test). */
const adopted = (page: Page) =>
  expect(page.locator(CARD)).toHaveAttribute("data-carousel-ready", "", { timeout: 20_000 });

/** Parks the pointer off the card. It USED TO BE what kept the clock running
 *  here — hover was a pause — and on this band it no longer is (operator call,
 *  2026-09-23; "a pointer resting on the card does not stop the slides" is the
 *  case that says so). Kept, not deleted, because it still keeps a button's
 *  hover fill out of what the cases around it read; none of them depends on
 *  it for the clock any more. */
const pointerAway = (page: Page) => page.mouse.move(2, 2);

/** Stops the band's clock the way a visitor does — Pause — and proves it
 *  stopped, for the cases that read the layout and must not have a turn land
 *  between two reads. They used to HOVER the eyebrow for this ("holds the
 *  clock; focuses nothing"). Hover stopped being a pause on 2026-09-23, and a
 *  hold that silently stops holding is the kind of change nothing would have
 *  reported: the turn it let through would only ever have shown up as a
 *  flaky geometry read. */
const holdClock = async (page: Page) => {
  await page.getByRole("button", { name: "Pause slides" }).click();
  await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
};

const status = (page: Page) => page.locator(`${CARD} [aria-live]`);

const barScale = (page: Page) =>
  page
    .locator(`${CARD} [data-carousel-progress] > div`)
    .evaluate((el) => Number(/scaleX\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1]));

/** The bar's value while it is COUNTING a dwell (`timed`), and 0 for anything
 *  else. A handover draws scaleX(1), so a bare `barScale` read just after a
 *  turn reads full — and a "the bar has moved on" wait is then satisfied for
 *  the wrong reason, as the Play case in `motion` found out. */
const timedFill = (page: Page) =>
  page
    .locator(`${CARD} [data-carousel-progress] > div`)
    .evaluate((el) =>
      (el as HTMLElement).dataset.carouselFill === "timed"
        ? Number(/scaleX\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1])
        : 0,
    );

/** The four staggered text lines of whichever slide is on stage. */
const LINES = `${CARD} [data-featured-slide]:not([inert]) [data-featured-line]`;

/** The card's scroll reveal has finished. animateIn hands the element back to
 *  its stylesheet when the reveal is over — every inline style it wrote is
 *  removed — so this is the revealed state and not merely "opacity says 1".
 *
 *  Takes a LOCATOR, not the page: /dev/a11y-fixtures draws two of these bands
 *  and the audits below measure the second one. */
const revealed = (card: Locator) =>
  expect
    .poll(
      () =>
        card.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { opacity: cs.opacity, transform: cs.transform };
        }),
      { timeout: 10_000 },
    )
    .toEqual({ opacity: "1", transform: "none" });

/** SCRIPT HAS HIDDEN THIS CARD, which is the half of the reveal that is easy to
 *  forget to wait for and the reason three audits in this file were measuring
 *  the server's markup rather than the page.
 *
 *  `revealed()` alone cannot say so: before hydration the card is at opacity 1
 *  with no transform and answers it instantly — the SAME answer the finished
 *  reveal gives. `data-reveal` is written by animateIn and by nothing else, so
 *  it is the positive artefact that the action ran. Pair it with `revealed()`
 *  around a scroll and the audit is pinned to one state: hidden by script, then
 *  revealed by script, then measured.
 *
 *  Only sound for a card that is BELOW THE FOLD at load, which every band on
 *  /dev/home and /dev/a11y-fixtures is (measured: the fixtures page's launch
 *  band sits at y=16119 of a 900 viewport). A card already on screen is hidden
 *  and revealed inside one frame and this would race it. */
const hiddenByScript = (card: Locator) =>
  expect(card).toHaveAttribute("data-reveal", "", { timeout: HYDRATION_TIMEOUT });

/** The one settled state every contrast audit in this file measures: script has
 *  hidden the card, the reader has scrolled to it, and the reveal is over.
 *
 *  WHY THIS IS A HELPER AND NOT THREE COPIES. axe answers `color-contrast` for
 *  text under a transparent ancestor with an INCOMPLETE rather than a ratio,
 *  and drops the rule entirely — neither passed nor incomplete, `inapplicable`
 *  — once opacity reaches 0. Measured on /dev/a11y-fixtures at 1440 across 16
 *  runs of the case at :1299, all three states occurred: 10 passed (the card
 *  still un-hydrated), 10 incomplete with messageKey `equalRatio` (caught
 *  mid-fade at opacity 0.0466), and the rule absent altogether (opacity 0),
 *  which is the `TypeError: Cannot read properties of undefined` of issue #142.
 *  The case that used to be the only one waiting for this (the /dev/home band
 *  audit) got the wait on 2026-09-22; these did not, and that is the class. */
async function settledForAudit(page: Page, card: Locator) {
  await hiddenByScript(card);
  await card.scrollIntoViewIfNeeded();
  await revealed(card);
}

/** The `color-contrast` nodes axe RESOLVED and the ones it could not, as two
 *  lists — never `passes.find(...)!`, which throws when the rule is absent.
 *
 *  The split between the two moves with load and with the frame the audit
 *  landed in (#142); their SUM is what a settled card makes stable, so a count
 *  is asserted over the sum and the incompletes are asserted empty separately.
 *  An incomplete is not a pass — that assertion is the `bgOverlap` guard and
 *  the only reason these audits exist — so the sum may never stand in for it. */
const contrastOf = (results: { passes: AxeRule[]; incomplete: AxeRule[] }) => ({
  measured: results.passes.find((r) => r.id === "color-contrast")?.nodes ?? [],
  unmeasured: results.incomplete.find((r) => r.id === "color-contrast")?.nodes ?? [],
});

type AxeRule = { id: string; nodes: { html: string; any?: { data?: unknown }[] }[] };

/** Which slides are on stage, by title — read off `inert`, the thing that
 *  actually takes a slide out of the tab order. */
const onStage = (page: Page) =>
  page
    .locator(`${CARD} [data-featured-slide]`)
    .evaluateAll((els) =>
      els
        .filter((el) => !el.hasAttribute("inert"))
        .map((el) => el.querySelector("h3")!.textContent),
    );

/** What the in-page clock recorded: every change of the live region, stamped
 *  with `performance.now()`, plus the first reading of the bar (and when) so a
 *  partly-run dwell can be told from a whole one. */
interface Timed {
  __turns: { t: number; text: string }[];
  __start: { t: number; p: number } | null;
}

/** Installs that clock before the page's first script. The live region is the
 *  carousel's own announcement of a turn — the one thing in the DOM that says
 *  "the slide changed" at the instant it does. */
const stampTurns = (page: Page) =>
  page.addInitScript((card: string) => {
    const w = window as unknown as Timed;
    w.__turns = [];
    w.__start = null;
    const scale = (region: Element) =>
      Number(
        /scaleX\(([^)]+)\)/.exec(
          region.querySelector("[data-carousel-progress] > div")?.getAttribute("style") ?? "",
        )?.[1],
      );
    const arm = () => {
      const region = document.querySelector(card);
      const live = region?.querySelector("[aria-live]");
      // Only once script has adopted the carousel: before that there is no
      // clock, and the bar's 0 would look like a dwell that just started.
      if (!region?.hasAttribute("data-carousel-ready") || !live || !Number.isFinite(scale(region)))
        return requestAnimationFrame(arm);
      w.__start = { t: performance.now(), p: scale(region) };
      new MutationObserver(() => {
        w.__turns.push({ t: performance.now(), text: live.textContent ?? "" });
      }).observe(live, { childList: true, characterData: true, subtree: true });
    };
    requestAnimationFrame(arm);
  }, CARD);

/** Every box relative to the CARD's own top-left — the comp's card-relative
 *  table (home-featured-properties §3) — never to the window. */
const geometry = (page: Page) =>
  page.evaluate(
    ({ CARD, BAND }) => {
      const card = document.querySelector(CARD)!;
      const C = card.getBoundingClientRect();
      const rel = (el: Element | null) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return {
          left: b.left - C.left,
          top: b.top - C.top,
          right: b.right - C.left,
          bottom: b.bottom - C.top,
          width: b.width,
          height: b.height,
        };
      };
      const active = [...card.querySelectorAll("[data-featured-slide]")].find(
        (s) => !s.hasAttribute("inert"),
      )!;
      const slot = document.querySelector(`${BAND} [data-map-slot]`)!;
      return {
        card: { width: C.width, height: C.height },
        photo: rel(active.querySelector("img")!.parentElement)!,
        bar: rel(card.querySelector("[data-carousel-progress]")),
        eyebrow: rel(card.querySelector("h2"))!,
        controls: rel(card.querySelector("div[data-js-only]:has(> button)")),
        text: rel(active.querySelector("h3")!.parentElement!.parentElement)!,
        sizeLine: rel(active.querySelector("p.t-h4"))!,
        button: rel(active.querySelector("a"))!,
        portfolio: rel(card.querySelector("[data-featured-portfolio] a")),
        slot: {
          display: getComputedStyle(slot).display,
          right: slot.getBoundingClientRect().right - C.left,
          width: slot.getBoundingClientRect().width,
          background: getComputedStyle(slot).backgroundColor,
        },
        // The child of the slot, which is the element that actually paints the
        // column before the tiles arrive. Reading only the slot's background
        // is what let a sand rectangle ship over the band's #3d0707.
        map: {
          background: getComputedStyle(slot.firstElementChild!).backgroundColor,
          width: slot.firstElementChild!.getBoundingClientRect().width,
        },
        // Positive means content wider than the box, which is the defect.
        // It reads -15 here even when nothing overflows: `clientWidth` reports
        // the viewport while the page lays out inside the reserved gutter.
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    },
    { CARD, BAND },
  );

test.describe("where the comp draws it", () => {
  test("1440: the chrome is INSIDE the panel beside the text — 285 under a 928:542 photo", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await holdClock(page);
      const g = await geometry(page);

      expect(g.photo.width / g.photo.height).toBeCloseTo(928 / 542, 2);
      expect(g.photo.width).toBeCloseTo(g.card.width, 0);
      // THE regression for the grid-row shorthand: with the chrome auto-placed
      // under the slides this was 545.
      expect(g.card.height - g.photo.height).toBeGreaterThanOrEqual(284);
      expect(g.card.height - g.photo.height).toBeLessThanOrEqual(286);

      // bar: 20 under the photo, 20 in from both edges, 2 tall
      expect(g.bar!.top - g.photo.bottom).toBeCloseTo(20, 0);
      expect(g.bar!.left).toBeCloseTo(20, 0);
      expect(g.card.width - g.bar!.right).toBeCloseTo(20, 0);
      expect(g.bar!.height).toBeCloseTo(2, 1);

      // The eyebrow and the listing's size line share a cap line (comp y=584):
      // the chrome is BESIDE the text, not under it.
      expect(g.eyebrow.top).toBeCloseTo(g.sizeLine.top, 0);
      expect(g.eyebrow.top + H4_TRIM - g.bar!.bottom).toBeCloseTo(20, 0);
      expect(g.eyebrow.left).toBeCloseTo(20, 0);
      expect(g.eyebrow.right).toBeLessThan(g.text.left);

      // arrows: pinned 43 above the card's foot, in the left column, 40 tall
      expect(g.card.height - g.controls!.bottom).toBeCloseTo(43, 0);
      expect(g.controls!.left).toBeCloseTo(20, 0);
      expect(g.controls!.height).toBeCloseTo(40, 0);
      expect(g.controls!.right).toBeLessThan(g.text.left);
      expect(g.controls!.top).toBeGreaterThan(g.photo.bottom);

      // text column: the comp's 434 / 474 (one px narrower card, see the slice)
      expect(g.text.left).toBeGreaterThan(432);
      expect(g.text.left).toBeLessThan(435);
      expect(g.card.width - g.text.right).toBeCloseTo(20, 0);
      expect(g.button.height).toBeCloseTo(40, 0);
    } finally {
      await context.close();
    }
  });

  test("the card starts on the site's column line — the hero's h1 — at every lg width", async ({
    page,
  }) => {
    for (const width of [1440, 1280, 1100, 1920]) {
      await page.setViewportSize(viewportFor(width));
      await page.goto(HOME);
      const h1 = page.locator('[data-slice-type="home_hero"] h1');
      // Auto-retrying: the first read after a viewport change can be the old layout.
      await expect
        .poll(
          async () => {
            const [a, b] = await Promise.all([h1.boundingBox(), page.locator(CARD).boundingBox()]);
            return Math.abs(a!.x - b!.x);
          },
          { message: `card vs h1 left edge at ${width}` },
        )
        .toBeLessThanOrEqual(1);
      // …and the map's column is the rest of the band, flush against the card.
      const g = await geometry(page);
      expect(g.slot.display, `${width}`).toBe("block");
      expect(g.slot.right, `${width}`).toBeCloseTo(0, 0);
      expect(g.slot.width, `${width}`).toBeGreaterThan(300);
      expect(g.overflowX, `${width}`).toBeLessThanOrEqual(0);

      // THE GROUND, READ OFF THE ELEMENT THAT ACTUALLY PAINTS. The slot is
      // transparent and always was — and that is not the claim worth making,
      // because the slot is transparent whatever its child does. The first
      // version of this asserted only the slot and passed while PropertyMap's
      // own root filled the whole column with hard-coded SAND over the band's
      // #3d0707. Until the tiles arrive the map IS its ground plus a list of
      // links, so the ground is the child's, and it is the child that is read.
      expect(g.slot.background, `${width}: the slot itself`).toBe("rgba(0, 0, 0, 0)");
      expect(g.map.background, `${width}: what the visitor sees before tiles`).toBe(
        "rgb(61, 7, 7)",
      );
      expect(g.map.background, `${width}: sand over the dark band`).not.toBe("rgb(232, 225, 209)");
    }
  });

  test("the arrows are 43 above the card's foot however tall the text runs", async ({
    browser,
  }) => {
    // The comp puts the arrows' bottom and the slide's LEARN MORE on one line
    // (y=784). `lg:h-[200px]` made the chrome a FIXED box top-aligned in its
    // grid area, so the moment a slide's text ran past 203px the area grew
    // underneath it and the arrows stayed put: measured 60.03 above the foot at
    // 1024 / 1100 / 1280 with the three-listing fixture (slide 2 runs to five
    // bullet lines) and at 1440 with the launch listing's five. `lg:h-auto
    // lg:min-h-[200px]` lets the grid item stretch, which is its default.
    //
    // Two shapes, both real, on the SAME three-listing fixture: at 1440 its
    // copy fits the comp's 285 and the floor is what holds the panel there; at
    // 1280 and 1024 slide 2 runs to five bullet lines, the stack grows to the
    // tallest of them, and the arrows must follow. (The launch listing's five
    // bullets do this at a true 1440, but ?featured=one draws no arrows at all
    // — one listing is not a carousel — so the width is the repro that can be
    // asserted without a fourth fixture.)
    for (const [width, panel] of [
      [1440, "285"],
      [1280, "taller"],
      [1024, "taller"],
    ] as const) {
      const { context, page } = await moving(browser, viewportFor(width));
      try {
        await page.goto(HOME);
        await adopted(page);
        await holdClock(page);
        const g = await geometry(page);
        expect(g.card.height - g.controls!.bottom, `arrows above the foot at ${width}`).toBeCloseTo(
          43,
          0,
        );
        const panelHeight = g.card.height - g.photo.height;
        if (panel === "285") {
          expect(panelHeight, `panel at ${width}`).toBeGreaterThanOrEqual(284);
          expect(panelHeight, `panel at ${width}`).toBeLessThanOrEqual(286);
        } else {
          expect(panelHeight, `panel at ${width} outgrew the comp's 285`).toBeGreaterThan(286);
        }
      } finally {
        await context.close();
      }
    }
  });

  test("390: map, photo, bar, [eyebrow | controls], text", async ({ browser }) => {
    const { context, page } = await moving(browser, viewportFor(390, 844));
    try {
      await page.goto(HOME);
      await adopted(page);
      await page.locator(BAND).scrollIntoViewIfNeeded();
      await holdClock(page);
      const g = await geometry(page);

      // WAS `toBe("none")`, with the title "and no map box". The comp does
      // draw one at 390 — 390 x 200, full bleed, the first thing in the band —
      // and #13 built it; the old assertion was a reading of the comp that
      // re-reading it overturned. Everything the map does with that box is
      // measured in tests/interaction/property-map.spec.ts; what belongs here
      // is only that it is drawn and that it did not move the card's anatomy,
      // which is what every line below this one is about.
      expect(g.slot.display).toBe("block");
      expect(g.photo.width / g.photo.height).toBeCloseTo(390 / 227.8, 2);
      expect(g.bar!.top - g.photo.bottom).toBeCloseTo(20, 0);
      // comp: 10 between the bar and the chrome row at 390 (20 at 1440)
      expect(g.controls!.top - g.bar!.bottom).toBeCloseTo(10, 0);
      // the eyebrow's CAP top is flush with the controls' top edge, not centred
      expect(g.eyebrow.top + H4_TRIM).toBeCloseTo(g.controls!.top, 0);
      // controls right-aligned on the panel's padding; Pause makes them 140
      expect(g.card.width - g.controls!.right).toBeCloseTo(20, 0);
      expect(g.controls!.width).toBeCloseTo(140, 0);
      // text 20 under the row
      expect(g.text.top - g.controls!.bottom).toBeCloseTo(20, 0);
      expect(g.overflowX).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });

  test("at 360 and 320 the eyebrow WRAPS beside the 140px controls; nothing collides or moves", async ({
    browser,
  }) => {
    // The decision #32 asked for. "FEATURED PROPERTIES" is 176.6 wide; with
    // Pause the controls are 140, so under 377 they no longer fit on one line
    // with the 20 gap. The eyebrow breaks onto two lines (34.2 tall) INSIDE
    // the 40px row, so the text below does not move — rather than the controls
    // dropping to their own row and costing every phone 60px.
    for (const width of [360, 320]) {
      const { context, page } = await moving(browser, viewportFor(width, 780));
      try {
        await page.goto(HOME);
        await adopted(page);
        await page.locator(BAND).scrollIntoViewIfNeeded();
        await holdClock(page);
        const g = await geometry(page);
        expect(g.eyebrow.height, `${width}: two lines`).toBeGreaterThan(40);
        expect(g.eyebrow.right, `${width}`).toBeLessThanOrEqual(g.controls!.left - 19);
        // two trimmed lines are 34.2: still inside the 40px controls row
        expect(g.eyebrow.bottom - H4_TRIM, `${width}`).toBeLessThanOrEqual(g.controls!.bottom);
        expect(g.text.top - g.controls!.bottom, `${width}`).toBeCloseTo(20, 0);
        expect(g.controls!.width, `${width}`).toBeCloseTo(140, 0);
        expect(g.overflowX, `${width}`).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }
  });
});

test.describe("rotation", () => {
  test("turns on its clock, dissolving — and the bar is the same clock", async ({ browser }) => {
    // Titled "turns on the comp's clock…" until 2026-09-23, when the operator
    // doubled the dwell: the comp's is 4000, this band's is DWELL (8000). The
    // dissolve is still the comp's 500. Three turns are ~25s of wall clock
    // now, not ~13, which is the one place in this file the doubling costs
    // its full price: what this case measures IS the clock.
    test.setTimeout(60_000);
    const { context, page } = await moving(browser);
    try {
      await stampTurns(page);
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      expect(await onStage(page)).toEqual(["25331 IH 10 West"]);
      await expect(status(page)).toHaveAttribute("aria-live", "off");
      await expect(page.locator(`${CARD} button`).first()).toHaveAttribute(
        "aria-label",
        "Pause slides",
      );
      // The clock's turns DISSOLVE: the photo's transition is the comp's 0.5s.
      await expect(
        page.locator(`${CARD} [data-featured-slide] img`).first().locator(".."),
      ).toHaveCSS("transition-duration", "0.5s");
      // The bar is filling before anything turns.
      await expect.poll(() => barScale(page)).toBeGreaterThan(0.2);

      await expect(status(page)).toHaveText("Slide 2 of 3", { timeout: TURN_CEILING });
      expect(await onStage(page)).toEqual(["101 W. Commerce Street"]);
      // DECIDED, THEN REVERSED, AND THEN THE REVERSAL WAS WRONG TOO. The comp
      // cross-fades a FULL bar into an empty one, so through the handover the
      // fill holds at 1 and only its opacity moves. The first attempt at this
      // kept the old snap to 0 underneath the fade, which meant fading a box
      // with no width — nothing on screen at all. `scaleX` is still drawn by
      // carousel state and by nothing else (no transition on the transform),
      // so there is still exactly one clock and a pause still freezes the bar
      // where it stands. The fade itself is measured in "the bar dissolves
      // across the handover" below; here the point is only that the number was
      // not EASED into place.
      expect(await barScale(page), "the fill holds full through the handover").toBe(1);

      // …and it loops.
      await expect(status(page)).toHaveText("Slide 3 of 3", { timeout: TURN_CEILING });
      await expect(status(page)).toHaveText("Slide 1 of 3", { timeout: TURN_CEILING });

      // THE LAP IS MEASURED IN THE PAGE, not out here. Two Date.now() readings
      // around two `expect(...).toHaveText()` calls measure Playwright's POLL
      // checkpoint, not the carousel: replicated four times, they read
      // 4340–4342ms while the true lap was 4499–4503, because both turns are
      // seen at the same ~4335ms checkpoint after the expect starts. A carousel
      // wired with `settle: 0` — a true 4000 lap — lands in the same poll
      // window and reads the same ~4340, so `toBeGreaterThan(4000)` passed for
      // a band that had lost its dissolve entirely. (Those numbers are the
      // 4000 dwell's, measured when it was the band's; the lesson is not.)
      const turns = await page.evaluate(() => (window as unknown as Timed).__turns);
      expect(turns.length, "stamped at least two turns").toBeGreaterThanOrEqual(2);
      // The FIRST turn is only as long as the dwell that was left when we
      // started watching — `progress` is elapsed / dwell, so the bar's own
      // first reading says how much is gone (carousel.spec.ts's lesson: a bare
      // "one dwell" went red at 3613ms on a correct carousel).
      const first = await page.evaluate(() => (window as unknown as Timed).__start!);
      expect(first.p, "watched most of the first dwell").toBeLessThan(0.5);
      const toFirstTurn = turns[0].t - first.t;
      expect(
        Math.abs(toFirstTurn - (1 - first.p) * DWELL),
        `first turn after ${toFirstTurn}ms with ${(1 - first.p) * DWELL}ms of the dwell left`,
        // 700, RAISED FROM 300, and it is not the clock that changed (#103).
        //
        // THE REASON FIRST GIVEN FOR THIS WAS WRONG, and it is corrected here
        // rather than quietly. It read: "at 1440x900 the 512x827 map is
        // already intersecting at scrollY 0, so its parse and its WebGL
        // context land inside this very dwell". Measured at this exact
        // viewport: the band's map slot top is y=1007 against a 900 viewport,
        // `data-map-ready` is false after 4s, and there is no canvas and no
        // attribution control. This test never scrolls, so MapLibre cannot
        // boot inside it at all. The same PR's journal retracted the belief;
        // the comment kept it.
        //
        // What the overshoots really were is in the same sentence that
        // measured them: 458.6 / 1029.7 / 2609.8ms BEFORE
        // `optimizeDeps.include: ["maplibre-gl"]` stopped Vite discovering the
        // dependency mid-session, and 364.6ms worst case after. That is the
        // DEV SERVER's module loading on first paint — the map's chunk being
        // resolved even though the map never runs — not the map booting.
        //
        // The width is kept, not the reason. Re-measured on a quiet machine
        // with the tree as it stands: 4/4 green at 300ms, so most of this
        // headroom is currently unused. It stays because the overshoot that
        // forced it was real and was measured on a LOADED machine, and
        // because this suite already has assertions that fail under load and
        // pass alone (#80). Tighten it when that is fixed, not before.
        //
        // NOTHING IS LOST BY IT. The loop below is the stronger guard and is
        // untouched: every WHOLE lap must be DWELL + DISSOLVE, −100/+200 (it
        // read 4400–4700 on the old 4500), and those are measured in-page
        // after the load has settled. A dwell that was actually wrong — the
        // old 4000, no dissolve — fails there whatever this line says. What
        // this line still catches is the first turn being unrelated to what
        // the bar was showing.
      ).toBeLessThan(700);
      // Every lap after it is a WHOLE one: dwell + dissolve on one clock.
      const LAP = DWELL + DISSOLVE;
      for (let i = 1; i < turns.length; i++) {
        const lap = turns[i].t - turns[i - 1].t;
        expect(lap, `lap ${i} was ${lap}ms — dwell + dissolve is ${LAP}`).toBeGreaterThan(
          LAP - 100,
        );
        expect(lap, `lap ${i} was ${lap}ms — dwell + dissolve is ${LAP}`).toBeLessThan(LAP + 200);
      }
    } finally {
      await context.close();
    }
  });

  test("Pause holds the slide AND the bar; Play starts them again", async ({ browser }) => {
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);
      // LATE in the dwell, so the wait below is short. It was a whole lap
      // from wherever the bar stood (DWELL + DISSOLVE + 700) — 9.2s of nothing
      // once the dwell doubled. The claim needs only the rest of THIS dwell.
      await expect.poll(() => barScale(page), { timeout: TURN_CEILING }).toBeGreaterThan(0.6);

      // A real mouse press — Chromium focuses on mousedown, which is itself a
      // pause; the control must not toggle straight back to playing.
      await page.getByRole("button", { name: "Pause slides" }).click();
      const play = page.getByRole("button", { name: "Play slides" });
      await expect(play).toBeVisible();
      await pointerAway(page);

      const frozen = await barScale(page);
      expect(frozen).toBeGreaterThan(0);
      expect(frozen).toBeLessThan(1);
      // Past the moment a clock still running WOULD have turned it: the part
      // of the dwell the bar says is left, and 700 of margin.
      await page.waitForTimeout((1 - frozen) * DWELL + 700);
      expect(await barScale(page)).toBe(frozen);
      expect(await onStage(page)).toEqual(["25331 IH 10 West"]);
      await expect(status(page)).toHaveAttribute("aria-live", "polite");

      await play.click();
      await pointerAway(page);
      await expect(page.getByRole("button", { name: "Pause slides" })).toBeVisible();
      // Focus is still inside the carousel, so rotation restarts only because
      // Play was pressed — and it resumes from where the bar stood.
      await expect(status(page)).toHaveText("Slide 2 of 3", { timeout: TURN_CEILING });
    } finally {
      await context.close();
    }
  });

  test("a pointer resting on the card does not stop the slides — and Pause and Play act on the press", async ({
    browser,
  }) => {
    // THE OPERATOR'S CALL, 2026-09-23: "i figured out the issue on the
    // homepage slideshow, remove the pause on hover, they have a pause button
    // for that." The issue was their earlier "the pause play button seems to
    // take a moment", and hover was the cause. The Pause button is INSIDE the
    // card, so the pointer travelling to it had already stopped the clock.
    // MEASURED on a production build of main's `/` at 1440 × 900, six runs:
    // the bar stopped 804–919ms BEFORE Pause was pressed; and Play, pressed
    // with the pointer still on it, flipped its label on release (104–109ms)
    // and moved the bar only when the pointer left the band.
    //
    // THREE CLAIMS, on a pointer that never leaves the card:
    //  1. resting on the photo for longer than a dwell, the clock turns the
    //     slide ON TIME — after the rest of the dwell the bar showed, not
    //     later — and runs the next dwell on past where it stood;
    //  2. resting on Pause itself, the bar is still filling, so the PRESS is
    //     what stops it — and no frame after the press moves it;
    //  3. Play, pressed without moving, starts it again.
    test.setTimeout(60_000);
    const { context, page } = await moving(browser);
    try {
      await stampTurns(page);
      await page.goto(HOME);
      await adopted(page);
      // Only what is on screen can be under a pointer, and the reveal moves
      // the card 24px: scroll to it and let the reveal finish.
      await page.locator(BAND).scrollIntoViewIfNeeded();
      await revealed(page.locator(CARD));
      const hovered = (locator: Locator) => locator.evaluate((el) => el.matches(":hover"));

      // ── 1: resting on the photo, for a whole lap ──
      const photo = (await page
        .locator(`${CARD} [data-featured-slide]:not([inert]) [data-featured-photo]`)
        .boundingBox())!;
      await page.mouse.move(photo.x + photo.width / 2, photo.y + photo.height / 2);
      // POSITIVE EVIDENCE THE POINTER IS ON THE BAND: a hover case whose
      // pointer missed the card would pass on every build there is.
      expect(await hovered(page.locator(CARD)), "the pointer is resting on the card").toBe(true);
      // Read INSIDE A FRAME, after the carousel's own tick has drawn it. Read
      // from a task, the bar can be a long task stale: the scroll above boots
      // the map, and under load 22 a read taken straight after it said 0.0727
      // (7418ms left) and the turn came 4850ms later — "early" by the length
      // of the frame the boot held up, not by anything the clock did.
      const start = await page.evaluate(
        (card) =>
          new Promise<{ t: number; p: number; mode?: string; turns: number }>((resolve) =>
            requestAnimationFrame(() => {
              const fill = document
                .querySelector(card)!
                .querySelector<HTMLElement>("[data-carousel-progress] > div")!;
              resolve({
                t: performance.now(),
                p: Number(/scaleX\(([^)]+)\)/.exec(fill.getAttribute("style") ?? "")?.[1]),
                mode: fill.dataset.carouselFill,
                turns: (window as unknown as Timed).__turns.length,
              });
            }),
          ),
        CARD,
      );
      expect(start.mode, "mid-dwell when the pointer came to rest").toBe("timed");
      await expect
        .poll(() => page.evaluate(() => (window as unknown as Timed).__turns.length), {
          timeout: TURN_CEILING,
          message: "the slide turned with the pointer resting on the card",
        })
        .toBeGreaterThan(start.turns);
      const turn = await page.evaluate((n) => (window as unknown as Timed).__turns[n], start.turns);
      const due = (1 - start.p) * DWELL;
      expect(
        Math.abs(turn.t - start.t - due),
        `turned ${(turn.t - start.t).toFixed(0)}ms after the pointer came to rest, ` +
          `with ${due.toFixed(0)}ms of the dwell left — a hover that stopped the clock at ` +
          `all makes this late`,
      ).toBeLessThan(700);
      // The next dwell runs on, under the same pointer, past where the bar
      // stood when it arrived: a whole lap, DWELL + DISSOLVE, under a hover.
      await expect.poll(() => timedFill(page), { timeout: TURN_CEILING }).toBeGreaterThan(start.p);
      const rested = await page.evaluate((t0) => performance.now() - t0, start.t);
      expect(rested, "rested for longer than a dwell").toBeGreaterThan(DWELL);
      expect(await hovered(page.locator(CARD)), "and never left the card").toBe(true);
      await expect(status(page), "rotating: the live region stays quiet").toHaveAttribute(
        "aria-live",
        "off",
      );

      // ── 2: resting on Pause — the press is what stops it ──
      const toggle = page.locator(`${CARD} div[data-js-only] > button`).first();
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
      const button = (await toggle.boundingBox())!;
      await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, {
        steps: 8,
      });
      expect(await hovered(toggle), "the pointer is on Pause").toBe(true);
      // Every frame of the bar, and the instant the press is dispatched,
      // stamped in the page — a frame read through Playwright is a round trip
      // stale, and "stopped on the press" is a claim about single frames.
      await page.evaluate((card) => {
        const w = window as unknown as {
          __press: { down: number | null; frames: { t: number; v: string | null }[] };
        };
        const fill = document.querySelector(card)!.querySelector("[data-carousel-progress] > div")!;
        w.__press = { down: null, frames: [] };
        window.addEventListener("pointerdown", () => (w.__press.down ??= performance.now()), {
          capture: true,
        });
        const tick = () => {
          w.__press.frames.push({ t: performance.now(), v: fill.getAttribute("style") });
          if (w.__press.frames.length < 600) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, CARD);
      await page.waitForTimeout(400);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
      await expect(toggle).toHaveAttribute("aria-label", "Play slides");
      await page.waitForTimeout(400);
      const press = await page.evaluate(
        () =>
          (
            window as unknown as {
              __press: { down: number; frames: { t: number; v: string | null }[] };
            }
          ).__press,
      );
      const before = press.frames.filter((f) => f.t < press.down);
      const after = press.frames.filter((f) => f.t > press.down);
      expect(
        new Set(before.map((f) => f.v)).size,
        `the bar was filling under the pointer on Pause, up to the press (${before.length} frames)`,
      ).toBeGreaterThan(1);
      expect(after.length, "sampled after the press").toBeGreaterThan(5);
      expect([...new Set(after.map((f) => f.v))], "no frame after the press moved the bar").toEqual(
        [after[0].v],
      );

      // ── 3: Play, without moving — the clock runs again under the pointer ──
      const frozen = await barScale(page);
      await page.mouse.down();
      await page.waitForTimeout(100);
      await page.mouse.up();
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
      expect(await hovered(toggle), "Play was pressed without leaving the button").toBe(true);
      await expect
        .poll(() => timedFill(page), {
          timeout: 2_000,
          message: "the bar filling again with the pointer still on the button",
        })
        .toBeGreaterThan(frozen);
    } finally {
      await context.close();
    }
  });

  test("the arrows turn the slide and never drop keyboard focus on <body> (#34)", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      const next = page.getByRole("button", { name: "Next slide" });
      await next.focus();
      // Focus entering is a pause (APG): the clock no longer drives.
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();

      const focused = () =>
        page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "BODY");

      for (const expected of ["Slide 2 of 3", "Slide 3 of 3", "Slide 1 of 3"]) {
        await page.keyboard.press("Enter");
        await expect(status(page)).toHaveText(expected);
        expect(await focused(), `after ${expected}`).toBe("Next slide");
      }
      await page.keyboard.press("ArrowLeft");
      await expect(status(page)).toHaveText("Slide 3 of 3");
      expect(await focused()).toBe("Next slide");

      // THE USER'S TURNS DISSOLVE NOW (operator call, 2026-09-23), and this
      // assertion is the reversal: it read `transition-duration: 0s` and "the
      // USER's turns are instant, as the comp wires its arrows (CHANGE_TO, no
      // transition)". The comp read was faithful; the operator overruled it.
      // Kept and inverted rather than deleted, so the record of which way it
      // used to point survives in the file that measures it.
      //
      // 0.5s is DISSOLVE, which is CAMERA_FLIGHT_MS: the same half second the
      // map's camera has always taken on THIS path, because `activeBy` reports
      // an arrow press as "visitor". The card used to snap while the camera
      // flew. The `motion` block below measures what the dissolve looks like.
      const photo = page.locator(`${CARD} [data-featured-slide]:not([inert]) img`).locator("..");
      await expect(photo).toHaveCSS("transition-duration", "0.5s");
      await expect(photo).toHaveCSS("opacity", "1");

      // Tab goes on INTO the slide that is on stage — its LEARN MORE — and
      // not into one that is off it.
      await page.keyboard.press("Tab");
      await expect(
        page.locator(`${CARD} [data-featured-slide]:not([inert]) a`),
        "the on-stage slide's link takes focus next",
      ).toBeFocused();
      expect(await page.evaluate(() => document.activeElement?.textContent)).toContain(
        "13810 Lookout Road",
      );
    } finally {
      await context.close();
    }
  });

  test("with Pause drawn, the band passes axe and its rings follow their grounds", async ({
    browser,
  }) => {
    // The a11y gate runs under reduced motion, where there is no Pause — so the
    // rotating state is audited here or nowhere.
    //
    // 60s, NOT THE DEFAULT 30. This case now waits for the band's map to finish
    // booting (see below), which is a 426 KB engine parse, a WebGL context, a
    // style fetch and a first tile. Measured on this machine at load average
    // 6.05: 7.0s for the whole case warm. The headroom is for a cold CI runner;
    // the wait itself is on positive evidence, so it is never a fixed sleep.
    test.setTimeout(60_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      // THE BAND HAS TO BE SCROLLED TO, AND ITS REVEAL HAS TO BE OVER. The
      // card reveals on first intersection (use:animateIn), so with the band
      // below the fold — which it is at every width — it sits at opacity 0
      // until a reader arrives, and axe answers `color-contrast` with an
      // INCOMPLETE for every word under a transparent ancestor instead of a
      // ratio. That is the same shape as the `bgOverlap` defect this case was
      // written for, reached by a different route, and an incomplete is still
      // not a pass. So: scroll as a reader does, then wait for positive
      // evidence the reveal has finished (animateIn removes every style it
      // wrote), and only then audit.
      await page.locator(BAND).scrollIntoViewIfNeeded();
      await revealed(page.locator(CARD));
      await page.getByRole("button", { name: "Pause slides" }).click();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();

      // THE MAP IS IN THIS RUN, AND THE EXCLUSION THAT USED TO TAKE IT OUT WAS
      // BOTH WRONGLY EXPLAINED AND HARMFUL. It read: "a cluster marker draws
      // its count in sand on garnet ON TOP OF A CANVAS, and axe cannot see
      // through a canvas". The homepage band has three slides and
      // `clusterPoints` never groups three pins that far apart — measured on
      // /dev/home: clusters 0, pins 3 — so the stated cause cannot occur on
      // the page the exclusion was written for. What axe actually could not
      // measure was the ATTRIBUTION: `.maplibregl-ctrl-attrib-inner` and its
      // three links, "Element's background color could not be determined
      // because element contains an image node", because the chip was
      // translucent over the canvas. (Recorded here as "88% sand", which was
      // wrong in a way nobody could see from this file: the chip was never
      // sand at ANY alpha. Our rule had lost a specificity tie to maplibre's
      // own, so the measured value was its `rgba(255, 255, 255, 0.5)`. See
      // PropertyMap.svelte, and the note on the credit assertion below.)
      //
      // Excluding the map's whole subtree therefore silenced axe over the
      // OpenStreetMap credit — which this component argues is a LICENCE
      // CONDITION and not a style choice, so it is the last thing that should
      // go unmeasured. Nothing is excluded here.
      //
      // AND THE AUDIT WAITS FOR THE MAP, which is the whole of this case's
      // 2026-09-22 correction. What stood here asserted that MapLibre "never
      // boots" on this band because the map slot's top is y=1007 against a 900
      // viewport — true at REST, and false three lines after the scroll this
      // very test performs. Measured at 1455x900 right after
      // `scrollIntoViewIfNeeded()`: scrollY 922, slot top 85, slot height 831,
      // 815px of it on screen. PropertyMap's lazy gate wants half of
      // `min(831, 900)` = 415.5px. It opens every time. Whether MapLibre then
      // finished before `analyze()` ran was a RACE, and the audit asserted on
      // the losing side of it: the listing links go `sr-only` at
      // `data-map-ready`, and axe does not measure contrast on visually hidden
      // text. CI called it flaky at e59970f — it passed on retry — which is
      // what a race looks like from outside.
      //
      // So the state is made determinate the way this repo makes every other
      // one determinate: wait for the positive artefact. `data-map-ready` is
      // set by MapLibre's own `load`, so past this line there is a canvas, an
      // attribution control and cluster markers, on every run.
      //
      // THE COST, SAID OUT LOUD: this audits the BOOTED state, so the band's
      // pre-boot state — the server-rendered link list every visitor sees for
      // as long as 426 KB takes, and for good without WebGL — is not audited
      // here any more. It never was deterministically; the old line reached it
      // by winning a race. #125 tracks giving it a case of its own, and #122
      // may change what that state even is. The two CLOCK cases in this block
      // still start timing without waiting for this boot: #117.
      await expect(
        page.locator("[data-property-map]").first(),
        "the band's map never finished booting, so this audit has no map in it",
      ).toHaveAttribute("data-map-ready", "", { timeout: 40_000 });
      // …AND FOR THE HAND-OVER (#122). `data-map-ready` is MapLibre's `load`,
      // which is where the canvas STARTS coming up over the fixed-frame
      // picture — MAP_HOME_FADE_MS of `transition-opacity` on the canvas host,
      // with the picture opaque beneath it. Auditing inside that window put
      // the whole canvas subtree under an ancestor at partial opacity, and axe
      // answers `color-contrast` with an incomplete rather than a ratio for
      // everything in it: this case found ZERO openstreetmap.org nodes among
      // the passes, on a chip whose measured colour is fine. The picture being
      // GONE is the positive evidence that the canvas is fully opaque, so it
      // is what the audit waits for rather than a sleep.
      await expect(
        page.locator("[data-map-home-box]"),
        "the picture never handed over, so the canvas is still mid-fade",
      ).toHaveCount(0, { timeout: 10_000 });

      const results = await new AxeBuilder({ page }).include(BAND).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      // Positive evidence that axe looked at the controls at all.
      expect(results.passes.map((p) => p.id)).toContain("button-name");

      // …and that it measured the MAP'S OWN TEXT, which is what the exclusion
      // was really hiding — and it is now the ATTRIBUTION, by name, which is a
      // STRONGER claim than the one this line used to make and not a weaker
      // one. The old assertion read the server-rendered listing links, which
      // exist only in the seconds before the engine lands; the credit line is
      // what a reader actually has in front of them, it is the licence
      // condition, and it is the exact text the old blanket exclusion hid.
      //
      // WAITING FOR THE MAP IS WHAT FOUND THE DEFECT UNDER IT. With the boot
      // allowed to finish, axe answered `color-contrast` with THREE
      // `imgNode` incompletes — `.maplibregl-ctrl-attrib-inner` and both
      // licence links, "background color could not be determined because
      // element contains an image node" — i.e. precisely the symptom
      // PropertyMap's <style> claims to have cured by painting the chip
      // opaque. It had not: `[data-property-map] .maplibregl-ctrl-attrib` is
      // specificity (0,2,0) and ties maplibre's own
      // `.maplibregl-ctrl.maplibregl-ctrl-attrib`, which is injected later and
      // won. Measured `rgba(255, 255, 255, 0.5)` on /dev/home and
      // /dev/properties alike. Fixed in PropertyMap.svelte by naming
      // `.maplibregl-ctrl` too, (0,3,0); the chip now computes
      // `rgb(232, 225, 209)` and axe reads the OpenStreetMap credit at
      // **8.86:1**, against the 8.87 that component predicted.
      const contrast = results.passes.find((p) => p.id === "color-contrast");
      const credit = contrast?.nodes.filter((n) => n.html.includes("openstreetmap.org")) ?? [];
      expect(
        credit.length,
        "axe measured the map's OpenStreetMap credit, rather than skipping the map",
      ).toBeGreaterThan(0);
      // The ratio itself, not merely that a ratio exists: an opaque chip is the
      // only thing that gives this number, and a regression to a translucent
      // one takes it back to `incomplete` rather than to a lower figure.
      expect(
        (credit[0]?.any?.[0]?.data as { contrastRatio?: number } | undefined)?.contrastRatio,
        "the credit's measured ratio",
      ).toBeGreaterThan(4.5);

      // AND THAT IT COULD MEASURE THE CARD'S TEXT. A violation count of zero
      // is not a contrast result: axe answers `color-contrast` with
      // "incomplete — bgOverlap" for anything it thinks something else is
      // painted over, and an off-stage slide left at opacity 0 covers the whole
      // card. Measured on this band before the fix: 1 node passed and 6 were
      // incomplete at 1440 (the h2, the size line, the h3, both bullets and
      // LEARN MORE). Incomplete is not a pass — so the assertion is that
      // nothing in the band is incomplete FOR CONTRAST, and that the ratios
      // axe did compute cover the card's own words.
      const incomplete = results.incomplete.find((r) => r.id === "color-contrast");
      expect(
        incomplete?.nodes.map((n) => n.html.slice(0, 60)) ?? [],
        "axe could not measure these",
      ).toEqual([]);
      const measured = results.passes.find((p) => p.id === "color-contrast");
      expect(measured, "axe measured contrast at all").toBeTruthy();
      expect(measured!.nodes.length, "every text node in the card").toBeGreaterThanOrEqual(6);

      // garnet on the sand card — the only ground this band puts a control on.
      // The portfolio button is on that same card ground and wears the same
      // tone; the off-white ring on the dark ground is held by the hero's and
      // the footer's own specs.
      await expectRing(page, page.getByRole("button", { name: "Next slide" }), GARNET);
    } finally {
      await context.close();
    }
  });
});

// ── the four animations ─────────────────────────────────────────────────────
//
// All four were asked for by the operator, and all four are invisible to a
// unit test: jsdom resolves no stylesheet, runs no transition and lays nothing
// out. They are also invisible to a test that forgets to opt OUT of the shared
// config's `reducedMotion: "reduce"` — every case below opens its own
// no-preference context through `moving()`, and the reduced-motion cases
// deliberately use the shared one.
//
// Each measurement is taken FROM THE PAGE, off the same clock the animation
// runs on. Round-tripping a read through Playwright measures the round trip:
// carousel.spec.ts's lesson, paid for again by the lap assertion above.
test.describe("motion", () => {
  /** One frame's reading of everything these cases measure. */
  interface Frame {
    /** Each on-stage text line's opacity and vertical translate, in order. */
    lines: { opacity: number; ty: number }[];
    /** The on-stage photo's scale, out of its computed matrix; null = none. */
    scale: number | null;
    /** `width` is the PAINTED width of the fill, and it is the only one of
     *  these that can see the dissolve. `value` is the scaleX the component
     *  declared; `opacity` is what it is fading. A fill at scaleX(0) paints a
     *  zero-width box, so opacity can ramp beautifully across 500ms and put no
     *  pixel on the screen — which is exactly what shipped in #102 and passed
     *  four assertions that all read `opacity`. */
    bar: { opacity: number; value: number; width: number; mode: string; dur: string };
  }

  /** Waits IN THE PAGE for the next clock turn — the live region changing is
   *  the one thing in the DOM that says "the slide changed" at the instant it
   *  does — then samples every frame for `ms` and hands back the series with
   *  its own timestamps. Sampled in the page, and not by polling from here,
   *  for carousel.spec.ts's reason: a read that round-trips measures the round
   *  trip. The sampler is written out in full rather than passed in, because
   *  the site's CSP ships no `unsafe-eval` and a `new Function` built here
   *  would be blocked in the page — silently, as a violation report. */
  async function sampleAfterTurn(page: Page, ms: number): Promise<{ t: number; v: Frame }[]> {
    return page.evaluate(
      async ({ card, ms }) => {
        const region = document.querySelector(card)!;
        const live = region.querySelector("[aria-live]")!;
        const verticalTranslate = (el: Element) => {
          const t = getComputedStyle(el).translate;
          if (!t || t === "none") return 0;
          const parts = t.split(/\s+/);
          return Number.parseFloat(parts[1] ?? "0") || 0;
        };
        const read = () => {
          const lines = [
            ...region.querySelectorAll("[data-featured-slide]:not([inert]) [data-featured-line]"),
          ].map((el) => ({
            opacity: Number(getComputedStyle(el).opacity),
            ty: verticalTranslate(el),
          }));
          const photo = region.querySelector(
            "[data-featured-slide]:not([inert]) [data-featured-photo]",
          )!;
          const transform = getComputedStyle(photo).transform;
          const fill = region.querySelector<HTMLElement>("[data-carousel-progress] > div")!;
          return {
            lines,
            scale: transform === "none" ? null : Number(/matrix\(([^,]+),/.exec(transform)![1]),
            bar: {
              opacity: Number(getComputedStyle(fill).opacity),
              value: Number(/scaleX\(([^)]+)\)/.exec(fill.getAttribute("style") ?? "")?.[1]),
              width: fill.getBoundingClientRect().width,
              mode: fill.dataset.carouselFill ?? "",
              dur: getComputedStyle(fill).transitionDuration,
            },
          };
        };
        await new Promise<void>((resolve) => {
          const observer = new MutationObserver(() => {
            observer.disconnect();
            resolve();
          });
          observer.observe(live, { childList: true, characterData: true, subtree: true });
        });
        const t0 = performance.now();
        const series: { t: number; v: ReturnType<typeof read> }[] = [];
        await new Promise<void>((resolve) => {
          const tick = () => {
            const t = performance.now() - t0;
            series.push({ t, v: read() });
            if (t >= ms) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return series;
      },
      { card: CARD, ms },
    );
  }

  // ── A: the staggered text entrance ───────────────────────────────────────

  test("the text arrives as four lines 60ms apart, all of it inside the settle", async ({
    browser,
  }) => {
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      // What the browser resolved, not what the source says: a `delay-[${n}ms]`
      // built at runtime renders exactly the same class attribute and ships no
      // CSS at all, so the class list is not evidence and the computed value is.
      const wired = await page.locator(LINES).evaluateAll((els) =>
        els.map((el) => {
          const cs = getComputedStyle(el);
          return { delay: cs.transitionDelay, duration: cs.transitionDuration };
        }),
      );
      expect(wired).toEqual([
        { delay: "0.15s", duration: "0.17s" },
        { delay: "0.21s", duration: "0.17s" },
        { delay: "0.27s", duration: "0.17s" },
        { delay: "0.33s", duration: "0.17s" },
      ]);

      // …and that they actually arrive in that order. Each line's opacity is
      // sampled every frame from the turn on; `done` is the first frame it
      // reached 1. The assertion is the SHAPE — a strictly later arrival per
      // line, and the whole cascade over by the 500ms settle — not four exact
      // timestamps, which would measure the machine's frame budget.
      const series = await sampleAfterTurn(page, 900);
      const done = [0, 1, 2, 3].map(
        (s) => series.find((f) => (f.v.lines[s]?.opacity ?? 0) >= 0.999)?.t ?? null,
      );
      expect(
        done.every((t) => t !== null),
        `arrivals: ${done.join(", ")}`,
      ).toBe(true);
      const at = done as number[];
      for (let i = 1; i < at.length; i++)
        expect(at[i], `line ${i} at ${at[i]}ms, line ${i - 1} at ${at[i - 1]}ms`).toBeGreaterThan(
          at[i - 1],
        );
      // Three 60ms steps between the first and the last.
      expect(at[3] - at[0], `spread ${at[3] - at[0]}ms`).toBeGreaterThan(120);
      expect(at[3] - at[0], `spread ${at[3] - at[0]}ms`).toBeLessThan(300);
      // The bar starts filling at the settle; nothing may still be arriving.
      expect(at[3], `last line landed at ${at[3]}ms`).toBeLessThan(DISSOLVE + 200);
      // Nothing is left part-way, and nothing is left 8px out of place: a line
      // stranded at partial opacity over the card is the `bgOverlap` shape the
      // axe case exists for.
      expect(series[series.length - 1].v.lines).toEqual([
        { opacity: 1, ty: 0 },
        { opacity: 1, ty: 0 },
        { opacity: 1, ty: 0 },
        { opacity: 1, ty: 0 },
      ]);
      // …and they came from 8px below, which is the rise that was asked for.
      expect(series[0].v.lines.map((l) => l.ty)).toEqual([8, 8, 8, 8]);
    } finally {
      await context.close();
    }
  });

  // ── A VISITOR'S TURN (operator call, 2026-09-23) ─────────────────────────
  //
  // "For the home slideshow, animations don't fire if I manually page
  // through, they should." MEASURED on main before the change, at 1440 with
  // two real mouse presses 1.5s apart: on the first frame of each turn all
  // four incoming lines were already at opacity 1, the photo at opacity 1 and
  // the outgoing slide already hidden, and the new photo then sat at exactly
  // scale(1) for the 5000ms that followed. Every way a visitor turns this band
  // is itself a pause (the arrow's focus, the pointer on the card), and the
  // old gate was `rotating`, so no manual turn ever animated — not the first
  // press and not any press after it.

  /** Presses `label` FROM INSIDE THE PAGE and samples every frame from that
   *  instant — the manual-turn twin of `sampleAfterTurn`, which waits on the
   *  live region for a turn it did not cause.
   *
   *  In the page rather than through Playwright: the claims are about the
   *  first 500ms, and a `locator.click()` round trip is measured in the same
   *  order of magnitude (carousel.spec.ts's lesson). `before` is read in the
   *  press's own task. `slides` is indexed by DOM ORDER, so the outgoing slide
   *  is followed by identity after it goes `inert`.
   *
   *  NOTHING IS READ IN THE PRESS'S OWN TASK AFTER THE PRESS, and that is a
   *  correction. Svelte flushes a programmatic `click()` in a microtask, so in
   *  that task `:not([inert])` still names the OUTGOING slide, whose words are
   *  of course opaque. MEASURED with the lines staggering: that read returned
   *  four opaque lines titled "25331 IH 10 West" while the next frame showed
   *  "101 W. Commerce Street" at opacity 0. Two cases in this file read
   *  exactly that and passed for it — "a USER turn does not stagger: the lines
   *  are simply there" and "reduced motion: the incoming lines are opaque in
   *  the same frame as the press" — so neither could ever have gone red. The
   *  first frame is the earliest honest reading.
   *
   *  The press FOCUSES the control and clicks it in one task, which lands the
   *  arrow's focus-pause and the turn in ONE flush. A real mouse puts them in
   *  two. The slice orders its freeze check before its turn handling for
   *  exactly this, and the drift case below is what holds it there.
   *
   *  TWO CLOCKS, AND CONFUSING THEM COST 6 REDS IN 64 UNDER LOAD. `t` is
   *  `performance.now()` from the press, which is what the script-driven drift
   *  is timed from. A CSS transition is not: it runs on the DOCUMENT TIMELINE
   *  from its own `startTime`, which Chromium resolves on a frame AFTER the
   *  style change — so neither the press nor the first sampled frame is its
   *  origin, and on a loaded machine the gap is whole frames. Measured at load
   *  21–87: timed from the press, a last line "landed at 1968.7ms" and a stack
   *  "never left" inside a 900ms window; timed from the first frame, four lines
   *  were still not whole "at 581.5ms". So each frame carries `tl`, the
   *  timeline time it was evaluated at, and `origin` is the incoming last
   *  line's own transition `startTime` — both relative to the press. Sampling
   *  runs until the timeline is `ms` past that origin. */
  async function sampleAfterPress(page: Page, ms: number, label = "Next slide") {
    return page.evaluate(
      async ({ card, ms, label }) => {
        const region = document.querySelector(card)!;
        const slides = [...region.querySelectorAll("[data-featured-slide]")];
        const photoOf = (el: Element) => el.querySelector<HTMLElement>("[data-featured-photo]")!;
        const scaleOf = (el: Element) => {
          const t = getComputedStyle(photoOf(el)).transform;
          return t === "none" ? null : Number(/matrix\(([^,]+),/.exec(t)![1]);
        };
        const linesOf = (el: Element) =>
          [...el.querySelectorAll("[data-featured-line]")].map((line) => {
            const cs = getComputedStyle(line);
            const t = cs.translate;
            return {
              opacity: Number(cs.opacity),
              ty: !t || t === "none" ? 0 : Number.parseFloat(t.split(/\s+/)[1] ?? "0") || 0,
              delay: cs.transitionDelay,
              duration: cs.transitionDuration,
            };
          });
        const read = () =>
          slides.map((el) => ({
            onStage: !el.hasAttribute("inert"),
            visibility: getComputedStyle(el).visibility,
            scale: scaleOf(el),
            style: photoOf(el).getAttribute("style"),
            photoOpacity: Number(getComputedStyle(photoOf(el).parentElement!).opacity),
            lines: linesOf(el),
          }));

        const was = slides.findIndex((el) => !el.hasAttribute("inert"));
        const before = read();
        const button = [...region.querySelectorAll("button")].find(
          (b) => b.getAttribute("aria-label") === label,
        )!;
        button.focus();
        button.click();
        const t0 = performance.now();
        /** The incoming last line's opacity transition's `startTime`, once the
         *  timeline has resolved it — null under reduced motion, where the
         *  0.01ms transition is over before anything can read it. */
        let origin: number | null = null;
        const findOrigin = () => {
          const onStage = slides.find((el) => !el.hasAttribute("inert"));
          const lines = onStage?.querySelectorAll("[data-featured-line]") ?? [];
          for (const animation of lines[lines.length - 1]?.getAnimations() ?? [])
            if (
              (animation as CSSTransition).transitionProperty === "opacity" &&
              animation.startTime !== null
            )
              return Number(animation.startTime) - t0;
          return null;
        };
        const series: { t: number; tl: number; v: ReturnType<typeof read> }[] = [];
        await new Promise<void>((resolve) => {
          const tick = () => {
            const t = performance.now() - t0;
            const tl = Number(document.timeline.currentTime) - t0;
            series.push({ t, tl, v: read() });
            origin ??= findOrigin();
            if (tl - (origin ?? series[0].tl) >= ms) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        return { was, before, series, origin: origin ?? series[0].tl };
      },
      { card: CARD, ms, label },
    );
  }

  /** How many slides are in the stack — `visibility: visible` — in one frame. */
  const inStack = (frame: { v: { visibility: string }[] }) =>
    frame.v.filter((slide) => slide.visibility === "visible").length;

  test("a VISITOR's turn staggers exactly as the clock's does, and lands on the same 500", async ({
    browser,
  }) => {
    // THE REVERSAL, MEASURED. This case replaces "a USER turn does not
    // stagger: the lines are simply there", which asserted the comp's wiring
    // (ON_CLICK → CHANGE_TO, no transition) and which the operator overruled —
    // and which, read in the press's own task, was vacuous besides (see
    // `sampleAfterPress`).
    //
    // TWO PRESSES, because the old gate failed every one of them: `rotating`
    // stays false for as long as focus stays in the carousel, so a fix that
    // animated only the first turn would pass one press and fail here.
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      for (const pass of ["first press", "second press, focus already inside"]) {
        const { was, series, origin } = await sampleAfterPress(page, 900);
        const now = (was + 1) % 3;
        const first = series[0].v[now];
        expect(first.onStage, `${pass}: on stage one frame after the press`).toBe(true);

        // WIRED — what the browser resolved on the incoming lines, which does
        // not depend on how fast the machine draws frames. The old gate
        // resolves `0s` on all four here.
        expect(
          first.lines.map((l) => [l.delay, l.duration]),
          `${pass}: the incoming lines' transitions`,
        ).toEqual([
          ["0.15s", "0.17s"],
          ["0.21s", "0.17s"],
          ["0.27s", "0.17s"],
          ["0.33s", "0.17s"],
        ]);
        // NOT ARRIVED on the first frame. The LAST line is the one read: it
        // cannot be opaque before 330 + 170 = 500ms, so this holds however late
        // the first frame comes, and an instant swap reads 1 here.
        expect(
          first.lines[3].opacity,
          `${pass}: the last line ${series[0].t.toFixed(1)}ms after the press`,
        ).toBeLessThan(1);
        expect(first.lines[3].ty, `${pass}: …and still parked below`).toBeGreaterThan(0);

        // They arrive in order and the last lands ON DISSOLVE — the number the
        // clock's cascade ends on, because it was never the settle's: it is
        // how long the hand-over takes to look finished. Times from the
        // transitions' origin (see `sampleAfterPress`). Non-decreasing, not
        // strictly increasing: under load two lines can land in one frame, and
        // the order is already pinned by the delays above.
        const since = (f: { tl: number }) => f.tl - origin;
        const done = [0, 1, 2, 3].map(
          (i) => series.find((f) => (f.v[now].lines[i]?.opacity ?? 0) >= 0.999) ?? null,
        );
        expect(
          done.every((f) => f !== null),
          `${pass}: arrivals ${done.map((f) => f && since(f).toFixed(1)).join(", ")}`,
        ).toBe(true);
        const at = (done as { tl: number }[]).map(since);
        for (let i = 1; i < at.length; i++)
          expect(
            at[i],
            `${pass}: line ${i} at ${at[i]}ms, line ${i - 1} at ${at[i - 1]}ms`,
          ).toBeGreaterThanOrEqual(at[i - 1]);
        // Not before 500: no frame earlier than that has the last line whole…
        expect(
          series
            .filter((f) => since(f) < DISSOLVE - 20 && f.v[now].lines[3].opacity >= 0.999)
            .map((f) => since(f).toFixed(1)),
          `${pass}: the last line whole before ${DISSOLVE}ms`,
        ).toEqual([]);
        // …and not after it: the first frame past 500 has all four whole,
        // however late that frame comes.
        const past = series.find((f) => since(f) >= DISSOLVE + 60)!;
        expect(
          past.v[now].lines.map((l) => l.opacity),
          `${pass}: all four whole at ${since(past).toFixed(1)}ms`,
        ).toEqual([1, 1, 1, 1]);
        // Nothing is left part-way over the card — the `bgOverlap` shape.
        expect(
          series[series.length - 1].v[now].lines.map((l) => [l.opacity, l.ty]),
          `${pass}: at rest`,
        ).toEqual([
          [1, 0],
          [1, 0],
          [1, 0],
          [1, 0],
        ]);
      }

      // The clock really is stopped throughout, so nothing above was a clock
      // turn wearing a press's clothes.
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      await expect(status(page)).toHaveText("Slide 3 of 3");
    } finally {
      await context.close();
    }
  });

  test("a VISITOR's turn drifts the photo it brought on — with the clock stopped", async ({
    browser,
  }) => {
    // THE HALF THE OLD GATE COULD NOT REACH, and the harder one: the drift was
    // `progress`, the rotation's clock, and the press stops that clock. The
    // slice gives a visitor's turn one dwell's worth of drift of its own —
    // still through the 500ms dissolve, then 1.00 → 1.03 over DWELL (8000ms
    // since 2026-09-23), then held — without restarting the rotation (see
    // `kick` in the slice). The
    // rate is pinned to the frame in FeaturedProperties.test.ts under fake
    // timers; this is the browser's word that it happens at all, with the
    // arrow's focus-pause landing in the same flush as the turn.
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      const { was, series } = await sampleAfterPress(page, 800);
      const now = (was + 1) % 3;
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();

      // Still through the dissolve, as a clock turn is still through its
      // settle: the drift starts on a photo that has finished arriving. Timed
      // from the PRESS, which is what the drift is timed from — and a frame's
      // read can only be staler than its timestamp, never ahead of it.
      const drift = series.map((f) => ({ t: f.t, s: f.v[now].scale! }));
      const still = drift.filter((f) => f.t < DISSOLVE - 60);
      expect(still.length, "sampled the dissolve").toBeGreaterThan(0);
      expect(new Set(still.map((f) => f.s))).toEqual(new Set([1]));
      // Monotone: nothing beats against it.
      for (let i = 1; i < drift.length; i++)
        expect(drift[i].s, `${drift[i].t.toFixed(1)}ms`).toBeGreaterThanOrEqual(drift[i - 1].s);

      // …and then it TRAVELS, with the rotation stopped — polled rather than
      // read off one frame, because the frame a sampler lands on can be a
      // whole second stale on a loaded machine (measured: 1.0015 read at
      // t ≥ 2000ms, where the drift was due at 1.0113, after a 1.3s frame gap).
      // The rate is the unit test's; this is the browser's word that it moves.
      await expect.poll(() => photoScale(page), { timeout: 8_000 }).toBeGreaterThan(1.005);
      // It ENDS, at the end scale, and HOLDS — DISSOLVE + DWELL from the press
      // (8.5s; it was 4.5 before the dwell doubled), then still.
      await expect.poll(() => photoScale(page), { timeout: DISSOLVE + DWELL + 2_000 }).toBe(1.03);
      await page.waitForTimeout(600);
      expect(await photoScale(page), "held at the end, not a second lap").toBe(1.03);
      // It turned nothing: same slide, rotation still stopped, bar at 0.
      expect(await onStage(page)).toHaveLength(1);
      await expect(status(page)).toHaveText(`Slide ${now + 1} of 3`);
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      expect(await barScale(page), "the bar has not moved: nothing is counting").toBe(0);
    } finally {
      await context.close();
    }
  });

  test("an arrow press: the outgoing slide holds still for the fade, then leaves the stack", async ({
    browser,
  }) => {
    // TWO CLAIMS, AND THE SECOND ONE IS AN ACCESSIBILITY GUARD.
    //
    // 1. The photo that just left is held at the drift it HAD. Off-stage
    //    photos used to sit at the end scale unconditionally, which was sound
    //    while a visitor's turn was instant — nobody ever saw that photo. It is
    //    opaque for the whole 500ms now (its `opacity-0` waits out
    //    `delay-500`), so an unconditional 1.03 would jump it under the
    //    incoming one in a single frame: up to 27.8px of width on the 928 ×
    //    542 box. Asserted as bit-equality with the frame before the press,
    //    every frame, for as long as it is visible.
    //
    // 2. It then LEAVES THE STACK. A slide at opacity 0 still paints a box
    //    over the card, and axe answers `color-contrast` with `bgOverlap`
    //    instead of a ratio for everything under it. That delayed `invisible`
    //    used to fire only on clock turns; this path had no second slide in
    //    the stack at all, and now has one for 500ms. The window is closed by
    //    CSS and not by the clock, which is what has to be true here, because
    //    after this press the clock is stopped.
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);
      // Press MID-DWELL, so the held value is distinguishable both from 1.00
      // (the incoming photo's) and from 1.03 (what the old rule held).
      await expect.poll(() => barScale(page), { timeout: TURN_CEILING }).toBeGreaterThan(0.2);

      const { was, before, series, origin } = await sampleAfterPress(page, 900);
      const parked = before[was].scale!;
      expect(parked, `the outgoing photo was mid-drift at ${parked}`).toBeGreaterThan(1.0001);
      expect(parked).toBeLessThan(1.03);

      // 1 — every frame, while it is in the stack, at exactly where it was.
      const shown = series.filter((f) => f.v[was].visibility === "visible");
      expect(shown.length, "sampled the outgoing slide while it was visible").toBeGreaterThan(0);
      expect(
        shown
          .filter((f) => f.v[was].scale !== parked)
          .map((f) => `${f.t.toFixed(1)}ms: ${f.v[was].scale}`),
        `the outgoing photo moved from ${parked}`,
      ).toEqual([]);

      // 2 — the WINDOW: two slides in the stack for as long as the fade runs…
      // (times from the transitions' origin; see `sampleAfterPress`)
      const during = series.filter((f) => f.tl - origin < DISSOLVE - 20);
      expect(during.length, "sampled the fade").toBeGreaterThan(0);
      expect(
        during
          .filter((f) => inStack(f) !== 2)
          .map((f) => `${(f.tl - origin).toFixed(1)}ms: ${inStack(f)}`),
        "two slides in the stack through the fade",
      ).toEqual([]);
      // …then one, closed by CSS with the clock stopped.
      const hiddenAt = series.find((f) => f.v[was].visibility === "hidden")?.tl;
      const firstHidden = hiddenAt === undefined ? null : hiddenAt - origin;
      expect(firstHidden, "the outgoing slide never left the stack").not.toBeNull();
      expect(firstHidden!, `left the stack at ${firstHidden}ms`).toBeGreaterThanOrEqual(
        DISSOLVE - 20,
      );
      // ON 500, on the timeline — every frame from there on has one slide in
      // the stack, however late the first of them arrived.
      const after = series.filter((f) => f.tl - origin >= DISSOLVE + 20);
      expect(after.length, "sampled past the fade").toBeGreaterThan(0);
      expect(
        after.filter((f) => inStack(f) !== 1).map((f) => `${(f.tl - origin).toFixed(1)}ms`),
        "one slide in the stack once the fade is over",
      ).toEqual([]);
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  /** Presses `label` and HOLDS the hand-over window open: every transition the
   *  press started is FINISHED except the outgoing slide's own delayed
   *  `visibility`, which is PAUSED. What is on screen then differs from the
   *  settled state in exactly one property — a second slide still in the
   *  stack — which is the state this window adds and nothing else.
   *
   *  Held rather than raced because axe cannot run inside 500ms: an audit
   *  timed to land in the window measures whichever frame it happens to reach,
   *  part-faded lines included (at ~250ms one line is mid-fade and axe
   *  computes it at 3.24:1 — true of every fade, and not this window's
   *  question). `getAnimations()` flushes style, so the press's transitions
   *  exist by the time it returns, without waiting a frame for them. */
  const holdWindow = (page: Page, label: string) =>
    page.evaluate(
      async ({ card, label }) => {
        const region = document.querySelector(card)!;
        const slides = [...region.querySelectorAll("[data-featured-slide]")];
        const was = slides.findIndex((el) => !el.hasAttribute("inert"));
        [...region.querySelectorAll("button")]
          .find((b) => b.getAttribute("aria-label") === label)!
          .click();
        await Promise.resolve();
        let held = 0;
        for (const animation of document.getAnimations()) {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          if (
            target === slides[was] &&
            (animation as CSSTransition).transitionProperty === "visibility"
          ) {
            animation.pause();
            held++;
          } else animation.finish();
        }
        const now = slides.findIndex((el) => !el.hasAttribute("inert"));
        /** Which slide PAINTS the point at the middle of `el`'s left edge.
         *
         *  Hit-testing follows paint order, but it skips what cannot be
         *  targeted, and the leaving slide is both `pointer-events: none` and
         *  `inert`. A bare `elementFromPoint` therefore answered "the slide on
         *  stage" whichever slide was painted on top: two versions of this
         *  probe passed with the leaving slide over the words on stage, and
         *  only the audit went red. So for the one reading the leaving slide is
         *  made targetable again — `inert` as a property, which is how the
         *  primitive sets it — and put straight back. Opacity 0 does not stop
         *  a hit and the slide is `visible`, so it is hit exactly where it
         *  paints. */
        const topAt = (el: Element) => {
          const b = el.getBoundingClientRect();
          const leaving = slides[was] as HTMLElement;
          leaving.inert = false;
          leaving.style.pointerEvents = "auto";
          const hit = document.elementFromPoint(b.left + 4, b.top + b.height / 2);
          leaving.style.pointerEvents = "";
          leaving.inert = true;
          return slides.findIndex((slide) => slide.contains(hit));
        };
        return {
          was,
          now,
          title: slides[now].querySelector("h3")!.textContent!.trim(),
          held,
          inStack: slides.filter((s) => getComputedStyle(s).visibility === "visible").length,
          titleOnTop: topAt(slides[now].querySelector("h3")!),
          photoOnTop: topAt(slides[now].querySelector("[data-featured-photo]")!),
        };
      },
      { card: CARD, label },
    );

  test("inside the hand-over and after it, axe measures every word on the card — both ways", async ({
    browser,
  }) => {
    // THE WINDOW'S COST, IN THE ONLY CURRENCY THAT MATTERS. For 500ms after
    // a turn the outgoing slide is still in the stack, and a slide in the
    // stack over the one on stage is what makes axe answer `bgOverlap`
    // instead of a ratio: measured on this band before the delayed
    // `invisible` existed, 1 node passed and 6 were incomplete at 1440.
    //
    // BOTH DIRECTIONS, because they are not the same window. Next from slide 1
    // puts the incoming slide LATER in the DOM, so it paints over the leaving
    // one and axe measured 7 of 7. Previous puts it EARLIER, so the leaving
    // slide — words at opacity 0, still `visible` — painted over the words on
    // stage, and axe measured 2 and answered `bgOverlap` for the size line,
    // the title, both bullets and LEARN MORE. The clock meets the same order
    // once a lap, at the wrap from the last slide to the first. The slice now
    // raises the slide on stage (`z-[1]` on the slide, not the photo), and
    // this case holds it there.
    //
    // A COUNT OF MEASURED NODES AND AN EMPTY INCOMPLETE LIST, not "no
    // violations": zero violations is also what a card with nothing
    // measurable reports.
    test.setTimeout(60_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await page.locator(BAND).scrollIntoViewIfNeeded();
      await revealed(page.locator(CARD));
      // The clock stopped first, so no turn of its own lands in an audit.
      await page.getByRole("button", { name: "Pause slides" }).click();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      await pointerAway(page);

      const audit = async (title: string, when: string) => {
        const results = await new AxeBuilder({ page }).include(CARD).analyze();
        expect(
          results.violations.map((v) => `${v.id}: ${v.nodes.length}`),
          `${when}: violations`,
        ).toEqual([]);
        const { measured, unmeasured } = contrastOf(results);
        expect(
          unmeasured.map((n) => n.html.slice(0, 60)),
          `${when}: axe could not measure these`,
        ).toEqual([]);
        // The seven: the eyebrow, the size line, the title, two bullets,
        // LEARN MORE and the portfolio button.
        expect(measured.length, `${when}: text nodes measured with a ratio`).toBe(7);
        expect(
          measured.some((n) => n.html.includes(title)),
          `${when}: the slide on stage's own title was among them`,
        ).toBe(true);
      };

      // Which slide the press brings on is read from the DOM, not assumed: on
      // a loaded machine the clock can turn once before Pause lands, and a
      // hard-coded "101 W. Commerce Street" then names the wrong slide.
      for (const label of ["Next slide", "Previous slide"]) {
        const held = await holdWindow(page, label);
        const title = held.title;
        expect(held.held, `${label}: the window was caught open`).toBe(1);
        expect(held.inStack, `${label}: two slides in the stack`).toBe(2);
        expect(held.titleOnTop, `${label}: the words on top are the slide on stage's`).toBe(
          held.now,
        );
        expect(held.photoOnTop, `${label}: …and so is the photo`).toBe(held.now);
        await audit(title, `${label}, window held open`);

        // RELEASE the held transition and let CSS close the window itself.
        // Finishing it instead would close any window at all — measured: with
        // the delay mutated to 60000ms, a version that called `finish()` here
        // stayed green.
        await page.evaluate(() => {
          for (const animation of document.getAnimations())
            if (animation.playState === "paused") animation.play();
        });
        await expect(page.locator(`${CARD} [data-featured-slide]`).nth(held.was)).toHaveCSS(
          "visibility",
          "hidden",
        );
        await audit(title, `${label}, window closed`);
      }
    } finally {
      await context.close();
    }
  });

  test("reduced motion: a visitor's turn is a plain swap — nothing part-way, nothing left over", async ({
    page,
  }) => {
    // The shared config's context: reducedMotion "reduce". This replaces
    // "reduced motion: the incoming lines are opaque in the same frame as the
    // press", which read the OUTGOING slide (see `sampleAfterPress`).
    //
    // WHAT A PLAIN SWAP LOOKS LIKE, MEASURED, because it is not "opaque in the
    // first frame". app.css turns every transition into a 0.01ms one on
    // `all`, and a transition sits at its START for the frame it begins in:
    // the first frame after the press showed the incoming lines at 0 / +8px
    // with the old slide still visible, and the next showed the new slide
    // whole and the old one gone, with no animation left running. That is the
    // old slide for one more frame, then the new one — never anything in
    // between. So the claim is: no frame part-way, every frame from 100ms on
    // whole, and no photo ever given a transform. The last is the one app.css
    // CANNOT enforce: the drift is written by script every frame.
    await page.goto(HOME);
    await adopted(page);
    const { was, series } = await sampleAfterPress(page, 700);
    const now = (was + 1) % 3;

    for (const f of series) {
      const when = `${f.t.toFixed(1)}ms`;
      expect(
        f.v.map((slide) => slide.style),
        `${when}: no photo carries a transform`,
      ).toEqual([null, null, null]);
      for (const line of f.v[now].lines) {
        expect([0, 1], `${when}: a line part-way at ${line.opacity}`).toContain(line.opacity);
        expect([0, 8], `${when}: a line part-way at +${line.ty}px`).toContain(line.ty);
      }
      expect([0, 1], `${when}: the photo part-way`).toContain(f.v[now].photoOpacity);
    }
    const settled = series.filter((f) => f.t >= 100);
    expect(settled.length, "sampled past 100ms").toBeGreaterThan(0);
    for (const f of settled) {
      const when = `${f.t.toFixed(1)}ms`;
      expect(
        f.v[now].lines.map((l) => [l.opacity, l.ty]),
        `${when}: the incoming words, whole`,
      ).toEqual([
        [1, 0],
        [1, 0],
        [1, 0],
        [1, 0],
      ]);
      expect(f.v[now].photoOpacity, `${when}: the incoming photo, whole`).toBe(1);
      expect(inStack(f), `${when}: nothing left in the stack`).toBe(1);
    }
  });

  // ── B: the Ken Burns drift ───────────────────────────────────────────────

  /** The active photo's scale, read out of the computed matrix. */
  const photoScale = (page: Page) =>
    page
      .locator(`${CARD} [data-featured-slide]:not([inert]) [data-featured-photo]`)
      .evaluate((el) => {
        const t = getComputedStyle(el).transform;
        if (t === "none") return null;
        return Number(/matrix\(([^,]+),/.exec(t)![1]);
      });

  test("the photo drifts 1.00 → 1.03 across its dwell, on the carousel's own clock", async ({
    browser,
  }) => {
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      // Sampled from a turn, so the dwell's start is known: the settle runs
      // 0–500 with `progress` pinned at 0, then DWELL of dwell. 0.03 over
      // 8000ms is 3.75e-6 per ms (half the 4000 dwell's rate), so a 1200ms
      // window is ~0.0045 of travel — still more than two orders of magnitude
      // above the matrix's resolution.
      const series = await sampleAfterTurn(page, 2000);
      const settle = series.filter((s) => s.t < DISSOLVE - 100).map((s) => s.v.scale);
      const late = series
        .filter((s) => s.t > DISSOLVE + 100)
        .map((s) => ({ t: s.t, v: s.v.scale }));

      // It sits STILL through the handover — `progress` is 0 while `elapsed`
      // is negative — and only then starts to travel. That is the one-clock
      // property: the zoom begins when the slide is fully shown, with the bar.
      expect(settle.length, "sampled the settle").toBeGreaterThan(5);
      expect(new Set(settle.map((v) => v!.toFixed(4)))).toEqual(new Set(["1.0000"]));

      const first = late[0].v!;
      const last = late[late.length - 1].v!;
      expect(
        last,
        `${first} → ${last} over ${late[late.length - 1].t - late[0].t}ms`,
      ).toBeGreaterThan(first);
      expect(first).toBeGreaterThanOrEqual(1);
      expect(last).toBeLessThanOrEqual(1.03);
      // Monotone, never a jump back: a second clock would beat against this one.
      for (let i = 1; i < late.length; i++)
        expect(late[i].v!, `frame ${i} at ${late[i].t}ms`).toBeGreaterThanOrEqual(late[i - 1].v!);
    } finally {
      await context.close();
    }
  });

  test("the drift FREEZES with the bar on pause — one clock, not two", async ({ browser }) => {
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);
      // Late in the dwell, for the Pause case's reason: the wait below is the
      // rest of this dwell, not a whole lap.
      await expect.poll(() => barScale(page), { timeout: TURN_CEILING }).toBeGreaterThan(0.6);

      await page.getByRole("button", { name: "Pause slides" }).click();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      await pointerAway(page);

      const frozenScale = await photoScale(page);
      const frozenBar = await barScale(page);
      expect(frozenScale).toBeGreaterThan(1);
      expect(frozenScale).toBeLessThan(1.03);
      // Past the end of the dwell the bar says is left: a CSS animation timed
      // to it would have run to its end by then.
      await page.waitForTimeout((1 - frozenBar) * DWELL + 700);
      expect(await photoScale(page)).toBe(frozenScale);
      expect(await barScale(page)).toBe(frozenBar);
    } finally {
      await context.close();
    }
  });

  test("reduced motion: the photo carries no transform at all", async ({ page }) => {
    // Not `scale(1)` — NO transform. app.css zeroes animation-duration to
    // 0.01ms with iteration-count 1, so a @keyframes with `forwards` would
    // snap to its end state and hold it: a permanently zoomed photo dressed up
    // as "no animation". Driving it off `progress`, which is 0 wherever the
    // carousel is not `eligible`, is what makes the style disappear entirely.
    await page.goto(HOME);
    await adopted(page);
    const photos = await page.locator(`${CARD} [data-featured-photo]`).evaluateAll((els) =>
      els.map((el) => ({
        style: el.getAttribute("style"),
        transform: getComputedStyle(el).transform,
      })),
    );
    expect(photos).toHaveLength(3);
    for (const photo of photos) expect(photo).toEqual({ style: null, transform: "none" });
  });

  // ── C: the bar dissolves at a turn ───────────────────────────────────────

  test("the bar dissolves across the handover while its value snaps", async ({ browser }) => {
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);

      const series = await sampleAfterTurn(page, 1400);

      const duringSettle = series.filter((s) => s.t < DISSOLVE - 100);
      expect(
        duringSettle.some((s) => s.v.bar.mode === "handover"),
        "the handover was drawn",
      ).toBe(true);

      // THE FILL IS ON SCREEN WHILE IT FADES, AND THIS IS THE ASSERTION THAT
      // MATTERS. The first version of this feature snapped `scaleX` to 0 and
      // then faded the opacity of a box with no width — the bar vanished
      // instantly, exactly as it had before the change, and every assertion
      // below still passed because every one of them reads `opacity`. Painted
      // width is the channel that can tell the feature from its absence.
      const track = await page.locator("[data-carousel-progress]").boundingBox();
      for (const s of duringSettle)
        expect(
          s.v.bar.width,
          `t=${Math.round(s.t)}ms the fill painted ${s.v.bar.width}px at opacity ${s.v.bar.opacity}`,
        ).toBeGreaterThan(track!.width * 0.9);

      // …and it is GONE once the handover is over: the value returns to the
      // clock, which is at the start of a fresh dwell.
      const resumed = series.filter((s) => s.t > DISSOLVE + 60 && s.t < DISSOLVE + 200);
      expect(resumed.length).toBeGreaterThan(2);
      expect(Math.min(...resumed.map((s) => s.v.bar.width))).toBeLessThan(track!.width * 0.2);

      // …and the OPACITY FADED across it, rather than snapping to 0 behind the
      // same `data-carousel-fill` flag. That distinction is the whole change,
      // and the first version of this case could not see it: `min < 0.8` is as
      // true of an instant drop to 0 as of a fade, so a mutation that set the
      // duration to 0ms passed. Three assertions replace it, each of which a
      // snap fails — the fade is GRADUAL (many samples strictly between), it
      // is HALF SPENT at the halfway mark, and it is only ever going DOWN.
      const mid = series.filter((s) => s.t > 60 && s.t < DISSOLVE - 60).map((s) => s.v.bar);
      const opacities = mid.map((b) => b.opacity);
      const partial = opacities.filter((o) => o > 0.02 && o < 0.98);
      expect(partial.length, `mid-handover opacities ${opacities.join(", ")}`).toBeGreaterThan(5);
      const halfway = mid[Math.floor(mid.length / 2)].opacity;
      expect(halfway, `halfway through the handover the fill was at ${halfway}`).toBeGreaterThan(
        0.25,
      );
      expect(halfway).toBeLessThan(0.75);
      for (let i = 1; i < opacities.length; i++)
        expect(opacities[i], `frame ${i} of the fade`).toBeLessThanOrEqual(opacities[i - 1]);

      // The fade lasts the carousel's OWN settle — the number is read off the
      // inline style the component writes from `carousel.settle`, not off a
      // constant repeated in the component.
      expect(new Set(mid.map((b) => b.dur))).toEqual(new Set([`${DISSOLVE / 1000}s`]));

      // By the end of the handover the fill is opaque again and filling — the
      // bar is never left faded out, which is what gating on `rotating` buys.
      const after = series.filter((s) => s.t > DISSOLVE + 300);
      expect(after.length).toBeGreaterThan(5);
      for (const s of after) expect(s.v.bar.opacity).toBe(1);
      expect(after[after.length - 1].v.bar.value).toBeGreaterThan(after[0].v.bar.value);
      expect(after[after.length - 1].v.bar.mode).toBe("timed");
    } finally {
      await context.close();
    }
  });

  test("Play after a VISITOR's turn: the bar restarts from empty — it is never drawn full", async ({
    browser,
  }) => {
    // A visitor's turn parks `elapsed` at −settle with the clock stopped, and
    // the moment the clock runs again over it, `rotating && settling` is true
    // — which was the whole of the handover's gate. So Play after an arrow
    // press (or a swipe, whose pointer leaves with the finger) drew the bar
    // FULL and faded it out over 500ms, for a dwell abandoned part-way and
    // never counted out. MEASURED before the fix: 41 frames in `handover` at
    // 887px after a manual turn and Play. CarouselProgress now hands over
    // only after a CLOCK turn (`turnedBy === "auto"`).
    //
    // Real mouse presses, on purpose: the arrow's focus is the pause, and
    // Play is what lifts it — the path a visitor takes.
    test.setTimeout(40_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await pointerAway(page);
      await expect.poll(() => barScale(page), { timeout: TURN_CEILING }).toBeGreaterThan(0.2);

      await page.getByRole("button", { name: "Next slide" }).click();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();

      // Every frame of the bar from here on, stamped in the page.
      await page.evaluate((card) => {
        const w = window as unknown as {
          __bar: { t: number; mode: string; width: number; label: string | null }[];
        };
        w.__bar = [];
        const region = document.querySelector(card)!;
        const fill = region.querySelector<HTMLElement>("[data-carousel-progress] > div")!;
        const tick = () => {
          w.__bar.push({
            t: performance.now(),
            mode: fill.dataset.carouselFill ?? "",
            width: fill.getBoundingClientRect().width,
            label: region.querySelector("button")!.getAttribute("aria-label"),
          });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, CARD);
      await page.getByRole("button", { name: "Play slides" }).click();
      await pointerAway(page);
      // Positive evidence the clock really runs again: the bar FILLING, in
      // `timed` mode. Not the bare scale — a handover draws scaleX(1), and the
      // first version of this wait was satisfied by exactly the defect it is
      // here to catch, stopping the recorder one frame in.
      await expect
        .poll(
          () =>
            page
              .locator(`${CARD} [data-carousel-progress] > div`)
              .evaluate((el) =>
                (el as HTMLElement).dataset.carouselFill === "timed"
                  ? Number(/scaleX\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1])
                  : 0,
              ),
          { timeout: TURN_CEILING },
        )
        .toBeGreaterThan(0.05);

      const frames = await page.evaluate(
        () =>
          (
            window as unknown as {
              __bar: { t: number; mode: string; width: number; label: string | null }[];
            }
          ).__bar,
      );
      const playing = frames.filter((f) => f.label === "Pause slides");
      expect(playing.length, "sampled the bar after Play").toBeGreaterThan(5);
      expect(
        playing.filter((f) => f.mode === "handover").length,
        "frames drawn as a handover after a visitor's turn",
      ).toBe(0);
      // …and the fill NEVER SHRINKS from Play on: it starts empty and grows.
      // A full bar fading out has to shrink to nothing when its handover
      // ends, so this reads the defect as geometry, not as a flag. (Not a
      // ceiling on the width: when the poll above returns is a matter of load,
      // and measured at load 27–87 it let the bar reach 318px first.)
      const shrank = playing.filter((f, i) => i > 0 && f.width < playing[i - 1].width - 0.5);
      expect(
        shrank.map((f) => `${f.width.toFixed(1)}px`),
        "the fill shrank after Play — something full was drawn first",
      ).toEqual([]);
      const track = (await page.locator(`${CARD} [data-carousel-progress]`).boundingBox())!.width;
      const widest = Math.max(...playing.map((f) => f.width));
      expect(widest, `the fill reached ${widest}px of a ${track}px track`).toBeLessThan(
        track * 0.9,
      );
    } finally {
      await context.close();
    }
  });

  test("reduced motion: the bar is position mode, and never dissolves", async ({ page }) => {
    await page.goto(HOME);
    await adopted(page);
    const fill = page.locator(`${CARD} [data-carousel-progress] > div`);
    await expect(fill).toHaveAttribute("data-carousel-fill", "position");
    await expect(fill).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "Next slide" }).click();
    await expect(status(page)).toHaveText("Slide 2 of 3");
    await expect(fill).toHaveCSS("opacity", "1");
    await expect(fill).toHaveAttribute("data-carousel-fill", "position");
  });

  // ── D: the card reveals on scroll ────────────────────────────────────────

  for (const width of [1440, 390]) {
    test(`${width}: the card is below the fold, hidden at 24px, and reveals ONCE`, async ({
      browser,
    }) => {
      test.setTimeout(40_000);
      const { context, page } = await moving(
        browser,
        viewportFor(width, width === 390 ? 844 : 900),
      );
      try {
        await page.goto(HOME);
        await adopted(page);

        // THE FIRST-PAINT HAZARD, MEASURED RATHER THAN ASSUMED. The card may
        // not ship `data-reveal` — its travel is not app.css's hard-coded 50%
        // — so it paints in its final position and is put back to opacity 0
        // when the action runs at hydration. That is only acceptable because
        // it happens off screen, which is this assertion and nothing else.
        const fold = await page.locator(CARD).evaluate((el) => ({
          top: el.getBoundingClientRect().top,
          viewport: window.innerHeight,
          scrollY: window.scrollY,
        }));
        expect(
          fold.top,
          `card top ${fold.top}, viewport ${fold.viewport}, scrollY ${fold.scrollY}`,
        ).toBeGreaterThan(fold.viewport);

        // AND IT IS NOT A YANK, IT IS A 600ms FADE-OUT. animateIn writes the
        // hidden opacity and the transition in one block, so the browser
        // starts a transition INTO the hidden state: measured here at 0.92 and
        // 0.97 while it ran, which is why this polls for the settled value
        // instead of reading once. Below the fold nobody sees either version,
        // but the distinction is the whole cost of shipping no marker, so it
        // is measured rather than described.
        await expect(page.locator(CARD)).toHaveCSS("opacity", "0");
        // matrix(1, 0, 0, 1, 0, 24) — 24px down, which is the travel asked for
        // and NOT the 50% app.css would have hidden a marked element at.
        await expect(page.locator(CARD)).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 24)");
        await expect(page.locator(CARD)).toHaveCSS("transition-duration", "0.6s, 0.6s");
        // `delayMax: 0`, and this is the only place that can see it. The
        // default 400 is multiplied by `left / innerWidth`, and jsdom has no
        // layout: `getBoundingClientRect().left` is 0 there, so the product is
        // 0 whatever `delayMax` says and the unit assertion on this cannot
        // fail. In a browser at 1440 the card's left edge is 513 of a 1455
        // viewport, which would buy 141ms of nothing happening.
        await expect(page.locator(CARD)).toHaveCSS("transition-delay", "0s");

        await page.locator(BAND).scrollIntoViewIfNeeded();
        await revealed(page.locator(CARD));

        // ONCE. Scroll away and back: the observer disconnected on the first
        // intersection, so nothing hides it again.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.locator(BAND).scrollIntoViewIfNeeded();
        await page.waitForTimeout(200);
        await expect(page.locator(CARD)).toHaveCSS("opacity", "1");
        await expect(page.locator(CARD)).toHaveCSS("transform", "none");
      } finally {
        await context.close();
      }
    });
  }

  test("reduced motion: the card is never hidden — the action is a no-op", async ({ page }) => {
    await page.goto(HOME);
    await adopted(page);
    const card = page.locator(CARD);
    // No inline style AT ALL: animateIn tears itself down before it hides
    // anything when the preference is already on, so there is nothing to
    // reveal and nothing that could be stranded at opacity 0.
    expect(await card.evaluate((el) => el.getAttribute("style"))).toBeNull();
    await expect(card).toHaveCSS("opacity", "1");
    await expect(card).toHaveCSS("transform", "none");
  });
});

test.describe("the portfolio button", () => {
  // Removed on 2026-09-21 for three reasons and restored by the operator's call
  // the same day on one condition — the card's own column, never a band-wide
  // overlay. These are the reasons, as numbers.
  test("1440 and 1280: it is in the CARD, clear of the map column, and level with LEARN MORE", async ({
    browser,
  }) => {
    // THE OLD COMPLAINT, closed. It used to sit on the band's floor at
    // `lg:pb-[43px]` — the ARROWS' line — so it was 3px under LEARN MORE at
    // 1440 on launch day and 12 at 1280. It is pinned to the text column's
    // bottom edge now (the card's 40px foot padding, the slide's own `mb-10`),
    // which is exactly where LEARN MORE lands whenever the slide's text is what
    // sizes the panel — every one-listing state, which is the state this site
    // ships. Measured 0.00 at both widths.
    for (const width of [1440, 1280]) {
      const { context, page } = await moving(browser, viewportFor(width));
      try {
        await page.goto(`${HOME}?featured=one`);
        await page.locator(`${CARD} [data-featured-portfolio]`).waitFor();
        const g = await geometry(page);
        expect(g.portfolio, `drawn at ${width}`).not.toBeNull();
        // In the CARD, which is the card's column — the reserved map column is
        // the other one, and the reason the old placement was removed.
        expect(g.portfolio!.left, `${width}: not in the map column`).toBeGreaterThan(0);
        expect(g.card.width - g.portfolio!.right, `${width}: on the card's 20`).toBeCloseTo(20, 0);
        expect(g.slot.right, `${width}: flush against the card's left edge`).toBeCloseTo(0, 0);
        // Level with LEARN MORE, to the pixel, at both widths.
        expect(
          g.portfolio!.bottom - g.button.bottom,
          `${width}: level with LEARN MORE`,
        ).toBeCloseTo(0, 1);
        expect(g.card.height - g.portfolio!.bottom, `${width}: the card's 40`).toBeCloseTo(40, 0);
        // …and clear of it: the two never share a pixel of x.
        expect(g.portfolio!.left, `${width}: clear of LEARN MORE`).toBeGreaterThan(g.button.right);
        expect(g.overflowX, `${width}`).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }
  });

  test("a card too narrow for both buttons drops it to its own row rather than over the text", async ({
    browser,
  }) => {
    // WHY THE QUERY IS ON THE CARD AND NOT THE VIEWPORT. /dev/a11y-fixtures
    // renders this band inside a `max-w-3xl` wrapper, so at a 1455 viewport the
    // card is 425.89 — and on LEARN MORE's line this button landed ACROSS it
    // (left 236.42 against LEARN MORE's right 355.13). Axe answered the launch
    // band 9 measured / 1 INCOMPLETE, which is the bgOverlap defect the button
    // was removed for, reintroduced by the placement that fixed the alignment.
    // A viewport media query cannot see it. `@container` can.
    const { context, page } = await moving(browser, viewportFor(1440));
    try {
      await page.goto("/dev/a11y-fixtures");
      const card = page.locator(CARD).nth(1);
      // The settled state, and the correction #142 asked for. What stood here
      // read the card the instant the document had loaded, which in 10 of 16
      // measured runs was BEFORE hydration: the assertions below were being
      // made against the server's markup, and the three runs that lost that
      // race met a card at opacity 0 — `color-contrast` absent from `passes`
      // altogether, and `passes.find(...)!.nodes.length` a TypeError.
      await settledForAudit(page, card);

      const learn = card.getByRole("link", { name: /Learn more/ });
      const portfolio = card.getByRole("link", { name: "Our portfolio" });
      // Read after the scroll, not before: every assertion below is one box
      // against another, so the frame they share only has to be the same one.
      const [c, l, p] = await Promise.all([
        card.boundingBox(),
        learn.boundingBox(),
        portfolio.boundingBox(),
      ]);
      expect(c!.width, "the wrapper squeezes the card").toBeLessThan(640);

      // THE TITLE'S CLAIM, MEASURED AS GEOMETRY, because that is what it is
      // about. What stood here made it entirely through axe's contrast count,
      // and a count of the nodes axe HAPPENED TO RESOLVE is a bad proxy for
      // "the button is not over the text": the count moves with the frame the
      // audit landed in (#142) and it cannot say WHICH node was covered.
      //
      // ITS OWN ROW, UNDER THE TEXT: the button's box shares no pixel with any
      // word in the card. `row-start-4` — the placement this `@container`
      // query replaced — put it at left 236.42 against LEARN MORE's right
      // 355.13 on LEARN MORE's own line, so this is the assertion that goes
      // red on a revert, by 118.71px of overlap, naming the element it lands on.
      const text = await card.evaluate((el) =>
        [...el.querySelectorAll<HTMLElement>("h2, h3, p, li, a")]
          .filter((n) => !n.closest("[data-featured-portfolio]") && n.textContent?.trim())
          .map((n) => {
            const b = n.getBoundingClientRect();
            return {
              tag: `${n.tagName.toLowerCase()}: ${n.textContent!.trim().slice(0, 28)}`,
              x: b.x,
              y: b.y,
              w: b.width,
              h: b.height,
            };
          }),
      );
      expect(text.length, "the card has words to be painted over").toBeGreaterThan(5);
      const overlapping = text.filter(
        (t) =>
          t.x < p!.x + p!.width && t.x + t.w > p!.x && t.y < p!.y + p!.height && t.y + t.h > p!.y,
      );
      expect(
        overlapping.map((t) => t.tag),
        "the button is painted over these",
      ).toEqual([]);
      // …and below, not merely clear of: the row IS the claim, and a button
      // that cleared the words by sitting in the margin beside them would pass
      // the line above.
      expect(p!.y, "below LEARN MORE").toBeGreaterThanOrEqual(l!.y + l!.height);
      expect(p!.x - c!.x, "on the card's 20").toBeCloseTo(20, 0);

      // AND THE CONSEQUENCE THE BUTTON WAS ONCE REMOVED FOR, which geometry
      // alone cannot reach: axe can still MEASURE every word on this card.
      // An element painted over text does not move it — it makes its contrast
      // unknowable, which axe answers with an INCOMPLETE rather than a ratio.
      await card.evaluate((el) => el.setAttribute("data-narrow-scope", ""));
      const results = await new AxeBuilder({ page }).include("[data-narrow-scope]").analyze();
      const { measured, unmeasured } = contrastOf(results as never);
      expect(
        unmeasured.map((n) => n.html.slice(0, 60)),
        "axe could not measure these",
      ).toEqual([]);
      // Over the SUM, never over `passes` alone. Which side of the line a node
      // lands on is timing-dependent — this very file records the split going
      // both ways at :1288 and :1331 — but every node axe looked at is in one
      // list or the other, so the total is what a settled card makes stable.
      // The emptiness asserted above is what keeps this from being satisfied by
      // ten incompletes: the two lines together say ten nodes, all resolved.
      expect(measured.length + unmeasured.length, "nine and this one, on a 425.89 card too").toBe(
        10,
      );
    } finally {
      await context.close();
    }
  });

  test("1440, one listing: axe measures the card's nine nodes AND this button — none incomplete", async ({
    browser,
  }) => {
    // THE GATE THE REMOVAL SET. As a `lg:absolute lg:inset-0` overlay this
    // button painted over the whole band, and axe answered `color-contrast`
    // with `bgOverlap` for the card's words: 1 node measured and 9 INCOMPLETE
    // at 1440 on the one-listing state; 9 and 0 with the button gone. An
    // incomplete is not a pass, so what is required here is that the same nine
    // are still measured — the eyebrow, the size line, the title, five bullets
    // and LEARN MORE — and that this button is a TENTH measurement rather than
    // a reason nine become unmeasurable.
    const { context, page } = await moving(browser, viewportFor(1440));
    try {
      await page.goto(`${HOME}?featured=one`);
      await page.locator(`${CARD} [data-featured-portfolio]`).waitFor();
      // THE SAME SETTLE AS EVERY OTHER CONTRAST AUDIT HERE, and the third and
      // last instance of #142's class in this file. This case never went red,
      // and that is the point: it was winning the pre-hydration race and
      // auditing markup no reader ever sees. On the settled card the numbers
      // below are unchanged — 10 measured, 0 incomplete — which is the
      // evidence that the wait costs this case nothing.
      await settledForAudit(page, page.locator(CARD));
      // The map's subtree is EXCLUDED rather than the audit narrowed to the
      // card: the band's ground is part of what this measures, and the map
      // (#13) brings text nodes of its own — the section's listings, as links.
      // Counting them here would turn "nine and this one" into a number that
      // moves whenever an editor adds a listing. The map's own contrast is
      // covered on /dev/a11y-fixtures, where it is mounted with `engine="off"`
      // so the gate never waits on a tile host.
      const results = await new AxeBuilder({ page })
        .include(BAND)
        .exclude(`${BAND} [data-property-map]`)
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

      const incomplete = results.incomplete.find((r) => r.id === "color-contrast");
      expect(
        incomplete?.nodes.map((n) => n.html.slice(0, 60)) ?? [],
        "axe could not measure these",
      ).toEqual([]);

      const measured = results.passes.find((p) => p.id === "color-contrast");
      expect(measured, "axe measured contrast at all").toBeTruthy();
      const html = measured!.nodes.map((n) => n.html);
      expect(
        html.filter((h) => h.startsWith("<h2")),
        "the eyebrow",
      ).toHaveLength(1);
      expect(
        html.filter((h) => h.startsWith("<h3")),
        "the listing's title",
      ).toHaveLength(1);
      expect(
        html.filter((h) => h.startsWith("<p")),
        "the size line",
      ).toHaveLength(1);
      expect(
        html.filter((h) => h.startsWith("<li")),
        "the five bullets",
      ).toHaveLength(5);
      expect(
        html.filter((h) => /href="\/properties\/[^"]+"/.test(h)),
        "LEARN MORE",
      ).toHaveLength(1);
      expect(
        html.filter((h) => /href="\/properties"/.test(h)),
        "this button",
      ).toHaveLength(1);
      expect(measured!.nodes.length, "nine and this one").toBe(10);
    } finally {
      await context.close();
    }
  });
});

test.describe("the other states", () => {
  test("reduced motion: no Pause, no rotation — the bar shows POSITION and the arrows still work", async ({
    page,
  }) => {
    // The shared config's context: reducedMotion "reduce".
    await page.goto(HOME);
    await adopted(page);
    const bar = page.locator(`${CARD} [data-carousel-progress]`);
    await expect(bar).toHaveAttribute("data-carousel-progress", "position");
    await expect(page.locator(`${CARD} button`)).toHaveCount(2);
    expect(await barScale(page)).toBeCloseTo(1 / 3, 2);

    await page.getByRole("button", { name: "Next slide" }).click();
    await expect(status(page)).toHaveText("Slide 2 of 3");
    expect(await barScale(page)).toBeCloseTo(2 / 3, 2);
    expect(await onStage(page)).toEqual(["101 W. Commerce Street"]);
  });

  test("ONE showable listing is a card: no carousel, no controls, nothing to rotate", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser);
    try {
      await page.goto(`${HOME}?featured=one`);
      const band = page.locator(BAND);
      await expect(band).toHaveAttribute("data-featured-picked", "3");
      await expect(band).toHaveAttribute("data-featured-shown", "1");
      await expect(band.locator('[role="region"]')).toHaveCount(0);
      await expect(band.locator("button")).toHaveCount(0);
      await expect(band.locator("[data-carousel-progress]")).toHaveCount(0);
      // The landmark's name moves to the <section>.
      await expect(page.getByRole("region", { name: "Featured Properties" })).toHaveCount(1);
      await expect(
        band.getByRole("link", { name: /Learn more about 25331 IH 10 West/ }),
      ).toBeVisible();
      // The SLIDE's five bullets. The band also holds the map's list of
      // Google Maps links (#13), which is <li>s too — an unqualified count
      // reads six and stops being about the panel this test is measuring.
      await expect(band.locator("[data-featured-slide] li")).toHaveCount(5);

      // The live listing's five bullets GROW the panel past the comp's 285;
      // LEARN MORE keeps the panel's 40 under it.
      const g = await geometry(page);
      expect(g.card.height - g.photo.height).toBeGreaterThan(285);
      expect(g.card.height - g.button.bottom).toBeCloseTo(40, 0);
      // The eyebrow still shares the size line's cap line.
      expect(g.eyebrow.top).toBeCloseTo(g.sizeLine.top, 0);
    } finally {
      await context.close();
    }
  });

  test("NO showable listing is no band: the page closes up over it", async ({ page }) => {
    await page.goto(`${HOME}?featured=none`);
    const band = page.locator(BAND);
    await expect(band).toHaveCount(1);
    await expect(band).toBeHidden();
    await expect(band).toHaveAttribute("data-featured-picked", "2");
    await expect(band).toHaveAttribute("data-featured-shown", "0");
    await expect(band).toHaveAttribute("data-featured-unembedded", "0");
    await expect(page.locator(CARD)).toHaveCount(0);
    expect(await band.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
  });

  test("with scripting off it is slide 1 with its link, and no dead controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      const card = page.locator(CARD);
      await expect(card, "only script sets this").not.toHaveAttribute("data-carousel-ready", "");
      await expect(card.locator("h2")).toBeVisible();
      await expect(
        card.getByRole("link", { name: /Learn more about 25331 IH 10 West/ }),
      ).toBeVisible();
      // In the markup (so nothing jumps at hydration) but not on screen. THREE:
      // the server cannot know the visitor's motion preference, so Pause ships
      // too and is hidden with the arrows by app.html's <noscript> rule.
      await expect(card.locator("button")).toHaveCount(3);
      for (const button of await card.locator("button").all()) await expect(button).toBeHidden();
      await expect(card.locator("[data-carousel-progress]")).toBeHidden();

      // #32's first promise, and the thing the unit tests cannot see: the
      // SERVER's markup puts exactly one slide on stage. A regression that
      // shipped all three stacked at opacity 1 would still pass every
      // assertion above — slide 1's link is visible either way.
      const slides = card.locator("[data-featured-slide]");
      await expect(slides).toHaveCount(3);
      await expect(card.locator("[data-featured-slide]:not([inert])")).toHaveCount(1);
      await expect(slides.nth(0)).not.toHaveAttribute("inert", "");
      for (const i of [1, 2]) {
        await expect(slides.nth(i)).toHaveAttribute("inert", "");
        await expect(slides.nth(i)).toHaveAttribute("aria-hidden", "true");
        await expect(slides.nth(i).locator("h3")).toBeHidden();
      }
      // WITHOUT THE BUNDLE THE BAND IS ITS FIRST LISTING, and that is the
      // decision, not an oversight: slides 2..N are `inert` in the server's
      // markup by the primitive's reviewed design, and CSS cannot undo `inert`.
      // Every listing is reachable from /properties — and THAT is the one link
      // this band draws of its own, server-rendered like everything else here,
      // so a visitor without the bundle still has a way to all of them (#47).
      // It is a plain <a> in the markup: nothing about it waits on hydration.
      const portfolio = card.getByRole("link", { name: "Our portfolio" });
      await expect(portfolio).toBeVisible();
      await expect(portfolio).toHaveAttribute("href", "/properties");
      // The map's own links go to Google Maps by design (#13), and they are
      // the OTHER thing a visitor without the bundle still gets here. Since
      // #122 there are TWO sets of them and they are the same three places:
      // the LIST — the map's accessible equivalent, `sr-only` now that the box
      // draws the committed picture of MAP_HOME — and the PINS the picture
      // draws over that raster, which is what a pointer actually has. Both are
      // asserted as their own claim rather than folded into the loop below.
      const rows = page.locator(`${BAND} [data-map-link]`);
      await expect(rows).toHaveCount(3);
      for (const row of await rows.all())
        await expect(row).toHaveAttribute(
          "href",
          /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
        );
      const pins = page.locator(`${BAND} [data-map-home-frame="full"] [data-map-home-pin]`);
      expect(await pins.count(), "the picture drew pins with no script at all").toBeGreaterThan(0);
      const rowHrefs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      for (const pin of await pins.all())
        expect(rowHrefs).toContain(await pin.getAttribute("href"));
      for (const link of await page
        .locator(`${BAND} a:not([data-map-link]):not([data-map-home-pin])`)
        .all())
        await expect(link).toHaveAttribute("href", /^\/properties(\/.+)?$/);
    } finally {
      await context.close();
    }
  });

  test("script ON, bundle never arrives: the controls are QUIET, and the row does not move when it does (#47)", async ({
    browser,
  }) => {
    // The state `data-js-only` cannot reach. The browser WILL run script, so
    // the <noscript> rule never applies — and before this fix the arrows, Pause
    // and the bar were drawn, focusable and clickable, doing nothing. The
    // decision on #47: they stay in the markup (the row must not jump) and are
    // `visibility: hidden` + `inert` until `carousel.hydrated` is true.
    const blocked = await browser.newContext({
      reducedMotion: "no-preference",
      viewport: viewportFor(1440),
    });
    try {
      const page = await blocked.newPage();
      await page.route("**/*", (route) =>
        route.request().resourceType() === "script" ? route.abort() : route.continue(),
      );
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      const card = page.locator(CARD);
      await expect(card, "script never adopted it").not.toHaveAttribute("data-carousel-ready", "");

      const controls = card.locator("div[data-js-only]:has(> button)");
      const bar = card.locator("[data-carousel-progress]");
      // Present — three buttons and a bar, holding their space …
      await expect(card.locator("button")).toHaveCount(3);
      await expect(controls).toHaveAttribute("data-carousel-quiet", "");
      await expect(bar).toHaveAttribute("data-carousel-quiet", "");
      // … and quiet: not visible, not focusable, not clickable. `inert` is the
      // property Svelte sets; a real browser reflects it to the attribute.
      await expect(controls).toHaveAttribute("inert", "");
      await expect(controls).toBeHidden();
      await expect(bar).toBeHidden();
      await expect(card.getByRole("button", { name: "Next slide" })).toHaveCount(0);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      expect(
        await page.evaluate(
          () =>
            document
              .activeElement!.closest("[data-js-only]")
              ?.hasAttribute("data-carousel-quiet") ?? false,
        ),
        "no tab stop inside the quiet controls",
      ).toBe(false);

      // The eyebrow's width IS the webfont's: measured before `document.fonts`
      // settles it reads 182 against Atkinson's 176.56, which is a font race,
      // not a layout shift.
      await page.evaluate(() => document.fonts.ready);
      const quietBoxes = await geometry(page);

      // …and the SAME page with script gives the same boxes: reserving the
      // space is the whole reason the controls ship at all. (The eyebrow/photo
      // are read from the card, never the window — house rule.)
      const { context, page: live } = await moving(browser);
      try {
        await live.goto(HOME);
        await adopted(live);
        await holdClock(live); // on slide 1: the first dwell is 8s long
        expect(await onStage(live), "held on slide 1, as the quiet page draws it").toEqual([
          "25331 IH 10 West",
        ]);
        await live.evaluate(() => document.fonts.ready);
        const liveBoxes = await geometry(live);
        for (const key of ["card", "photo", "bar", "eyebrow", "controls", "text"] as const) {
          const [before, after] = [quietBoxes[key]!, liveBoxes[key]!] as Record<string, number>[];
          for (const edge of Object.keys(before)) {
            expect(
              Math.abs(after[edge] - before[edge]),
              `${key}.${edge} moved at hydration: ${before[edge]} → ${after[edge]}`,
            ).toBeLessThan(0.5);
          }
        }
      } finally {
        await context.close();
      }
    } finally {
      await blocked.close();
    }
  });
});

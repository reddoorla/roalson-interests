import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectRing, GARNET } from "./expect-ring";

// The homepage's featured band (src/lib/slices/FeaturedProperties) is the
// headless carousel's first consumer, and makes promises jsdom cannot check:
//
//  1. THE CHROME SITS WHERE THE COMP DRAWS IT — inside the card's panel —
//     WITHOUT being inside a slide in the DOM. That is done by grid placement,
//     and it broke exactly once already: `lg:row-span-2` is the `grid-row`
//     shorthand, it reset the chrome's row start inside the `lg` block, and the
//     eyebrow and arrows were auto-placed UNDER the slides. The card measured
//     1086 tall for the comp's 827 and every unit test was green.
//  2. IT ROTATES, on the comp's clock (4000 dwell + 500 dissolve), and Pause
//     holds it — slide and bar together;
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

const DWELL = 4000;
const DISSOLVE = 500;
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

/** Parks the pointer where it cannot hover the card — hover is a pause. */
const pointerAway = (page: Page) => page.mouse.move(2, 2);

const status = (page: Page) => page.locator(`${CARD} [aria-live]`);

const barScale = (page: Page) =>
  page
    .locator(`${CARD} [data-carousel-progress] > div`)
    .evaluate((el) => Number(/scaleX\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1]));

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
      await page.locator(`${CARD} h2`).hover(); // holds the clock; focuses nothing
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
      // …and the reserved column is the rest of the band: the band's own
      // ground, nothing drawn, flush against the card.
      const g = await geometry(page);
      expect(g.slot.display, `${width}`).toBe("block");
      expect(g.slot.right, `${width}`).toBeCloseTo(0, 0);
      expect(g.slot.width, `${width}`).toBeGreaterThan(300);
      expect(g.slot.background, `${width}`).toBe("rgba(0, 0, 0, 0)");
      expect(g.overflowX, `${width}`).toBeLessThanOrEqual(0);
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
        await page.locator(`${CARD} h2`).hover();
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

  test("390: photo, bar, [eyebrow | controls], text — and no map box", async ({ browser }) => {
    const { context, page } = await moving(browser, viewportFor(390, 844));
    try {
      await page.goto(HOME);
      await adopted(page);
      await page.locator(BAND).scrollIntoViewIfNeeded();
      await page.locator(`${CARD} h2`).hover();
      const g = await geometry(page);

      expect(g.slot.display).toBe("none");
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
        await page.locator(`${CARD} h2`).hover();
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
  test("turns on the comp's clock, dissolving — and the bar is the same clock", async ({
    browser,
  }) => {
    test.setTimeout(40_000);
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

      await expect(status(page)).toHaveText("Slide 2 of 3", { timeout: DWELL + 2000 });
      expect(await onStage(page)).toEqual(["101 W. Commerce Street"]);
      // DECIDED: the bar SNAPS to 0 on the frame the slide turns and waits out
      // the dissolve there (the comp cross-fades a full bar into an empty one —
      // an artefact of dissolving the whole variant frame, not a drawn timer).
      expect(await barScale(page)).toBeLessThan(0.15);

      // …and it loops.
      await expect(status(page)).toHaveText("Slide 3 of 3", { timeout: DWELL + DISSOLVE + 2000 });
      await expect(status(page)).toHaveText("Slide 1 of 3", { timeout: DWELL + DISSOLVE + 2000 });

      // THE LAP IS MEASURED IN THE PAGE, not out here. Two Date.now() readings
      // around two `expect(...).toHaveText()` calls measure Playwright's POLL
      // checkpoint, not the carousel: replicated four times, they read
      // 4340–4342ms while the true lap was 4499–4503, because both turns are
      // seen at the same ~4335ms checkpoint after the expect starts. A carousel
      // wired with `settle: 0` — a true 4000 lap — lands in the same poll
      // window and reads the same ~4340, so `toBeGreaterThan(4000)` passed for
      // a band that had lost its dissolve entirely.
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
      ).toBeLessThan(300);
      // Every lap after it is a WHOLE one: dwell + dissolve on one clock.
      for (let i = 1; i < turns.length; i++) {
        const lap = turns[i].t - turns[i - 1].t;
        expect(lap, `lap ${i} was ${lap}ms — dwell + dissolve is 4500`).toBeGreaterThan(4400);
        expect(lap, `lap ${i} was ${lap}ms — dwell + dissolve is 4500`).toBeLessThan(4700);
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
      await expect.poll(() => barScale(page)).toBeGreaterThan(0.1);

      // A real mouse press — Chromium focuses on mousedown, which is itself a
      // pause; the control must not toggle straight back to playing.
      await page.getByRole("button", { name: "Pause slides" }).click();
      const play = page.getByRole("button", { name: "Play slides" });
      await expect(play).toBeVisible();
      await pointerAway(page);

      const frozen = await barScale(page);
      expect(frozen).toBeGreaterThan(0);
      expect(frozen).toBeLessThan(1);
      // Longer than a whole lap: a clock still running WOULD have turned it.
      await page.waitForTimeout(DWELL + DISSOLVE + 700);
      expect(await barScale(page)).toBe(frozen);
      expect(await onStage(page)).toEqual(["25331 IH 10 West"]);
      await expect(status(page)).toHaveAttribute("aria-live", "polite");

      await play.click();
      await pointerAway(page);
      await expect(page.getByRole("button", { name: "Pause slides" })).toBeVisible();
      // Focus is still inside the carousel, so rotation restarts only because
      // Play was pressed — and it resumes from where the bar stood.
      await expect(status(page)).toHaveText("Slide 2 of 3", { timeout: DWELL + 2000 });
    } finally {
      await context.close();
    }
  });

  test("the arrows turn the slide at once and never drop keyboard focus on <body> (#34)", async ({
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

      // The USER's turns are instant, as the comp wires its arrows (CHANGE_TO,
      // no transition): nothing on the incoming slide is transitioning.
      const photo = page.locator(`${CARD} [data-featured-slide]:not([inert]) img`).locator("..");
      await expect(photo).toHaveCSS("transition-duration", "0s");
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
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await page.getByRole("button", { name: "Pause slides" }).click();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();

      const results = await new AxeBuilder({ page }).include(BAND).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      // Positive evidence that axe looked at the controls at all.
      expect(results.passes.map((p) => p.id)).toContain("button-name");

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
        expect(g.slot.right, `${width}: the map column is still empty`).toBeCloseTo(0, 0);
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
      const learn = card.getByRole("link", { name: /Learn more/ });
      const portfolio = card.getByRole("link", { name: "Our portfolio" });
      const [c, l, p] = await Promise.all([
        card.boundingBox(),
        learn.boundingBox(),
        portfolio.boundingBox(),
      ]);
      expect(c!.width, "the wrapper squeezes the card").toBeLessThan(640);

      // THE CONSEQUENCE FIRST, because it is the claim: axe can still MEASURE
      // the card here. The geometry below is only the explanation.
      await card.evaluate((el) => el.setAttribute("data-narrow-scope", ""));
      const results = await new AxeBuilder({ page }).include("[data-narrow-scope]").analyze();
      const incomplete = results.incomplete.find((r) => r.id === "color-contrast");
      expect(
        incomplete?.nodes.map((n) => n.html.slice(0, 60)) ?? [],
        "axe could not measure these",
      ).toEqual([]);
      expect(
        results.passes.find((r) => r.id === "color-contrast")!.nodes.length,
        "nine and this one, on a 425.89 card too",
      ).toBe(10);

      // Its own row UNDER the text, on the card's left padding — not beside it.
      expect(p!.y, "below LEARN MORE").toBeGreaterThanOrEqual(l!.y + l!.height);
      expect(p!.x - c!.x, "on the card's 20").toBeCloseTo(20, 0);
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
      const results = await new AxeBuilder({ page }).include(BAND).analyze();
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
      await expect(band.locator("li")).toHaveCount(5);

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
      for (const link of await page.locator(`${BAND} a`).all())
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
        await live.locator(`${CARD} h2`).hover(); // holds the clock on slide 1
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

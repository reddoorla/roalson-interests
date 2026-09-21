import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectRing, GARNET, OFF_WHITE } from "./expect-ring";

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

async function moving(browser: Browser, viewport = { width: 1440, height: 900 }) {
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
        slot: {
          display: getComputedStyle(slot).display,
          right: slot.getBoundingClientRect().right - C.left,
          width: slot.getBoundingClientRect().width,
          background: getComputedStyle(slot).backgroundColor,
        },
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
      await page.setViewportSize({ width, height: 900 });
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
      expect(g.overflowX, `${width}`).toBe(0);
    }
  });

  test("390: photo, bar, [eyebrow | controls], text — and no map box", async ({ browser }) => {
    const { context, page } = await moving(browser, { width: 390, height: 844 });
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
      expect(g.overflowX).toBe(0);
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
      const { context, page } = await moving(browser, { width, height: 780 });
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
        expect(g.overflowX, `${width}`).toBe(0);
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
      const t2 = Date.now();
      expect(await onStage(page)).toEqual(["101 W. Commerce Street"]);
      // DECIDED: the bar SNAPS to 0 on the frame the slide turns and waits out
      // the dissolve there (the comp cross-fades a full bar into an empty one —
      // an artefact of dissolving the whole variant frame, not a drawn timer).
      expect(await barScale(page)).toBeLessThan(0.15);

      await expect(status(page)).toHaveText("Slide 3 of 3", { timeout: DWELL + DISSOLVE + 2000 });
      const lap = Date.now() - t2;
      // One lap is dwell + dissolve on ONE clock: 4500. Generous either side —
      // this is a loaded machine — but it cannot be 4000, and it cannot be 0.
      expect(lap).toBeGreaterThan(DWELL + DISSOLVE - 500);
      expect(lap).toBeLessThan(DWELL + DISSOLVE + 1500);

      // …and it loops.
      await expect(status(page)).toHaveText("Slide 1 of 3", { timeout: DWELL + DISSOLVE + 2000 });
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

      // garnet on the sand card; off-white on the band's dark ground
      await expectRing(page, page.getByRole("button", { name: "Next slide" }), GARNET);
      await expectRing(page, page.locator(`${BAND} a`, { hasText: "Our portfolio" }), OFF_WHITE);
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
      // Every other listing is one link away.
      await expect(page.locator(`${BAND} a`, { hasText: "Our portfolio" })).toHaveAttribute(
        "href",
        "/properties",
      );
    } finally {
      await context.close();
    }
  });
});

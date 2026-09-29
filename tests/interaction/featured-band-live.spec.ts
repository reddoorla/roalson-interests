import { expect, test, type Browser, type ConsoleMessage, type Page } from "@playwright/test";
import { FEATURED_DISSOLVE, FEATURED_DWELL } from "./featured-dwell";
import { measuresGutter, viewportFor } from "./gutter";
import { hydrated, HYDRATION_TIMEOUT } from "./hydrated";
import { GARNET, SAND } from "./palette";

// THE CAROUSEL'S FIRST CONSUMER, ON THE ROUTE THE SITE SERVES (#32), so it runs
// on a production build too:
//
//   pnpm exec playwright test tests/interaction/featured-band-live.spec.ts --workers=1
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/featured-band-live.spec.ts --workers=1
//
// (`/` renders from Prismic: in a sandbox behind a proxy, NODE_USE_ENV_PROXY=1.)
//
// featured-properties.spec.ts and carousel.spec.ts measure the band and the
// primitive on /dev/home and /dev/a11y-fixtures, and /dev/* 404s on a
// production build — so none of their no-JS, hydration, CSS or dissolve
// assertions can run against the shipped bundle (CLAUDE.md: verify on a
// production build). The cases below re-make those claims on `/`, plus the one
// #32 found unmeasured anywhere: the Pause press on a TOUCH screen.
//
// NOTHING HERE HARD-CODES A LISTING: the slides are the live document's.
//
// EVERY CASE ABOUT MOTION OPENS ITS OWN CONTEXT. The shared config forces
// `reducedMotion: "reduce"`, under which the band never rotates, draws no
// Pause and never hides its card.

const HOME = "/";
const BAND = '[data-slice-type="featured_properties"]';
const CARD = "[data-featured-card]";
const SLIDES = `${CARD} [data-featured-slide]`;
const FILL = `${CARD} [data-carousel-progress] > div`;

measuresGutter();

const adopted = (page: Page) =>
  expect(page.locator(CARD)).toHaveAttribute("data-carousel-ready", "", {
    timeout: HYDRATION_TIMEOUT,
  });

async function moving(browser: Browser, viewport = viewportFor(1440)) {
  const context = await browser.newContext({ reducedMotion: "no-preference", viewport });
  return { context, page: await context.newPage() };
}

const status = (page: Page) => page.locator(`${CARD} [aria-live]`);

const barValue = (page: Page) =>
  page
    .locator(FILL)
    .evaluate((el) => Number(/scaleX\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1]));

/** Where keyboard focus IS, by name, with the band's own account of itself —
 *  in ONE read (carousel.spec.ts's `focusAnd`). */
const focusAnd = (page: Page) =>
  page.evaluate((card) => {
    const region = document.querySelector(card)!;
    const el = document.activeElement;
    const live = region.querySelector("[aria-live]")!;
    return {
      focus:
        !el || el === document.body
          ? "BODY"
          : (el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName),
      inCard: !!el && el !== document.body && region.contains(el),
      status: live.textContent,
      live: live.getAttribute("aria-live"),
    };
  }, CARD);

/** Every console warning and error, and every uncaught page error. */
function listen(page: Page) {
  const heard: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "warning" || m.type() === "error") heard.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => heard.push(`pageerror: ${e.message}`));
  return heard;
}

test.describe("scripting off", () => {
  test("slide 1 on stage, the rest inert and hidden, no controls or bar, a polite live region — and the card SHOWN", async ({
    browser,
  }) => {
    // Motion allowed, so the card's server-rendered `data-reveal` (#105) is
    // live CSS here and app.html's <noscript> rule is what shows it.
    const context = await browser.newContext({
      javaScriptEnabled: false,
      reducedMotion: "no-preference",
      viewport: viewportFor(1440),
    });
    try {
      const page = await context.newPage();
      await page.goto(HOME, { waitUntil: "domcontentloaded" });
      const card = page.locator(CARD);
      await expect(card, "only script sets this").not.toHaveAttribute("data-carousel-ready", "");

      const slides = await page.locator(SLIDES).evaluateAll((els) =>
        els.map((el) => ({
          label: el.getAttribute("aria-label"),
          inert: el.hasAttribute("inert"),
          hidden: el.getAttribute("aria-hidden"),
        })),
      );
      expect(slides.length, "premise: the live document features more than one").toBeGreaterThan(1);
      expect(slides[0]).toEqual({ label: `1 of ${slides.length}`, inert: false, hidden: null });
      for (const [i, slide] of slides.entries())
        if (i > 0)
          expect(slide, `slide ${i + 1}`).toEqual({
            label: `${i + 1} of ${slides.length}`,
            inert: true,
            hidden: "true",
          });

      // In the markup (so nothing jumps at hydration), hidden by `data-js-only`.
      await expect(card.locator("button")).toHaveCount(3);
      for (const button of await card.locator("button").all()) await expect(button).toBeHidden();
      await expect(card.locator("[data-carousel-progress]")).toBeHidden();
      await expect(status(page)).toHaveAttribute("aria-live", "polite");

      await expect(card).toHaveAttribute("data-reveal");
      await expect(card).toHaveCSS("opacity", "1");
      await expect(card).toHaveCSS("transform", "none");
      await expect(page.locator(`${SLIDES}:not([inert]) a`).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});

test.describe("hydration", () => {
  test("the band is adopted with no hydration warning and no page error", async ({ page }) => {
    const heard = listen(page);
    await page.goto(HOME);
    await hydrated(page);
    await adopted(page);
    // Positive evidence script owns the band, not only that nothing complained:
    // the server shipped three buttons, and under the harness's reduced motion
    // script has dropped Pause.
    await expect(page.locator(`${CARD} button`)).toHaveCount(2);
    await page.waitForTimeout(500);
    expect(heard.filter((m) => /hydrat|pageerror/i.test(m))).toEqual([]);
  });

  test("…and the listener DOES hear one when the served markup is broken on purpose", async ({
    page,
  }) => {
    // THE INSTRUMENT, PROVEN. A stray element at the head of the card's chrome
    // is a server/client structure mismatch Svelte must report — as
    // "[svelte] hydration_mismatch" in dev and as the bare
    // https://svelte.dev/e/hydration_mismatch in production. If this ever
    // passes silently, the case above is measuring nothing.
    await page.route(HOME, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<div[^>]*data-featured-chrome[^>]*>)/,
        "$1<i data-injected></i>",
      );
      expect(body, "premise: the injection found its target").toContain("data-injected");
      await route.fulfill({ response, body });
    });
    const heard = listen(page);
    await page.goto(HOME);
    await hydrated(page);
    await expect
      .poll(() => heard.filter((m) => /hydration_mismatch/.test(m)).length)
      .toBeGreaterThan(0);
  });
});

test.describe("the production CSS", () => {
  /** Every style rule's selector in the page's own stylesheets, nested rules
   *  included (`@layer`, `@media`). A cross-origin sheet throws on read. */
  const selectors = (page: Page) =>
    page.evaluate(() => {
      const out: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule) out.push(rule.selectorText);
          if ("cssRules" in rule) walk((rule as CSSGroupingRule).cssRules);
        }
      };
      for (const sheet of document.styleSheets) {
        try {
          walk(sheet.cssRules);
        } catch {
          // Google Fonts' sheet: not ours, not readable.
        }
      }
      return out;
    });

  test("the bar's two track alphas and the arrows' hover utilities are in the bundle — and the hover paints", async ({
    page,
  }) => {
    await page.goto(HOME);
    await adopted(page);
    const all = await selectors(page);
    expect(all.length, "read the page's own stylesheets").toBeGreaterThan(100);
    for (const cls of ["bg-dark\\/53", "bg-background\\/44"])
      expect(all, `.${cls}`).toContain(`.${cls}`);
    for (const cls of [
      "not-aria-disabled\\:hover\\:bg-primary",
      "not-aria-disabled\\:hover\\:text-light",
      "not-aria-disabled\\:hover\\:bg-background",
      "not-aria-disabled\\:hover\\:text-primary",
    ])
      expect(
        all.some((s) => s.startsWith(`.${cls}`)),
        `a rule for .${cls}`,
      ).toBe(true);

    // …and on the page: the garnet track is painted, and Next fills garnet
    // under the pointer with a sand glyph. (Reduced motion: no colour fade.)
    const track = page.locator(`${CARD} [data-carousel-progress]`);
    await expect(track).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const next = page.getByRole("button", { name: "Next slide" });
    await next.scrollIntoViewIfNeeded();
    await expect(next).not.toHaveCSS("background-color", GARNET);
    await next.hover();
    await expect(next).toHaveCSS("background-color", GARNET);
    await expect(next).toHaveCSS("color", SAND);
  });
});

test.describe("keyboard focus", () => {
  test("an arrow key on a slide's link is the page's; on a control it turns the slide and focus stays put", async ({
    page,
  }) => {
    // carousel.spec.ts's case, on the band. Reduced motion (the harness's):
    // nothing rotates, so every change below is the key's.
    await page.goto(HOME);
    await adopted(page);
    const count = await page.locator(SLIDES).count();
    const next = page.getByRole("button", { name: "Next slide" });

    await next.focus();
    await page.keyboard.press("Tab");
    const link = page.locator(`${SLIDES}:not([inert]) a`).first();
    await expect(link, "Tab goes from the controls into the slide on stage").toBeFocused();
    const linkName = (await link.textContent())!.trim();

    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => focusAnd(page))
      .toEqual({ focus: linkName, inCard: true, status: `Slide 1 of ${count}`, live: "polite" });

    await page.keyboard.press("Shift+Tab");
    await expect(next).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => focusAnd(page))
      .toEqual({
        focus: "Next slide",
        inCard: true,
        status: `Slide 2 of ${count}`,
        live: "polite",
      });

    // Tab goes on into the slide showing NOW, not the one that left — once
    // it is `visible`. Under the harness's reduced motion app.css's 0.01ms
    // rule puts the slide's `visibility` on a transition that Chromium
    // resolves two frames late (measured: `hidden` at +26 and +30ms, `visible`
    // by +130), and a Tab inside that window skips the hidden link for the
    // portfolio button — 4 of 5 runs. The 0.01ms class (#93, #170); two
    // frames is under any human's keypress.
    await expect(page.locator(`${SLIDES}:not([inert])`)).toHaveCSS("visibility", "visible");
    await page.keyboard.press("Tab");
    await expect(page.locator(`${SLIDES}:not([inert]) a`).first()).toBeFocused();
    expect((await focusAnd(page)).focus).not.toBe(linkName);
  });

  test("autoplay never turns a slide out from under keyboard focus", async ({ browser }) => {
    test.setTimeout(45_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      const toggle = page.locator(`${CARD} button`).first();

      await toggle.focus();
      await expect(toggle, "focus entering stops it (APG)").toHaveAttribute(
        "aria-label",
        "Play slides",
      );
      await page.keyboard.press("Enter");
      // Rotating, positively: it offers Pause, the live region is muted and
      // the bar is moving. Without this the rest would pass on a band at rest.
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
      await expect(status(page)).toHaveAttribute("aria-live", "off");
      const before = await barValue(page);
      await expect.poll(() => barValue(page)).toBeGreaterThan(before);

      await page.keyboard.press("Tab"); // Previous
      await page.keyboard.press("Tab"); // Next
      await page.keyboard.press("Tab"); // the slide on stage's link
      const link = page.locator(`${SLIDES}:not([inert]) a`).first();
      await expect(link).toBeFocused();
      const name = (await link.textContent())!.trim();
      const was = (await status(page).textContent())!;

      // Longer than a whole lap: the clock would have turned by now.
      await page.waitForTimeout(FEATURED_DWELL + FEATURED_DISSOLVE + 300);
      expect(await focusAnd(page)).toEqual({
        focus: name,
        inCard: true,
        status: was,
        live: "polite",
      });
      await expect(toggle).toHaveAttribute("aria-label", "Play slides");
    } finally {
      await context.close();
    }
  });
});

test.describe("motion on the shipped bundle", () => {
  test("a clock turn dissolves a FULL bar; a visitor's turn dissolves the fill it found (#146)", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const { context, page } = await moving(browser);
    try {
      await page.goto(HOME);
      await adopted(page);
      await page.mouse.move(2, 2);
      // ON SCREEN, which below the fold at 1440 × 900 it is not: scrolled to,
      // and its reveal over, so the bar measured is a bar a reader sees.
      await page.locator(BAND).scrollIntoViewIfNeeded();
      await expect(page.locator(CARD)).toHaveCSS("opacity", "1", { timeout: 10_000 });
      // …and the MAP BOOTED before anything is timed (#117): the scroll opens
      // its lazy gate, and a MapLibre parse and a WebGL context inside the
      // sampled window starve it of frames (measured: 2 frames in 400ms).
      await expect(page.locator(`${BAND} [data-property-map]`)).toHaveAttribute(
        "data-map-ready",
        "",
        { timeout: 40_000 },
      );
      await expect(page.locator(`${BAND} [data-map-home-box]`)).toHaveCount(0, { timeout: 10_000 });
      const track = (await page.locator(`${CARD} [data-carousel-progress]`).boundingBox())!.width;

      // One frame's reading of the fill: its PAINTED width (#102: an opacity
      // can ramp on a zero-width box) and its opacity.
      const sample = (press: boolean) =>
        page.evaluate(
          async ({ card, press }) => {
            const region = document.querySelector(card)!;
            const fill = region.querySelector<HTMLElement>("[data-carousel-progress] > div")!;
            const live = region.querySelector("[aria-live]")!;
            if (press) {
              const next = [...region.querySelectorAll("button")].find(
                (b) => b.getAttribute("aria-label") === "Next slide",
              )!;
              next.focus();
              next.click();
            } else {
              await new Promise<void>((resolve) => {
                const seen = new MutationObserver(() => {
                  seen.disconnect();
                  resolve();
                });
                seen.observe(live, { childList: true, characterData: true, subtree: true });
              });
            }
            const t0 = performance.now();
            const frames: { t: number; mode: string; width: number; opacity: number }[] = [];
            await new Promise<void>((resolve) => {
              const tick = () => {
                frames.push({
                  t: performance.now() - t0,
                  mode: fill.dataset.carouselFill ?? "",
                  width: fill.getBoundingClientRect().width,
                  opacity: Number(getComputedStyle(fill).opacity),
                });
                if (performance.now() - t0 >= 900) resolve();
                else requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            });
            return frames;
          },
          { card: CARD, press },
        );

      // FRAMES ARE FEW HERE, AND THE ASSERTIONS ARE SHAPED FOR IT. With the
      // map booted each turn is also a 500ms camera flight, and on headless
      // software GL that starves the page: measured 2 to 4 frames inside the
      // first 400ms of a handover at load 9-10. So nothing below counts
      // frames beyond a floor. What it requires is what a snap cannot give:
      // a frame PART-WAY through the fade, painting the width being faded.
      const partWay = (frames: { opacity: number }[]) =>
        frames.filter((f) => f.opacity > 0.05 && f.opacity < 0.95);
      const neverUp = (frames: { opacity: number }[]) => {
        for (let i = 1; i < frames.length; i++)
          expect(frames[i].opacity, `frame ${i}`).toBeLessThanOrEqual(frames[i - 1].opacity);
      };

      // THE CLOCK'S TURN: full width, fading, then the next dwell from empty.
      const clock = await sample(false);
      const handover = clock.filter((f) => f.mode === "handover");
      expect(handover.length, `${clock.length} frames sampled`).toBeGreaterThanOrEqual(2);
      expect(clock[0].mode, "the turn's first frame is the handover").toBe("handover");
      for (const f of handover)
        expect(f.width, `t=${f.t.toFixed(0)}ms`).toBeGreaterThan(track * 0.9);
      expect(partWay(handover).length, "a frame part-way through the fade").toBeGreaterThan(0);
      neverUp(handover);
      expect(clock.at(-1)!.mode).toBe("timed");
      expect(clock.at(-1)!.opacity).toBe(1);

      // THE VISITOR'S TURN, part-way through the next dwell: that width,
      // fading, and then held out while the arrow's focus holds the clock.
      await expect.poll(() => barValue(page), { timeout: 10_000 }).toBeGreaterThan(0.2);
      const visitor = await sample(true);
      const width = visitor[0].width;
      expect(width, "a part-filled bar").toBeGreaterThan(track * 0.15);
      expect(width, "never a full one").toBeLessThan(track * 0.9);
      for (const f of visitor) {
        expect(f.mode, `t=${f.t.toFixed(0)}ms`).toBe("departing");
        expect(Math.abs(f.width - width), `t=${f.t.toFixed(0)}ms`).toBeLessThan(0.5);
      }
      expect(partWay(visitor).length, "a frame part-way through the fade").toBeGreaterThan(0);
      neverUp(visitor);
      expect(visitor.at(-1)!.opacity, "and ends out").toBe(0);
      test.info().annotations.push({
        type: "frames",
        description:
          `clock: ${handover.length} handover frames, ${partWay(handover).length} part-way; ` +
          `visitor: ${visitor.length} frames at ${width.toFixed(1)}px of ${track}, ` +
          `${partWay(visitor).length} part-way`,
      });
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("1920 × 1080: the card is on screen at load, and its reveal still PLAYS (#105)", async ({
    browser,
  }) => {
    const { context, page } = await moving(browser, viewportFor(1920, 1080));
    try {
      await page.addInitScript((card: string) => {
        const w = window as unknown as { __card: number[] };
        w.__card = [];
        let held: HTMLElement | null = null;
        const tick = () => {
          held ??= document.querySelector<HTMLElement>(card);
          if (held) w.__card.push(Number(getComputedStyle(held).opacity));
          if (w.__card.at(-1) !== 1 || w.__card.length < 5) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, CARD);
      await page.goto(HOME);
      await adopted(page);
      const top = await page.locator(CARD).evaluate((el) => el.getBoundingClientRect().top);
      expect(top, "premise: on screen at load").toBeLessThan(1080);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { __card: number[] }).__card.at(-1)))
        .toBe(1);
      const trace = await page.evaluate(() => (window as unknown as { __card: number[] }).__card);
      expect(trace[0], "hidden on its first frame").toBe(0);
      expect(trace.filter((o) => o > 0.02 && o < 0.98).length, "then a fade").toBeGreaterThan(5);
    } finally {
      await context.close();
    }
  });
});

test.describe("Pause on a touch screen (#32)", () => {
  test("a TAP on Pause stops the slide and the bar on the tap, and a second tap plays", async ({
    browser,
  }) => {
    // Measured only with a mouse until now. The primitive's pause handler
    // settles a POINTER press on the opposite of what was on screen when its
    // own pointerdown began — because a press focuses the button first, and
    // focus entering is itself a pause (APG). A touch tap reaches the button
    // as pointerdown → pointerup → (compat) mousedown/focus → click, so the
    // focus lands between the pointerdown and the click: exactly the order
    // the handler was written for, and here it is measured. Chromium with
    // `hasTouch`; WebKit is the operator's to measure (#32).
    test.setTimeout(45_000);
    const context = await browser.newContext({
      reducedMotion: "no-preference",
      // A phone's own width: under `isMobile` the scrollbar overlays, so
      // there is no gutter to add.
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await context.newPage();
      await page.goto(HOME);
      await adopted(page);
      const toggle = page.locator(`${CARD} button`).first();
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
      await toggle.scrollIntoViewIfNeeded();
      await expect.poll(() => barValue(page)).toBeGreaterThan(0.05);

      // Every event on the button, and every frame of the bar, stamped in
      // the page from before the tap.
      await page.evaluate(
        ({ card }) => {
          const region = document.querySelector(card)!;
          const button = region.querySelector("button")!;
          const fill = region.querySelector("[data-carousel-progress] > div")!;
          const w = window as unknown as {
            __tap: { events: { t: number; type: string }[]; frames: { t: number; v: string }[] };
          };
          w.__tap = { events: [], frames: [] };
          for (const type of [
            "pointerdown",
            "pointerup",
            "pointerleave",
            "touchstart",
            "touchend",
            "mousedown",
            "focusin",
            "click",
          ])
            button.addEventListener(
              type,
              (e) =>
                w.__tap.events.push({
                  t: performance.now(),
                  type: `${type}${"pointerType" in e ? `:${(e as PointerEvent).pointerType}` : ""}`,
                }),
              { capture: true },
            );
          const tick = () => {
            w.__tap.frames.push({ t: performance.now(), v: fill.getAttribute("style") ?? "" });
            if (w.__tap.frames.length < 400) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        },
        { card: CARD },
      );
      await page.waitForTimeout(300);
      const was = (await status(page).textContent())!;
      await toggle.tap();
      await expect(toggle).toHaveAttribute("aria-label", "Play slides");
      await expect(status(page)).toHaveAttribute("aria-live", "polite");
      await page.waitForTimeout(700);
      const tap = await page.evaluate(
        () =>
          (
            window as unknown as {
              __tap: { events: { t: number; type: string }[]; frames: { t: number; v: string }[] };
            }
          ).__tap,
      );
      const click = tap.events.find((e) => e.type.startsWith("click"));
      const down = tap.events.find((e) => e.type === "pointerdown:touch");
      expect(down, `a TOUCH pointer pressed it: ${JSON.stringify(tap.events)}`).toBeDefined();
      expect(click, "and it clicked").toBeDefined();
      const before = tap.frames.filter((f) => f.t < down!.t);
      const after = tap.frames.filter((f) => f.t > click!.t);
      expect(
        new Set(before.map((f) => f.v)).size,
        "the bar was filling up to the tap",
      ).toBeGreaterThan(1);
      expect(after.length, "sampled after the tap").toBeGreaterThan(5);
      expect([...new Set(after.map((f) => f.v))], "no frame after the tap moved the bar").toEqual([
        after[0].v,
      ]);
      await expect(status(page), "the slide held").toHaveText(was);
      test.info().annotations.push({
        type: "tap",
        description: tap.events.map((e) => `${e.type}@${(e.t - down!.t).toFixed(1)}`).join(" "),
      });

      // …and a second tap plays, from where it stood.
      const frozen = await barValue(page);
      await toggle.tap();
      await expect(toggle).toHaveAttribute("aria-label", "Pause slides");
      await expect.poll(() => barValue(page)).toBeGreaterThan(frozen);
    } finally {
      await context.close();
    }
  });
});

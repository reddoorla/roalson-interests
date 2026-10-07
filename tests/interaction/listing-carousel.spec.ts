import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { GARNET, OFF_WHITE } from "./expect-ring";
import { hydrated, HYDRATION_TIMEOUT } from "./hydrated";
import { axe } from "./axe";

// THE PROPERTIES PAGE BELOW `lg`: EACH SECTION AN IN-CARD CAROUSEL (#14), and
// the focus net under it (#34). jsdom has no layout, no `inert` and no cascade,
// so everything here is a claim only a browser can check:
//
//  1. With no script the page is the stacked list, every card and link shown.
//  2. Hydrated at 390 each section shows one card; its arrows, a swipe and
//     the arrow keys turn it; the bar and the live region count.
//  3. The arrows sit between the photo and the text of the card on stage and
//     are not inside it; off-stage cards take no focus; the ring shows on
//     both card tones.
//  4. Focus is never left on an inert or removed node: a turn made while
//     focus is IN the card (a swipe that moves no focus), a window widened
//     past `lg` with focus on an arrow, and one narrowed below it with focus
//     in the third card. With the net removed from carousel.svelte.ts these
//     read BODY.
//  5. A pressed pin turns the carousel to its card.
//  6. From `lg` nothing is a carousel; nothing rotates on its own anywhere.
//  7. Axe passes on the carousel state, on both card tones.
//
// The shared config forces `reducedMotion: "reduce"`; this carousel has no
// clock, so that changes nothing it does — case 6 checks the other preference.
//
//   pnpm exec playwright test tests/interaction/listing-carousel.spec.ts --workers=1
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/listing-carousel.spec.ts
//
// On a production build `/dev/*` 404s (#120), so the same cases run against
// the live /properties, whose content comes from Prismic; every count is read
// off the page rather than assumed.
const PREVIEW = process.env.REDDOOR_GATE_SERVER === "preview";
const ROUTE = PREVIEW ? "/properties" : "/dev/properties";
const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1440, height: 900 };

/** Every section's card list: the carousel's wrapper, a plain div without it. */
const LISTS = "[data-listing-carousel]";
const CAROUSEL = '[aria-roledescription="carousel"]';
const SLIDE = '[aria-roledescription="slide"]';

async function open(browser: Browser, viewport = PHONE, options: { js?: boolean } = {}) {
  const context = await browser.newContext({
    viewport,
    javaScriptEnabled: options.js ?? true,
  });
  const page = await context.newPage();
  await page.goto(ROUTE, { waitUntil: options.js === false ? "domcontentloaded" : "load" });
  if (options.js !== false) await hydrated(page);
  return { context, page };
}

/** The first carousel with at least two cards, adopted by script. */
async function firstCarousel(page: Page) {
  const carousel = page.locator(`${CAROUSEL}[data-carousel-ready]`).first();
  await expect(carousel).toBeAttached({ timeout: HYDRATION_TIMEOUT });
  return carousel;
}

/** What the carousel says about itself, in ONE read: the card on stage (its
 *  heading), how many slides the accessibility tree exposes, the count the
 *  slide label and the live region give, and the bar's fill. */
const state = (carousel: Locator) =>
  carousel.evaluate((region, sel) => {
    const slides = [...region.querySelectorAll<HTMLElement>(sel)];
    const shown = slides.filter((s) => s.getAttribute("aria-hidden") === null);
    const style = region.querySelector("[data-carousel-fill]")?.getAttribute("style") ?? "";
    return {
      count: slides.length,
      exposed: shown.length,
      title: shown[0]?.querySelector("h3")?.textContent?.trim() ?? null,
      label: shown[0]?.getAttribute("aria-label") ?? null,
      status: region.querySelector("[aria-live]")?.textContent ?? null,
      bar: Number(/scaleX\(([^)]+)\)/.exec(style)?.[1]),
    };
  }, SLIDE);

/** Where focus IS, named — "BODY" when nothing holds it — and whether that
 *  element is inert, detached, or the carousel's own region. A test about lost
 *  focus has to name the element that has it. */
const focus = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { at: "BODY", inert: false, connected: true };
    return {
      at: el.hasAttribute("data-listing-carousel")
        ? "REGION"
        : (el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName),
      inert: !!el.closest("[inert]"),
      connected: el.isConnected,
    };
  });

/** The ring AFTER its colour transition has landed. `expectRing` (the shared
 *  helper) polls until the ring matches, and a ring's first frame is
 *  `currentcolor` — the control's own text colour, which on these arrows IS
 *  the colour each case expects (cream glyph, off-white ring). So it passed
 *  with the garnet card's ring override deleted: measured, the outline read
 *  rgb(243, 241, 239) on the frame of focus with `--focus-ring` unset. This
 *  waits for the element to have no running animation first. */
async function expectSettledRing(page: Page, target: Locator, color: string) {
  await page.keyboard.press("Tab");
  await target.evaluate((el) => (el as HTMLElement).focus());
  await expect
    .poll(() => target.evaluate((el) => el.getAnimations().length), {
      timeout: HYDRATION_TIMEOUT,
    })
    .toBe(0);
  expect(
    await target.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        showing: el.matches(":focus-visible"),
        color: cs.outlineColor,
        width: cs.outlineWidth,
      };
    }),
  ).toEqual({ showing: true, color, width: "2px" });
}

test.describe("with no script", () => {
  test(
    "390: every section is the stacked list — every card shown, every link reachable",
    { tag: "@smoke" },
    async ({ browser }) => {
      const { context, page } = await open(browser, PHONE, { js: false });
      try {
        const lists = page.locator(LISTS);
        expect(await lists.count(), "a list per section").toBeGreaterThan(0);
        expect(await page.locator(`${CAROUSEL}, ${SLIDE}, ${LISTS} [inert]`).count()).toBe(0);
        expect(
          await lists.getByRole("button", { name: /^(Previous|Next) slide$/ }).count(),
          "no dead arrows",
        ).toBe(0);

        for (let i = 0; i < (await lists.count()); i++) {
          const cards = lists.nth(i).locator("article");
          for (let j = 0; j < (await cards.count()); j++)
            await expect(cards.nth(j), `list ${i}: card ${j} painted`).toBeVisible();
        }
      } finally {
        await context.close();
      }
    },
  );
});

test.describe("at 390, hydrated", () => {
  test("one card on stage; arrows, keys and a swipe turn it; the bar and the live region count", async ({
    browser,
  }) => {
    const { context, page } = await open(browser);
    try {
      const carousel = await firstCarousel(page);
      const first = await state(carousel);
      const n = first.count;
      expect(n).toBeGreaterThan(1);
      expect(first).toMatchObject({ exposed: 1, label: `1 of ${n}`, status: `Slide 1 of ${n}` });
      expect(first.bar).toBeCloseTo(1 / n, 5);

      await carousel.getByRole("button", { name: "Next slide" }).click();
      const second = await state(carousel);
      expect(second).toMatchObject({ exposed: 1, label: `2 of ${n}`, status: `Slide 2 of ${n}` });
      expect(second.title).not.toBe(first.title);
      expect(second.bar).toBeCloseTo(2 / n, 5);

      // The keys, from the control that has focus (the click above focused it).
      await page.keyboard.press("ArrowLeft");
      expect(await state(carousel)).toMatchObject({ label: `1 of ${n}`, title: first.title });
      await page.keyboard.press("ArrowLeft");
      expect((await state(carousel)).label, "and it wraps").toBe(`${n} of ${n}`);
      await page.keyboard.press("ArrowRight");

      // A swipe: a real pointer, left across the card, inside 300ms.
      await carousel.scrollIntoViewIfNeeded();
      const box = (await carousel.locator(":scope > ul").boundingBox())!;
      const y = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width - 20, y);
      await page.mouse.down();
      await page.mouse.move(box.x + 20, y, { steps: 4 });
      await page.mouse.up();
      expect((await state(carousel)).label, "swiped left: on to the next").toBe(`2 of ${n}`);
    } finally {
      await context.close();
    }
  });

  test("the arrows sit between the photo and the text of the card on stage, and are not in it", async ({
    browser,
  }) => {
    const { context, page } = await open(browser);
    try {
      const carousel = await firstCarousel(page);
      const geometry = await carousel.evaluate((region) => {
        const card = region.querySelector("li:not(.invisible) > article")!;
        const [photo, text] = [card.firstElementChild!, card.lastElementChild!].map((el) =>
          el.getBoundingClientRect(),
        );
        const bar = region.querySelector("[data-carousel-progress]")!.getBoundingClientRect();
        const next = region.querySelector('[aria-label="Next slide"]')!;
        const arrow = next.getBoundingClientRect();
        const c = card.getBoundingClientRect();
        return {
          insideSlide: !!next.closest("[data-carousel-slide]"),
          barGap: bar.top - photo.bottom,
          arrowGap: arrow.top - bar.bottom,
          textGap: text.top - arrow.bottom,
          barInset: [bar.left - c.left, c.right - bar.right],
          arrowRight: c.right - arrow.right,
        };
      });
      expect(geometry.insideSlide, "a control inside a slide would go inert with it").toBe(false);
      // The comp's panel: 20 over the bar, 10 under it, the 40px arrows, then
      // the text panel's own 20.
      expect(geometry.barGap).toBeCloseTo(20, 0);
      expect(geometry.arrowGap).toBeCloseTo(10, 0);
      expect(geometry.textGap).toBeCloseTo(0, 0);
      expect(geometry.barInset[0]).toBeCloseTo(20, 0);
      expect(geometry.barInset[1]).toBeCloseTo(20, 0);
      expect(geometry.arrowRight).toBeCloseTo(20, 0);
    } finally {
      await context.close();
    }
  });

  test(
    "off-stage cards take no focus: Tab goes from the arrows to the card on stage and on",
    { tag: "@smoke" },
    async ({ browser }) => {
      const { context, page } = await open(browser);
      try {
        const carousel = await firstCarousel(page);
        const links = await carousel.evaluate((region) =>
          [...region.querySelectorAll<HTMLElement>("a[href]")].map((a) => ({
            inert: !!a.closest("[inert]"),
            hidden: getComputedStyle(a).visibility !== "visible",
            card: a.closest("article")?.querySelector("h3")?.textContent?.trim() ?? null,
          })),
        );
        const reachable = links.filter((l) => !l.inert);
        expect(new Set(reachable.map((l) => l.card)).size, "one card's links").toBeLessThanOrEqual(
          1,
        );
        expect(links.filter((l) => l.inert).every((l) => l.hidden)).toBe(true);

        const next = carousel.getByRole("button", { name: "Next slide" });
        await next.focus();
        await page.keyboard.press("Enter");
        expect(await focus(page), "pressing an arrow keeps focus on it").toMatchObject({
          at: "Next slide",
          inert: false,
        });
        const onStage = (await state(carousel)).title!;
        await page.keyboard.press("Tab");
        const landed = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          return {
            inert: !!el.closest("[inert]"),
            card: el.closest("article")?.querySelector("h3")?.textContent?.trim() ?? null,
          };
        });
        // A past project has no link, so Tab leaves the carousel instead.
        if (landed.card !== null) expect(landed).toEqual({ inert: false, card: onStage });
        expect(landed.inert).toBe(false);
      } finally {
        await context.close();
      }
    },
  );

  test("the ring shows on both card tones: off-white on the garnet card, garnet on the light ones", async ({
    browser,
  }) => {
    const { context, page } = await open(browser);
    try {
      // The first section's first card is the comp's garnet `feature scroll`.
      const carousel = page.locator(`${LISTS}${CAROUSEL}`).first();
      await expect(carousel).toHaveAttribute("data-carousel-ready", "", {
        timeout: HYDRATION_TIMEOUT,
      });
      const garnetCard = await carousel
        .locator("li:not(.invisible) > article")
        .evaluate((a) => a.classList.contains("bg-primary"));
      expect(garnetCard, "the first card on stage is garnet").toBe(true);
      const next = carousel.getByRole("button", { name: "Next slide" });
      await expectSettledRing(page, next, OFF_WHITE);
      await page.keyboard.press("Enter");
      await expectSettledRing(page, next, GARNET);
    } finally {
      await context.close();
    }
  });

  test(
    "axe passes on the carousels, on the garnet card and on a light one",
    { tag: "@smoke" },
    async ({ browser }) => {
      const { context, page } = await open(browser);
      try {
        await firstCarousel(page);
        const audit = async () => {
          const results = await axe(page)
            .include(LISTS)
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          const contrast = results.passes.find((r) => r.id === "color-contrast");
          expect(contrast?.nodes.length ?? 0, "contrast measured something").toBeGreaterThan(0);
          return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join()}`);
        };
        expect(await audit()).toEqual([]);
        for (const carousel of await page.locator(`${CAROUSEL}[data-carousel-ready]`).all()) {
          await carousel.getByRole("button", { name: "Next slide" }).click();
        }
        expect(await audit()).toEqual([]);
      } finally {
        await context.close();
      }
    },
  );

  test("a pressed pin turns the carousel to its card", async ({ browser }) => {
    const { context, page } = await open(browser);
    try {
      const section = page.locator("section[data-view-section]").first();
      const carousel = section.locator(CAROUSEL);
      await expect(carousel).toHaveAttribute("data-carousel-ready", "", {
        timeout: HYDRATION_TIMEOUT,
      });
      const map = section.locator("[data-property-map]");
      await map.scrollIntoViewIfNeeded();
      await expect(map).toHaveAttribute("data-map-ready", "", { timeout: 25_000 });
      const stageId = () =>
        carousel.evaluate(
          (region) =>
            region.querySelector<HTMLElement>("li[data-centre-id]:not([aria-hidden])")!.dataset
              .centreId,
        );
      const before = await stageId();
      // A single-listing pin that is not the card on stage, with its centre
      // inside the 200px box — one on the box's edge is clipped, and a click
      // there lands on the map. Pressed by coordinates: MapLibre repaints
      // under a pin, which Playwright's "stable" check reads as movement.
      const pin = await map.evaluate((box, onStage) => {
        const m = box.getBoundingClientRect();
        for (const el of box.querySelectorAll<HTMLElement>("[data-map-pin]")) {
          if (el.dataset.mapPin === onStage) continue;
          const r = el.getBoundingClientRect();
          const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
          const inside = x > m.left + 4 && x < m.right - 4 && y > m.top + 4 && y < m.bottom - 4;
          if (inside && el.contains(document.elementFromPoint(x, y))) {
            return { id: el.dataset.mapPin!, x, y };
          }
        }
        return null;
      }, before);
      expect(pin, "a pressable pin other than the card on stage").not.toBeNull();
      await page.mouse.click(pin!.x, pin!.y);
      await expect.poll(stageId, { message: `${pin!.id}'s card is on stage` }).toBe(pin!.id);
      await expect
        .poll(() =>
          carousel.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight + 1;
          }),
        )
        .toBe(true);
    } finally {
      await context.close();
    }
  });
});

test.describe("beside the view tabs (#180)", () => {
  test("a tab hides the other section's carousel without unmounting it: its slide is kept", async ({
    browser,
  }) => {
    const { context, page } = await open(browser);
    try {
      const land = page.locator(`section[data-view-section="land"] ${CAROUSEL}`);
      const improved = page.locator(`section[data-view-section="improved"] ${CAROUSEL}`);
      await expect(land).toHaveAttribute("data-carousel-ready", "", {
        timeout: HYDRATION_TIMEOUT,
      });
      test.skip((await improved.count()) === 0, "one listing in Improved: no carousel there");
      await land.getByRole("button", { name: "Next slide" }).click();
      const landSlide = (await state(land)).label;

      await page.locator('[data-view-tab="improved"]').click();
      await expect(land).toBeHidden();
      await expect(improved).toBeVisible();
      await improved.getByRole("button", { name: "Next slide" }).click();
      expect((await state(improved)).label).toMatch(/^2 of /);

      await page.goBack();
      await expect(land).toBeVisible();
      expect((await state(land)).label, "Land is where it was left").toBe(landSlide);
    } finally {
      await context.close();
    }
  });
});

test.describe("the focus net (#34), in a real browser", () => {
  test("a turn made while focus is IN the card hands focus to the region, never to <body>", async ({
    browser,
  }) => {
    const { context, page } = await open(browser);
    try {
      const carousel = await firstCarousel(page);
      const link = carousel.locator("li:not(.invisible) a[href]").first();
      test.skip((await link.count()) === 0, "the first carousel's card has no link");
      await link.focus();
      const title = (await state(carousel)).title;
      // A SYNTHETIC swipe: the gesture's own pointer events, dispatched, move
      // no focus — unlike a real press, which the platform answers by moving
      // focus off the link first. So the slide holding focus turns away.
      await carousel.locator(":scope > ul").evaluate((ul) => {
        const at = (type: string, x: number) =>
          ul.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              clientX: x,
              clientY: 300,
              bubbles: true,
              isPrimary: true,
            }),
          );
        at("pointerdown", 300);
        at("pointerup", 100);
      });
      await expect.poll(async () => (await state(carousel)).title).not.toBe(title);
      expect(await focus(page)).toEqual({ at: "REGION", inert: false, connected: true });
    } finally {
      await context.close();
    }
  });

  test("narrowed below lg with focus in the third card, that card is on stage and keeps focus", async ({
    browser,
  }) => {
    const { context, page } = await open(browser, WIDE);
    try {
      const list = page.locator(LISTS).first();
      await expect(list).toHaveAttribute("aria-roledescription", "carousel");
      const next = list.getByRole("button", { name: "Next slide" });
      await next.click();
      await next.click();
      await expect.poll(async () => (await state(list)).label).toMatch(/^3 of /);
      const link = list.locator("li:not([aria-hidden]) a[href]").first();
      await link.focus();
      await expect(link).toBeFocused();
      const name = await link.evaluate(
        (a) => a.closest("article")!.querySelector("h3")!.textContent,
      );

      await page.setViewportSize(PHONE);
      await expect(list).toHaveAttribute("aria-roledescription", "carousel");
      const s = await state(list);
      expect(s).toMatchObject({ exposed: 1, label: `3 of ${s.count}`, title: name?.trim() });
      expect(await focus(page)).toMatchObject({ inert: false, connected: true });
      expect((await focus(page)).at).not.toBe("BODY");
      expect(await link.evaluate((a) => a === document.activeElement)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("widened past lg with focus on an arrow, the carousel and the focus both stay", async ({
    browser,
  }) => {
    const { context, page } = await open(browser);
    try {
      const carousel = await firstCarousel(page);
      const before = await page.locator(CAROUSEL).count();
      await carousel.getByRole("button", { name: "Next slide" }).focus();
      await page.setViewportSize(WIDE);
      await expect(page.locator(CAROUSEL)).toHaveCount(before - 1);
      await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
      expect(await focus(page)).toEqual({ at: "Next slide", inert: false, connected: true });
    } finally {
      await context.close();
    }
  });
});

test.describe("what does not change", () => {
  test("from lg: Past Projects is a grid, nothing in it inert, every card shown", async ({
    browser,
  }) => {
    const { context, page } = await open(browser, WIDE);
    try {
      await expect(page.locator("[data-listing][data-view]")).toBeAttached();
      const past = `section[data-past] ${LISTS}`;
      await expect(page.locator(past)).toHaveCount(1);
      expect(
        await page.locator(`${past}${CAROUSEL}, ${past} ${SLIDE}, ${past} [inert]`).count(),
      ).toBe(0);
      expect(await page.locator(`${past} button, ${past} .invisible`).count()).toBe(0);
      const cards = await page
        .locator(`${past} article`)
        .evaluateAll((all) => all.map((a) => a.getBoundingClientRect().height > 0));
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.every(Boolean)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test("nothing turns by itself, with motion allowed or not", async ({ browser }) => {
    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      const context = await browser.newContext({ viewport: PHONE, reducedMotion });
      try {
        const page = await context.newPage();
        await page.goto(ROUTE);
        await hydrated(page);
        const carousel = await firstCarousel(page);
        expect(await carousel.getByRole("button", { name: /slides$/ }).count(), "no Pause").toBe(0);
        const before = await state(carousel);
        await page.waitForTimeout(2500);
        expect((await state(carousel)).label, `${reducedMotion}: still slide 1`).toBe(before.label);
      } finally {
        await context.close();
      }
    }
  });
});

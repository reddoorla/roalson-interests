import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { nextTurn } from "./band-turn";
import { cameraLog, cameraProbeInstalled, mapZoom, resetCamera, watchCamera } from "./camera-probe";
import { carouselHydrated, hydrated } from "./hydrated";

// THE HOMEPAGE BAND'S MAP IS A PICTURE WHILE THE SLIDESHOW RUNS, AND A MAP
// WHILE IT IS STOPPED. Operator call, 2026-09-23: "map should get all
// navigation tools when the slideshow is paused, and be uninteractable when the
// slideshow is running". The band passes PropertyMap
// `interactive={carousel.paused || !carousel.eligible}` — `paused` is the
// visitor's own stop (Pause, or focus entering the carousel), `!eligible` is
// "nothing can run here" (reduced motion).
//
// WHY THESE ASSERTIONS AND NOT A FLAG. "Uninteractable" is only true if the
// PAGE gets the input, so every locked case measures the page moving under a
// wheel or a finger and the map not moving at all — both, because either alone
// passes on a map that crashed. The unit cases in FeaturedProperties.test.ts
// and PropertyMap.camera.svelte.test.ts hold the switch itself.
//
// `/`, not /dev/home: /dev/* 404s on a production build (#120). Run it both
// ways:
//
//   pnpm exec playwright test tests/interaction/property-map-band-lock.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/property-map-band-lock.spec.ts
//
// MOTION ALLOWED, and that is the whole of this file's premise. The fleet's
// `playwright-a11y` config forces `reducedMotion: "reduce"`, under which the
// carousel is not `eligible` and — by the rule — the map is interactive. Every
// "locked while running" case below would pass by testing an unlocked map with
// nothing running. The reduced-motion case puts the emulation back on purpose.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

/** `CAMERA_FLIGHT_MS` from $lib/property-map (a spec cannot resolve `$lib`);
 *  property-map.test.ts pins the source at 500. */
const CAMERA_FLIGHT_MS = 500;

const HOME = "/";
const MAP = "[data-property-map]";
const CARD = "[data-featured-card]";

/** What the `/properties` map has, measured on a production build
 *  (2026-09-23): the handlers maplibre builds on for PropertyMap's options. */
const ALL_TOOLS = [
  "boxZoom",
  "doubleClickZoom",
  "dragPan",
  "keyboard",
  "scrollZoom",
  "touchZoomRotate",
];

/** The band, scrolled to, its carousel adopted and its map drawn and probed. */
async function bandUp(page: Page, viewport = { width: 1440, height: 900 }) {
  await watchCamera(page);
  await page.setViewportSize(viewport);
  await page.goto(HOME);
  await hydrated(page);
  await carouselHydrated(page.locator(CARD));
  await page.locator(MAP).first().scrollIntoViewIfNeeded();
  await expect(page.locator(MAP).first()).toHaveAttribute("data-map-ready", "", {
    timeout: 60_000,
  });
  await expect
    .poll(() => page.evaluate(() => window.__camera?.maps?.length ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
}

/** The slideshow's clock is running: the band's live region is `aria-live="off"`
 *  exactly while `carousel.rotating` — the one thing the band draws off it. */
const running = (page: Page) =>
  page.locator(`${CARD} [aria-live]`).evaluate((el) => el.getAttribute("aria-live") === "off");

/** The navigation handlers the band's map has on right now, read off maplibre. */
const tools = (page: Page) =>
  page.evaluate(() => {
    const m = window.__camera.maps[0] as unknown as Record<string, { isEnabled(): boolean }>;
    return [
      "scrollZoom",
      "boxZoom",
      "dragRotate",
      "dragPan",
      "keyboard",
      "doubleClickZoom",
      "touchZoomRotate",
      "touchPitch",
    ]
      .filter((n) => m[n]!.isEnabled())
      .sort();
  });

/** The canvas's focus and name, and the cursor a pointer over it gets. */
const canvasState = (page: Page) =>
  page.evaluate(() => {
    const c = window.__camera.maps[0]!.getCanvas();
    return {
      tabindex: c.getAttribute("tabindex"),
      name: c.getAttribute("aria-label"),
      cursor: getComputedStyle(c.parentElement!).cursor,
    };
  });

/** A point on the band's map where the bare canvas is what the pointer hits. */
const bareSpot = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-property-map]") as HTMLElement;
    const b = el.getBoundingClientRect();
    const top = Math.max(b.top, 0) + 40;
    const bottom = Math.min(b.bottom, window.innerHeight) - 50;
    for (let y = (top + bottom) / 2, i = 0; i < 40; i++, y += i % 2 ? i * 7 : -i * 7)
      for (let x = (b.left + b.right) / 2, j = 0; j < 20; j++, x += j % 2 ? j * 9 : -j * 9) {
        if (y < top || y > bottom || x < b.left + 30 || x > b.right - 30) continue;
        if (document.elementFromPoint(x, y)?.matches("canvas.maplibregl-canvas")) return { x, y };
      }
    return null;
  });

/** Put the band's map `from` px below the top of the window. */
async function park(page: Page, from = 40) {
  await page.evaluate((d) => {
    const b = document.querySelector("[data-property-map]")!.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + b.top - d, behavior: "instant" });
  }, from);
  await page.waitForTimeout(900);
}

/** `n` real 120px notches at (x, y), 130ms apart, after the wheel has been
 *  quiet long enough to be a new scroll. What the page and the map did. */
async function wheel(page: Page, at: { x: number; y: number }, n: number, deltaY = 120) {
  const y0 = await page.evaluate(() => window.scrollY);
  const z0 = await mapZoom(page);
  await page.mouse.move(at.x, at.y);
  await page.waitForTimeout(700);
  for (let i = 0; i < n; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(130);
  }
  await page.waitForTimeout(1200);
  return {
    page: (await page.evaluate(() => window.scrollY)) - y0,
    zoom: (await mapZoom(page)) - z0,
  };
}

/**
 * THE CAMERA AT REST: wait until maplibre reports nothing moving, twice, 200ms
 * apart, and read the zoom there.
 *
 * WHY NOT A ZOOM DELTA. While the slideshow runs its clock flies the camera to
 * each new listing — an arc that zooms OUT and back to 12 — so "the zoom did
 * not change across the notches" is a race with the band's own turn, and it
 * lost: measured on a production build, one notch over the locked map read
 * −0.811 because a turn's flight was mid-arc at the second read. At rest every
 * flight has landed at the frame's own 12, and a wheel that zoomed would leave
 * it anywhere else.
 */
async function zoomAtRest(page: Page) {
  const still = () =>
    page.evaluate(
      () => !(window.__camera.maps[0] as unknown as { isMoving(): boolean }).isMoving(),
    );
  await expect
    .poll(async () => (await still()) && (await page.waitForTimeout(200), await still()), {
      timeout: 15_000,
      message: "the camera came to rest",
    })
    .toBe(true);
  return mapZoom(page);
}

/** Every camera move a GESTURE started since the last `resetCamera` — maplibre
 *  tags those with the input event (`mousemove`, `touchmove`, `keydown`…);
 *  the clock's flights and a wheel zoom are untagged ("programmatic"). */
const gestureMoves = async (page: Page) =>
  (await cameraLog(page)).movestart.filter((type) => type !== "programmatic");

async function pause(page: Page) {
  await page.getByRole("button", { name: "Pause slides" }).click();
  await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
}

// ---------------------------------------------------------------------------

test.describe("while the slideshow runs, the band's map is a picture the page goes past", () => {
  test("the wheel over it scrolls the page — one notch and five — and moves nothing", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    expect(await running(page), "premise: the slideshow is running").toBe(true);
    expect(await tools(page), "no navigation handler is on").toEqual([]);
    const spot = await bareSpot(page);
    expect(spot, "bare canvas to rest the pointer on").not.toBeNull();

    const one = await wheel(page, spot!, 1);
    expect(one.page, "one notch: the page moved its 120").toBe(120);
    expect(await zoomAtRest(page), "and the map is at the frame's own zoom").toBeCloseTo(12, 4);
    await park(page);
    const five = await wheel(page, spot!, 5);
    expect(five.page, "five notches: the page moved all 600").toBe(600);
    expect(await zoomAtRest(page)).toBeCloseTo(12, 4);
    // A pointer resting on the MAP is not a hover of the carousel (the map is
    // outside its region), so the slideshow is still running — the lock was
    // measured in the state it exists for.
    expect(await running(page), "still running after the wheel").toBe(true);
  });

  test("its pins press nothing, and neither they nor the canvas take focus", async ({ page }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    expect(await running(page)).toBe(true);

    const pins = page.locator(`${MAP} [data-map-pin]`);
    expect(await pins.count(), "pins to press").toBeGreaterThan(0);
    for (const pin of await pins.all()) {
      await expect(pin, "every pin is disabled").toBeDisabled();
      await expect(pin).toHaveCSS("pointer-events", "none");
    }
    // A real click where a pin is drawn: it reaches the canvas under it,
    // opens no sheet and moves no camera.
    await resetCamera(page);
    const box = (await pins.first().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 3);
    await page.waitForTimeout(800);
    await expect(page.locator(`${MAP} [data-map-sheet]`)).toHaveCount(0);
    const log = await cameraLog(page);
    expect(log.ease.length + log.jump.length, "no camera move from the press").toBe(0);

    const c = await canvasState(page);
    expect(c.tabindex, "the canvas is not focusable at all").toBeNull();
    expect(c.name, "and does not announce an interactive map").toMatch(/listings, map$/);
    expect(c.cursor, "and a pointer over it is not a grab hand").not.toBe("grab");

    // THE KEYBOARD, from the far side: Shift+Tab from the first stop AFTER the
    // band walks back through the map — its attribution links, then its list
    // of Google Maps links, the map's accessible equivalent, which stay — and
    // never lands on the canvas.
    const walk = await walkBack(page);
    const stops = walk.map((w) => w.at);
    expect(stops, "the walk back through the map").not.toContain("canvas");
    expect(stops, "reaches the map's own list").toContain("list link");
    // Read at every stop INSIDE the map: the walk's own last step leaves the
    // map for the card, and focus entering the carousel pauses it (APG) —
    // which is the carousel's rule, not a map stop pausing anything.
    expect(
      walk.map((w) => w.running),
      "and nothing in the map stopped the slideshow",
    ).not.toContain(false);
    await park(page);

    // The locked map passes axe — measured, not assumed, since its canvas lost
    // its tabindex and changed its name.
    const results = await new AxeBuilder({ page }).include(MAP).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    expect(results.passes.length, "axe looked at the map").toBeGreaterThan(0);
  });

  test("the clock's turn still flies the camera, and the map stays a picture across it", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await page.mouse.move(2, 2);
    await resetCamera(page);
    await nextTurn(page.locator(CARD));
    await page.waitForTimeout(900);
    const log = await cameraLog(page);
    expect(log.fly.length, "the camera followed the clock").toBeGreaterThan(0);
    expect(await tools(page), "and the map is still locked").toEqual([]);
  });
});

test.describe("a finger on the running band's map scrolls the page", () => {
  test("a one-finger drag at 390x844 moves the page and not the map, then pans it once paused", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    try {
      await bandUp(page, { width: 390, height: 844 });
      await park(page, 200);
      expect(await running(page), "premise: running").toBe(true);
      const cdp = await context.newCDPSession(page);

      /** Drag one finger up by 144px from (x, y): how far the page moved, and
       *  every camera move the drag started (maplibre tags a touch pan with
       *  its `touchmove`; the clock's own flights are untagged, so a turn
       *  during the drag cannot read as a pan). */
      const drag = async (x: number, y: number) => {
        await resetCamera(page);
        const y0 = await page.evaluate(() => window.scrollY);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        for (let i = 1; i <= 12; i++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: y - 12 * i }],
          });
          await page.waitForTimeout(16);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(1200);
        return {
          page: (await page.evaluate(() => window.scrollY)) - y0,
          pans: await gestureMoves(page),
        };
      };

      const box = (await page.locator(MAP).first().boundingBox())!;
      const locked = await drag(box.x + box.width / 2, box.y + box.height / 2);
      expect(locked.page, "running: the finger scrolled the page").toBeGreaterThan(100);
      expect(locked.pans, "and panned nothing").toEqual([]);

      // The control, and Pause's half of the rule: the same drag pans a paused
      // map and leaves the page where it is.
      await page.getByRole("button", { name: "Pause slides" }).tap();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      await park(page, 200);
      const box2 = (await page.locator(MAP).first().boundingBox())!;
      const paused = await drag(box2.x + box2.width / 2, box2.y + box2.height / 2);
      expect(paused.pans, "paused: the finger panned the map").toContain("touchmove");
      expect(paused.page, "and the page stayed").toBe(0);
    } finally {
      await context.close();
    }
  });
});

test.describe("Pause hands over every tool at once, and Play takes them back at once", () => {
  test("the same set the /properties map has", async ({ page }) => {
    test.setTimeout(180_000);
    // Measured on /properties first, so "all navigation tools" is a
    // comparison with the real thing rather than with a list in this file.
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/properties");
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await expect(page.locator(MAP).first()).toHaveAttribute("data-map-ready", "", {
      timeout: 60_000,
    });
    await expect
      .poll(() => page.evaluate(() => window.__camera?.maps?.length ?? 0))
      .toBeGreaterThan(0);
    const properties = await tools(page);
    expect(properties, "what /properties has").toEqual(ALL_TOOLS);

    await bandUp(page);
    await park(page);
    await pause(page);
    expect(await tools(page), "the paused band's map: the same set").toEqual(properties);
  });

  test("Pause: the wheel zooms and the canvas takes focus; Play: back to a picture", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    await pause(page);
    expect(await canvasState(page)).toEqual({
      tabindex: "0",
      name: expect.stringMatching(/listings, interactive map$/),
      cursor: "grab",
    });
    expect(
      (await walkBack(page)).map((w) => w.at),
      "paused, the walk back stops on the canvas",
    ).toContain("canvas");
    // Let the keyboard's focus scroll finish: a notch that arrives while it is
    // still animating is sent uncancellable, and an uncancellable wheel is the
    // page's by rule (see PropertyMap's wheel latch).
    await park(page);
    await page.mouse.move(2, 2);
    const spot = (await bareSpot(page))!;
    const one = await wheel(page, spot, 1, -120);
    expect(one.zoom, "one notch zoomed the paused map in").toBeGreaterThan(0.06);
    expect(one.page, "and kept the page").toBe(0);
    const five = await wheel(page, spot, 5, -120);
    expect(five.zoom, "five notches").toBeGreaterThan(0.3);
    expect(five.page).toBe(0);

    await page.getByRole("button", { name: "Play slides" }).click();
    await expect(page.getByRole("button", { name: "Pause slides" })).toBeVisible();
    await page.mouse.move(2, 2);
    expect(await tools(page), "Play took every tool back").toEqual([]);
    expect((await canvasState(page)).tabindex).toBeNull();
    await park(page);
    const again = await wheel(page, (await bareSpot(page))!, 1);
    expect(again.page, "and the wheel is the page's again").toBe(120);
    expect(await zoomAtRest(page), "and zoomed nothing").toBeCloseTo(12, 4);
  });

  test("Play ends a drag in progress, and the camera goes back to the slide on screen", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    await pause(page);
    const play = page.getByRole("button", { name: "Play slides" });
    await play.focus();
    const spot = (await bareSpot(page))!;
    await resetCamera(page);

    // Mid-drag, Play by keyboard: the pointer never leaves the map. The
    // press on the canvas takes focus (it is focusable while paused), so Play
    // is focused again before Enter — the drag is maplibre's and does not
    // care where focus is.
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 30, spot.y + 20, { steps: 5 });
    await page.mouse.move(spot.x + 60, spot.y + 40, { steps: 5 });
    // Polled: maplibre applies a drag on its next render frame, and under
    // load that frame can land after a single read (1 in 32 at load ~30).
    // The button is still held, so the drag is still in progress throughout.
    await expect
      .poll(async () => (await cameraLog(page)).movestart, {
        message: "premise: the drag really moved the map",
      })
      .toContain("mousemove");
    await resetCamera(page);
    await play.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Pause slides" })).toBeVisible();
    // The hand keeps going: a locked map must not follow it.
    await page.mouse.move(spot.x + 120, spot.y + 80, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);

    const after = await cameraLog(page);
    expect(after.movestart, "nothing the hand did after Play moved the map").not.toContain(
      "mousemove",
    );
    expect(after.fly.length, "the camera flew back to the slide on screen").toBeGreaterThan(0);
    expect(after.fly.at(-1)!.zoom, "at the frame's own zoom").toBe(12);
    // THE DRAG ENDED: maplibre's drag handler is no longer active, and the
    // camera comes to REST. Polled rather than read once, because after Play
    // the clock resumes where it froze and its next turn's flight can be in
    // the air at any single read — a one-shot `isMoving()` went red 2 times in
    // 16 at load ~50 on exactly that. A stranded gesture never comes to rest;
    // a flight always does.
    expect(
      await page.evaluate(() =>
        (
          window.__camera.maps[0] as unknown as { dragPan: { isActive(): boolean } }
        ).dragPan.isActive(),
      ),
      "the drag is over",
    ).toBe(false);
    expect(await zoomAtRest(page), "and the camera comes to rest at the frame's zoom").toBeCloseTo(
      12,
      4,
    );
    expect(await tools(page)).toEqual([]);
  });

  test("Play ends a wheel's zoom in progress the same way", async ({ page }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    await pause(page);
    const spot = (await bareSpot(page))!;
    await page.mouse.move(spot.x, spot.y);
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Play slides" }).focus();
    await resetCamera(page);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
    const zoomed = await mapZoom(page);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const log = await cameraLog(page);
    expect(zoomed, "premise: the wheel was zooming when Play was pressed").not.toBeCloseTo(12, 3);
    expect(log.fly.length, "the camera went back to the slide").toBeGreaterThan(0);
    expect(
      await page.evaluate(() =>
        (
          window.__camera.maps[0] as unknown as { scrollZoom: { isActive(): boolean } }
        ).scrollZoom.isActive(),
      ),
      "the wheel's zoom is over",
    ).toBe(false);
    // At rest, for the reason the drag case gives.
    expect(await zoomAtRest(page), "at the frame's zoom, not the wheel's").toBeCloseTo(12, 4);
  });

  test("while paused, arrow presses coalesce: no arc abandoned (#127/#128 on the band)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    await pause(page);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(1200);
    await resetCamera(page);
    const next = page.getByRole("button", { name: "Next slide" });
    for (let i = 0; i < 3; i++) {
      await next.click();
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(2000);
    const flights = (await cameraLog(page)).fly;
    expect(flights.length, "the presses were followed").toBeGreaterThan(0);
    const gaps = flights.slice(1).map((f, i) => f.t - flights[i]!.t);
    for (const g of gaps)
      expect(g, "no flight replaced before it landed").toBeGreaterThanOrEqual(CAMERA_FLIGHT_MS);
  });
});

test.describe("the rule is the visitor's pause, not the clock's", () => {
  test("a hidden tab stops the clock and leaves the map locked", async ({ page }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => running(page), { message: "premise: the clock stopped" }).toBe(false);
    expect(await tools(page), "nobody paused the slideshow").toEqual([]);
  });

  test("a pointer resting on the card leaves the map locked, whether or not it stops the clock", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await bandUp(page);
    await park(page);
    const card = (await page.locator(CARD).boundingBox())!;
    await page.mouse.move(card.x + card.width / 2, card.y + 60);
    await page.waitForTimeout(400);
    // On this branch a hover stops the clock; on the branch that stops making
    // it one it does not. The map's answer is the same either way, and which
    // state was measured is recorded rather than required.
    test.info().annotations.push({
      type: "hover-stops-clock",
      description: String(!(await running(page))),
    });
    expect(await tools(page), "a hover is not a pause").toEqual([]);
  });

  test("under reduced motion nothing runs, so the map is interactive from the start", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const page = await reduced(browser);
    try {
      await bandUp(page);
      await park(page);
      await expect(
        page.getByRole("button", { name: /slides$/ }),
        "premise: no Pause, because nothing can run",
      ).toHaveCount(0);
      expect(await tools(page)).toEqual(ALL_TOOLS);
      const spot = (await bareSpot(page))!;
      const one = await wheel(page, spot, 1, -120);
      expect(one.zoom, "the wheel zooms it").toBeGreaterThan(0.06);
      expect(one.page).toBe(0);
    } finally {
      await page.context().close();
    }
  });
});

test.describe("the expand control below lg belongs to the map, not the carousel", () => {
  test("pressing it while the slideshow runs does not pause it, so the map stays a picture", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    try {
      await bandUp(page, { width: 390, height: 844 });
      await park(page, 200);
      const expand = page.locator("[data-map-expand]").first();
      await expand.tap();
      await expect(expand).toHaveAttribute("data-map-expand", "collapse");
      expect(
        await expand.evaluate((el) => !!el.closest("[aria-roledescription='carousel']")),
        "the control is outside the carousel's region",
      ).toBe(false);
      expect(await running(page), "so pressing it is not focus entering the carousel").toBe(true);
      expect(await tools(page), "and the enlarged map is still a picture").toEqual([]);
      // Pause is what unlocks it, enlarged or not.
      await page.getByRole("button", { name: "Pause slides" }).tap();
      await expect(page.getByRole("button", { name: "Play slides" })).toBeVisible();
      expect(await tools(page)).toEqual(ALL_TOOLS);
    } finally {
      await context.close();
    }
  });
});

/** Focus the first tab stop after the band's map and Shift+Tab back through
 *  the map until focus leaves it: what each stop inside the map was, and
 *  whether the slideshow was running while focus sat there. */
async function walkBack(page: Page) {
  await page.evaluate(() => {
    const map = document.querySelector("[data-property-map]")!;
    const stops = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (el) =>
        !map.contains(el) &&
        map.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING &&
        el.getClientRects().length > 0,
    );
    stops[0]!.focus();
  });
  const seen: { at: string; running: boolean }[] = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Shift+Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el?.closest("[data-property-map]")) return null;
      const running =
        document.querySelector("[data-featured-card] [aria-live]")?.getAttribute("aria-live") ===
        "off";
      if (el.matches("canvas")) return { at: "canvas", running };
      if (el.hasAttribute("data-map-link")) return { at: "list link", running };
      if (el.closest(".maplibregl-ctrl-attrib")) return { at: "attribution", running };
      return { at: el.tagName.toLowerCase(), running };
    });
    if (stop === null) {
      if (seen.length) break;
      continue;
    }
    seen.push(stop);
  }
  return seen;
}

/** A page under the fleet's own reduced-motion emulation. */
async function reduced(browser: Browser) {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  return context.newPage();
}

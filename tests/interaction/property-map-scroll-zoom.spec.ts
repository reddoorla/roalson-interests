import { expect, test, type Page } from "@playwright/test";

import { cameraLog, cameraProbeInstalled, mapZoom, resetCamera, watchCamera } from "./camera-probe";
import { hydrated } from "./hydrated";

// THE WHEEL OVER THE MAP ZOOMS THE MAP (operator call, 2026-09-23): "if you
// scroll on the map it should zoom in and out rather than scrolling the whole
// page".
//
// IT IS A REVERSAL. The day before, `scrollZoom` was turned OFF for exactly the
// reason this file measures from the other side: the land map is `lg:sticky`
// for its whole section, so a pointer resting on it cannot scroll the page.
// That trade is the operator's to make. What this file owes them is that the
// thing they asked for actually happens wherever they aim, that the visitor's
// zoom is still theirs after the next card, and that the keyboard is still a
// way out. The trap's own numbers are in the journal entry for this change.
//
// WHY THESE ROUTES. /dev/* 404s on a production build (#120), so every case
// drives `/properties`, which CI serves from the dev server and which runs
// unchanged against the shipped bundle:
//
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test \
//     tests/interaction/property-map-scroll-zoom.spec.ts
//
// EVERY PASS NEEDS AN ARTIFACT ONLY A WORKING WHEEL PRODUCES — the map's own
// zoom, read off maplibre — and "the page did not move" is only ever allowed to
// deny one. That half alone would pass on a map that had crashed, or on a
// canvas that never came up.

// MOTION ALLOWED. The fleet's `playwright-a11y` config sets
// `contextOptions.reducedMotion: "reduce"` on every test, under which
// `cameraMove` answers `jump` for everything. The crossing case below is about
// the FLIGHT the visitor actually sees, so the preference is lifted file-wide —
// except for the keyboard case, which puts it back and says why.
test.use({ contextOptions: { reducedMotion: "no-preference" } });

const MAP = "[data-property-map]";
const PROPERTIES = "/properties";

/** The land map is drawn (maplibre's own `load`) and the probe has adopted
 *  it, so `mapZoom` reads maplibre rather than `undefined`. */
async function landMapUp(page: Page) {
  await watchCamera(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PROPERTIES);
  await hydrated(page);
  await page.locator(MAP).first().scrollIntoViewIfNeeded();
  await expect(page.locator(MAP).first()).toHaveAttribute("data-map-ready", "", {
    timeout: 60_000,
  });
  await expect
    .poll(() => page.evaluate(() => window.__camera?.maps?.length ?? 0), { timeout: 30_000 })
    .toBeGreaterThan(0);
  expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
}

/** Scroll to `y` and let the camera land whatever the centre rule asked of it. */
async function parkAt(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  await page.waitForTimeout(1200);
}

/** The land map's box and the cards column beside it — measured, so a layout
 *  change makes a premise visibly false instead of quietly true. */
const geometry = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-property-map]") as HTMLElement;
    // `:not([data-map-list])` — the map renders its own <ul> of links, so a
    // bare `querySelector("ul")` finds a list INSIDE the map box, and a
    // "control" probed there reads exactly the number the map is accused of.
    const list = el.closest("section")!.querySelector("ul:not([data-map-list])") as HTMLElement;
    const b = el.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    return {
      map: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width },
      cards: { x: (l.left + l.right) / 2, y: window.innerHeight / 2 },
      viewport: window.innerWidth,
      sticky: getComputedStyle(el).position === "sticky",
    };
  });

/** A point on the land map where the BARE CANVAS is what the pointer hits —
 *  not a marker, the expand affordance or the attribution chip. */
const bareSpot = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector("[data-property-map]") as HTMLElement;
    const b = el.getBoundingClientRect();
    const top = Math.max(b.top, 0) + 40;
    const bottom = Math.min(b.bottom, window.innerHeight) - 60;
    for (let y = (top + bottom) / 2, i = 0; i < 40; i++, y += i % 2 ? i * 7 : -i * 7)
      for (let x = (b.left + b.right) / 2, j = 0; j < 20; j++, x += j % 2 ? j * 9 : -j * 9) {
        if (y < top || y > bottom || x < b.left + 30 || x > b.right - 30) continue;
        if (document.elementFromPoint(x, y)?.matches("canvas.maplibregl-canvas")) return { x, y };
      }
    return null;
  });

/** The card crossing the middle of the window, by the page's own geometry. */
const onCentreLine = (page: Page) =>
  page.evaluate(() => {
    const mid = window.innerHeight / 2;
    for (const li of document.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const b = li.getBoundingClientRect();
      if (b.top <= mid && b.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

/** Where the document's scroll ends up after a key: first it has to LEAVE
 *  `from` (a scroll can start late under load, and a helper that only waited
 *  for stillness would read the start as the answer), then it has to stop —
 *  unchanged across 20 consecutive animation frames, ~330ms. Resolves with
 *  wherever it is at `timeout` if either never happens, so a key that does
 *  nothing reads as `from` and fails the caller's assertion honestly. */
async function settled(page: Page, from: number, timeout = 15_000) {
  return page.evaluate(
    ({ from: origin, limit }) =>
      new Promise<number>((resolve) => {
        const end = performance.now() + limit;
        let left = false;
        let last = window.scrollY;
        let still = 0;
        const step = () => {
          const now = window.scrollY;
          if (now !== origin) left = true;
          still = now === last ? still + 1 : 0;
          last = now;
          if ((left && still >= 20) || performance.now() > end) resolve(now);
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    { from, limit: timeout },
  );
}

/** The land map's camera has stopped: centre and zoom unchanged across 400ms.
 *  A marker located while a flight is still landing is somewhere else by the
 *  time the wheel reaches it — measured once in 16 on the dev server. */
async function cameraStill(page: Page) {
  const read = () =>
    page.evaluate(() => {
      const m = window.__camera.maps[0]!;
      const c = m.getCenter();
      return `${c.lng.toFixed(7)},${c.lat.toFixed(7)},${m.getZoom().toFixed(5)}`;
    });
  await expect
    .poll(
      async () => {
        const a = await read();
        await page.waitForTimeout(400);
        return a === (await read());
      },
      { timeout: 20_000, message: "the camera came to rest" },
    )
    .toBe(true);
}

/** `ticks` real 120px wheel notches at (x, y), 130ms apart — inside the
 *  130-220ms a hand turning a wheel produces. Returns what the DOCUMENT and
 *  the MAP each did with them. */
async function wheelAt(page: Page, x: number, y: number, ticks: number, deltaY = 120) {
  const y0 = await page.evaluate(() => window.scrollY);
  const z0 = await mapZoom(page);
  await page.mouse.move(x, y);
  await page.waitForTimeout(150);
  for (let i = 0; i < ticks; i++) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(130);
  }
  await page.waitForTimeout(1200);
  return {
    page: (await page.evaluate(() => window.scrollY)) - y0,
    zoom: (await mapZoom(page)) - z0,
  };
}

test.describe("the wheel over the map zooms the map", () => {
  test("five ticks over the pinned map zoom it and leave the page where it was", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await landMapUp(page);
    await parkAt(page, 2400);
    const g = await geometry(page);

    // THE PREMISE: the obstacle is real and it is pinned.
    expect(g.sticky, "the map really is pinned here").toBe(true);
    expect(g.map.width / g.viewport, "and it really is ~27% of the viewport").toBeGreaterThan(0.2);

    // THE CONTROL FIRST, on a camera nobody has touched: it says what this
    // page's scroll does when nothing is in the way, so "both were zero"
    // cannot read as a pass. First because five notches over the cards cross
    // cards, and a crossing flies the camera — after a zoom over the map it
    // would fly at the visitor's zoom, and the control's zoom would be telling
    // us about that instead of about the wheel.
    const onCards = await wheelAt(page, g.cards.x, g.cards.y, 5);
    expect(onCards.page, "the control really scrolls, a notch at a time").toBe(600);
    expect(onCards.zoom, "and scrolling the cards does not zoom the map").toBeCloseTo(0, 3);

    await parkAt(page, 2400);
    const spot = await bareSpot(page);
    expect(spot, "a patch of bare canvas to wheel over").not.toBeNull();
    const onMap = await wheelAt(page, spot!.x, spot!.y, 5);

    // THE PASS IS THE ZOOM. Five 120px notches out are about -0.9 at
    // maplibre's own rate (-0.1796 a notch, measured); the floor is a third of
    // that, so a rate change does not red this and a map that never zoomed
    // cannot green it.
    expect(onMap.zoom, "the wheel really zoomed the map out").toBeLessThan(-0.3);
    // THE TRADE, as a number rather than a caveat.
    expect(onMap.page, "and the page did not move under the pointer").toBe(0);
  });

  test("a wheel aimed at a MARKER zooms the map, not the page", async ({ page }) => {
    test.setTimeout(180_000);
    await landMapUp(page);
    await parkAt(page, 2400);

    // THE MARKERS ARE HOLES IN THE MAP unless `forwardWheel` fills them:
    // maplibre listens on its canvas container, and every marker is a
    // `pointer-events-auto` <button> outside it. So this records, for the one
    // real notch sent, what it landed on and whether anything took it from the
    // page — read on `window` at the end of the bubble, after every listener
    // on the way has had its say.
    await page.evaluate(() => {
      const w = window as unknown as { __wheels: { onMarker: boolean; prevented: boolean }[] };
      w.__wheels = [];
      window.addEventListener(
        "wheel",
        (e) => {
          if (!e.isTrusted) return; // the re-dispatch is ours; count the visitor's
          const t = e.target instanceof Element ? e.target : null;
          w.__wheels.push({
            onMarker: !!t?.closest("[data-map-pin],[data-map-cluster]"),
            prevented: e.defaultPrevented,
          });
        },
        { passive: true },
      );
    });

    await cameraStill(page);
    const target = await page.evaluate(() => {
      const map = document.querySelector("[data-property-map]") as HTMLElement;
      const m = map.getBoundingClientRect();
      for (const marker of map.querySelectorAll<HTMLElement>("[data-map-pin],[data-map-cluster]")) {
        const b = marker.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 3;
        if (y < Math.max(m.top, 0) + 10 || y > Math.min(m.bottom, window.innerHeight) - 10)
          continue;
        if (document.elementFromPoint(x, y)?.closest("[data-map-pin],[data-map-cluster]"))
          return { x, y };
      }
      return null;
    });
    expect(target, "a marker on screen, and the probe point is really ON it").not.toBeNull();

    const onMarker = await wheelAt(page, target!.x, target!.y, 1);
    const wheels = await page.evaluate(
      () =>
        (window as unknown as { __wheels: { onMarker: boolean; prevented: boolean }[] }).__wheels,
    );
    expect(wheels, "exactly one real notch was sent").toHaveLength(1);
    expect(wheels[0]!.onMarker, "and it landed on the marker, not the canvas").toBe(true);
    expect(wheels[0]!.prevented, "and the page did not get to keep it").toBe(true);
    // One notch is -0.1796 at maplibre's rate; anything past a third of that
    // is a zoom, and zero is the defect.
    expect(onMarker.zoom, "the notch on the marker zoomed the map").toBeLessThan(-0.06);
    expect(onMarker.page, "and did not scroll the page past it").toBe(0);
  });
});

// ---------------------------------------------------------------------------
// THE KEYBOARD IS STILL THE WAY OUT
// ---------------------------------------------------------------------------

test.describe("the keyboard is not the map's", () => {
  // REDUCED MOTION, ON PURPOSE, and against this file's own default. This case
  // makes no claim about motion — it asks whether the keys reach the document
  // — and with motion allowed it measured Chromium rather than the map. The
  // first version pressed End the moment PageDown had gone 300px, mid-
  // animation, and was 11/16: the End was dropped and the page stopped at
  // PageDown's own target, 3160. Waiting for each scroll to settle (`settled`)
  // fixed that and left a second loss, diagnosed with a `keydown` listener on
  // `window` and a CONTROL off the map, 16 runs each, production build:
  //
  //   motion allowed, focus on <body>:   pointer on map 16/16   on cards 13/16
  //   reduced motion, focus on <body>:   pointer on map 16/16   on cards 16/16
  //   reduced motion, dev server:        focus in canvas 15/16  on a card link 15/16
  //
  // In every loss the key ARRIVED, `defaultPrevented: false`, and the page did
  // not move for 8-10s; both reduced-motion losses were in the same window, at
  // load 27.6 on an 8-core machine. It is not the map — the control lost as
  // often — and nothing on /properties scrolls programmatically on a key.
  //
  // SO THE CLAIM IS SPLIT, and only one half is allowed any slack. "The key
  // reached the document and nothing on the way prevented it" is the half the
  // map could break, and it is asserted strictly on every press. "The
  // document then scrolled" is the half Chromium loses under starvation, and
  // it gets ONE re-press, recorded as a `key-retried` annotation so a repeat
  // run can count how often that happened rather than hide it.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  /** Press `key` and return where the document's scroll settles. */
  async function press(page: Page, key: string, from: number) {
    for (let attempt = 1; ; attempt++) {
      await page.evaluate(() => {
        const w = window as unknown as { __keydown: boolean[] };
        w.__keydown = [];
        window.addEventListener("keydown", (e) => w.__keydown.push(e.defaultPrevented), {
          once: true,
        });
      });
      await page.keyboard.press(key);
      expect(
        await page.evaluate(() => (window as unknown as { __keydown: boolean[] }).__keydown),
        `${key} reached the document, and nothing on the way prevented it`,
      ).toEqual([false]);
      const at = await settled(page, from, 6_000);
      if (at !== from || attempt === 2) {
        if (attempt === 2) test.info().annotations.push({ type: "key-retried", description: key });
        return at;
      }
    }
  }

  test("the keyboard still scrolls the page, pointer on the map or focus in it", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await landMapUp(page);
    await parkAt(page, 2400);

    // The keyboard is the way out of the trap the wheel now sets, so it is
    // held by a test rather than by an argument. maplibre's keyboard handler
    // answers + - and the arrows and returns for anything else without
    // preventing it (its `default: return`), so PageDown and End belong to the
    // document even with the canvas focused — which is the second half, and
    // the one a visitor who clicked the map is actually in.
    const spot = await bareSpot(page);
    expect(spot, "a patch of bare canvas to rest the pointer on").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await page.waitForTimeout(150);

    const start = await page.evaluate(() => window.scrollY);
    const paged = await press(page, "PageDown", start);
    expect(paged, "PageDown scrolled the page").toBeGreaterThan(start + 300);
    const foot = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(await press(page, "End", paged), "and End took it to the foot").toBe(foot);

    // Now IN the map: a click on the canvas gives it focus (maplibre makes it
    // tabbable), and the same key must still reach the page.
    await parkAt(page, 2400);
    const again = await bareSpot(page);
    expect(again, "bare canvas to click").not.toBeNull();
    await page.mouse.click(again!.x, again!.y);
    expect(
      await page.evaluate(() => document.activeElement?.matches("canvas.maplibregl-canvas")),
      "the click really put focus in the map",
    ).toBe(true);
    const inMap = await page.evaluate(() => window.scrollY);
    expect(
      await press(page, "PageDown", inMap),
      "PageDown from inside the map scrolled the page",
    ).toBeGreaterThan(inMap + 300);
  });
});

// ---------------------------------------------------------------------------
// THE VISITOR'S ZOOM SURVIVES THE NEXT CARD
// ---------------------------------------------------------------------------

test.describe("a zoom the wheel chose is still the visitor's after the next card", () => {
  // Measured on a production build before `chosenZoom`: five notches in took
  // the land map from z12 to z12.8979, the visitor scrolled on to the next
  // listing, and the camera flew there at z12 — the zoom was gone at the first
  // card they crossed. The flight going was right (the crossing is the visitor
  // asking for somewhere else); it was going at the frame's zoom, not theirs.
  test("the crossing flies to the next listing at the visitor's zoom", async ({ page }) => {
    test.setTimeout(180_000);
    await landMapUp(page);
    await parkAt(page, 2400);

    const first = await onCentreLine(page);
    expect(first, "a listing is on the centre line to start from").not.toBeNull();
    const before = await mapZoom(page);

    const spot = await bareSpot(page);
    expect(spot, "bare canvas to wheel over").not.toBeNull();
    const zoomIn = await wheelAt(page, spot!.x, spot!.y, 5, -120);
    const chosen = await mapZoom(page);
    expect(zoomIn.zoom, `the wheel really zoomed in (${before} -> ${chosen})`).toBeGreaterThan(0.3);
    expect(await onCentreLine(page), "and the page stayed on the same listing").toBe(first);

    // THE CROSSING. The pointer has to leave the map to scroll the page at
    // all — that is the trap, recorded here as a fact of the procedure.
    await resetCamera(page);
    const g = await geometry(page);
    await page.mouse.move(g.cards.x, g.cards.y);
    for (let i = 0; i < 12 && (await onCentreLine(page)) === first; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(160);
    }
    const next = await onCentreLine(page);
    expect(next, "the page really reached a different listing").not.toBe(first);
    expect(next, "and one that is on the centre line").not.toBeNull();
    await page.waitForTimeout(1500);

    // POSITIVE EVIDENCE THE CAMERA FOLLOWED — a flight, not a map that simply
    // never moved again (which would also "keep" the zoom).
    const log = await cameraLog(page);
    expect(log.fly.length, "the camera followed the page to the new listing").toBeGreaterThan(0);
    for (const f of log.fly)
      expect(f.zoom, "every flight after the crossing is at the visitor's zoom").toBeCloseTo(
        chosen,
        3,
      );
    expect(await mapZoom(page), "and that is where the map ended up").toBeCloseTo(chosen, 3);
  });
});

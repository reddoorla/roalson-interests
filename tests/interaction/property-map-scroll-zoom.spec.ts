import { expect, test, type CDPSession, type Page } from "@playwright/test";

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
/** `CAMERA_FLIGHT_MS` from $lib/property-map, repeated for the reason
 *  property-map-camera-prod.spec.ts gives: a Playwright spec does not resolve
 *  `$lib`, and property-map.test.ts pins the source at 500. */
const CAMERA_FLIGHT_MS = 500;

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

// ---------------------------------------------------------------------------
// …AND THE ZOOM CARRIED IS ONE THE VISITOR CHOSE, ON A LISTING
// ---------------------------------------------------------------------------
//
// Verification of #150 on the integrated tree found three ways the number
// carried was not that. Each case below reproduces one on /properties at
// 1440x900 and reads maplibre's own answers, and each asserts its PREMISE —
// that the page really was in the state the finding names — before its claim,
// so a run in which the premise did not happen fails rather than passing on a
// state nobody asked about. The two that race a real flight or a real ease try
// up to three times and record which attempt the premise held on.

/** Put the next listing of `id`'s own section on the centre line, instantly —
 *  a crossing with no wheel in it, so nothing here can be filed as a scroll
 *  the map was in. Answers the listing it scrolled to. */
const crossToNext = (page: Page, id: string | null) =>
  page.evaluate((current) => {
    const all = [...document.querySelectorAll<HTMLElement>("[data-centre-id]")];
    const from = all.find((li) => li.dataset.centreId === current);
    if (!from) return null;
    const own = all.filter((li) => li.closest("section") === from.closest("section"));
    const next = own[own.indexOf(from) + 1];
    if (!next) return null;
    const b = next.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + b.top + b.height / 2 - window.innerHeight / 2,
      behavior: "instant",
    });
    return next.dataset.centreId ?? null;
  }, id);

/** From here on, every `zoomend` the land map fires — its zoom, and the time
 *  on the camera probe's own clock, so it can be put beside a command's `t`. */
const recordZoomends = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __zoomends: { t: number; zoom: number }[] };
    w.__zoomends = [];
    const m = window.__camera.maps[0]!;
    m.on("zoomend", () =>
      w.__zoomends.push({ t: performance.now() - window.__camera.t0, zoom: m.getZoom() }),
    );
  });
const zoomends = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __zoomends: { t: number; zoom: number }[] }).__zoomends,
  );
const clearZoomends = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __zoomends: unknown[] }).__zoomends.length = 0;
  });

test.describe("the zoom carried is one the visitor chose, on a listing", () => {
  test("a zoom chosen on the overview is not carried to the first listing", async ({ page }) => {
    // THE MAJOR. At 1440x900 the land map is drawn at load on MAP_HOME with
    // no listing active; five notches out over it recorded z7.7021, and the
    // first listing the visitor then scrolled to flew at z7.7021 instead of
    // z12 — as did every one after. With 5 notches in it was 9.4979.
    test.setTimeout(240_000);
    // AT LOAD, NOT AFTER A SCROLL. The centre rule holds the last card it
    // reported rather than clearing it ("nothing on the line means hold",
    // centreWatch.ts), so the only time /properties has NO active listing is
    // before the first card has crossed the line — and at 1440x900 the land
    // map is already drawn then: 384px of its 595 are on screen at scrollY 0,
    // past the half its boot waits for. `landMapUp` scrolls it into view, so
    // it is not used here.
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await expect(page.locator(MAP).first()).toHaveAttribute("data-map-ready", "", {
      timeout: 60_000,
    });
    await expect
      .poll(() => page.evaluate(() => window.__camera?.maps?.length ?? 0), { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
    expect(await page.evaluate(() => window.scrollY), "premise: at the top").toBe(0);
    expect(await onCentreLine(page), "premise: no listing is active at the top").toBeNull();
    await cameraStill(page);
    const overview = await mapZoom(page);
    expect(overview, "premise: the map shows the overview, not a listing").toBeLessThan(11);

    const spot = await bareSpot(page);
    expect(spot, "bare canvas to wheel over").not.toBeNull();
    const out = await wheelAt(page, spot!.x, spot!.y, 5);
    expect(out.zoom, "premise: the wheel really zoomed the overview out").toBeLessThan(-0.3);
    expect(out.page, "and the page stayed put").toBe(0);

    // THE CROSSING, by the visitor's own wheel over the cards.
    await resetCamera(page);
    const g = await geometry(page);
    await page.mouse.move(g.cards.x, g.cards.y);
    for (let i = 0; i < 40 && (await onCentreLine(page)) === null; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(160);
    }
    expect(await onCentreLine(page), "the page reached a listing").not.toBeNull();
    await page.waitForTimeout(1500);

    const log = await cameraLog(page);
    expect(log.fly.length, "the camera flew to it").toBeGreaterThan(0);
    for (const f of log.fly)
      expect(f.zoom, `at the listing's own zoom, not the overview's ${overview + out.zoom}`).toBe(
        12,
      );
    expect(await mapZoom(page), "and that is where the map is").toBeCloseTo(12, 3);
  });

  test("a wheel that stops the crossing's flight carries the listing's zoom plus its own, not the arc's", async ({
    page,
  }) => {
    // From z12 at rest, a crossing's flight was stopped mid-arc by three
    // notches IN and the carried zoom came out at 11.3963 (combined) and
    // 11.6842 (branch alone) — further out than where the visitor started.
    test.setTimeout(300_000);
    await landMapUp(page);
    await parkAt(page, 2400);
    await cameraStill(page);
    const spot = await bareSpot(page);
    expect(spot, "bare canvas to wheel over").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await recordZoomends(page);
    // When the first real notch reached the page, on the probe's clock. (Not
    // `map.isEasing()`, which a production build does not expose — the first
    // version of this case read `undefined` there and threw inside the
    // listener, so every attempt looked like a notch that never came.)
    await page.evaluate(() => {
      const w = window as unknown as { __firstNotch: number | null };
      w.__firstNotch = null;
      window.addEventListener(
        "wheel",
        (e) => {
          if (e.isTrusted && w.__firstNotch === null)
            w.__firstNotch = performance.now() - window.__camera.t0;
        },
        { capture: true, passive: true },
      );
    });

    let from = await onCentreLine(page);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await cameraStill(page);
      await resetCamera(page);
      await clearZoomends(page);
      await page.evaluate(() => {
        (window as unknown as { __firstNotch: unknown }).__firstNotch = null;
      });
      // Quiet first, so the notches below begin a scroll of their own over
      // the map (`WHEEL_QUIET_MS`).
      await page.waitForTimeout(700);
      const next = await crossToNext(page, from);
      expect(next, "a next listing to cross to").not.toBeNull();
      await expect
        .poll(async () => (await cameraLog(page)).fly.length, { timeout: 5000 })
        .toBeGreaterThan(0);
      await page.waitForTimeout(100);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(1500);
      from = next;

      const flight = (await cameraLog(page)).fly[0]!;
      const ends = await zoomends(page);
      const firstNotch = await page.evaluate(
        () => (window as unknown as { __firstNotch: number | null }).__firstNotch,
      );
      // THE PREMISE, in two halves. The first notch reached the page inside
      // the flight's 500ms; and the flight ENDED OFF ITS TARGET — the first
      // `zoomend` after a `flyTo` is that flight's own, and a flight that
      // lands ends exactly on the zoom it was given.
      const stopped = ends[0];
      if (
        firstNotch === null ||
        firstNotch - flight.t >= CAMERA_FLIGHT_MS ||
        !stopped ||
        Math.abs(stopped.zoom - flight.zoom!) < 0.01
      ) {
        test.info().annotations.push({
          type: "flight-not-stopped",
          description: `attempt ${attempt}: flight z${flight.zoom} at t${flight.t.toFixed(0)}, first notch at t${firstNotch?.toFixed(0)}, zoomends ${JSON.stringify(ends)}`,
        });
        continue;
      }
      const rest = await mapZoom(page);
      const wheeled = rest - stopped.zoom;
      expect(wheeled, "premise: the three notches zoomed IN from the arc").toBeGreaterThan(0.2);
      const carried = flight.zoom! + wheeled;
      test.info().annotations.push({
        type: "stopped-flight",
        description: `attempt ${attempt}: flight to z${flight.zoom} stopped at z${stopped.zoom.toFixed(4)}, rest z${rest.toFixed(4)}, carried ${carried.toFixed(4)}`,
      });

      await resetCamera(page);
      expect(await crossToNext(page, next), "a listing after that one").not.toBeNull();
      await page.waitForTimeout(1500);
      const after = await cameraLog(page);
      expect(after.fly.length, "the next crossing flew").toBeGreaterThan(0);
      for (const f of after.fly)
        expect(
          f.zoom,
          `the listing's z${flight.zoom} plus the wheel's ${wheeled.toFixed(4)}, not the arc's rest z${rest.toFixed(4)}`,
        ).toBeCloseTo(carried, 3);
      expect(carried, "closer than the listing's own zoom — the visitor zoomed in").toBeGreaterThan(
        flight.zoom!,
      );
      return;
    }
    throw new Error("no attempt reached the flight while it was in the air (see annotations)");
  });

  test("a crossing while the wheel's zoom is still easing waits for it, and flies at the zoom it settled on", async ({
    page,
  }) => {
    // Three notches in, 30ms apart, then the page moved on at once: the zoom
    // was 12.3457 at the crossing, never recorded, and the flight went at 12.
    test.setTimeout(300_000);
    await landMapUp(page);
    await parkAt(page, 2400);
    const spot = await bareSpot(page);
    expect(spot, "bare canvas to wheel over").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await recordZoomends(page);

    let from = await onCentreLine(page);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await cameraStill(page);
      await resetCamera(page);
      await clearZoomends(page);
      await page.waitForTimeout(700);
      const z0 = await mapZoom(page);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(30);
      }
      // The crossing, in the same task as the read that proves the wheel's
      // ease was still running when it happened.
      const at = await page.evaluate(
        ({ current }) => {
          const m = window.__camera.maps[0]!;
          const easing = m.scrollZoom.isActive();
          const zoom = m.getZoom();
          const all = [...document.querySelectorAll<HTMLElement>("[data-centre-id]")];
          const f = all.find((li) => li.dataset.centreId === current)!;
          const own = all.filter((li) => li.closest("section") === f.closest("section"));
          const next = own[own.indexOf(f) + 1]!;
          const b = next.getBoundingClientRect();
          window.scrollTo({
            top: window.scrollY + b.top + b.height / 2 - window.innerHeight / 2,
            behavior: "instant",
          });
          return {
            easing,
            zoom,
            t: performance.now() - window.__camera.t0,
            next: next.dataset.centreId ?? null,
          };
        },
        { current: from },
      );
      await page.waitForTimeout(1500);
      from = at.next;
      if (!at.easing) {
        test.info().annotations.push({
          type: "ease-over-before-crossing",
          description: `attempt ${attempt}: z${z0} -> z${at.zoom} at the crossing`,
        });
        continue;
      }
      const flight = (await cameraLog(page)).fly[0];
      const ends = await zoomends(page);
      test.info().annotations.push({
        type: "crossing",
        description: `attempt ${attempt}: z${z0.toFixed(4)}, crossing at t${at.t.toFixed(0)} z${at.zoom.toFixed(4)}; zoomends ${JSON.stringify(ends)}; flight ${JSON.stringify(flight)}`,
      });
      expect(flight, "the crossing flew").toBeDefined();
      const settledEnd = ends.filter((e) => e.t <= flight!.t).at(-1);
      expect(settledEnd, "the wheel's own zoom ended before the flight left").toBeDefined();
      // THE PREMISE, read after the fact: the zoom the wheel settled on is
      // past the one on screen at the crossing, so the ease was still MOVING
      // then — and its end, 200ms after it stops moving, was further off.
      if (settledEnd!.zoom <= at.zoom + 0.005) {
        test.info().annotations.push({
          type: "ease-still-at-crossing",
          description: `attempt ${attempt}: the zoom had stopped moving by the crossing`,
        });
        continue;
      }
      expect(flight!.zoom, "the flight went at the zoom the wheel settled on").toBeCloseTo(
        settledEnd!.zoom,
        3,
      );

      await resetCamera(page);
      expect(await crossToNext(page, at.next), "a listing after that one").not.toBeNull();
      await page.waitForTimeout(1500);
      const after = await cameraLog(page);
      expect(after.fly.length, "the next crossing flew").toBeGreaterThan(0);
      for (const f of after.fly)
        expect(f.zoom, "and so did the one after it").toBeCloseTo(settledEnd!.zoom, 3);
      return;
    }
    throw new Error("no attempt crossed while the wheel's ease was running (see annotations)");
  });
});

// ---------------------------------------------------------------------------
// THE WHEEL STAYS WITH WHAT THE SCROLL STARTED ON
// ---------------------------------------------------------------------------
//
// Operator call, 2026-09-23, choosing the mitigation this PR's first half
// recommended. Measured on a production build before it, 1440x900, the
// pointer resting on the land map's column and a run of 120px notches from
// scrollY 0: the page stopped at 480 with the pointer at y 150, at 120 at
// y 405 — the notch after the pinned map slid under a pointer that had not
// moved went to the map, which zoomed and kept every notch after. The rule
// (`wheelRun`, $lib/property-map) files every wheel into a run, and a run is
// the map's only if it BEGAN over the map; a new run needs `WHEEL_QUIET_MS`
// (500) of silence or the pointer moving more than `WHEEL_SLOP_PX` (10).
//
// THE NOTCHES HERE CARRY THEIR OWN CLOCK. Each is a CDP `mouseWheel` with an
// explicit `timestamp`, and Chromium stamps the DOM event's `timeStamp` from it
// — measured: three notches sent 700ms and then ~0ms apart in wall time, with
// timestamps 0.13s and 0.87s apart, arrived 130 and 870 apart. So "130ms
// between notches" and "600ms of quiet" are what the page's rule sees whatever
// the machine's load does to the real gaps, and none of these cases can pass
// or fail on a slow runner's timing.

/** One scroll of `n` notches at (x, y), `gapS` seconds apart on the EVENT
 *  clock, starting at `from` (seconds since the epoch). The real wait between
 *  notches is only there so the page's own scroll keeps up with the hand.
 *  Returns the event time of the last notch. */
async function notches(
  page: Page,
  cdp: CDPSession,
  at: { x: number; y: number },
  n: number,
  from: number,
  { gapS = 0.13, deltaY = 120 } = {},
) {
  let t = from;
  for (let i = 0; i < n; i++) {
    t = from + i * gapS;
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: at.x,
      y: at.y,
      deltaX: 0,
      deltaY,
      timestamp: t,
    });
    await page.waitForTimeout(90);
  }
  return t;
}

/** Record, for every real wheel from here on, whether it landed inside the
 *  land map and whether anything took it from the page — read from a
 *  `window` CAPTURE listener (the first to see it; a bubble one would miss
 *  exactly the wheels the rule withholds) and settled a task later, once
 *  dispatch is over. */
const recordWheels = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __wheels: { onMap: boolean; prevented: boolean }[] };
    w.__wheels = [];
    window.addEventListener(
      "wheel",
      (e) => {
        if (!e.isTrusted) return;
        const onMap = !!(e.target as Element | null)?.closest?.("[data-property-map]");
        setTimeout(() => w.__wheels.push({ onMap, prevented: e.defaultPrevented }), 0);
      },
      { capture: true, passive: true },
    );
  });
const wheelsSeen = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __wheels: { onMap: boolean; prevented: boolean }[] }).__wheels,
  );

test.describe("the wheel stays with the scroll it started in", () => {
  test("a scroll begun above the map runs to the foot of the page, the map sliding under it", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await landMapUp(page);
    const g = await geometry(page);
    const x = (g.map.left + g.map.right) / 2;
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(800);
    // THE PREMISE: at the top of the page the pointer is on the PAGE, above
    // the map's column (the map is pinned 100px from the top once it arrives,
    // so y 150 is where it will be).
    const y = 150;
    expect(
      await page.evaluate(
        (p) => !!document.elementFromPoint(p.x, p.y)?.closest("[data-property-map]"),
        { x, y },
      ),
      "the scroll begins with the pointer off the map",
    ).toBe(false);
    await page.mouse.move(x, y);
    await recordWheels(page);
    const z0 = await mapZoom(page);
    const foot = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );

    const cdp = await page.context().newCDPSession(page);
    let t = Date.now() / 1000;
    for (let i = 0; i < 90 && (await page.evaluate(() => window.scrollY)) < foot; i++)
      t = (await notches(page, cdp, { x, y }, 1, t + 0.13)) as number;
    await page.waitForTimeout(1000);

    const wheels = await wheelsSeen(page);
    const onMap = wheels.filter((w) => w.onMap);
    // The map really did arrive under the still pointer — without this the
    // case could pass on a layout where it never does.
    expect(onMap.length, `notches that landed ON the map (${wheels.length} sent)`).toBeGreaterThan(
      5,
    );
    expect(
      onMap.filter((w) => w.prevented).length,
      "and none of them was taken from the page",
    ).toBe(0);
    // THE PASS: the page reached its foot. Before the rule it stopped at 480.
    expect(await page.evaluate(() => window.scrollY), "the scroll reached the foot").toBe(foot);
    expect(await mapZoom(page), "and the map it passed over never zoomed").toBeCloseTo(z0, 4);
  });

  // THE RACE THE FIRST NOTCH RUNS. Over the page Chromium sends a wheel
  // uncancellable and scrolls at once; the DOM target is hit-tested after that
  // scroll has begun. With the pointer one notch above where the map will be,
  // the FIRST notch arrived on the map in 6 of 8 production runs — sent at
  // scrollY 0, dispatched at 120 — and was filed as a scroll begun there; the
  // page then stopped at 120. An uncancellable wheel is now the page's.
  test("a scroll begun one notch above the map is not handed to it by the first notch's race", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await landMapUp(page);
    const g = await geometry(page);
    const x = (g.map.left + g.map.right) / 2;
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(800);
    const mapTop = await page.evaluate(
      () => document.querySelector("[data-property-map]")!.getBoundingClientRect().top,
    );
    // 110px above the map's top: off it now, 10px inside it after one notch.
    const y = Math.round(mapTop - 110);
    expect(y, "premise: there is page above the map to start on").toBeGreaterThan(100);
    await page.mouse.move(x, y);
    await recordWheels(page);
    const foot = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    const cdp = await page.context().newCDPSession(page);
    let t = Date.now() / 1000;
    for (let i = 0; i < 90 && (await page.evaluate(() => window.scrollY)) < foot; i++)
      t = await notches(page, cdp, { x, y }, 1, t + 0.13);
    await page.waitForTimeout(1000);
    const wheels = await wheelsSeen(page);
    expect(wheels.filter((w) => w.onMap).length, "notches that landed on the map").toBeGreaterThan(
      5,
    );
    expect(wheels.filter((w) => w.prevented).length, "none of them was the map's").toBe(0);
    expect(await page.evaluate(() => window.scrollY), "the scroll reached the foot").toBe(foot);
  });

  test("the same still pointer, after 600ms of quiet, zooms the map it is now over", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await landMapUp(page);
    const g = await geometry(page);
    const x = (g.map.left + g.map.right) / 2;
    const y = 300;
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(800);
    await page.mouse.move(x, y);
    const cdp = await page.context().newCDPSession(page);

    // Scroll the page until the map is under the pointer and has been for a
    // while: the notches that landed on it went to the page.
    let t = Date.now() / 1000;
    t = await notches(page, cdp, { x, y }, 20, t);
    await page.waitForTimeout(800);
    const under = await page.evaluate(
      (p) => !!document.elementFromPoint(p.x, p.y)?.closest("[data-property-map]"),
      { x, y },
    );
    expect(under, "premise: the map is under the pointer now").toBe(true);
    const y0 = await page.evaluate(() => window.scrollY);
    expect(y0, "and the page got there by the wheel").toBeGreaterThan(1000);

    // A new scroll: same place, 600ms after the last notch.
    const z0 = await mapZoom(page);
    await notches(page, cdp, { x, y }, 5, t + 0.6, { deltaY: -120 });
    await page.waitForTimeout(1200);
    expect((await mapZoom(page)) - z0, "the new scroll zoomed the map").toBeGreaterThan(0.3);
    expect((await page.evaluate(() => window.scrollY)) - y0, "and kept the page").toBe(0);
  });

  test("moving onto the map starts a new scroll at once — no quiet needed", async ({ page }) => {
    test.setTimeout(240_000);
    await landMapUp(page);
    await parkAt(page, 2400);
    const g = await geometry(page);
    const spot = await bareSpot(page);
    expect(spot, "bare canvas to move onto").not.toBeNull();
    const cdp = await page.context().newCDPSession(page);

    await page.mouse.move(g.cards.x, g.cards.y);
    const t = await notches(page, cdp, g.cards, 3, Date.now() / 1000);
    await page.waitForTimeout(600);
    const y0 = await page.evaluate(() => window.scrollY);
    expect(y0, "premise: the cards' notches scrolled the page").toBeGreaterThan(2400);
    const z0 = await mapZoom(page);

    // 130ms after the last card notch on the event clock: well inside the
    // quiet, so only the MOVE can make this a new scroll.
    await page.mouse.move(spot!.x, spot!.y, { steps: 4 });
    await notches(page, cdp, spot!, 5, t + 0.13, { deltaY: -120 });
    await page.waitForTimeout(1200);
    expect((await mapZoom(page)) - z0, "the wheel on the map zoomed it").toBeGreaterThan(0.3);
    expect((await page.evaluate(() => window.scrollY)) - y0, "and kept the page").toBe(0);
  });
});

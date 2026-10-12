import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { cameraProbeInstalled, mapZoom, watchCamera } from "./camera-probe";
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
});

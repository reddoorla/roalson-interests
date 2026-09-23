import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cameraLog,
  cameraMovesFor,
  cameraProbeInstalled,
  mapNamed,
  mapZoom,
  resetCamera,
  watchCamera,
  type CameraLog,
} from "./camera-probe";
import { FEATURED_LAP } from "./featured-dwell";
import { hydrated } from "./hydrated";
import { placedPin } from "./placed-markers";

/** `CAMERA_FLIGHT_MS` from $lib/property-map, repeated rather than imported: a
 *  Playwright spec is transformed by Playwright and does not resolve `$lib`.
 *  property-map.test.ts pins the source at 500 ("flies for as long as the
 *  homepage band's own dissolve"), so a change there fails a unit test before
 *  it can quietly weaken the floor below. */
const CAMERA_FLIGHT_MS = 500;

// THE CAMERA, ON THE SITE'S OWN ROUTES (#118 review).
//
// WHY A SECOND FILE AND NOT MORE CASES IN property-map-camera.spec.ts. That
// file measures /dev/properties and /dev/home — the real components over
// fixture data, hermetic, which is the right default and is why it stays. But
// /dev/* routes 404 on a production build (issue #120), so nothing in it can
// ever run against the shipped bundle, and that is not a theoretical gap: all
// three majors this file exists for were reported FIXED on the strength of
// measurements taken there, and independent verification found all three alive
// on a production build of `/` and `/properties`.
//
// So every case below drives a route the site really serves. Run it either way:
//
//   pnpm exec playwright test tests/interaction/property-map-camera-prod.spec.ts
//   REDDOOR_GATE_SERVER=preview pnpm exec playwright test tests/interaction/property-map-camera-prod.spec.ts
//
// The second builds the site and serves the real bundle. Both were run for the
// PR that added this file; the numbers in the comments below are the
// production-build ones.
//
// NOTHING HERE HARD-CODES A LISTING. The ids on these routes are Prismic
// document ids from the live repository, so every case discovers the cards and
// pins it drives from the DOM. What it may assume is the SHAPE the page
// promises: a land section and an improved section, each with cards and a map.
//
// EVERY CASE LIFTS THE FLEET'S REDUCED-MOTION EMULATION, and that is not
// optional decoration. `playwright-a11y` sets `contextOptions.reducedMotion:
// "reduce"` on every test; app.css turns that into `scroll-behavior: auto
// !important`, so a smooth scroll lands in ONE frame, no card between here and
// there is ever crossed, and `cameraMove` answers `jump` for everything. The
// entire defect class below is structurally unobservable that way — which is
// exactly how it shipped.

const PROPERTIES = "/properties";
const HOME = "/";
const MAP = "[data-property-map]";

/** MapLibre's own `load` has fired for the nth map on the page. */
const drawn = (page: Page, nth = 0) =>
  expect(page.locator(MAP).nth(nth)).toHaveAttribute("data-map-ready", "", { timeout: 45_000 });

/** A point in the middle of the map's box AND inside the window — the two are
 *  not the same thing once the box is 520px tall on an 844px phone, and a
 *  `mouse.move` to a y below the viewport is clamped somewhere else entirely.
 *  A first version of the band cases wheeled at such a point and measured a map
 *  that never saw a wheel: zoom 12 before and 12 after, reported as a fix. */
const wheelSpot = (page: Page) =>
  page
    .locator(MAP)
    .first()
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      const top = Math.max(b.top, 0);
      const bottom = Math.min(b.bottom, window.innerHeight);
      return { x: b.left + b.width / 2, y: (top + bottom) / 2, height: bottom - top };
    });

/** A point inside the first map's box that is NOT a marker or a control.
 *  Markers are <button>s and swallow the pointerdown, which is how a first
 *  attempt at a drag test measured nothing and drew a conclusion from it. */
const bareSpot = (page: Page) =>
  page
    .locator(MAP)
    .first()
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      const floor = Math.min(box.bottom, window.innerHeight);
      for (let y = Math.max(box.top, 0) + 30; y < floor - 60; y += 20)
        for (let dx = 30; dx < box.width - 40; dx += 20) {
          const x = box.left + dx;
          const hit = document.elementFromPoint(x, y);
          if (
            hit &&
            !hit.closest("[data-map-pin],[data-map-cluster],[data-map-expand],.maplibregl-ctrl") &&
            el.contains(hit)
          )
            return { x, y };
        }
      return null;
    });

const land = (page: Page) => page.locator("section[aria-labelledby='listing-land']");
const improved = (page: Page) => page.locator("section[aria-labelledby='listing-improved']");

/** The card `data-centre-id` crossing the middle of the window, by the page's
 *  own geometry rather than by asking the component. */
const onCentreLine = (section: Locator) =>
  section.evaluate((el) => {
    const mid = window.innerHeight / 2;
    for (const li of el.querySelectorAll<HTMLElement>("[data-centre-id]")) {
      const b = li.getBoundingClientRect();
      if (b.top <= mid && b.bottom >= mid) return li.dataset.centreId ?? null;
    }
    return null;
  });

/** Where a listing's pin sits inside its map's box — its TIP, which is the point
 *  the camera centres — or null if that listing is inside a cluster and has no
 *  pin of its own (issue #115).
 *
 *  THE TIP IS THE PROJECTED POINT, so it is read out of the transform rather
 *  than off `getBoundingClientRect()` — `reposition()` writes
 *  `translate(point) translate(-50%, -100%)`, so the first translate is where
 *  the tip lands. That is not a shortcut, it is the #143 correction: a rect can
 *  still be at the overlay's corner for one frame AFTER the transform is
 *  correct, and it answers 0,0 there, which is a number and not an error.
 *  `placedPin` refuses to read at all until every marker carries a transform. */
const pinAt = async (section: Locator, id: string) =>
  (await placedPin(section.locator(MAP), id, `${id}'s pin`))?.point ?? null;

/** Every listing this section draws a single pin for, in DOM order. */
const pinIds = (section: Locator) =>
  section.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-map-pin]")].map((p) => p.dataset.mapPin!),
  );

/** Scroll `id`'s card to the middle of the window INSTANTLY, so the thing under
 *  test is the camera and not the scroll. */
async function centre(page: Page, id: string) {
  await page.evaluate((listing) => {
    const li = document.querySelector<HTMLElement>(`[data-centre-id="${listing}"]`)!;
    const box = li.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + box.top + box.height / 2 - window.innerHeight / 2,
      behavior: "instant" as ScrollBehavior,
    });
  }, id);
  await page.waitForTimeout(900);
}

/** The premises every count below rests on, asserted rather than assumed: the
 *  probe is in, motion is allowed, and the document really glides. Without the
 *  first an empty log reads as a pass; without the other two nothing is ever
 *  crossed on the way and there is nothing to coalesce. */
async function premises(page: Page) {
  expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);
  expect(
    await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
    "the fleet's reduced-motion emulation is lifted in this file",
  ).toBe(false);
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
    "and the document really does scroll smoothly",
  ).toBe("smooth");
}

/** Sample `window.scrollY` every frame from INSIDE the page while `drive` runs
 *  and for `ms` afterwards — a round trip per sample would miss the middle of a
 *  scroll that is over in under a second. Returns the positions and the cards
 *  the centre line crossed, both measured off the page's own boxes.
 *
 *  WHAT `crossed` COUNTS, AND WHY IT IS NOT THE SAMPLES ANY MORE. It used to be
 *  the cards a SAMPLED centre line sat on, and that made a premise out of the
 *  rAF lottery. Measured on this machine, 32 runs of the `End` case: the
 *  journey is the same every single time — 0 to 7000 on a 7900px document, over
 *  a span of 139-256ms — but the main thread sees it as 3 to 9 position
 *  changes, because the scroll is composited and one frame's step can be
 *  3841px (447 -> 4288 -> 7000 was a real run). Of 22 cards the centre line
 *  passes over, between 1 and 7 happened to be under a sampled position. The
 *  floor of `> 2` therefore failed 1 in 16 runs here and on CI (#130), on a
 *  scroll that had covered every card on the page.
 *
 *  So the span the centre line SWEPT is what is counted: every card whose box
 *  meets the interval between the lowest and the highest position sampled. That
 *  is the question the premise is asking, it cannot be under-reported by a
 *  missed frame, and it is 22 of 22 on every run of the case above. It is also
 *  strictly MORE than the old count — a card the sweep passed over between two
 *  samples was crossed, and the old line said it was not.
 *
 *  A SWEEP IS ONLY A SWEEP IF THE PAGE GLIDED, and that is why the glide
 *  premise is asserted BEFORE this count rather than beside it: a page that
 *  teleports 7000px in one frame passes OVER no card, and this interval would
 *  happily report all 22 of them. Mutated to exactly that — `End` replaced by
 *  `scrollTo({ behavior: "instant" })` over the same distance — the glide
 *  premise reds 3 times in 3, at "2 distinct" positions and 0 in the middle. */
async function travelOf(page: Page, drive: () => Promise<void>, ms = 2500) {
  // Each sample carries the time the CAMERA PROBE would stamp on a flight
  // issued in the same frame (`__camera.t0` is the shared origin), which is
  // what lets a case ask "did it fly while the page was moving" rather than
  // only "how many times did it fly".
  const sampling = page.evaluate(async (until) => {
    const out: { t: number; y: number }[] = [];
    const t0 = window.__camera.t0;
    const end = performance.now() + until;
    await new Promise<void>((resolve) => {
      const step = () => {
        out.push({ t: performance.now() - t0, y: Math.round(window.scrollY) });
        if (performance.now() < end) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return out;
  }, ms);
  await drive();
  const samples = await sampling;
  const positions = samples.map((s) => s.y);
  // The last instant the page's own position CHANGED — the end of the
  // movement, whoever or whatever was driving it, and not the moment the
  // driving call returned (`End` returns the instant the key is pressed and
  // the page glides on for another 300ms after it).
  let movingUntil = samples[0]?.t ?? 0;
  // …and the first instant it changed, so "how long was it moving" is a span
  // and not a count of frames. A single-frame jump — which is what the fleet's
  // reduced-motion emulation turns every drive here into — spans 0.
  let movingFrom: number | null = null;
  for (let i = 1; i < samples.length; i++)
    if (samples[i]!.y !== samples[i - 1]!.y) {
      movingUntil = samples[i]!.t;
      movingFrom ??= samples[i - 1]!.t;
    }
  const { crossed, sampled } = await page.evaluate((ys) => {
    const cards = [...document.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => {
      const b = li.getBoundingClientRect();
      return {
        id: li.dataset.centreId!,
        top: b.top + window.scrollY,
        bottom: b.bottom + window.scrollY,
      };
    });
    const seen = new Set<string>();
    for (const y of ys) {
      const mid = y + window.innerHeight / 2;
      for (const c of cards) if (c.top <= mid && c.bottom >= mid) seen.add(c.id);
    }
    const half = window.innerHeight / 2;
    const lo = Math.min(...ys) + half;
    const hi = Math.max(...ys) + half;
    return {
      crossed: cards.filter((c) => c.top <= hi && c.bottom >= lo).map((c) => c.id),
      sampled: seen.size,
    };
  }, positions);
  const first = positions[0]!;
  const last = positions[positions.length - 1]!;
  return {
    positions,
    crossed,
    /** How many of `crossed` a sampled position happened to land on. Evidence
     *  for a failure message, never a premise — see the note above. */
    sampled,
    movingUntil,
    /** How long the page's position kept changing, in ms. */
    movingFor: movingFrom === null ? 0 : movingUntil - movingFrom,
    /** Positions strictly between where it started and where it ended: a page
     *  that jumped in one frame has none, however far it went. */
    between: new Set(positions.filter((y) => y !== first && y !== last)).size,
    distance: last - first,
  };
}

// ---------------------------------------------------------------------------
// NO ARC IS ABANDONED, whatever is moving the page (#118 review MAJOR 3,
// re-based on the flight itself by #127 and #128)
// ---------------------------------------------------------------------------

test.describe("no arc is abandoned: a flight lands before the next one leaves", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  /** Load /properties at 1440x900 with the probe in, both maps drawn, parked at
   *  the top of the page with nothing on the centre line. */
  async function atTheTop(page: Page) {
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await drawn(page, 0);
    await premises(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);
    expect(await onCentreLine(land(page)), "nothing is on the centre line at the top").toBeNull();
    await resetCamera(page);
  }

  // WHAT IS ASSERTED HERE, AND WHY IT IS NOT A COUNT ANY MORE (#127, #128).
  //
  // This block used to require "at most ONE flight per map per scroll", which
  // the rule of the day delivered by refusing every flight while the DOCUMENT
  // was moving. Both halves of that turned out to be wrong:
  //
  //   #127  the refusal was a 120ms debounce on `scroll`, and a mouse wheel is
  //         ONE event per notch. At a 130ms notch gap a production build
  //         issued 9 flights for a 2560px scroll — the same 9 as a build with
  //         the refusal deleted outright — and with a 300px notch at 150ms the
  //         closest two flights were 171ms apart.
  //   #128  the same refusal had no ceiling, so a scroll that kept delivering
  //         events issued ZERO camera commands for its whole duration:
  //         measured here at 6400px over 10s and 21 cards crossed, with one
  //         flight at t=10425 once it stopped.
  //
  // A count cannot express what either of those is about. The defect is an ARC
  // ABANDONED — a 500ms Van Wijk path replaced after a few milliseconds — and
  // what says so is the GAP between two flights to the same map. The rule now
  // gates on a flight already in the air, so that gap is CAMERA_FLIGHT_MS by
  // construction, for every input, and this block measures exactly that.
  //
  // It is weaker than the old assertion in one direction — a long drive now
  // costs several flights, each of them complete: `End` went 1 -> 2, a smooth
  // scrollTo 1 -> 3, a pressed pin 1 -> 3 — and stronger in the direction that
  // matters, because it holds for the wheel and for the held scroll, neither
  // of which the old assertion could see at all.
  //
  // THE FLOOR, with its slack stated. Measured across eleven drives on a
  // production build, the smallest gap any of them produced was 500ms exactly,
  // and the hold is a `setTimeout`, which can only fire late. 450 is that
  // number with a frame of allowance; it is still 2.6x the worst gap #127
  // found.
  const FLIGHT_FLOOR_MS = 450;

  /** Consecutive flights to the same map, ms apart, closest first. */
  function gapsPerMap(log: CameraLog) {
    const byMap = new Map<number, number[]>();
    for (const call of [...log.fly, ...log.ease])
      byMap.set(call.m, [...(byMap.get(call.m) ?? []), call.t]);
    const gaps: { m: number; gap: number }[] = [];
    for (const [m, times] of byMap) {
      const sorted = [...times].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++)
        gaps.push({ m, gap: Math.round(sorted[i]! - sorted[i - 1]!) });
    }
    return gaps.sort((a, b) => a.gap - b.gap);
  }

  /** A point in the CARDS column, clear of every pinned map box — where a real
   *  visitor's pointer is while they wheel down the portfolio. Wheeling over a
   *  map box is a different test entirely: maplibre's ScrollZoomHandler ends in
   *  an unconditional preventDefault (see PropertyMap's `boot`), so the page
   *  would not move and the drive would measure nothing. */
  const overTheCards = (page: Page) =>
    page.evaluate(() => {
      const maps = [...document.querySelectorAll("[data-property-map]")].map((el) =>
        el.getBoundingClientRect(),
      );
      const card = document.querySelector("[data-centre-id]")!.getBoundingClientRect();
      const y = Math.min(Math.max(card.top + card.height / 2, 120), window.innerHeight - 120);
      const x = card.left + card.width / 2;
      const clear = maps.every((m) => x < m.left || x > m.right || y < m.top || y > m.bottom);
      return clear ? { x, y } : null;
    });

  for (const [name, drive, watchFor] of [
    ["the End key", (page: Page) => page.keyboard.press("End"), 2500],
    [
      "three PageDowns",
      async (page: Page) => {
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press("PageDown");
          await page.waitForTimeout(60);
        }
      },
      2500,
    ],
    [
      "a page's own smooth scrollTo",
      (page: Page) =>
        page.evaluate(() => window.scrollTo({ top: 4999, behavior: "smooth" })) as Promise<void>,
      2500,
    ],
    // THE CASE THE OLD BLOCK COULD NOT SEE, and the whole of why #127 shipped:
    // every drive above animates at frame rate, so each of them held the old
    // debounce true from end to end. A wheel does not. One notch is one event,
    // and the spacing is set by a hand — 130-220ms for someone turning it
    // steadily. 150ms is inside that band and wider than the 120ms the old
    // rule used, so a guard that measures the PAGE is absent here and a guard
    // that measures the FLIGHT is not. 300px a notch because that is a notch
    // that crosses a card every time: at 1440x900 the portfolio's cards are
    // ~284px of scroll apart, so a 100px notch crosses one every third notch
    // and hides the interruption behind the card geometry.
    [
      "a real mouse wheel, 300px a notch, 150ms apart",
      async (page: Page) => {
        const spot = await overTheCards(page);
        expect(spot, "a point in the cards column, clear of every map box").not.toBeNull();
        await page.mouse.move(spot!.x, spot!.y);
        for (let i = 0; i < 10; i++) {
          await page.mouse.wheel(0, 300);
          await page.waitForTimeout(150);
        }
      },
      6000,
    ],
    // #128: a scroll that keeps delivering events for ten seconds — a
    // scrollbar drag, a held autoscroll, a long momentum fling. `instant` on
    // purpose: `scroll-behavior: smooth` is on the documentElement here, and a
    // per-frame `scrollBy` under it restarts an animation every frame and
    // travels ~500px in ten seconds rather than ~6000.
    [
      "a scroll held for ten seconds",
      (page: Page) =>
        page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              let y = window.scrollY;
              const end = performance.now() + 10_000;
              const step = () => {
                y += 8;
                window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
                if (performance.now() < end) requestAnimationFrame(step);
                else resolve();
              };
              requestAnimationFrame(step);
            }),
        ) as Promise<void>,
      13_000,
    ],
  ] as const) {
    test(`${name} lands every arc it starts`, async ({ page }) => {
      test.setTimeout(180_000);
      await atTheTop(page);

      const travel = await travelOf(page, () => drive(page), watchFor);

      // THE PREMISES. Without these a gap of Infinity could be true because
      // nothing moved, or because it moved in a single frame.
      expect(
        travel.distance,
        `the page really travelled (${travel.positions.length} frames)`,
      ).toBeGreaterThan(500);
      // IT GLIDED RATHER THAN JUMPING, said as time and as shape rather than as
      // a sample count. What stood here wanted more than 4 DISTINCT POSITIONS,
      // on a measurement taken from a production build ("as few as 10 for a
      // 10 000px journey"). That number does not survive: measured 32 times on
      // this dev-server route, `End` produced between 4 and 10 distinct
      // positions, four of them exactly 4 — so the floor sat one above the
      // platform's own minimum and fired 6 times in 16 on an unchanged page
      // that had scrolled the full 7000px every run. The cause is not load: the
      // scroll is composited, and the main thread sees one 3841px step where
      // the reader sees a glide.
      //
      // So the two things "glided" actually means are asserted directly. It
      // OCCUPIED THE MIDDLE — a page that jumps in one frame has no position
      // between its first and its last, however far it went — and it TOOK TIME
      // doing it. 32ms is two frames; the measured span was 139-256ms, and the
      // fleet's reduced-motion emulation (lifted in this file, and asserted
      // lifted in `premises`) makes it 0.
      //
      // SAID OUT LOUD: on the "how many distinct positions" axis this asks for
      // less than the old line did (3 where it wanted 5). It asks for it on an
      // axis the old line could not see at all, and the number it replaces was
      // never met with room to spare. #144.
      expect(
        travel.between,
        `and it glided rather than jumping — it occupied the middle ` +
          `(${travel.positions.length} frames, ${new Set(travel.positions).size} distinct)`,
      ).toBeGreaterThan(0);
      expect(
        travel.movingFor,
        "and the travel took time rather than landing in one frame",
      ).toBeGreaterThan(32);
      expect(
        travel.crossed.length,
        `and it crossed several cards on the way (${travel.crossed.length} swept, ` +
          `${travel.sampled} of them under a sampled position)`,
      ).toBeGreaterThan(2);

      await page.waitForTimeout(1200);
      const log = await cameraLog(page);
      // FLIGHTS are what can be abandoned, and the claim is per MAP: a page
      // draws one map per section, and two flights to DIFFERENT maps are two
      // cameras doing their own job rather than one interrupting itself.
      //
      // A JUMP is deliberately not in the class and is not counted here —
      // `cameraMove` refuses only a flight, because an instant move cannot be
      // interrupted and cannot smear. A map that boots mid-scroll issues one:
      // its first measured box is not the box its boot camera was computed
      // against, and re-fitting that is a layout answer.
      const perMap = new Map<number, number>();
      for (const call of [...log.fly, ...log.ease])
        perMap.set(call.m, (perMap.get(call.m) ?? 0) + 1);
      const gaps = gapsPerMap(log);
      const tally =
        `fly ${log.fly.length}, ease ${log.ease.length}, jump ${log.jump.length}; ` +
        `per map ${[...perMap].map(([m, n]) => `${m}:${n}`).join(" ") || "none"}; ` +
        `gaps ${gaps.map((g) => `${g.m}:${g.gap}`).join(" ") || "none"}`;
      // THE CLAIM. Every flight was allowed to land before the next one left.
      if (gaps.length)
        expect(
          gaps[0]!.gap,
          `map ${gaps[0]!.m} was sent a second flight ${gaps[0]!.gap}ms into a ` +
            `${CAMERA_FLIGHT_MS}ms arc (${tally})`,
        ).toBeGreaterThanOrEqual(FLIGHT_FLOOR_MS);
      // And positive evidence that it flew at all: a rule that answered "no
      // move" to everything would satisfy the line above perfectly, having
      // never produced a pair to measure.
      expect(log.fly.length, `the camera did follow the scroll (${tally})`).toBeGreaterThan(0);
      // …and — the other half of #128 — it followed WHILE the page was moving
      // rather than only once it stopped. The drive is the first `watchFor` ms
      // of the run; a camera that issued everything after it is the freeze.
      const during = log.fly.filter((c) => c.t <= travel.movingUntil + 100).length;
      expect(
        during,
        `flights issued while the page was still moving (${during} of ${log.fly.length}; ${tally})`,
      ).toBeGreaterThan(0);

      // And the camera is not merely quiet: it went where the scroll ENDED.
      const settled = await onCentreLine(land(page));
      if (settled) {
        const pin = await pinAt(land(page), settled);
        if (pin) {
          const box = await land(page)
            .locator(MAP)
            .evaluate((el) => {
              const b = el.getBoundingClientRect();
              return { w: b.width, h: b.height };
            });
          expect(pin.x).toBeCloseTo(box.w / 2, 0);
          expect(pin.y).toBeCloseTo(box.h / 2 + 4, 0);
        }
      }
    });
  }

  // THE PRESS IS STILL NOT A SPECIAL CASE OF ANYTHING, and the number it costs
  // has changed. It used to be asserted at exactly ONE command, which the
  // document-scroll refusal delivered by holding the camera for the whole
  // travel; under the flight rule the press costs THREE complete arcs (1 ->
  // 3, measured on a production build: flights at t=2526, 3058, 3706, gaps 532
  // and 648). That is the visible price of the correction and it is recorded in
  // the journal and in an issue rather than hidden here: the camera now visits
  // the listings the page really passes through on the way, instead of
  // arriving after the fact.
  test("and a pressed pin is no longer a special case of anything", async ({ page }) => {
    test.setTimeout(180_000);
    await atTheTop(page);
    const section = land(page);
    const pins = await pinIds(section);
    expect(pins.length, "the land map draws pins to press").toBeGreaterThan(0);
    // The pin whose card is FURTHEST down the list, so the press has the most
    // to travel and crosses the most cards.
    const target = await section.evaluate((el, ids) => {
      const order = [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map(
        (li) => li.dataset.centreId!,
      );
      return ids.slice().sort((a, b) => order.indexOf(b) - order.indexOf(a))[0]!;
    }, pins);

    const travel = await travelOf(page, async () => {
      await page.evaluate(
        (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
        target,
      );
    });
    expect(travel.distance, "the press really scrolled the page").toBeGreaterThan(500);
    expect(travel.crossed.length, "across several cards").toBeGreaterThan(2);

    await page.waitForTimeout(1200);
    const landMap = await mapNamed(page, "Land");
    expect(landMap, "the land map is one of the booted maps").toBeGreaterThanOrEqual(0);
    expect(
      await cameraMovesFor(page, landMap),
      "the pressed section's camera was commanded at all",
    ).toBeGreaterThan(0);
    // The same claim as every case above, on the path that used to have its own
    // machinery: no arc was abandoned.
    const gaps = gapsPerMap(await cameraLog(page)).filter((g) => g.m === landMap);
    if (gaps.length)
      expect(
        gaps[0]!.gap,
        `the press sent a second flight ${gaps[0]!.gap}ms into a ${CAMERA_FLIGHT_MS}ms arc`,
      ).toBeGreaterThanOrEqual(FLIGHT_FLOOR_MS);
    expect(await onCentreLine(section)).toBe(target);
  });
});

// ---------------------------------------------------------------------------
// A PRESS IN ONE SECTION LEAVES EVERY OTHER SECTION ALONE (MAJOR 1)
// ---------------------------------------------------------------------------

test.describe("two sections, two cameras, no shared state between them", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  // WHAT THIS IS ABOUT. The press suspension that shipped was keyed per section
  // while the three timers behind it were single component-level variables, so
  // the second press cancelled the first's pending resume and the first
  // section's centre rule stayed suspended for the life of the page. Measured
  // on a production build at 1440x900: press a land pin, then an improved pin
  // 300ms later, and the land map issued ZERO camera commands across five
  // subsequent card crossings — its centre byte-identical at -98.73018,
  // 29.77384 — against 9 for the same crossings with no cross-section press. A
  // 1000ms gap behaved the same; only waiting out the 2000ms cap recovered it.
  //
  // Nothing in the suite pressed pins in two sections, which is the whole
  // reason it shipped. This does.
  test("a press in the improved section does not freeze the land camera", async ({ page }) => {
    test.setTimeout(240_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await drawn(page, 0);
    await premises(page);

    // Both maps have to be booted before either can be pressed — the improved
    // one loads only when half of its box is on screen.
    await improved(page).locator(MAP).scrollIntoViewIfNeeded();
    await drawn(page, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(900);

    const landPins = await pinIds(land(page));
    const improvedPins = await pinIds(improved(page));
    expect(landPins.length, "the land map draws a pin to press").toBeGreaterThan(0);
    expect(improvedPins.length, "and so does the improved map").toBeGreaterThan(0);

    // THE SEQUENCE. A press in one section, then a press in the other while the
    // first scroll is still travelling.
    await page.evaluate(
      (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
      landPins[0]!,
    );
    await page.waitForTimeout(300);
    await page.evaluate(
      (id) => document.querySelector<HTMLElement>(`[data-map-pin="${id}"]`)!.click(),
      improvedPins[0]!,
    );
    await page.waitForTimeout(1500);

    // Now drive the LAND section's cards past the centre line, one at a time,
    // and ask its own map whether it noticed.
    const landCards = await land(page).evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("[data-centre-id]")].map((li) => li.dataset.centreId!),
    );
    expect(landCards.length, "the land section has cards to cross").toBeGreaterThan(4);

    const landMap = await mapNamed(page, "Land");
    expect(landMap, "the land map is one of the booted maps").toBeGreaterThanOrEqual(0);
    await resetCamera(page);
    const before = await page.evaluate((n) => window.__camera.maps[n]!.getCenter(), landMap);
    for (const id of landCards.slice(0, 5)) await centre(page, id);
    const after = await page.evaluate((n) => window.__camera.maps[n]!.getCenter(), landMap);

    const followed = await cameraMovesFor(page, landMap);
    expect(
      followed,
      `the land camera followed its own cards after a press in another section ` +
        `(${followed} commands across ${landCards.slice(0, 5).length} crossings)`,
    ).toBeGreaterThan(0);
    // And it really moved, not merely issued something: the centre is not the
    // one it was stranded on.
    expect(
      Math.abs(after.lng - before.lng) + Math.abs(after.lat - before.lat),
      `the land map's centre moved (${before.lng.toFixed(5)}, ${before.lat.toFixed(5)} -> ` +
        `${after.lng.toFixed(5)}, ${after.lat.toFixed(5)})`,
    ).toBeGreaterThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// A RE-FIT THE `userMoved` GUARD CAN ACTUALLY FAIL ON (MAJOR 3, the residual)
// ---------------------------------------------------------------------------

test.describe("a drag holds the view against a box change the real portfolio can produce", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference", hasTouch: true } });

  // WHY THIS EXISTS BESIDE THE ONE IN property-map-camera.spec.ts. That test
  // drags the map and then RESIZES THE WINDOW from 1440 to 1200, and its
  // positive control — an undriven map really does re-fit on that resize —
  // passes on the fixture. It cannot pass on the real portfolio, and saying so
  // plainly is half of what this file owes:
  //
  //   * With ONE listing active the fitted camera does not depend on the box at
  //     all. A one-point bounds has zero span, the zoom clamps to the frame's
  //     maxZoom and the centre is that point plus a padding correction that is
  //     a constant number of pixels. Nothing a resize does can move it.
  //   * With NOTHING active — the fit-them-all camera, which is the case the
  //     flag was written for — the land section's fit is HEIGHT-bound at every
  //     desktop width on production data: the box runs 294.9x595 at 1024
  //     through 397x595 at 1440 and the boot zoom is 6.9481 at all of them. And
  //     the map's height is a fixed `lg:h-[595px]`, so no desktop resize
  //     changes it.
  //
  // So on /properties at desktop, with the real 17 land listings, the re-fit
  // that test guards against cannot happen. It measures a real rule against a
  // box change only the 4-point fixture produces.
  //
  // The EXPAND affordance is a box change the real data does produce, on every
  // phone: it takes the map from 200px to min(70dvh, 520px), which changes both
  // the height the fit is bound by AND the frame (compact -> full, different
  // padding). Below `lg` the centre rule does not run at all, so `active` is
  // null and the camera on screen IS the fit-them-all one.
  test("expanding and collapsing re-fits an undriven map, and never a dragged one", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(PROPERTIES);
    await hydrated(page);
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page)).toBe(true);
    // POSITIVE EVIDENCE that the camera on screen is the fit-them-all one, not
    // an argument that it must be: `centreWatch` does not run below `lg`, so
    // `active` is null and the zoom is whatever the whole section fits into.
    // A camera driven by an active listing would be at the frame's maxZoom, 12,
    // exactly — so any zoom below that is a fit and nothing else.
    const fitted = await mapZoom(page);
    expect(
      fitted,
      `the map is fitted to the section, not centred on one listing (z${fitted})`,
    ).toBeLessThan(11.5);

    const expand = page.locator("[data-map-expand]").first();
    await expand.click();
    await page.waitForTimeout(900);

    // THE POSITIVE CONTROL, on a map nobody has touched: collapsing really does
    // ask this camera for a different one. Without it every line below could be
    // true because the box change moves nothing.
    await resetCamera(page);
    await expand.click();
    await page.waitForTimeout(1200);
    expect(
      await cameraMovesFor(page, 0),
      "a collapse really does re-fit an undriven map — the control for the assertion below",
    ).toBeGreaterThan(0);

    // Now the same box change, after a drag.
    await expand.click();
    await page.waitForTimeout(900);
    const spot = await bareSpot(page);
    expect(spot, "found a bare patch of the expanded map to drag").not.toBeNull();
    await page.mouse.move(spot!.x, spot!.y);
    await page.mouse.down();
    await page.mouse.move(spot!.x + 60, spot!.y + 30, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    expect(
      (await cameraLog(page)).movestart,
      "a real drag reaches MapLibre as a movestart carrying its originalEvent",
    ).toContain("mousemove");

    const held = await page.evaluate(() => {
      const m = window.__camera.maps[0]!;
      const c = m.getCenter();
      return { lng: Number(c.lng.toFixed(5)), lat: Number(c.lat.toFixed(5)), zoom: m.getZoom() };
    });
    await resetCamera(page);
    await expand.click();
    await page.waitForTimeout(1200);
    expect(await cameraMovesFor(page, 0), "the visitor's pan survives the same box change").toBe(0);
    const after = await page.evaluate(() => {
      const m = window.__camera.maps[0]!;
      const c = m.getCenter();
      return { lng: Number(c.lng.toFixed(5)), lat: Number(c.lat.toFixed(5)), zoom: m.getZoom() };
    });
    expect(after.lng, "and the view is exactly where they left it").toBeCloseTo(held.lng, 4);
    expect(after.lat).toBeCloseTo(held.lat, 4);
    expect(after.zoom).toBeCloseTo(held.zoom, 4);
  });
});

// ---------------------------------------------------------------------------
// THE HOMEPAGE BAND'S CLOCK IS NOT A VISITOR (MAJOR 2)
// ---------------------------------------------------------------------------

test.describe("the band's auto-advance keeps its hands off the visitor's view", () => {
  test.use({
    contextOptions: { reducedMotion: "no-preference", hasTouch: true },
  });

  // THE ONE STATE WHERE THE WHEEL IS DELIBERATELY THE VISITOR'S. The in-page
  // map is built with scroll-zoom off so the pinned box cannot eat the page's
  // scroll; EXPANDING it turns scroll-zoom back on, and the expand affordance
  // exists only where the map is compact — below `lg`. So this runs at 390x844.
  //
  // Measured on a production build of `/` at 390x844 before the fix: four
  // wheel-up ticks took the map from z12 to z12.5387, and ~9s later — with no
  // further input at all — the camera had issued 2 flyTo back to z12 and the
  // zoom was gone while the map was still expanded. The dwell is 4000ms, so
  // nobody could hold a view for longer than four seconds.
  test("a visitor's zoom survives the dwell that follows it", async ({ page }) => {
    test.setTimeout(180_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    await hydrated(page);

    const band = page.locator("section:has([data-map-slot])").first();
    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page), "the camera probe installed").toBe(true);

    const expand = page.locator("[data-map-expand]").first();
    await expect(expand).toHaveAttribute("data-map-expand", "expand");
    await expand.click();
    await expect(expand).toHaveAttribute("data-map-expand", "collapse");
    await page.waitForTimeout(600);
    expect(
      await page.evaluate(() => window.__camera.maps[0]!.scrollZoom.isEnabled()),
      "expanding is what hands the wheel to the map",
    ).toBe(true);

    const before = await mapZoom(page);
    const spot = await wheelSpot(page);
    expect(spot.height, "the expanded map really is on screen to wheel over").toBeGreaterThan(100);

    // Four ticks over the middle of the expanded map. This is the gesture
    // MapLibre leaves untagged — its `movestart` carries no `originalEvent` —
    // which is why the component listens for the wheel itself.
    await page.mouse.move(spot.x, spot.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(900);
    const zoomed = await mapZoom(page);
    expect(zoomed, `the wheel really zoomed the map (${before} -> ${zoomed})`).toBeGreaterThan(
      before + 0.1,
    );

    // Hands off the map, and off the band, so nothing after this is input to
    // anything: the pointer leaves the map entirely and the only thing left
    // running is the band's own clock — 8000ms a listing since 2026-09-23.
    await page.mouse.move(2, 2);
    const slideBefore = await band
      .locator("[data-carousel-slide]")
      .evaluateAll((els) => els.findIndex((el) => !el.hasAttribute("aria-hidden")));
    await resetCamera(page);
    // More than a whole lap, read off the slice (./featured-dwell.ts), so the
    // band turns inside it wherever in its dwell it was. This was 9000 — two
    // laps of the old 4500, and only 500ms more than one of the new 8500.
    await page.waitForTimeout(FEATURED_LAP + 1000);

    // THE PREMISE, and without it "0 commands" would pass on a band that was
    // simply paused.
    const slideAfter = await band
      .locator("[data-carousel-slide]")
      .evaluateAll((els) => els.findIndex((el) => !el.hasAttribute("aria-hidden")));
    expect(
      slideAfter,
      `the band really did turn on its own (slide ${slideBefore} -> ${slideAfter})`,
    ).not.toBe(slideBefore);

    const log = await cameraLog(page);
    expect(
      log.fly.length + log.ease.length + log.jump.length,
      `the clock commanded the camera ${log.fly.length + log.ease.length + log.jump.length} ` +
        `times with nobody touching anything`,
    ).toBe(0);
    expect(await mapZoom(page), "and the visitor's zoom is exactly where they left it").toBeCloseTo(
      zoomed,
      3,
    );
    await expect(expand, "on a map that is still expanded").toHaveAttribute(
      "data-map-expand",
      "collapse",
    );
  });

  // ALSO NOT DISCRIMINATING, AND ALSO KEPT. Against the code this PR replaces
  // it passed, because there ANY change of `active` lifted the suspension —
  // which was the defect. It guards the OVER-correction: a rule that told an
  // auto-advance apart from a visitor and then never lifted for either would
  // be the older defect (one gesture killing the camera for the life of the
  // page) in new clothes, and it would satisfy the case above perfectly.
  test("and an arrow press — a visitor asking for somewhere else — gives it back", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await watchCamera(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(HOME);
    await hydrated(page);

    await page.locator(MAP).first().scrollIntoViewIfNeeded();
    await drawn(page, 0);
    expect(await cameraProbeInstalled(page)).toBe(true);

    const expand = page.locator("[data-map-expand]").first();
    await expand.click();
    await page.waitForTimeout(600);
    const before = await mapZoom(page);
    const spot = await wheelSpot(page);
    await page.mouse.move(spot.x, spot.y);
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(900);
    const zoomed = await mapZoom(page);
    expect(zoomed, `the wheel really zoomed the map (${before} -> ${zoomed})`).toBeGreaterThan(
      before + 0.1,
    );

    // THE OTHER HALF OF THE RULE. A suspension that nothing could lift would be
    // the older defect — one pan killing the feature for the life of the page —
    // wearing different clothes.
    await page.mouse.move(2, 2);
    await resetCamera(page);
    await page.getByRole("button", { name: "Next slide" }).click();
    await page.waitForTimeout(1500);

    const log = await cameraLog(page);
    expect(
      log.fly.length + log.ease.length + log.jump.length,
      "the visitor asked for a different listing, so the camera follows again",
    ).toBeGreaterThan(0);
    expect(await mapZoom(page), "and it is back on the frame's own zoom").not.toBeCloseTo(
      zoomed,
      3,
    );
  });
});

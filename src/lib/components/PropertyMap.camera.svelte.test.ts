import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";

import PropertyMap from "./PropertyMap.svelte";
import { CAMERA_FLIGHT_MS, type MapPoint } from "$lib/property-map";

/**
 * THE COALESCING GUARD THAT CAN SEE ITS OWN SOURCE (#127, #128).
 *
 * WHY THIS FILE EXISTS, and it is the whole point of it. `cameraMove` takes the
 * refusal's input as a PARAMETER, so every unit case in property-map.test.ts
 * asks "given a true, does it refuse" and none of them can ask "is the true
 * ever true". #127 is exactly that gap: the field used to be `pageScrolling`,
 * a 120ms debounce on the window's `scroll` events, and its unit cases were
 * complete and green for six days while, in a browser, a mouse wheel at any
 * notch spacing over 120ms lapsed the debounce between every pair of notches
 * and the guard was not weak but ABSENT. Measured on a production build of
 * /properties at 1440x900 with the guard in place: 9 flights for a 2560px
 * wheel scroll at a 130ms notch gap, identical to a build with the refusal
 * deleted outright.
 *
 * So the cases below drive the COMPONENT, which is where the value is made.
 * They change `active` on a live map on a clock the test owns, and count what
 * reached MapLibre. Two things fall out that the parameter cannot express:
 *
 *  - the spacing of the changes is the test's to choose, so a slow input is
 *    expressible (it is the whole of `a slow wheel`, below);
 *  - `scroll` events are the test's to dispatch, so a case can state that the
 *    document's own scroll is no longer consulted — positively, by scrolling
 *    hard and watching the camera keep flying.
 *
 * A `.svelte.test.ts` because props are held in a `$state` object rather than
 * pushed with `rerender`: `rerender` re-runs the boot effect, whose cleanup
 * calls `destroy()`, so the second `active` change of any sequence written
 * that way lands on a map that no longer exists and every count is a vacuous
 * zero (PropertyMap.test.ts says the same, having paid for it).
 */

const mockEnv = vi.hoisted(() => ({ env: {} as { PUBLIC_MAP_STYLE_URL?: string } }));
vi.mock("$env/dynamic/public", () => mockEnv);

/** Every camera command, with the time it was issued — under fake timers, so
 *  `Date.now()` is the test's own clock and a gap is exact. */
interface Command {
  kind: "fly" | "jump" | "ease";
  t: number;
  center: [number, number];
}

const engine = vi.hoisted(() => {
  const created: {
    handlers: Record<string, (e?: unknown) => void>;
    commands: Command[];
    removed: boolean;
  }[] = [];

  class FakeMap {
    handlers: Record<string, (e?: unknown) => void> = {};
    canvas = document.createElement("canvas");
    canvasContainer = document.createElement("div");
    record: (typeof created)[number];
    scrollZoom = { enable() {}, disable() {}, isEnabled: () => false };
    constructor() {
      this.record = { handlers: this.handlers, commands: [], removed: false };
      created.push(this.record);
    }
    log(kind: Command["kind"], camera: { center?: [number, number] }) {
      this.record.commands.push({ kind, t: Date.now(), center: camera.center ?? [0, 0] });
    }
    getCanvasContainer() {
      return this.canvasContainer;
    }
    on(name: string, fn: (e?: unknown) => void) {
      this.handlers[name] = fn;
    }
    addControl() {}
    getCanvas() {
      return this.canvas;
    }
    getZoom() {
      return 7;
    }
    getMaxZoom() {
      return 16;
    }
    project() {
      return { x: 10, y: 20 };
    }
    jumpTo(camera: { center?: [number, number] }) {
      this.log("jump", camera);
    }
    easeTo(camera: { center?: [number, number] }) {
      this.log("ease", camera);
    }
    flyTo(camera: { center?: [number, number] }) {
      this.log("fly", camera);
    }
    resize() {}
    remove() {
      this.record.removed = true;
    }
  }
  class FakeAttributionControl {}
  return {
    created,
    module: { default: { Map: FakeMap, AttributionControl: FakeAttributionControl } },
  };
});
vi.mock("$lib/map-engine", () => engine.module);

/** Six real listings, far enough apart that every one is its own camera —
 *  `cameraMove` answers `arrived` for a repeat, so a drive over points that
 *  resolved to the same centre would count nothing and pass. */
const points: MapPoint[] = [
  ["a", 29.7732434, -98.7301826],
  ["b", 27.4900712, -97.8487066],
  ["c", 29.3709, -98.8608],
  ["d", 29.6221, -98.1156],
  ["e", 28.8053, -97.0036],
  ["f", 30.2672, -97.7431],
].map(([id, lat, lng]) => ({
  id: id as string,
  title: `Listing ${id}`,
  lat: lat as number,
  lng: lng as number,
  href: null,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
}));

function stubObservers(box = { width: 397, height: 595 }) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(public cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: box } as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(public cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb(
          [
            {
              isIntersecting: true,
              target: el,
              boundingClientRect: { height: box.height } as DOMRectReadOnly,
              intersectionRect: { height: box.height } as DOMRectReadOnly,
              rootBounds: { height: 900 } as DOMRectReadOnly,
              intersectionRatio: 1,
              time: 0,
            } as IntersectionObserverEntry,
          ],
          this as never,
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
}

/**
 * A booted map whose `active` the test can change as often as it likes, on a
 * clock the test owns.
 *
 * The boot is `await`ed on REAL timers — it goes through
 * `await Promise.all([import(…), import(…)])`, which a faked clock has no
 * quarrel with but `vi.waitFor` does — and the fake clock starts after it, so
 * every `t` below is measured from a map that is already drawn.
 */
async function booted(active: string) {
  stubObservers();
  const props: { points: MapPoint[]; label: string; active: string | null } = $state({
    points,
    label: "Land",
    active,
  });
  render(PropertyMap, { props });
  await vi.waitFor(() => expect(engine.created).toHaveLength(1));
  const record = engine.created[0]!;
  record.handlers.load?.();
  await tick();
  await tick();
  expect(record.commands, "a map opens already framed on its active listing").toHaveLength(0);
  vi.useFakeTimers();
  return { props, record };
}

/** The flights one map was issued, in order. */
const flights = (record: { commands: Command[] }) =>
  record.commands.filter((c) => c.kind === "fly");

/** Gaps between consecutive flights. THE measurement of this whole fix: a
 *  flight `CAMERA_FLIGHT_MS` long that is replaced sooner than that is an arc
 *  abandoned, which is the smear the guard exists to prevent. */
const gapsOf = (record: { commands: Command[] }) => {
  const t = flights(record).map((c) => c.t);
  return t.slice(1).map((now, i) => now - t[i]!);
};

/** Advance the test's clock and let Svelte's effects run for it. */
function elapse(ms: number) {
  vi.advanceTimersByTime(ms);
  flushSync();
}

beforeEach(() => {
  engine.created.length = 0;
  delete mockEnv.env.PUBLIC_MAP_STYLE_URL;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

describe("the hold belongs to the flight, not to the page", () => {
  // #127. The listing under the centre line changes every `gap` ms, and
  // nothing else happens — no scroll event is dispatched anywhere, which is
  // the honest model of a mouse wheel whose notches are further apart than any
  // scroll debounce: between two notches the document is, by every measure a
  // debounce can take, still.
  for (const gap of [150, 220]) {
    it(`coalesces a drive whose changes are ${gap}ms apart — slower than any scroll debounce`, async () => {
      const { props, record } = await booted("a");

      for (const id of ["b", "c", "d", "e", "f", "b", "c", "d", "e"]) {
        props.active = id;
        flushSync();
        elapse(gap);
      }
      // Let the last flight land, so the count is of a finished drive.
      elapse(CAMERA_FLIGHT_MS + 50);

      const gaps = gapsOf(record);
      const tally = `${flights(record).length} flights, gaps [${gaps.join(", ")}]`;
      // THE CLAIM, and it is about arcs rather than about counts: no flight was
      // replaced before it landed.
      for (const g of gaps)
        expect(
          g,
          `two flights ${g}ms apart — a ${CAMERA_FLIGHT_MS}ms arc abandoned (${tally})`,
        ).toBeGreaterThanOrEqual(CAMERA_FLIGHT_MS);
      // …and bounded from above by the same constant, which is the other half:
      // nine changes over ~2s must not collapse to one flight at the end.
      const spanned = 9 * gap;
      expect(
        flights(record).length,
        `the camera kept up over ${spanned}ms of drive (${tally})`,
      ).toBeGreaterThanOrEqual(Math.floor(spanned / CAMERA_FLIGHT_MS));
      // Positive evidence, because every line above is satisfied perfectly by a
      // camera that never moves: it flew, and it ended where the drive ended.
      expect(flights(record).length, `the camera did follow (${tally})`).toBeGreaterThan(0);
      expect(flights(record).at(-1)!.center[0]).toBeCloseTo(
        points.find((p) => p.id === "e")!.lng,
        6,
      );
    });
  }

  it("issues one flight, not nine, when the same nine changes arrive at once", async () => {
    // The control for the pair above: the old guard's ONE good case. Changes
    // inside a single flush are a frame-rate scroll, and one flight is the
    // right answer — the new rule has to keep it.
    const { props, record } = await booted("a");
    for (const id of ["b", "c", "d", "e", "f", "b", "c", "d", "e"]) props.active = id;
    flushSync();
    elapse(CAMERA_FLIGHT_MS + 50);
    expect(flights(record)).toHaveLength(1);
    expect(flights(record)[0]!.center[0]).toBeCloseTo(points.find((p) => p.id === "e")!.lng, 6);
  });

  it("holds the second flight for exactly the duration it gave the first", async () => {
    // The constant on both sides of the mechanism, asserted rather than
    // asserted-about: the hold is the `duration` passed to `flyTo`, so a
    // change at CAMERA_FLIGHT_MS - 1 is refused and the same change one
    // millisecond later is not.
    const { props, record } = await booted("a");
    props.active = "b";
    flushSync();
    expect(flights(record)).toHaveLength(1);

    elapse(CAMERA_FLIGHT_MS - 1);
    props.active = "c";
    flushSync();
    expect(flights(record), "one millisecond before the arc lands, nothing").toHaveLength(1);

    elapse(1);
    expect(flights(record), "and the landing is what re-asks — no new prop change").toHaveLength(2);
    expect(flights(record)[1]!.center[0]).toBeCloseTo(points.find((p) => p.id === "c")!.lng, 6);
  });
});

describe("a refusal cannot outlast a flight", () => {
  // #128. The machinery #126 deleted carried SUSPEND_CAP_MS = 2000 and nothing
  // replaced it: the refusal that took its place was "the page is scrolling",
  // which a scroll delivering an event every frame holds true for as long as
  // it lasts. Measured on a production build before this fix: a 10s scroll
  // over 6400px, crossing 21 cards, issued ZERO camera commands for its whole
  // duration and one at 10425ms when it stopped.
  //
  // THE SCROLL EVENTS BELOW ARE THE MUTATION LEVER, and they are why this case
  // is worth its length. Against the code this replaces they hold the refusal
  // true for the full ten seconds and the camera issues nothing; against the
  // code here nothing listens to them at all, and the proof of that is a
  // camera that keeps flying while they arrive.
  it("keeps following a ten-second scroll that never stops delivering events", async () => {
    const { props, record } = await booted("a");
    const order = ["b", "c", "d", "e", "f", "a"];

    const FRAME = 16;
    const HELD = 10_000;
    for (let t = 0; t < HELD; t += FRAME) {
      window.dispatchEvent(new Event("scroll"));
      // A card crossing every ~10 frames, which is what 6400px over 21 cards
      // works out to at this frame rate.
      if (t % (10 * FRAME) === 0) props.active = order[(t / (10 * FRAME)) % order.length]!;
      flushSync();
      elapse(FRAME);
    }

    const during = flights(record);
    const tally = `${during.length} flights over ${HELD}ms`;
    // The bound, from the same constant and nothing else: a refusal that
    // cannot outlast a flight yields a flight per CAMERA_FLIGHT_MS. Allowing
    // some slack for the frame the re-ask lands on.
    expect(
      during.length,
      `the camera followed the scroll instead of freezing for it (${tally})`,
    ).toBeGreaterThanOrEqual(Math.floor(HELD / CAMERA_FLIGHT_MS) - 2);
    // And no arc was abandoned on the way — the two claims are not the same,
    // and a fix for one that broke the other would be no fix.
    const worst = Math.min(...gapsOf(record));
    expect(worst, `closest two flights were ${worst}ms apart (${tally})`).toBeGreaterThanOrEqual(
      CAMERA_FLIGHT_MS,
    );
    // The longest silence, stated as its own number because it is the whole
    // defect: 10006ms before, and one flight's length after.
    const longest = Math.max(...gapsOf(record));
    expect(longest, `longest silence mid-scroll (${tally})`).toBeLessThan(CAMERA_FLIGHT_MS * 2);
  });

  it("does not consult the document's scroll at all — a still page flies the same", async () => {
    // The other side of the same claim, and the case that would have caught
    // #127 from the opposite direction: with NO scroll events, the camera
    // behaves identically. Under the code this replaces these two cases
    // disagree completely; under this one they must not.
    const { props, record } = await booted("a");
    for (let t = 0; t < 2000; t += 16) {
      if (t % 160 === 0) props.active = ["b", "c", "d", "e", "f"][(t / 160) % 5]!;
      flushSync();
      elapse(16);
    }
    expect(flights(record).length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...gapsOf(record))).toBeGreaterThanOrEqual(CAMERA_FLIGHT_MS);
  });
});

describe("what the hold does NOT hold", () => {
  it("lets a jump through mid-flight, and stops waiting on the flight it cancelled", async () => {
    // A jump is instant: it cannot be interrupted and cannot smear, and
    // MapLibre's `jumpTo` stops the easing outright — so the hold left over
    // from the flight it cancelled would refuse a real flight for up to half a
    // second on a map that is standing still.
    const { props, record } = await booted("a");
    props.active = "b";
    flushSync();
    expect(flights(record)).toHaveLength(1);

    elapse(50);
    props.active = null;
    flushSync();
    const jumps = record.commands.filter((c) => c.kind === "jump");
    expect(jumps, "fitting them all is a layout answer, and instant").toHaveLength(1);

    // 50ms after the jump — well inside the cancelled flight's 500ms — a real
    // flight is due and must go out.
    elapse(50);
    props.active = "c";
    flushSync();
    expect(flights(record), "the cancelled flight is not still holding the next one").toHaveLength(
      2,
    );
  });

  it("stops its clock when the map goes away", async () => {
    // The timer outliving the component would fire `landed += 1` on a
    // destroyed one. Nothing observable breaks — which is why it is asserted
    // here rather than left to be noticed.
    const { props, record } = await booted("a");
    props.active = "b";
    flushSync();
    expect(flights(record)).toHaveLength(1);
    cleanup();
    expect(record.removed).toBe(true);
    elapse(CAMERA_FLIGHT_MS * 3);
    expect(flights(record), "nothing was issued after the map was removed").toHaveLength(1);
  });
});

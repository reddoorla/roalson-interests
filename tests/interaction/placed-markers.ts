import { type Locator } from "@playwright/test";

// READING A MAP MARKER'S POSITION IS A RACE — TWO OF THEM — AND THIS IS THE ONE
// PLACE THAT LOSES BOTH SAFELY (#143).
//
// PropertyMap splits a marker's markup from its placement on purpose: Svelte
// owns the keyed `{#each}`, and `reposition()` — MapLibre's `project()` for
// every cluster — owns `style.transform`, because re-running the each block
// sixty times a second to move seventeen boxes would be the wrong tool. The two
// are a `tick()` apart:
//
//     $effect(() => { void clusters; void tick().then(reposition); });
//
// RACE 1 — THE UNPLACED MARKER. A marker read in that gap is in the DOM with an
// EMPTY transform, at the overlay's origin. It has a box and an id, and
// `getBoundingClientRect()` answers the overlay's own corner — a number, not an
// error, and every assertion downstream believes it.
//
// map-home.spec's first fix was a `placed()` poll: wait until every
// `[data-map-pin]` has a non-empty transform, then read. That is TWO round
// trips, and `clusters` re-derives on `zoom`, `frame.clusterRadius` or
// `points`, so a marker can be re-keyed and unplaced again between the poll
// passing and the read landing. Closing it needs the check and the read in ONE
// synchronous DOM read, which nothing can re-render through. That is what
// `placedMarkers` is.
//
// RACE 2 — THE RECT THAT HAS NOT CAUGHT UP, which is the one that was actually
// failing, and which no amount of checking `style.transform` can see. MEASURED,
// because it is not what anyone assumed: on /properties at 390, 10 runs, each
// reading the same markers on 6 consecutive animation frames —
//
//   run 3, frame 0:  rect 0.0     transform translate(257.451px, …)
//   run 3, frame 1:  rect 246.5   transform translate(257.451px, …)
//
// — every marker at once, for exactly one frame, and correct on the next.
// `style.transform` reads back whatever was just assigned to it whether or not
// the box has been recomputed from it, so a marker in this state passes every
// placement check there is and still measures at the overlay's corner. 1 run in
// 10 here; 3 in 16 through the case itself.
//
// So a test that reads a marker's RECT waits for `steadyMarkers`: every marker
// placed AND the same rect on two consecutive animation frames. The stale state
// lasts one frame, so it cannot agree with the next one. A test that reads the
// projected point out of the TRANSFORM only needs `placedMarkers` — and should
// prefer it, because `steadyMarkers` requires a still map by construction and
// would spin through a flight.
//
// THE CLASS, ENUMERATED. Every test that reads a marker's position: map-home's
// live-pin case (`steadyMarkers` — it compares rects against the picture's),
// property-map-camera's `pinAt`, `pinsAt` and `where`, and
// property-map-camera-prod's `pinAt` (all `placedMarkers`; `pinAt` there now
// derives the pin's tip from the transform, which is what the tip IS, rather
// than from `getBoundingClientRect`). Reads that do not depend on placement —
// a pin's width, its fill, the ids a map draws, clicking one — do not go
// through here, and saying which is which is the point of the list.

/** One marker in a map that had ALL of its markers placed when it was read. */
export interface PlacedMarker {
  /** `data-map-pin` — the listing's own id, or null for a group of several. */
  id: string | null;
  /** `data-map-cluster` — how many listings this marker stands for. */
  count: number;
  /** The inline transform `reposition()` wrote, verbatim. */
  transform: string;
  /** The projected point that transform names — the first `translate()`. A pin
   *  is anchored `-50%,-100%`, so this point is its TIP; a cluster disc is
   *  anchored `-50%,-50%`, so it is its centre. */
  point: { x: number; y: number } | null;
  /** The marker's box, as offsets from the map's own box. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedRead {
  /** The map's own box, the only frame of reference a pin offset means anything in. */
  box: { w: number; h: number };
  markers: PlacedMarker[];
}

/** How long to keep asking for a settled frame. Generous on purpose: a miss
 *  costs one more round trip, and a map whose markers never settle is a red
 *  that names itself where a short timeout would name the symptom. */
const SETTLE_TIMEOUT = 15_000;

async function read(
  map: Locator,
  steady: boolean,
  what: string,
  timeout: number,
): Promise<PlacedRead> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const answer = await map.evaluate(async (el, wantSteady): Promise<PlacedRead | string> => {
      // THE GUARD AND THE READ, IN ONE SYNCHRONOUS PASS. Nothing may go between
      // them: that is the whole of RACE 1.
      const at = (): PlacedRead | string => {
        const els = [...el.querySelectorAll<HTMLElement>("[data-map-pin],[data-map-cluster]")];
        if (els.length === 0) return "the map drew no markers at all";
        const unplaced = els.filter((m) => m.style.transform === "").length;
        if (unplaced > 0) return `${unplaced} of ${els.length} markers were still unplaced`;
        const box = el.getBoundingClientRect();
        return {
          box: { w: +box.width.toFixed(1), h: +box.height.toFixed(1) },
          markers: els.map((m) => {
            const r = m.getBoundingClientRect();
            const t = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(m.style.transform);
            return {
              id: m.dataset.mapPin ?? null,
              count: Number(m.dataset.mapCluster ?? "1"),
              transform: m.style.transform,
              point: t ? { x: Number(t[1]), y: Number(t[2]) } : null,
              x: +(r.left - box.left).toFixed(1),
              y: +(r.top - box.top).toFixed(1),
              w: +r.width.toFixed(1),
              h: +r.height.toFixed(1),
            };
          }),
        };
      };
      const first = at();
      if (typeof first === "string" || !wantSteady) return first;
      // RACE 2: one more frame, and the rects have to agree. The stale state
      // lasts exactly one frame, so it cannot.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const second = at();
      if (typeof second === "string") return second;
      const where = (r: PlacedRead) => r.markers.map((m) => `${m.id}@${m.x},${m.y}`).join(" ");
      return where(first) === where(second)
        ? second
        : `two frames disagreed — ${where(first)} then ${where(second)}`;
    }, steady);
    if (typeof answer !== "string") return answer;
    if (Date.now() > deadline)
      throw new Error(`${what}: no usable frame in ${timeout}ms — ${answer}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Every marker in `map`, read from a frame in which all of them were PLACED.
 *
 * `map` must resolve to exactly one `[data-property-map]`. Use this for the
 * projected point (`marker.point`, out of the transform) and for the transform
 * itself. For a marker's RECT, use `steadyMarkers` — see RACE 2 above.
 */
export const placedMarkers = (map: Locator, what = "the map's markers", timeout = SETTLE_TIMEOUT) =>
  read(map, false, what, timeout);

/**
 * Every marker in `map`, read from two CONSECUTIVE ANIMATION FRAMES that agreed
 * on every rect — the only state in which `getBoundingClientRect()` can be
 * trusted to have caught up with the transform (RACE 2 above).
 *
 * Requires a still map: during a flight the positions change every frame and
 * this would spin until it threw, which is the honest outcome for asking a
 * moving map where its pins are.
 */
export const steadyMarkers = (map: Locator, what = "the map's markers", timeout = SETTLE_TIMEOUT) =>
  read(map, true, what, timeout);

/** The marker a listing has to itself, or null when it is inside a group and has
 *  no pin of its own (issue #115). Never null merely because it was read early
 *  — see `placedMarkers`. */
export const placedPin = async (map: Locator, id: string, what = id) =>
  (await placedMarkers(map, what)).markers.find((m) => m.id === id) ?? null;

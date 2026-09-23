import { readFileSync } from "node:fs";

// THE HOMEPAGE BAND'S CLOCK, FOR EVERY SPEC THAT WAITS ON IT. It lives here,
// beside hydrated.ts, because Playwright will not let one spec import another,
// and three specs time something against this band's turns: its own
// (featured-properties.spec.ts) and the map's two (property-map-camera and
// property-map-camera-prod, whose "a paused carousel is a still map" and "the
// band really did turn on its own" both need a wait longer than one lap).
//
// READ OUT OF THE SLICE, NOT COPIED FROM IT. Every one of those specs said
// 4000 until the operator doubled the time on each listing (2026-09-23), and
// a copy is exactly what would have let them go on timing a 4000 band. Some
// of that fails loudly — a wait sized to the old lap is a ceiling that runs
// out — but a negative window ("nothing turned in 9s") silently stops
// containing a turn once the lap outgrows it, and a bound like "a lap is
// 4400–4700" is a claim about the product that would have been rewritten to
// match whatever it measured. A spec cannot import a .svelte module, so the
// number is parsed from the file that declares it, and a slice that stops
// declaring it that way fails here rather than silently. The value itself —
// the operator's 8000 — is pinned once, in FeaturedProperties.test.ts.

const SLICE = new URL("../../src/lib/slices/FeaturedProperties/index.svelte", import.meta.url);

/** ms each listing is on screen before the clock turns it: the slice's DWELL. */
export const FEATURED_DWELL = (() => {
  const declared = /^\s*export const DWELL = (\d+);$/m.exec(readFileSync(SLICE, "utf8"));
  if (!declared)
    throw new Error(
      "src/lib/slices/FeaturedProperties/index.svelte no longer declares `export const DWELL = <ms>;`",
    );
  return Number(declared[1]);
})();

/** How far the photo's drift travels across a dwell: the slice's KEN_BURNS
 *  (1.00 → 1.03). Read out of the slice for DWELL's reason — the slice calls
 *  it reversible (0.06 is the old speed over the new dwell), and a spec that
 *  checks where the photo should be on a given frame must follow it. */
export const FEATURED_KEN_BURNS = (() => {
  const declared = /^\s*export const KEN_BURNS = (\d*\.?\d+);$/m.exec(readFileSync(SLICE, "utf8"));
  if (!declared)
    throw new Error(
      "src/lib/slices/FeaturedProperties/index.svelte no longer declares `export const KEN_BURNS = <scale>;`",
    );
  return Number(declared[1]);
})();

/** The slice's DISSOLVE, which is CAMERA_FLIGHT_MS — pinned at 500 by
 *  property-map.test.ts (property-map-camera-prod.spec.ts repeats it the same
 *  way). The dwell doubling did not touch it: the hand-over is how long a turn
 *  takes to look finished, and the operator asked for longer on each listing. */
export const FEATURED_DISSOLVE = 500;

/** One whole turn of the band's clock: the dwell, then the settle the next
 *  dwell waits out. 8500 since 2026-09-23; 4500 before. */
export const FEATURED_LAP = FEATURED_DWELL + FEATURED_DISSOLVE;

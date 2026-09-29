import type { Page } from "@playwright/test";

import type { CameraLog } from "./camera-probe";

// WHAT A DRIVE DID TO THE PAGE, measured from inside it — one sampler for both
// camera specs (#144), because the dev spec had kept its own copy of the
// premise the production spec had already corrected, and it went red for the
// same reason on main.

/**
 * Sample `window.scrollY` every frame from INSIDE the page while `drive` runs,
 * and return the positions and the cards the centre line crossed, both
 * measured off the page's own boxes. A round trip per sample would miss the
 * middle of a scroll that is over in under a second.
 *
 * THE WINDOW OPENS BEFORE THE DRIVE AND CLOSES ON THE PAGE, NOT ON A CLOCK. It
 * used to open whenever the sampler's first frame came and close `ms` after
 * that, both racing the drive. A wheel over the cards column scrolls on the
 * compositor, which does not wait for the main thread, so on a starved machine
 * the first sample was taken with most of the drive already applied: 10
 * notches of 300px measured as "travelled 300 (6 frames)" in a full verify at
 * load 60 (#138's comment). Now the first sample is a frame taken, and waited
 * for, BEFORE the drive starts, and sampling stops only once the drive has
 * returned, `atLeast` has passed and the page has then held still for
 * `quietMs`.
 *
 * WHAT `crossed` COUNTS, AND WHY IT IS NOT THE SAMPLES. It used to be the cards
 * a SAMPLED centre line sat on, and that made a premise out of the rAF
 * lottery. Measured on this machine, 32 runs of the `End` case: the journey is
 * the same every single time — 0 to 7000 on a 7900px document, over a span of
 * 139-256ms — but the main thread sees it as 3 to 9 position changes, because
 * the scroll is composited and one frame's step can be 3841px (447 -> 4288 ->
 * 7000 was a real run). Of 22 cards the centre line passes over, between 1 and
 * 7 happened to be under a sampled position. So the span the centre line SWEPT
 * is what is counted: every card whose box meets the interval between the
 * lowest and the highest position sampled.
 *
 * A SWEEP IS ONLY A SWEEP IF THE PAGE GLIDED, so callers assert `between` and
 * `movingFor` BEFORE they read `crossed`: a page that teleports 7000px in one
 * frame passes OVER no card, and this interval would happily report all of
 * them. Mutated to exactly that — `End` replaced by `scrollTo({ behavior:
 * "instant" })` over the same distance — the glide premise reds 3 times in 3.
 *
 * Each sample carries the time the CAMERA PROBE would stamp on a flight issued
 * in the same frame (`__camera.t0` is the shared origin, or 0 without a
 * probe), which is what lets a case ask "did it fly while the page was moving".
 */
export async function travelOf(
  page: Page,
  drive: () => Promise<unknown>,
  { atLeast = 2500, quietMs = 600, cap = 30_000 } = {},
) {
  await page.evaluate(
    () =>
      new Promise<void>((started) => {
        const t0 = window.__camera?.t0 ?? 0;
        const state: TravelSampler = {
          out: [],
          start: performance.now(),
          lastChange: performance.now(),
          driveEnd: null,
          finish: null,
          cap: 0,
          atLeast: 0,
          quietMs: 0,
        };
        window.__travel = state;
        const step = () => {
          const now = performance.now();
          const y = Math.round(window.scrollY);
          const prev = state.out[state.out.length - 1];
          if (prev && prev.y !== y) state.lastChange = now;
          state.out.push({ t: now - t0, y });
          if (state.out.length === 1) started();
          const end = state.driveEnd;
          if (
            end !== null &&
            state.finish &&
            ((now - state.start >= state.atLeast &&
              now - end >= state.quietMs &&
              now - state.lastChange >= state.quietMs) ||
              now - end >= state.cap)
          ) {
            state.finish(state.out);
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  await drive();
  const samples = await page.evaluate(
    (o) =>
      new Promise<{ t: number; y: number }[]>((resolve) => {
        const state = window.__travel!;
        Object.assign(state, o, { driveEnd: performance.now(), finish: resolve });
      }),
    { atLeast, quietMs, cap },
  );
  const positions = samples.map((s) => s.y);
  // The last instant the page's own position CHANGED — the end of the
  // movement, whoever or whatever was driving it, and not the moment the
  // driving call returned (`End` returns the instant the key is pressed and
  // the page glides on for another 300ms after it).
  let movingUntil = samples[0]?.t ?? 0;
  // …and the first instant it changed, so "how long was it moving" is a span
  // and not a count of frames. A single-frame jump — which is what the fleet's
  // reduced-motion emulation turns every drive here into — spans one frame.
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
    /** Where the page was in the frame before the drive began. */
    from: first,
  };
}

/** Consecutive flights to the same map, ms apart, closest first. The claim
 *  "no arc is abandoned" is per MAP: a page draws one map per section, and two
 *  flights to DIFFERENT maps are two cameras doing their own job rather than
 *  one interrupting itself. */
export function gapsPerMap(log: CameraLog) {
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

interface TravelSampler {
  out: { t: number; y: number }[];
  start: number;
  lastChange: number;
  driveEnd: number | null;
  finish: ((out: { t: number; y: number }[]) => void) | null;
  cap: number;
  atLeast: number;
  quietMs: number;
}

declare global {
  interface Window {
    __travel?: TravelSampler;
  }
}

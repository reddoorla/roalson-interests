import { fade as svelteFade, fly as svelteFly, slide as svelteSlide } from "svelte/transition";
import type { FadeParams, FlyParams, SlideParams, TransitionConfig } from "svelte/transition";

// Svelte's JS-driven transitions (Web Animations API) do NOT honor the CSS
// `prefers-reduced-motion` reset in app.css. These thin wrappers do: when the
// user asks for reduced motion we collapse duration + delay to 0 so the element
// still appears/disappears, just without the animation. Components import
// fade/fly/slide from here instead of "svelte/transition".
//
// Checked per transition run (not at module load), so an OS-level toggle takes
// effect on the next open/close. `matchMedia` is guarded for SSR and jsdom.
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

type Subscriber = (value: boolean) => void;

const subscribers = new Set<Subscriber>();

// ONE MediaQueryList for the whole app, created on first use and reused. A
// preference consulted in several unconnected places drifts: this module reads
// it per transition run, Slider keeps its own listener, and animateIn used to
// sample it once at mount — so turning Reduce Motion on mid-session stopped the
// carousel but left every scroll reveal running until a reload. Anything that
// lives long enough to react should read the store below.
let factory: typeof window.matchMedia | null = null;
let list: MediaQueryList | null = null;

function onChange(event: MediaQueryListEvent) {
  // Copy first: a subscriber may unsubscribe itself while being notified
  // (animateIn tears itself down the moment the preference turns on).
  for (const run of [...subscribers]) run(event.matches);
}

/** The live MediaQueryList, or null where there is no `matchMedia` at all (SSR,
 *  and jsdom before a test stubs one). Re-created when `window.matchMedia`
 *  itself is swapped, which is exactly what the tests do between cases — the
 *  listener follows the current implementation rather than pinning the first
 *  one it ever saw. */
function queryList(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    list?.removeEventListener?.("change", onChange);
    factory = null;
    list = null;
    return null;
  }
  if (list && factory === window.matchMedia) return list;
  list?.removeEventListener?.("change", onChange);
  factory = window.matchMedia;
  list = window.matchMedia(REDUCE_QUERY);
  // Optional-called: ancient Safari has only the deprecated addListener, and
  // some jsdom stubs omit it entirely. Losing the listener costs reactivity,
  // never correctness — every read below still hits `.matches`.
  list.addEventListener?.("change", onChange);
  return list;
}

/** Live reduced-motion query, exported for components whose BEHAVIOR (not just
 *  animation) changes under reduced motion — e.g. PreNavTransition skips its
 *  artificial pre-navigation delay entirely. Deliberately asks `matchMedia`
 *  fresh rather than reading the cached list: callers are one-shot (a
 *  transition about to run), and a fresh ask is what keeps it correct where the
 *  list is a stub rather than a live object. Prefer the `reducedMotion` store
 *  wherever the caller lives long enough to react to a change. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(REDUCE_QUERY).matches;

/** The same preference as a Svelte store, so long-lived consumers (actions,
 *  components) update when the OS setting is toggled mid-session instead of
 *  waiting for a reload. Standard store contract — `$reducedMotion` in a
 *  component, `.subscribe()` in an action. SSR-safe: with no `matchMedia` it
 *  emits `false` once and never again. */
export const reducedMotion = {
  subscribe(run: Subscriber): () => void {
    queryList();
    subscribers.add(run);
    run(prefersReducedMotion());
    return () => {
      subscribers.delete(run);
    };
  },
};

/** What a transition collapses to under reduced motion: zero-length AND
 *  style-free. Zeroing the duration is NOT sufficient on its own — Svelte still
 *  samples the config's `css` at t=0 and commits that frame, so a
 *  `fly({ y: 22 })` paints its full 22px offset for one frame before snapping
 *  back. That is visible motion for someone who asked for none, and any layout
 *  read landing in that frame is wrong (upstream it inflated a nav overlay's
 *  scrollHeight by exactly the fly distance). With no `css` and no `tick` there
 *  is nothing for Svelte to apply, so the element simply appears. */
const INSTANT: TransitionConfig = { duration: 0, delay: 0 };

export function fade(node: Element, params: FadeParams = {}): TransitionConfig {
  return prefersReducedMotion() ? { ...INSTANT } : svelteFade(node, params);
}

export function fly(node: Element, params: FlyParams = {}): TransitionConfig {
  return prefersReducedMotion() ? { ...INSTANT } : svelteFly(node, params);
}

export function slide(node: Element, params: SlideParams = {}): TransitionConfig {
  return prefersReducedMotion() ? { ...INSTANT } : svelteSlide(node, params);
}

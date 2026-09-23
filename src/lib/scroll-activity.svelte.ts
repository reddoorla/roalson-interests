/**
 * IS THE PAGE STILL SCROLLING? — one answer, for the whole document (#118
 * review, MAJOR 3).
 *
 * WHY THIS EXISTS. The property map's camera follows the card crossing the
 * middle of the window, and a single smooth scroll crosses many cards: each
 * crossing asked the camera for a new destination, and `flyTo` replaces the
 * flight in progress, so what shipped was a chain of Van Wijk arcs each
 * interrupted after a few milliseconds. Measured on a PRODUCTION build of
 * /properties at 1440x900 with motion allowed, counting the calls made to
 * maplibre-gl: `End` from scrollY 0 issued 5-9 `flyTo` inside 71-81ms,
 * `PageDown` x3 issued 5, `Space` x4 issued 4, and a programmatic smooth
 * scroll of 0 -> 4999 issued 15 in 784ms.
 *
 * The first attempt at this fixed the PRESS — the one path that had been
 * noticed — by suspending the centre rule from PropertyListing while a
 * press-initiated scroll travelled. Every other smooth scroll chained exactly
 * as before, because there is no end to the list of things that can scroll a
 * document: a key, a fragment link, a browser's find-in-page, an AT's "scroll
 * into view", a page's own `scrollTo`. So the rule is not at the things that
 * cause a scroll; it is at the camera, and it is one line — WHILE THE PAGE IS
 * STILL MOVING, RETARGET RATHER THAN LAUNCH.
 *
 * SETTLE_MS is a debounce on the document's own `scroll` events, not a guess
 * at how long a scroll takes: a scroll delivers an event about every frame, so
 * ~120ms of silence means it has stopped, whatever distance it covered. A
 * fixed duration would have to be long enough for the 4500px land section and
 * would then hold the camera for a second on a 200px hop. Nothing
 * correctness-critical hangs on the number — the worst a wrong one does is fly
 * a beat early or late, and `cameraMove`'s answer is still `cameraMove`'s
 * answer.
 *
 * ONE LISTENER FOR THE PAGE, ref-counted, because a page draws as many maps as
 * it has sections and they all ask the same question. It is `passive`, and its
 * whole body is a boolean and a timer.
 */

/** ms of silence on the document's `scroll` that means it has stopped. */
export const SCROLL_SETTLE_MS = 120;

let scrolling = $state(false);
let watchers = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function onScroll() {
  scrolling = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    scrolling = false;
  }, SCROLL_SETTLE_MS);
}

/** Reactive. True from the first `scroll` event until `SCROLL_SETTLE_MS` of
 *  silence — and false on the server, and in any page that never called
 *  `watchPageScroll`, which is the honest answer for a document nothing is
 *  listening to rather than a guess. */
export function pageScrolling(): boolean {
  return scrolling;
}

/** Attach from an `$effect` and return the teardown it hands back. The
 *  listener exists only while something is asking. */
export function watchPageScroll(): () => void {
  if (typeof window === "undefined") return () => {};
  if (watchers === 0) window.addEventListener("scroll", onScroll, { passive: true });
  watchers += 1;
  let released = false;
  return () => {
    // Guarded: an effect teardown that ran twice would take the count negative
    // and leak the listener for the rest of the page.
    if (released) return;
    released = true;
    watchers -= 1;
    if (watchers > 0) return;
    window.removeEventListener("scroll", onScroll);
    clearTimeout(timer);
    timer = undefined;
    scrolling = false;
  };
}

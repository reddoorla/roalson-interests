/**
 * Which child of a list the viewport is looking AT — the one whose box crosses
 * the horizontal line through the middle of the screen (#13 follow-up).
 *
 * THERE IS EXACTLY ONE RULE, AND THIS IS IT. On the Properties page the
 * section's map follows the active listing, and a pressed pin does NOT set
 * that listing: it scrolls the card to the centre, and this reports it from
 * there. Two mechanisms — "the card nearest the centre" and "the pin you
 * pressed" — would disagree the moment a scroll was still settling, and the
 * map would flick between them. So a press is an input to the SCROLL, never to
 * the answer.
 *
 * WHY A ZERO-HEIGHT ROOT AND NOT A DISTANCE COMPARISON. `rootMargin:
 * "-50% 0px -50% 0px"` collapses the observer's root to a line across the
 * viewport's middle, so "is this card the one" becomes "does this card cross
 * the line" — a question the browser answers off the main thread, with no
 * scroll listener, no `getBoundingClientRect` per card per frame, and nothing
 * to throttle. A card is 220–284px tall here and the gap between two is 20px,
 * so at most one card can be on the line at a time.
 *
 * Measured against an independent box test (`top <= innerHeight/2 &&
 * bottom >= innerHeight/2`) at nine scroll positions down the real /properties
 * on a production build: identical at all nine.
 *
 * NOTHING ON THE LINE MEANS HOLD, NOT BLANK. Twice per card the centre falls
 * in the 20px gap and no card is intersecting. Measured: a single jump from
 * scrollY 0 to 1250 lands the centre in a gap, and this keeps the last card it
 * reported rather than clearing it. Clearing would let the map go twice per
 * card, which is the flicker this rule exists to avoid.
 *
 * FAST SCROLL. A big jump delivers a batch of entries, not one, and they are
 * not ordered for us; the newest INTERSECTING entry by `time` is the only one
 * that describes where the page is now. Taking `entries[0]`, or the last of
 * the array, is right most of the time and wrong exactly when the scroll was
 * fast — which is when it matters.
 *
 * DESKTOP ONLY, AND NOT MERELY HIDDEN. The map only pins from `lg` (see
 * PropertyListing.svelte for why a phone does not spend a quarter of its
 * viewport on one), so below that there is nothing for this to drive and it
 * does not run at all — no observer constructed, no callbacks. The media query
 * is live, so a resize past the breakpoint starts or stops it.
 */

/** The attribute a watched child carries, holding the id to report. */
export const CENTRE_ID = "data-centre-id";

/** The root, shrunk to a zero-height line across the viewport's middle. */
export const CENTRE_BAND = "-50% 0px -50% 0px";

export interface CentreWatchOptions {
  /** Called with the `data-centre-id` of the child on the centre line. Never
   *  called with null — see "nothing on the line means hold". */
  onactive: (id: string) => void;
  /** Viewport width, in px, at or above which this runs at all. */
  minWidth: number;
  /** False tears it down: a section with no map has nothing to drive. */
  enabled?: boolean;
}

export function centreWatch(node: HTMLElement, options: CentreWatchOptions) {
  let current = options;
  let observer: IntersectionObserver | null = null;

  function report(entries: IntersectionObserverEntry[]) {
    let newest: IntersectionObserverEntry | null = null;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (newest === null || entry.time >= newest.time) newest = entry;
    }
    if (newest === null) return;
    const id = (newest.target as HTMLElement).getAttribute(CENTRE_ID);
    if (id) current.onactive(id);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
  }

  function start() {
    stop();
    if (current.enabled === false) return;
    // No matchMedia is not "assume desktop": this is an enhancement over a
    // list that already works, and a server or a jsdom render must get the
    // list. (vitest-setup.ts's default answers `matches: false`, so a unit
    // test that wants this running says so.)
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia(`(min-width: ${current.minWidth}px)`).matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    observer = new IntersectionObserver(report, { rootMargin: CENTRE_BAND, threshold: 0 });
    for (const child of node.querySelectorAll<HTMLElement>(`[${CENTRE_ID}]`))
      observer.observe(child);
  }

  // One listener for the whole life of the action, on a query built from the
  // width it was created with. `minWidth` is a layout constant, not state.
  const query =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(`(min-width: ${options.minWidth}px)`)
      : null;
  const onQueryChange = () => start();
  query?.addEventListener("change", onQueryChange);

  start();

  return {
    update(next: CentreWatchOptions) {
      current = next;
      // Re-scan rather than diff: the children are a `{#each}` whose keys can
      // change, and re-observing a node already observed is a no-op.
      start();
    },
    destroy() {
      stop();
      query?.removeEventListener("change", onQueryChange);
    },
  };
}

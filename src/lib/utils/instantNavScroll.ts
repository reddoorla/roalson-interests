import type { AfterNavigate, BeforeNavigate } from "$app/navigation";

/**
 * Make SvelteKit's own post-navigation scroll INSTANT instead of a visible
 * glide. app.css sets `html { scroll-behavior: smooth }`, which the browser
 * applies to programmatic scrolls too — including kit's scroll-to-top on link
 * navs, its `scrollIntoView` for cross-page `#hash` deep links, and its
 * position restore on back/forward.
 *
 * We never call `scrollTo` ourselves: kit already picks the correct target for
 * every navigation type (top for links, the anchor for hash URLs, the saved
 * position for popstate, unchanged for `data-sveltekit-reset="false"`, kit 3's
 * name for kit 2's `data-sveltekit-noscroll`). Scrolling
 * on our own would fight those semantics — an earlier version of this util did
 * exactly that and broke cross-page anchors and no-reset links. Instead:
 * `beforeNavigate` flips scroll-behavior to `auto`, kit performs its scroll
 * un-animated, and `afterNavigate` restores the inline style one frame later.
 *
 * A cancelled navigation leaves `auto` in place until the next completed one —
 * harmless (smooth applies again after it) and self-healing.
 */
export function disableSmoothScroll(_nav: BeforeNavigate): void {
  document.documentElement.style.scrollBehavior = "auto";
}

/**
 * Flush layout after kit has swapped in the new page and BEFORE it scrolls.
 * Call it from an `$effect` keyed on `page.url` in the root layout: kit 3
 * awaits Svelte's `settled()` (which runs effects) between the DOM update and
 * its `scrollTo`, so this runs in exactly that gap.
 *
 * Why it is needed: kit 3 calls `scrollTo` while the swapped-in page's layout
 * is still dirty, and Chromium then applies the scroll only at the next
 * layout, after `restoreSmoothScroll`'s frame has put `smooth` back. A Back or
 * Forward to an entry saved at the top glided there (~480ms, 863→0 on
 * /team/matt-howard from /properties at y=1500) where kit 2 jumped. Forcing
 * layout AFTER the scroll does not help; only before it does (measured,
 * roalson-interests#306).
 */
export function flushLayoutForKitScroll(): void {
  void document.documentElement.scrollTop;
}

export function restoreSmoothScroll({ type }: AfterNavigate): void {
  // First render: nothing was disabled. Kit's startup restore of a reload's
  // position runs before hydration, and app.css (pre-hydration
  // `scroll-behavior: auto` and `overflow-anchor: none`) is what makes it land.
  if (type === "enter") return;
  requestAnimationFrame(() => {
    document.documentElement.style.scrollBehavior = "";
  });
}

/**
 * Scroll anchoring off for a reload or a Back/Forward page load, until the
 * root layout mounts (`releaseAnchoring`). Call it from `hooks.client.ts`
 * `init`, which kit 3 runs before its own startup restore of the saved
 * position.
 *
 * Why: kit restores that position before hydration, into the server-rendered
 * layout, and on /properties that is 14212px tall before hydration and 2487px
 * after. With anchoring on, Chromium and Firefox moved a reload at 1500 to
 * 1612 when hydration shrank the page. Only these loads have a restore to
 * protect: on a first visit anchoring stays on, so a web font swapping in
 * while the visitor reads does not move the text under them (switching it
 * off for every load did: -24 to -72px on /privacy, roalson-interests#306
 * round 5). Re-applying kit's target after hydration instead fought a
 * visitor who scrolled during a slow load (round 4).
 */
export function holdAnchoringForRestore(): void {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (entry?.type !== "reload" && entry?.type !== "back_forward") return;
  document.documentElement.style.overflowAnchor = "none";
  document.body.style.overflowAnchor = "none";
}

/** Undo `holdAnchoringForRestore`, once the page has hydrated. */
export function releaseAnchoring(): void {
  document.documentElement.style.overflowAnchor = "";
  document.body.style.overflowAnchor = "";
}

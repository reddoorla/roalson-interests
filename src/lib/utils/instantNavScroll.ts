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

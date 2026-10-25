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
  // position runs before hydration; app.css's pre-hydration
  // `scroll-behavior: auto` and holdAnchoringForRestore make it land.
  if (type === "enter") return;
  requestAnimationFrame(() => {
    document.documentElement.style.scrollBehavior = "";
  });
}

/**
 * Whether kit 3 will restore a saved scroll position on this page load. It
 * is kit's own test (client.js `_start`), read the same way: the history
 * entry's index from `history.state["sveltekit:metadata"]`, and that index's
 * saved `scroll` in `sessionStorage["sveltekit:history-info"]`. Not the
 * navigation type: Chromium and WebKit keep the history state on a load of
 * the URL the tab is already on (Enter in the address bar, a full-reload
 * link), report it as `navigate`, and kit restores anyway
 * (roalson-interests#306, round 6). Both keys are kit-internal; if a kit
 * upgrade renames them this returns false, anchoring stays on, and
 * tests/interaction/history-scroll.spec.ts's reload test goes red at 1612.
 */
export function kitWillRestoreScroll(): boolean {
  try {
    const index = (history.state as Record<string, { historyIndex?: number }> | null)?.[
      "sveltekit:metadata"
    ]?.historyIndex;
    if (!index) return false;
    const info = JSON.parse(sessionStorage.getItem("sveltekit:history-info") ?? "{}") as Record<
      string,
      { scroll?: unknown } | undefined
    >;
    return Boolean(info[String(index)]?.scroll);
  } catch {
    return false;
  }
}

/**
 * Scroll anchoring off for a page load on which kit restores a saved
 * position, until the root layout mounts (`releaseAnchoring`). Call it from
 * `hooks.client.ts` `init`, which kit 3 runs before that restore.
 *
 * Why: kit restores the position before hydration, into the server-rendered
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
  if (!kitWillRestoreScroll()) return;
  document.documentElement.style.overflowAnchor = "none";
  document.body.style.overflowAnchor = "none";
}

/** Undo `holdAnchoringForRestore`, once the page has hydrated. */
export function releaseAnchoring(): void {
  document.documentElement.style.overflowAnchor = "";
  document.body.style.overflowAnchor = "";
}

/**
 * Where `sessionStorage` is blocked, hand reload and Back restores back to the
 * browser. Call it from `hooks.client.ts` `init`.
 *
 * Kit 3.1 sets `history.scrollRestoration = "manual"` at startup and restores
 * from `sessionStorage` itself; kit 2 also set it back to `"auto"` on unload,
 * and kit 3.1 does not. With site data blocked (Firefox's "block all cookies
 * and site data" makes `sessionStorage` throw), kit has nothing to restore and
 * the browser was told not to, so a reload or a Back from another site landed
 * at 0 where kit 2 landed exactly (roalson-interests#306, round 7). Setting
 * `"auto"` on `pagehide` gives that entry back to the browser, as kit 2 did.
 * With storage working this does nothing, and kit's own restore stands.
 * Returns the listener's remover (for tests).
 */
export function letBrowserRestoreWithoutStorage(): () => void {
  try {
    void sessionStorage.length;
    return () => {};
  } catch {
    const handBack = () => {
      history.scrollRestoration = "auto";
    };
    addEventListener("pagehide", handBack);
    return () => removeEventListener("pagehide", handBack);
  }
}

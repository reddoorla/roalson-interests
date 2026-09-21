/**
 * Move focus to an element and land it 20px under the pinned bar — an alert, a
 * confirmation or an error summary that script has just rendered (`reveal`), or
 * the control native validation has just refused (`revealInvalid`) — because
 * `focus()` alone loses a race with a smooth scroll in flight and leaves the
 * element focused and hidden.
 *
 * THE RACE. `focus()` scrolls "only if needed", and decides that at the instant
 * of the call; `html` is `scroll-behavior: smooth` (app.css), so every scroll
 * the browser makes for focus is a glide (0 → 558px took ~500ms on /contact).
 * Tab to a submit button and press Enter in the same breath: the glide that is
 * bringing the button into view is still in flight when the answer arrives, the
 * new panel IS in view at that instant, so focus() scrolls nothing — and the
 * glide then finishes with the panel under the bar. Measured on /contact at
 * 1440×900: the failure alert's top at −8px behind an 80px bar, focused and
 * invisible.
 *
 * The browser's own focus loses the same race. Native validation focuses the
 * first invalid control the same way: submitted by keyboard with Name empty,
 * that input was in view mid-glide and ended at top 70 under the 80px bar. And
 * `scrollIntoView({ block: "nearest" })` does NOT rescue it — Chromium leaves a
 * glide in flight alone when "nearest" finds nothing to do (measured: still 70).
 *
 * So: focus WITHOUT scrolling, then `scrollIntoView({ block: "start" })`, which
 * always has a destination, replaces whatever scroll is in flight, and lands
 * the same place every time. WHERE is not decided here: "start" honours
 * `html`'s `scroll-padding-top` (app.css — the bar plus 20px), so do not put a
 * `scroll-mt-*` on the target as well. The two add.
 *
 * `scrollIntoView` is called optionally because jsdom does not implement it.
 */
export function reveal(el: HTMLElement | null | undefined, anchor?: Element | null): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  (anchor ?? el).scrollIntoView?.({ block: "start" });
}

/**
 * An `oninvalid` handler for a form control: lands the control the browser has
 * just focused, LABEL first, where `reveal` lands a panel.
 *
 * The browser fires `invalid` at every invalid control, first to last, and only
 * then focuses the first — so every refused control asks, a frame later, and
 * only the one that was given focus acts. The label is the anchor because it
 * sits ABOVE the control: landing the input itself 20px under the bar would put
 * its own label behind the bar.
 *
 * `checkValidity()` fires the same event and moves focus nowhere, and the focus
 * check is what keeps the page still for it — unless focus already sits in an
 * invalid control, which no event can tell apart from a refusal. Nothing on
 * this site calls `checkValidity()`; know this before something does.
 */
export function revealInvalid(event: Event): void {
  const control = event.target as HTMLElement & { labels?: NodeListOf<HTMLLabelElement> | null };
  requestAnimationFrame(() => {
    if (document.activeElement !== control) return;
    reveal(control, control.labels?.[0]);
  });
}

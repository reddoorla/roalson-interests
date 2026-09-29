/** Stop the document scrolling behind a full-screen overlay; returns the
 *  release. Lifted out of Modal.svelte when the nav overlay needed the same
 *  lock — a second copy is how `prefersReducedMotion` ended up in two slices.
 *
 *  `overflow: hidden` on <body> (not documentElement, and not `position:
 *  fixed`): body's overflow propagates to the viewport while html's is
 *  `visible`, and unlike the position:fixed technique it neither loses the
 *  scroll position nor changes the containing block for absolute descendants —
 *  which matters, because the site header is fixed/absolute.
 *
 *  THE GUTTER IS RELEASED WHILE LOCKED (#172). app.css keeps `scrollbar-gutter:
 *  stable` on html, so a classic scrollbar's strip stays reserved under the
 *  lock, and nothing can paint into it: measured in Chromium 151, a fixed
 *  overlay at `inset: 0`, at `width: 100vw` (box 390 of 390) or at `right:
 *  -15px`, and a <dialog>'s ::backdrop, all left the strip showing the canvas.
 *  Only `scrollbar-gutter: auto` let them cover it. The page behind is held
 *  still by paying the strip back as body padding, and `--scroll-lock-gutter`
 *  on html is that width for fixed boxes that must not move either (the nav).
 *  The strip is measured off html's box, not `clientWidth`, which reads the
 *  full window on this site (tests/interaction/gutter.ts).
 *
 *  Call it from an `$effect` keyed on the overlay's open state and RETURN the
 *  release, so Svelte runs it on every close path and on unmount. A lock that
 *  outlives its overlay leaves the page permanently unscrollable, which is a
 *  worse bug than the one being fixed.
 *
 *  Each call restores exactly what it found, so locks nest: an overlay opened
 *  over another finds the strip already released and measures 0, and the
 *  outer release puts back the page's own values. SSR-safe — with no document
 *  it is a no-op. */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const body = document.body;
  const root = document.documentElement;
  const previous = {
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    gutter: root.style.scrollbarGutter,
    width: root.style.getPropertyValue("--scroll-lock-gutter"),
  };
  const gutter = Math.max(0, window.innerWidth - root.getBoundingClientRect().width);
  body.style.overflow = "hidden";
  if (gutter > 0) {
    root.style.scrollbarGutter = "auto";
    root.style.setProperty("--scroll-lock-gutter", `${gutter}px`);
    body.style.paddingRight = `${gutter}px`;
  }
  return () => {
    body.style.overflow = previous.overflow;
    body.style.paddingRight = previous.paddingRight;
    root.style.scrollbarGutter = previous.gutter;
    if (previous.width) root.style.setProperty("--scroll-lock-gutter", previous.width);
    else root.style.removeProperty("--scroll-lock-gutter");
  };
}

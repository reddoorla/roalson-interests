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
 *  Call it from an `$effect` keyed on the overlay's open state and RETURN the
 *  release, so Svelte runs it on every close path and on unmount. A lock that
 *  outlives its overlay leaves the page permanently unscrollable, which is a
 *  worse bug than the one being fixed.
 *
 *  Each call restores exactly what it found, so locks nest: an overlay opened
 *  over another puts back "hidden", and the outer release puts back the page's
 *  own value. SSR-safe — with no document it is a no-op. */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const body = document.body;
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;
  // Classic-scrollbar environments lose the scrollbar's width when the
  // document stops scrolling; pay it back as padding so the page behind
  // doesn't jump sideways as the overlay opens.
  const gutter = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (gutter > 0) body.style.paddingRight = `${gutter}px`;
  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
  };
}

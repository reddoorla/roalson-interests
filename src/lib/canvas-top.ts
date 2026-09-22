// The colour a route shows ABOVE the top of its own document — what a
// rubber-band overscroll at the top of the page pulls away to reveal.
//
// The other end of the page is a canvas colour (`html { background-color }` in
// app.css, the footer's sand, the same on every route). This end cannot be: the
// top of the page is the homepage hero's flat dark garnet, the Properties and
// Contact mastheads' garnet, or the page ground — three colours, one canvas. So
// app.css paints it with an element at negative coordinates (`.canvas-top`),
// the root layout renders that element once, and the ROUTE says what colour it
// is, the way it already says what its first band is (`navOver`) and what its
// footer grades from (`footerGround`).
//
// Why a token and not a colour: the claim a route is making is "the band I open
// on is this one of the theme's colours", and a route that spelled `#3d0707`
// would keep spelling it after the band moved to another token. Both values
// here are the exact ground CLASS the band component wears — HomeHero's section
// is `bg-dark`, PageMasthead's header is `bg-gradient-to-b from-primary` — and
// src/routes/nav-over.test.ts reads those components to check that each route's
// claim still matches the band it opens on.

/** The band grounds a route may claim, as the theme variable each one reads. */
export const CANVAS_TOP_COLORS = {
  /** HomeHero's flat dark-garnet ground (`bg-dark`, #3d0707). */
  dark: "var(--color-dark)",
  /** PageMasthead's gradient at its TOP stop (`from-primary`, #652323). */
  primary: "var(--color-primary)",
} as const;

export type CanvasTop = keyof typeof CANVAS_TOP_COLORS;

/**
 * The `style` attribute for the layout's `.canvas-top` element, or `undefined`
 * for a route that claims nothing.
 *
 * `undefined` is a real answer, not a failure: the CSS declares
 * `var(--canvas-top, var(--color-background))`, so an unclaimed route keeps the
 * page ground — which is exactly what it shows above its first band today. An
 * unrecognised token answers the same way rather than interpolating itself into
 * the style attribute, so a typo in page data is the old behaviour and never a
 * broken declaration.
 */
export function canvasTopStyle(token?: string | null): string | undefined {
  const color = token ? CANVAS_TOP_COLORS[token as CanvasTop] : undefined;
  return color ? `--canvas-top: ${color}` : undefined;
}

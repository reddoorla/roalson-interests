// The colour a route shows ABOVE the top of its own document — what a
// rubber-band overscroll at the top of the page pulls away to reveal — and,
// on Safari, the tint the browser puts on its own toolbar.
//
// THIS FILE WAS WRONG UNTIL 2026-09-22, and the way it was wrong is worth
// keeping. The first build painted the top with an ELEMENT at negative
// coordinates (`.canvas-top`, `position: absolute; bottom: 100%`), reasoning
// that a pull translates the scrolling contents and would therefore carry it
// into view. The premise that made it seem free is the same one that makes it
// impossible: scrollable overflow only ever grows DOWN and RIGHT, so an
// element above y=0 costs no scroll range — and is clipped out of the
// scrollable area entirely. The operator pulled on a real Mac and saw the
// canvas (sand), never the element. Headless Chromium had "proved" it by
// translating the contents from script, which assumes the thing in question.
//
// So it is inverted. A canvas has exactly one colour, the browser paints it at
// BOTH ends, and it comes from the root element's background. The TOP is the
// end that can only be the canvas, so the canvas is the top:
//
//   html { background-color: var(--canvas-top, var(--color-background)) }
//
// and the route declares `--canvas-top` on `:root` through the layout's head.
// The FOOT is then painted by `.canvas-foot` — a zero-height element after the
// footer whose `box-shadow` lays 100vh of sand below the last thing drawn.
// Painting BELOW the document end is the direction that is not clipped, and
// `box-shadow` is specified not to contribute to scrollable overflow, so that
// end costs no scroll range either. Same trick, the one way round that works.
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
 * The same grounds as LITERAL hexes, for `<meta name="theme-color">`.
 *
 * A second spelling of a colour is a drift risk, and this one cannot be
 * avoided: `theme-color` is read by the browser's own chrome, outside the
 * document, and it does not resolve `var()`. So the duplication is held still
 * instead — `canvas-top.test.ts` parses app.css's `@theme` block and fails if
 * either value stops matching the variable it claims to be.
 */
export const CANVAS_TOP_HEX = {
  dark: "#3d0707",
  primary: "#652323",
} as const satisfies Record<CanvasTop, string>;

/** The page ground, for a route that claims nothing. Same guard. */
export const CANVAS_TOP_DEFAULT_HEX = "#f2efe9";

/**
 * The CSS text of the `:root` rule the layout puts in the document head, or
 * `undefined` for a route that claims nothing.
 *
 * `undefined` is a real answer, not a failure: `html`'s declaration in app.css
 * is `var(--canvas-top, var(--color-background))`, so an unclaimed route keeps
 * the page ground — which is exactly what it shows above its first band today.
 * An unrecognised token answers the same way rather than interpolating itself
 * into a stylesheet, so a typo in page data is the old behaviour and never a
 * broken rule (nor an injection point: nothing but a value from the map above
 * is ever written).
 */
export function canvasTopRule(token?: string | null): string | undefined {
  const color = token ? CANVAS_TOP_COLORS[token as CanvasTop] : undefined;
  return color ? `:root{--canvas-top:${color}}` : undefined;
}

/**
 * The whole `<style>` element, as markup, or `undefined`.
 *
 * WHY THIS IS A STRING AND NOT A TAG IN THE LAYOUT. A literal `<style>` written
 * inside `<svelte:head>` is taken by the compiler as the COMPONENT's stylesheet
 * and hoisted out of the markup — it never reaches the document. Measured on a
 * production build 2026-09-22: `theme-color` shipped correctly on all four
 * routes and the rule was simply absent, so every page fell through to
 * `var(--color-background)` and the top went off-white. So the layout renders
 * this with `{@html}` instead, and the escaping question lives HERE, once.
 *
 * It is safe by construction rather than by sanitising: the only interpolated
 * value is `CANVAS_TOP_COLORS[token]`, a lookup on a frozen map of two literals
 * that the caller cannot add to. An unknown token returns `undefined` and
 * nothing is written. `canvas-top.test.ts` asserts that every possible output
 * is one of exactly three values, so a future edit that starts interpolating
 * the token itself fails there rather than in a browser.
 */
export function canvasTopStyleTag(token?: string | null): string | undefined {
  const rule = canvasTopRule(token);
  return rule ? `<style>${rule}</style>` : undefined;
}

/**
 * The `content` for `<meta name="theme-color">`: the literal hex of the band
 * this route opens on, falling back to the page ground.
 *
 * Always a colour, never `undefined` — the tag ships on every route, because a
 * route that omitted it would inherit whatever the last route set on a
 * client-side navigation.
 */
export function canvasTopThemeColor(token?: string | null): string {
  return (token && CANVAS_TOP_HEX[token as CanvasTop]) || CANVAS_TOP_DEFAULT_HEX;
}

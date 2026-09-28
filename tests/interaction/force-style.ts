import { expect, type Page } from "@playwright/test";

// How a spec writes a declaration from script and waits until the page WEARS
// it. It lives here, beside hydrated.ts, because canvas-ground.spec.ts and
// masthead-scrim.spec.ts each grew a private copy of it, and the second copy
// had to rediscover what the first knew (#170).
//
// WHY IT IS NOT `el.style.x = v`. The harness forces `reducedMotion: "reduce"`
// on every test, and app.css's reduce block gives EVERY element
// `transition-duration: 0.01ms !important` over a computed
// `transition-property: all`. So under this harness any change of computed
// value starts a transition, and until it runs out the element keeps its OLD
// value, even against an inline `!important`. Two consequences, both measured:
//
//  - On the element written: canvas-ground.spec.ts wrote `body`'s transform
//    and read `matrix(1, 0, 0, 1, 0, 0)` back in the same task.
//  - On its DESCENDANTS, for an inherited property: masthead-scrim.spec.ts hid
//    the bar with `visibility: hidden; transition: none`, both `!important`.
//    The bar computed `hidden` at once, but its CTA and menu button inherit
//    visibility through transitions of their own, still computed `visible` a
//    frame later, and were in the screenshot: the menu glyph at 1.00:1, sand
//    on sand. force-style.spec.ts pins that lag, and pins it on the reduce
//    rule. Measured 2026-09-28 on /contact: all 12 of the bar's descendants
//    still `visible` in the writing task under `reduce`; 0 under
//    `no-preference`; 0 under `reduce` with the rule's duration deleted.
//
// So: `transition: none !important` beside every write, on the element and,
// for an inherited property, on every descendant too; then POLL until every
// one of them computes the value, because "I wrote it" is not "it is applied".
// app.css's rule stays as it is: CSS cannot select "elements that declared a
// transition", so the only root fix is `transition-duration: 0s`, which stops
// `transitionend` firing under `reduce` at all: a product call, not a spec's.

/** Inherited properties a pixel-reading spec writes. A child takes these from
 *  its parent through a transition of its own, so the write goes to every
 *  descendant as well. Add a property here before writing it. */
const INHERITED = new Set(["visibility", "color"]);

/** `[selector, property, value, want]`: `want` is the COMPUTED value to wait
 *  for, when the browser reports it differently from how it was written
 *  (`#fff` computes to `rgb(255, 255, 255)`). */
export type StyleWrite = [selector: string, property: string, value: string, want?: string];

/** Write each declaration `!important` with its transition suppressed, then
 *  poll until every element it reaches computes it. */
export async function forceStyle(page: Page, writes: StyleWrite[], message: string) {
  const inherited = [...INHERITED];
  await page.evaluate(
    ({ writes, inherited }) => {
      for (const [sel, prop, value] of writes) {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) throw new Error(`forceStyle: nothing matches ${sel}`);
        const all = inherited.includes(prop)
          ? [el, ...el.querySelectorAll<HTMLElement>("*")]
          : [el];
        for (const node of all) {
          node.style.setProperty("transition", "none", "important");
          node.style.setProperty(prop, value, "important");
        }
      }
    },
    { writes, inherited },
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ writes, inherited }) =>
            writes.every(([sel, prop, value, want]) => {
              const el = document.querySelector(sel)!;
              const all = inherited.includes(prop) ? [el, ...el.querySelectorAll("*")] : [el];
              return all.every(
                (node) => getComputedStyle(node).getPropertyValue(prop) === (want ?? value),
              );
            }),
          { writes, inherited },
        ),
      message,
    )
    .toBe(true);
}

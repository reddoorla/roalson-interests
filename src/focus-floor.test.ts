import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Focus styling in this template is opt-in per component: the buttons on the
// fixtures page carry their own rings and everything else falls back to the
// UA's 1px hairline, which is invisible on a dark nav or over a photo hero
// (WCAG 2.4.7). There was no floor at all — `grep -a "focus-visible" src/app.css`
// returned nothing. This asserts the floor exists, since a CSS cascade rule is
// not reachable from jsdom, which resolves no stylesheets.
// Resolved from the project root, not `import.meta.url`: under the jsdom
// environment vite serves this module over http, so `new URL(..., import.meta.url)`
// is not a file: URL and readFileSync rejects it.
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");

const FLOOR_SELECTOR = ':where(a, button, summary, [tabindex]:not([tabindex="-1"])):focus-visible';

describe("the keyboard-focus floor", () => {
  it("gives every interactive element a visible outline on :focus-visible", () => {
    // Located by string, then sliced to the closing brace. A regex for the
    // selector is a trap here: `[^)]*` stops at the nested `)` inside
    // `:not([tabindex="-1"])`, so it matches nothing however good the CSS is —
    // which is exactly how a check that can only ever fail gets written.
    const at = css.indexOf(FLOOR_SELECTOR);
    expect(at, "no :focus-visible floor rule in app.css").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at) + 1);
    expect(rule).toMatch(/outline:\s*2px solid/);
  });

  // `:where()` contributes ZERO specificity, so the floor weighs one
  // pseudo-class and every authored `focus-visible:ring-*` still wins twice
  // over — higher specificity AND a later cascade layer. Written as a bare
  // selector it would outrank the utilities it is meant to sit under.
  it("is written with :where() so authored rings still win", () => {
    expect(css).toContain(
      ':where(a, button, summary, [tabindex]:not([tabindex="-1"])):focus-visible',
    );
  });
});

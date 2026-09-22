import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CANVAS_TOP_COLORS,
  CANVAS_TOP_DEFAULT_HEX,
  CANVAS_TOP_HEX,
  canvasTopRule,
  canvasTopStyleTag,
  canvasTopThemeColor,
} from "./canvas-top";

const APP_CSS = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
const THEME = /@theme\s*\{([\s\S]*?)\n\}/.exec(APP_CSS)?.[1] ?? "";

/** The hex a `--color-*` variable is actually set to in app.css's @theme. */
const themeHex = (name: string) =>
  new RegExp(`--color-${name}:\\s*(#[0-9a-f]{3,8})`, "i").exec(THEME)?.[1]?.toLowerCase();

/** Tokens a route may not claim, written as they have actually gone wrong or
 *  plausibly could: absent, blank, a colour rather than a token, a trailing
 *  space, the variable spelled out, and an injection attempt. */
const NOT_A_CLAIM = [
  undefined,
  null,
  "",
  "sand",
  "dark ",
  "--color-dark",
  "red;}html{display:none",
];

describe("a route's claim, as the rule the layout puts in the head", () => {
  it.each(Object.keys(CANVAS_TOP_COLORS))("%s resolves to its own theme colour", (token) => {
    const value = CANVAS_TOP_COLORS[token as keyof typeof CANVAS_TOP_COLORS];
    expect(canvasTopRule(token)).toBe(`:root{--canvas-top:${value}}`);
    expect(canvasTopStyleTag(token)).toBe(`<style>:root{--canvas-top:${value}}</style>`);
  });

  it.each(NOT_A_CLAIM)("%o claims nothing, so the CSS default stands", (token) => {
    expect(canvasTopRule(token as string | undefined)).toBeUndefined();
    expect(canvasTopStyleTag(token as string | undefined)).toBeUndefined();
  });

  // THE REASON THIS ONE EXISTS. The layout renders the tag with `{@html}`,
  // because a literal <style> inside <svelte:head> is hoisted out as the
  // component's own stylesheet and never reaches the document (measured on a
  // production build, 2026-09-22). `{@html}` is safe here only while the
  // output can never contain anything but a value from the frozen map — so
  // that is asserted directly, as a CLOSED SET, rather than left to review.
  // An edit that started interpolating the token itself fails here.
  it("can only ever emit one of exactly three strings, whatever it is handed", () => {
    const possible = new Set(
      [
        ...Object.keys(CANVAS_TOP_COLORS),
        ...NOT_A_CLAIM,
        "<script>",
        "}",
        "var(--color-error)",
      ].map((t) => canvasTopStyleTag(t as string | undefined)),
    );
    expect([...possible].sort()).toEqual([
      "<style>:root{--canvas-top:var(--color-dark)}</style>",
      "<style>:root{--canvas-top:var(--color-primary)}</style>",
      undefined,
    ]);
    for (const out of possible) {
      if (out === undefined) continue;
      expect(out, "nothing but a <style> element is ever emitted").toMatch(
        /^<style>:root\{--canvas-top:var\(--color-[a-z]+\)\}<\/style>$/,
      );
    }
  });

  // The token IS the theme colour's name, so the two cannot drift apart. This
  // is what lets the route claim read as "the ground class my first band wears"
  // (`bg-dark`, `from-primary`) rather than as a hex value copied twice.
  it("every token names the theme colour it resolves to", () => {
    for (const [token, value] of Object.entries(CANVAS_TOP_COLORS)) {
      expect(value).toBe(`var(--color-${token})`);
    }
  });

  // A claim about code, so it is made by reading that code: a token whose theme
  // colour does not exist would resolve to nothing at all and leave the canvas
  // at its fallback — which is the defect, not a graceful degrade.
  it("every colour it names is defined in the theme", () => {
    expect(THEME).not.toBe("");
    for (const token of Object.keys(CANVAS_TOP_COLORS)) {
      expect(themeHex(token), `--color-${token} is not in @theme`).toBeTruthy();
    }
  });
});

describe("theme-color — the same grounds, spelled a second time", () => {
  // `<meta name="theme-color">` is read by the browser's own chrome, outside
  // the document, and it does not resolve var(). So these hexes MUST be
  // duplicated — and a duplicated colour is exactly how a palette drifts. This
  // block is the thing that holds them still: it reads app.css and fails if
  // either stops being the variable it claims to be.
  it.each(Object.keys(CANVAS_TOP_HEX))("%s's hex is still what @theme says", (token) => {
    expect(CANVAS_TOP_HEX[token as keyof typeof CANVAS_TOP_HEX].toLowerCase()).toBe(
      themeHex(token),
    );
  });

  it("the unclaimed default is still the page ground", () => {
    expect(CANVAS_TOP_DEFAULT_HEX.toLowerCase()).toBe(themeHex("background"));
  });

  // Unlike the rule, this one has no "nothing" answer: the tag ships on every
  // route. A route that omitted it would keep whatever the PREVIOUS route set
  // across a client-side navigation, so an unclaimed route has to say the page
  // ground out loud.
  it.each(NOT_A_CLAIM)("%o still gets a colour — the page ground", (token) => {
    expect(canvasTopThemeColor(token as string | undefined)).toBe(CANVAS_TOP_DEFAULT_HEX);
  });

  it.each(Object.keys(CANVAS_TOP_HEX))("%s gets its own band's hex", (token) => {
    expect(canvasTopThemeColor(token)).toBe(CANVAS_TOP_HEX[token as keyof typeof CANVAS_TOP_HEX]);
  });

  it("never answers with anything but a six-digit hex", () => {
    for (const token of [...Object.keys(CANVAS_TOP_HEX), ...NOT_A_CLAIM]) {
      expect(canvasTopThemeColor(token as string | undefined)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("the two ends of the page, in app.css", () => {
  // The whole fix, as one assertion each. These read app.css because that is
  // where the mechanism lives; tests/interaction/canvas-ground.spec.ts then
  // measures both in a browser.
  it("the canvas is the route's TOP colour, falling back to the page ground", () => {
    expect(APP_CSS).toMatch(/background-color:\s*var\(--canvas-top,\s*var\(--color-background\)\)/);
  });

  it("the FOOT is painted by a shadow, so it cannot add scroll range", () => {
    const rule = /\.canvas-foot\s*\{([^}]*)\}/.exec(APP_CSS)?.[1] ?? "";
    expect(rule, "no .canvas-foot rule in app.css").not.toBe("");
    expect(rule).toMatch(/height:\s*0/);
    expect(rule).toMatch(/box-shadow:[^;]*var\(--color-light\)/);
    // A `background-color` here would paint the same pixels and add 100vh of
    // scroll to every page — which is the trap this rule is shaped to avoid.
    expect(rule, "a background would be scrollable; a shadow is not").not.toMatch(
      /background(-color)?:/,
    );
  });

  // The old mechanism, named so it cannot come back by accident. `.canvas-top`
  // was an element at `bottom: 100%`, above the document's y=0 — where the
  // scroll origin is clamped, so a rubber-band never reached it. The operator
  // pulled on a Mac on 2026-09-22 and saw the canvas, not the element.
  it("the element above the document's origin is gone", () => {
    expect(APP_CSS).not.toMatch(/\.canvas-top\s*\{/);
  });
});

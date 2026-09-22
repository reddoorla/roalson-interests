import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CANVAS_TOP_COLORS, canvasTopStyle } from "./canvas-top";

const APP_CSS = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

describe("canvasTopStyle — a route's claim as a declaration", () => {
  it.each(Object.keys(CANVAS_TOP_COLORS))("%s resolves to its own theme colour", (token) => {
    expect(canvasTopStyle(token)).toBe(
      `--canvas-top: ${CANVAS_TOP_COLORS[token as keyof typeof CANVAS_TOP_COLORS]}`,
    );
  });

  // Not decoration: the layout interpolates this straight into a `style`
  // attribute. A route that claims nothing, or claims something this module has
  // never heard of, must produce NO declaration — the CSS default then stands.
  it.each([undefined, null, "", "sand", "dark ", "--color-dark", "red; display:none"])(
    "%o claims nothing, so the CSS default stands",
    (token) => {
      expect(canvasTopStyle(token as string | undefined)).toBeUndefined();
    },
  );

  // The token IS the theme colour's name, so the two cannot drift apart. This
  // is what lets the route claim read as "the ground class my first band wears"
  // (`bg-dark`, `from-primary`) rather than as a hex value copied twice.
  it("every token names the theme colour it resolves to", () => {
    for (const [token, value] of Object.entries(CANVAS_TOP_COLORS)) {
      expect(value).toBe(`var(--color-${token})`);
    }
  });

  // A claim about code, so it is made by reading that code: a token whose theme
  // colour does not exist would resolve to nothing at all and paint the element
  // transparent — which is the defect, not a fallback.
  it("every colour it names is defined in the theme", () => {
    const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(APP_CSS)?.[1] ?? "";
    expect(theme).not.toBe("");
    for (const token of Object.keys(CANVAS_TOP_COLORS)) {
      expect(theme).toMatch(new RegExp(`--color-${token}:\\s*#[0-9a-f]{3,8}`, "i"));
    }
  });
});

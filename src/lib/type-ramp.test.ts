import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The comp's type ramp, pinned.
 *
 * Figma sets `leadingTrim: CAP_HEIGHT` on H1–H5, so the comp's vertical gaps
 * are measured cap-to-baseline while CSS makes every line box `line-height`
 * tall. `app.css` compensates with a negative block margin per style. That
 * margin is the one number in the ramp that is DERIVED rather than transcribed,
 * which makes it the one that can be wrong without looking wrong.
 *
 * It was in fact wrong once: the Stage A inventory recorded H5's trim as 2.2px
 * when it is 3.2px. Nothing would have caught that — the eyebrow would simply
 * have sat 1px low, on every eyebrow on the site.
 *
 * So this test RECOMPUTES the expected margin from the measured cap ratio and
 * compares it to what app.css declares. Transcribing a wrong number into both
 * places is the only way to fool it, and that is a different mistake from
 * making an arithmetic slip in one of them.
 */

/** Measured on this Figma file: every CAP_HEIGHT-trimmed single-line node
 *  reports round(0.66 × fontSize), across nine nodes from 10px to 66px. */
const CAP_RATIO = 0.66;

/** The comp's styles. size / lineHeight in px, and whether Figma trims it. */
const RAMP = [
  { name: "t-h1", size: 66, lineHeight: 80, weight: 500, trimmed: true },
  { name: "t-h2", size: 38, lineHeight: 48, weight: 500, trimmed: true },
  { name: "t-h3", size: 24, lineHeight: 34.8, weight: 500, trimmed: true },
  { name: "t-h4", size: 14, lineHeight: 25.2, weight: 600, trimmed: true },
  { name: "t-h5", size: 12, lineHeight: 14.4, weight: 600, trimmed: true },
  // NOT trimmed in the comp. The most-used style in the file (185 nodes) and
  // the only label-sized one that is untrimmed — see the note in app.css.
  { name: "t-h6", size: 12, lineHeight: 18, weight: 600, trimmed: false },
  { name: "t-body-1", size: 16, lineHeight: 24, weight: 400, trimmed: false },
  { name: "t-body-2", size: 14, lineHeight: 20, weight: 400, trimmed: false },
] as const;

const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

/** The body of `@utility <name> { … }`, or null when it is not declared. */
function utilityBody(name: string): string | null {
  const m = css.match(new RegExp(`@utility\\s+${name}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

function declaration(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`(?:^|;|\\n)\\s*${prop}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

const px = (v: string | null) => (v === null ? null : Number.parseFloat(v));

describe("type ramp", () => {
  it.each(RAMP)("$name declares the comp's size, line-height and weight", (style) => {
    const body = utilityBody(style.name);
    expect(body, `@utility ${style.name} is not declared in app.css`).not.toBeNull();
    expect(px(declaration(body!, "font-size"))).toBe(style.size);
    expect(px(declaration(body!, "line-height"))).toBe(style.lineHeight);
    expect(px(declaration(body!, "font-weight"))).toBe(style.weight);
  });

  it.each(RAMP.filter((s) => s.trimmed))(
    "$name compensates the cap-height trim by exactly half the leading",
    (style) => {
      const capBox = Math.round(CAP_RATIO * style.size);
      const expected = -((style.lineHeight - capBox) / 2);
      const declared = px(declaration(utilityBody(style.name)!, "margin-block"));
      expect(
        declared,
        `${style.name}: Figma trims this style to a ${capBox}px cap box, so CSS adds ` +
          `${((style.lineHeight - capBox) / 2).toFixed(2)}px of half-leading above and ` +
          `below that the comp never showed. app.css declares ${declared}px. ` +
          `Recompute as -(lineHeight - round(${CAP_RATIO} x size)) / 2 rather than ` +
          `adjusting this expectation.`,
      ).toBeCloseTo(expected, 2);
    },
  );

  it.each(RAMP.filter((s) => !s.trimmed))("$name is untrimmed and takes NO margin", (style) => {
    const declared = declaration(utilityBody(style.name)!, "margin-block");
    expect(
      declared,
      `${style.name} is leadingTrim: NONE in the comp — its box is exactly its ` +
        `line-height, so a compensating margin would push it out of position.`,
    ).toBeNull();
  });

  /** The ramp is only useful if it is the ONLY place these numbers live. */
  it("every style in the ramp is declared, and none has been quietly dropped", () => {
    const declared = [...css.matchAll(/@utility\s+(t-[a-z0-9-]+)\s*\{/g)].map((m) => m[1]);
    expect(declared.sort()).toEqual(RAMP.map((s) => s.name).sort());
  });
});

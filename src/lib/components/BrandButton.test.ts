import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { createRawSnippet } from "svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import BrandButton, {
  BRAND_BUTTON_TONES,
  brandButtonBase,
  brandButtonPadding,
} from "./BrandButton.svelte";

afterEach(cleanup);

const label = createRawSnippet(() => ({ render: () => "<span>Learn more</span>" }));

describe("BrandButton", () => {
  it("is a link to its href, named by its label", () => {
    const { getByRole } = render(BrandButton, { props: { href: "/properties", children: label } });
    expect(getByRole("link", { name: "Learn more" }).getAttribute("href")).toBe("/properties");
  });

  it("adds its arrow without adding to its name", () => {
    const { getByRole } = render(BrandButton, {
      props: { href: "/x", arrow: true, children: label },
    });
    const glyphs = [...getByRole("link", { name: "Learn more" }).querySelectorAll("svg")];
    expect(glyphs.length).toBeGreaterThan(0);
    for (const svg of glyphs) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });
});

// The contact form's submit is a <button> and this component is an <a>, so the
// page wears the button through the module script's exports. That is only the
// same button for as long as the component renders FROM those exports.
describe("BrandButton's exported classes", () => {
  const tokens = (s: string) => s.split(/\s+/).filter(Boolean);

  it("are all worn by what the component renders, in every tone, with and without the arrow", () => {
    for (const tone of ["garnet", "cream", "light"] as const) {
      for (const arrow of [false, true]) {
        const { getByRole } = render(BrandButton, {
          props: { href: "/x", tone, arrow, children: label },
        });
        expect(tokens(getByRole("link").className)).toEqual(
          expect.arrayContaining(
            tokens(`${brandButtonBase} ${BRAND_BUTTON_TONES[tone]} ${brandButtonPadding(arrow)}`),
          ),
        );
        cleanup();
      }
    }
  });

  it("leave colour to the tone, so a caller can pick one", () => {
    // Two competing `border-*`/`text-*` sets in one class attribute resolve by
    // stylesheet order, not by the order they were written.
    expect(brandButtonBase).not.toMatch(
      /\b(text|bg|border)-(primary|background|dust|light|dark)\b/,
    );
  });
});

// ── the tones, measured ─────────────────────────────────────────────────────
//
// Each tone's label, at rest and on its hover fill, against the grounds it is
// placed on — computed from app.css's tokens and the class strings the
// component ships.

type Rgb = [number, number, number];

const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(
  readFileSync(resolve(process.cwd(), "src/app.css"), "utf8"),
)![1];
const token = (name: string): Rgb | null => {
  const raw = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(theme)?.[1].trim();
  if (raw === undefined || raw === "transparent" || raw === "currentColor") return null;
  const hex = raw === "white" ? "#ffffff" : raw === "black" ? "#000000" : raw;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`--color-${name} is "${raw}"`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
};

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** What the tone's `<utility>-<token>[/<pct>]` paints over `ground`, at rest
 *  or under `hover:` — null when it sets none. */
function painted(classes: string, utility: "text" | "bg", hover: boolean, ground: Rgb) {
  for (const c of classes.split(/\s+/)) {
    const variants = c.split(":");
    const m = new RegExp(`^${utility}-([a-z-]+?)(?:/(\\d+))?$`).exec(variants.pop()!);
    if (!m || (hover ? !variants.includes("hover") : variants.length > 0)) continue;
    const colour = token(m[1]);
    if (!colour) continue;
    const alpha = m[2] === undefined ? 1 : Number(m[2]) / 100;
    return colour.map((v, i) => Math.round(v * alpha + ground[i] * (1 - alpha))) as Rgb;
  }
  return null;
}

const GROUNDS = {
  // "garnet" on the off-white page, white and the sand card; "cream" on the
  // garnet property card and the homepage hero's dark ground; "light" on the
  // nav floating over a dark band.
  garnet: ["background", "white", "light"],
  cream: ["primary", "dark"],
  light: ["primary", "dark"],
} as const;

const AA = 4.5;

describe("BrandButton tones", () => {
  const cases = Object.entries(GROUNDS).flatMap(([tone, grounds]) =>
    grounds.map((ground) => ({ tone: tone as keyof typeof BRAND_BUTTON_TONES, ground })),
  );

  it.each(cases)(
    "$tone on bg-$ground: the label clears AA at rest and on hover",
    ({ tone, ground }) => {
      const classes = BRAND_BUTTON_TONES[tone];
      const g = token(ground)!;
      const restFill = painted(classes, "bg", false, g) ?? g;
      const rest = painted(classes, "text", false, restFill);
      expect(rest, `the ${tone} tone sets no text colour`).not.toBeNull();
      const hoverFill = painted(classes, "bg", true, g) ?? restFill;
      const hovered = painted(classes, "text", true, hoverFill) ?? rest!;
      expect(contrast(rest!, restFill), "at rest").toBeGreaterThanOrEqual(AA);
      expect(contrast(hovered, hoverFill), "on hover").toBeGreaterThanOrEqual(AA);
    },
  );

  it("covers every tone the component ships", () => {
    expect(Object.keys(GROUNDS).sort()).toEqual(Object.keys(BRAND_BUTTON_TONES).sort());
  });
});

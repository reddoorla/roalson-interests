import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
    // Garnet unless a ground says otherwise — see the next describe.
    expect(rule).toContain("var(--focus-ring, var(--color-primary))");
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

// The ring was garnet on every ground, which is 1:1 on `bg-primary`. It takes
// its colour from the ground it is drawn on now: a ground class sets
// `--focus-ring` for its CHILDREN (an outline sits outside its element, on the
// container's ground), and inheritance resolves to the nearest one.
describe("the focus ring follows its ground", () => {
  const DARK = ["primary", "dark", "black"] as const;
  const LIGHT = ["background", "light", "white"] as const;
  /** Fills that are never a container's ground. `dust` was the buttons' hover
   *  fill until the operator moved their light colour to the tan on 2026-09-22;
   *  its only `bg-dust` in src/ now is HomeHero's half-pixel rule. Either way a
   *  hover fill is `hover:bg-*`, which the scan below does not count. */
  const NOT_A_GROUND = ["dust", "transparent", "current"] as const;

  /** The rule that sets a value: from the `:where(` that opens its selector
   *  to its closing brace — not from the previous `}`, which would drag the
   *  comment above it in and make every anchored match fail. */
  const block = (needle: string) => {
    const at = css.indexOf(needle);
    expect(at, `no rule setting ${needle}`).toBeGreaterThan(-1);
    return css.slice(css.lastIndexOf(":where(", at), css.indexOf("}", at) + 1);
  };
  const darkRule = block("--focus-ring: var(--color-background)");
  const lightRule = block("--focus-ring: var(--color-primary)");

  const theme = (() => {
    const body = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    const out: Record<string, string> = { white: "#ffffff", black: "#000000" };
    for (const m of body.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  })();
  const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };
  const luminance = (value: string) => {
    const raw = (NAMED[value] ?? value).replace("#", "");
    const h = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
    expect(h, `cannot measure ${value}`).toMatch(/^[0-9a-f]{6}$/i);
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(theme[a]), luminance(theme[b])].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("sets the ring for what sits ON a ground, never for the ground itself", () => {
    for (const rule of [darkRule, lightRule]) {
      expect(rule).toMatch(/^:where\([^{]+\)\s*>\s*\*\s*\{/);
    }
    for (const token of DARK) expect(darkRule).toContain(`.bg-${token}`);
    for (const token of LIGHT) expect(lightRule).toContain(`.bg-${token}`);
    // The dark bands are gradients with no `bg-*`, and the floating bar has no
    // ground of its own.
    expect(darkRule).toContain(".from-primary");
    expect(darkRule).toContain("[data-floating]");
  });

  it("draws both rings at 3:1 or better against every ground they land on", () => {
    for (const ground of DARK) {
      expect(contrast("background", ground), `off-white ring on ${ground}`).toBeGreaterThanOrEqual(
        3,
      );
    }
    for (const ground of LIGHT) {
      expect(contrast("primary", ground), `garnet ring on ${ground}`).toBeGreaterThanOrEqual(3);
    }
    // …and the defect this replaced, so the numbers stay on record.
    expect(contrast("primary", "primary")).toBe(1);
    expect(contrast("primary", "dark")).toBeLessThan(1.5);
  });

  it("classifies every ground class the markup uses", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? files(join(dir, e.name))
          : e.name.endsWith(".svelte")
            ? [join(dir, e.name)]
            : [],
      );
    const known = new Set<string>([...DARK, ...LIGHT, ...NOT_A_GROUND]);
    const tokens = new Set(Object.keys(theme));
    const found = new Set<string>();
    for (const file of files(resolve(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf-8");
      // Unprefixed only: `hover:bg-primary` is a fill, not a container's ground.
      for (const m of src.matchAll(/(?<![\w:-])(?:bg|from)-([a-z0-9]+)(?![\w-])/g)) {
        if (tokens.has(m[1])) found.add(m[1]);
      }
    }
    expect(found.size, "the scan found no ground classes at all").toBeGreaterThan(3);
    expect([...found].filter((t) => !known.has(t))).toEqual([]);
  });
});

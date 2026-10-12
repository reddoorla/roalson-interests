import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CANVAS_TOP_COLORS } from "$lib/canvas-top";

// Focus styling in this template is opt-in per component: the buttons on the
// fixtures page carry their own rings and everything else falls back to the
// UA's 1px hairline, which is invisible on a dark nav or over a photo hero
// (WCAG 2.4.7). app.css lays a floor under all of it, and a CSS cascade rule
// is not reachable from jsdom, which resolves no stylesheets — so the rings
// are measured from the theme tokens here and in a browser by
// tests/interaction/focus-ring.spec.ts.
// Resolved from the project root, not `import.meta.url`: under the jsdom
// environment vite serves this module over http, so `new URL(..., import.meta.url)`
// is not a file: URL and readFileSync rejects it.
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8");

describe("the keyboard-focus floor", () => {
  it("gives :focus-visible an outline in the ring colour its ground sets", () => {
    const floor = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(floor, "no :focus-visible floor in app.css").toBeDefined();
    expect(floor).toMatch(/outline(?:-color)?:[^;]*var\(--focus-ring\b/);
  });
});

// The ring was garnet on every ground, which is 1:1 on `bg-primary`. It takes
// its colour from the ground it is drawn on now: a ground class sets
// `--focus-ring` for its CHILDREN (an outline sits outside its element, on the
// container's ground), and inheritance resolves to the nearest one.
describe("the focus ring follows its ground", () => {
  /** Fills that are never a container's ground. `dust` was the buttons' hover
   *  fill until the operator moved their light colour to the tan on 2026-09-22;
   *  HomeHero's half-pixel rule was its last `bg-dust` in src/, until the
   *  revised hero dropped the specialty list on 2026-09-28. Either way a
   *  hover fill is `hover:bg-*`, which the scan below does not count.
   *  `secondary` is Slider's idle dot (#58): a childless <span>, so nothing
   *  is ever focused on it. */
  const NOT_A_GROUND = ["dust", "secondary", "transparent", "current"] as const;

  /** Each `--focus-ring` rule's selector and the theme colour it sets the ring
   *  to. Only a rule written on `> *` counts: a ground that coloured its own
   *  ring would give a garnet button on the off-white page an off-white one. */
  const ringRules = (() => {
    const out: { selector: string; ring: string }[] = [];
    for (const m of css.matchAll(/--focus-ring:\s*var\(--color-([a-z0-9-]+)\)/g)) {
      const open = css.lastIndexOf("{", m.index);
      const from = Math.max(css.lastIndexOf("}", open), css.lastIndexOf("*/", open));
      const selector = css.slice(from, open);
      if (/>\s*\*\s*$/.test(selector)) out.push({ selector, ring: m[1] });
    }
    return out;
  })();
  /** Every ground class a `--focus-ring` rule names (`bg-dark`), and the
   *  theme colour it sets the ring to — read from the selector in front of
   *  each declaration, so the pairs measured below are the ones the stylesheet
   *  actually ships. */
  const rings = new Map(
    ringRules.flatMap(({ selector, ring }) =>
      [...selector.matchAll(/\.((?:bg|from)-[a-z0-9]+)/g)].map((g) => [g[1], ring] as const),
    ),
  );
  /** The theme colour a ground class paints: `bg-dark` → `dark`. */
  const token = (ground: string) => ground.slice(ground.indexOf("-") + 1);

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

  it("draws every ring at 3:1 or better against the ground that sets it", () => {
    expect(rings.size, "no ground sets a --focus-ring in app.css").toBeGreaterThan(3);
    for (const [ground, ring] of rings) {
      expect(contrast(ring, token(ground)), `${ring} ring on ${ground}`).toBeGreaterThanOrEqual(3);
    }
  });

  // The floating bar has no ground of its own: it borrows the band a route
  // opens on under it, which is one of the grounds a route may claim.
  it("draws the floating bar's ring at 3:1 or better on every band it floats over", () => {
    const ring = ringRules.find((r) => r.selector.includes("[data-floating]"))?.ring;
    expect(ring, "no --focus-ring rule names [data-floating]").toBeDefined();
    for (const band of Object.keys(CANVAS_TOP_COLORS)) {
      expect(contrast(ring!, band), `${ring} ring over ${band}`).toBeGreaterThanOrEqual(3);
    }
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
    const known = new Set<string>([
      ...rings.keys(),
      ...NOT_A_GROUND.flatMap((t) => [`bg-${t}`, `from-${t}`]),
    ]);
    const tokens = new Set(Object.keys(theme));
    const found = new Set<string>();
    for (const file of files(resolve(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf-8");
      // Unprefixed only: `hover:bg-primary` is a fill, not a container's ground.
      for (const m of src.matchAll(/(?<![\w:-])((?:bg|from)-([a-z0-9]+))(?![\w-])/g)) {
        if (tokens.has(m[2])) found.add(m[1]);
      }
    }
    expect(found.size, "the scan found no ground classes at all").toBeGreaterThan(3);
    expect([...found].filter((t) => !known.has(t))).toEqual([]);
  });
});

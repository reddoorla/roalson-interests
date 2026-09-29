import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DIMMED_CLUSTER_OPACITY, DIMMED_PIN_OPACITY } from "$lib/property-map";

/**
 * THE DIMMED MARKERS STILL MEET THEIR CONTRAST — re-measured from the map's
 * own colours every run (operator, 2026-09-29: "whatever the active pin is
 * should stay full opacity and the rest should be slightly reduced opacity so
 * it's featured").
 *
 * "Slightly" is decided here, not by taste. A pin is an interactive graphic,
 * so once it is composited at DIMMED_PIN_OPACITY its garnet must keep 3:1
 * (WCAG 1.4.11) against every ground the tinted style can put under it. A
 * cluster's count is TEXT, sand on its garnet disc, so at
 * DIMMED_CLUSTER_OPACITY the two must keep 4.5:1 (WCAG 1.4.3) after both are
 * composited over that ground. Each constant must be the LOWEST two-decimal
 * value that does, so a palette change that moves the answer either way is a
 * red test here, naming the ground, rather than a number nobody re-derives.
 *
 * NOTHING IS TYPED IN TWICE. The grounds come from static/map-style.json
 * (every paint layer, composited at its own opacity over the style's
 * background), the pin's colours from app.css's `@theme` through the token
 * names PropertyMap.svelte actually paints the pin and the disc with.
 *
 * THE MARGIN, AND WHY IT IS THIS ONE. The page is painted in 8-bit sRGB, so a
 * composite can land one step off the exact blend on any channel, and a tile
 * edge can too. The rule is: the ratio must hold with EVERY channel of BOTH
 * colours moved one step toward the other. That is a margin with a reason; a
 * round "3.2" would be taste.
 */

type Rgb = [number, number, number];

const REPO_ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(REPO_ROOT, path), "utf8");

/** WCAG 2.x relative luminance — the implementation theme-contrast.test.ts uses. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The same ratio with every channel of both colours one 8-bit step toward
 *  the other — the lighter one darker, the darker one lighter. */
function contrastAtWorst(a: Rgb, b: Rgb): number {
  const [hi, lo] = luminance(a) >= luminance(b) ? [a, b] : [b, a];
  return contrast(hi.map((c) => c - 1) as Rgb, lo.map((c) => c + 1) as Rgb);
}

/** `fg` at `alpha` over opaque `bg`, rounded to the 8 bits it is painted in. */
const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((c, i) => Math.round(c * alpha + bg[i]! * (1 - alpha))) as Rgb;

/** A colour as the style or the theme spells it: `#rrggbb`, `#rgb`, or
 *  `rgba(r, g, b, a)` — the alpha returned separately. */
function parse(value: string): { rgb: Rgb; alpha: number } {
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(
    value,
  );
  if (rgba) {
    return {
      rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])],
      alpha: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!hex) throw new Error(`a colour this guard cannot read: ${value}`);
  const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (c) => c + c) : hex[1]!;
  return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, alpha: 1 };
}

const hex = (rgb: Rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");

// ── the pin's own colours ─────────────────────────────────────────────────

const theme = (() => {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(read("src/app.css"));
  if (!block) throw new Error("no @theme block in src/app.css");
  const out: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g))
    out[m[1]!] = m[2]!.trim();
  return out;
})();

/** The token names the component paints with, read off its markup: the pin's
 *  body and hole (twice each — the live pin and the picture's), and the
 *  cluster disc and its count (the same twice). Each must be ONE token, or
 *  the two copies have drifted and there is no single colour to measure. */
const painted = (() => {
  const src = read("src/lib/components/PropertyMap.svelte");
  const one = (re: RegExp, what: string) => {
    const all = [...src.matchAll(re)].map((m) => m[1]!);
    const found = [...new Set(all)];
    if (all.length !== 2 || found.length !== 1)
      throw new Error(
        `${what}: expected ONE token painted in BOTH copies (live + picture), ` +
          `found ${JSON.stringify(all)} — update this guard with the markup`,
      );
    return found[0]!;
  };
  return {
    body: one(/<path d=\{PIN_PATH\} fill="var\(--color-([a-z0-9-]+)\)"/g, "pin body"),
    hole: one(/r=\{PIN_HOLE\.r\}\s*fill="var\(--color-([a-z0-9-]+)\)"/g, "pin hole"),
    disc: one(/rounded-full bg-([a-z0-9-]+) font-semibold/g, "cluster disc"),
    count: one(/font-semibold\s+text-([a-z0-9-]+)\s+tabular-nums/g, "cluster count"),
  };
})();

const token = (name: string): Rgb => {
  const value = theme[name];
  if (value === undefined) throw new Error(`no --color-${name} in app.css @theme`);
  return parse(value).rgb;
};

// ── the grounds, from the style ───────────────────────────────────────────

interface Layer {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
}
const style = JSON.parse(read("static/map-style.json")) as { layers: Layer[] };

/** Every literal colour a paint value can take — a plain string, or the
 *  string stops of an `interpolate`/`step`/`match` expression. */
function colours(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === "string" ? colours(v) : []));
  return [];
}
const isColour = (s: string) => /^(#|rgba?\()/.test(s);
/** The strongest opacity a paint value reaches: the number, or the largest
 *  numeric stop of an expression; absent is 1. */
function strongest(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    // `["interpolate", [...], ["zoom"], z0, v0, z1, v1, ...]`: the outputs are
    // the odd entries after the input.
    const outs = value.slice(3).filter((_, i) => i % 2 === 1);
    const nums = outs.filter((v): v is number => typeof v === "number");
    if (nums.length > 0) return Math.max(...nums);
  }
  throw new Error(`an opacity this guard cannot read: ${JSON.stringify(value)}`);
}

/**
 * EDGES, NOT GROUNDS. A road's casing, a park's outline and an administrative
 * boundary are strokes along the edge of something else, and a pin crossing
 * one is still bordered by the ground on both sides of it. How thin they are
 * is the style's own arithmetic: `road_motorway_casing` is 4.86px wide at z12
 * over a 3.61px fill (0.62px showing each side), and 10.43px over 8.29px at
 * z16 (1.07px). They are measured and RECORDED below — they do not choose the
 * opacity, and what they cost is said there.
 */
const EDGE = /casing|outline|boundary/;

interface Ground {
  name: string;
  rgb: Rgb;
}
const background = (() => {
  const bg = style.layers.find((l) => l.type === "background");
  return parse(String(bg?.paint?.["background-color"])).rgb;
})();

/** Every colour a paint layer lays down, composited at its own strongest
 *  opacity over the style's background. Symbols are text and not grounds. */
function paintedBy(filter: (l: Layer) => boolean): Ground[] {
  const out: Ground[] = [{ name: "background", rgb: background }];
  for (const layer of style.layers.filter(filter)) {
    const p = layer.paint ?? {};
    const [colourKey, opacityKey] =
      layer.type === "fill"
        ? ["fill-color", "fill-opacity"]
        : layer.type === "line"
          ? ["line-color", "line-opacity"]
          : layer.type === "fill-extrusion"
            ? ["fill-extrusion-color", "fill-extrusion-opacity"]
            : [null, null];
    if (colourKey === null || opacityKey === null) continue;
    // `landcover_wetland` paints a PATTERN image and no colour; it has
    // nothing this guard can composite, and is 80% of an image of reeds.
    for (const c of colours(p[colourKey]).filter(isColour)) {
      const { rgb, alpha } = parse(c);
      out.push({
        name: layer.id,
        rgb: over(rgb, background, alpha * strongest(p[opacityKey])),
      });
    }
  }
  return out;
}

const drawable = (l: Layer) => l.type !== "symbol" && l.type !== "background";
const grounds = paintedBy((l) => drawable(l) && !EDGE.test(l.id));
const edges = paintedBy((l) => drawable(l) && EDGE.test(l.id)).filter(
  (g) => g.name !== "background",
);

// ── the two criteria ──────────────────────────────────────────────────────

const PIN_NON_TEXT = 3;
const COUNT_TEXT = 4.5;

/** A dimmed pin against a ground: the composited body vs the ground. */
const pinOn = (g: Ground, alpha: number) => {
  const body = over(token(painted.body), g.rgb, alpha);
  return { nominal: contrast(body, g.rgb), worst: contrastAtWorst(body, g.rgb) };
};
/** A dimmed cluster over a ground: its count vs its disc, both composited. */
const countOn = (g: Ground, alpha: number) => {
  const disc = over(token(painted.disc), g.rgb, alpha);
  const text = over(token(painted.count), g.rgb, alpha);
  return { nominal: contrast(text, disc), worst: contrastAtWorst(text, disc) };
};

const worstGround = (measure: (g: Ground, a: number) => { worst: number }, alpha: number) =>
  grounds
    .map((g) => ({ ground: g, ...measure(g, alpha) }))
    .reduce((a, b) => (b.worst < a.worst ? b : a));

const two = (n: number) => Math.round(n * 100) / 100;

describe("the dimmed markers, measured against the style's own grounds", () => {
  it("reads the grounds it claims to: the background, water, park and the road fills", () => {
    // Positive evidence the extraction worked. A regex that stopped matching
    // would measure against the background alone and pass everything.
    const names = new Set(grounds.map((g) => g.name));
    for (const id of ["background", "water", "park", "landuse_residential", "road_motorway"])
      expect(names, id).toContain(id);
    expect(grounds.length).toBeGreaterThan(40);
    expect(edges.some((e) => e.name === "road_motorway_casing")).toBe(true);
    // And the tokens resolved to the brand's garnet and sand.
    expect(painted).toEqual({ body: "primary", hole: "light", disc: "primary", count: "light" });
  });

  it("the darkest ground a pin can sit on is water", () => {
    // Water is opaque and drawn over every landcover fill, so no translucent
    // stack reaches under it; the land fills are all lighter.
    const darkest = grounds.reduce((a, b) => (luminance(b.rgb) < luminance(a.rgb) ? b : a));
    expect(hex(darkest.rgb)).toBe("#a8b4b8");
    expect(["water", "waterway_tunnel", "waterway_river", "waterway_other"]).toContain(
      darkest.name,
    );
    // The darkest STACK of land fills — every translucent fill, in draw
    // order, over the darkest opaque land fill — is still lighter than it.
    const land = style.layers.filter(
      (l) => l.type === "fill" && !/water/.test(l.id) && l.paint?.["fill-color"] !== undefined,
    );
    const opaque = land
      .filter((l) => strongest(l.paint!["fill-opacity"]) === 1)
      .map((l) => parse(colours(l.paint!["fill-color"]).filter(isColour)[0]!).rgb)
      .reduce((a, b) => (luminance(b) < luminance(a) ? b : a));
    let stack = opaque;
    for (const l of land.filter((l) => strongest(l.paint!["fill-opacity"]) < 1)) {
      const { rgb, alpha } = parse(colours(l.paint!["fill-color"]).filter(isColour)[0]!);
      const next = over(rgb, stack, alpha * strongest(l.paint!["fill-opacity"]));
      if (luminance(next) < luminance(stack)) stack = next;
    }
    expect(luminance(stack)).toBeGreaterThan(luminance(darkest.rgb));
  });

  it(`a dimmed pin (${DIMMED_PIN_OPACITY}) keeps 3:1 on every ground, even at the worst rounding`, () => {
    const failing = grounds
      .map((g) => ({ g, ...pinOn(g, DIMMED_PIN_OPACITY) }))
      .filter((r) => r.worst < PIN_NON_TEXT)
      .map((r) => `${r.g.name} ${hex(r.g.rgb)}: ${r.nominal.toFixed(4)} (${r.worst.toFixed(4)})`);
    expect(failing, "grounds a dimmed pin falls under 3:1 on").toEqual([]);
  });

  it("and it is the LOWEST such value — 0.01 less fails, on water", () => {
    const below = worstGround(pinOn, two(DIMMED_PIN_OPACITY - 0.01));
    expect(below.worst, `${below.ground.name} at ${two(DIMMED_PIN_OPACITY - 0.01)}`).toBeLessThan(
      PIN_NON_TEXT,
    );
    expect(hex(below.ground.rgb)).toBe("#a8b4b8");
    // The figures the constant's comment quotes, so they cannot drift from it.
    const water = { name: "water", rgb: parse("#a8b4b8").rgb };
    expect(pinOn(water, 0.67).nominal).toBeCloseTo(3.082, 3);
    expect(pinOn(water, 0.67).worst).toBeCloseTo(3.0018, 3);
    expect(pinOn(water, 0.66).nominal).toBeCloseTo(3.0328, 3);
    expect(pinOn(water, 0.66).worst).toBeCloseTo(2.954, 3);
  });

  it(`a dimmed cluster (${DIMMED_CLUSTER_OPACITY}) keeps its count at 4.5:1 and its disc at 3:1`, () => {
    const text = grounds
      .map((g) => ({ g, ...countOn(g, DIMMED_CLUSTER_OPACITY) }))
      .filter((r) => r.worst < COUNT_TEXT)
      .map((r) => `${r.g.name} ${hex(r.g.rgb)}: ${r.nominal.toFixed(4)} (${r.worst.toFixed(4)})`);
    expect(text, "grounds a dimmed count falls under 4.5:1 on").toEqual([]);
    const disc = grounds
      .map((g) => ({ g, ...pinOn(g, DIMMED_CLUSTER_OPACITY) }))
      .filter((r) => r.worst < PIN_NON_TEXT)
      .map((r) => r.g.name);
    expect(disc, "grounds a dimmed disc falls under 3:1 on").toEqual([]);
  });

  it("and it is the LOWEST such value — 0.01 less fails, on the lightest ground", () => {
    const below = worstGround(countOn, two(DIMMED_CLUSTER_OPACITY - 0.01));
    expect(
      below.worst,
      `${below.ground.name} at ${two(DIMMED_CLUSTER_OPACITY - 0.01)}`,
    ).toBeLessThan(COUNT_TEXT);
    expect(hex(below.ground.rgb)).toBe("#ffffff");
    const white = { name: "minor road", rgb: parse("#ffffff").rgb };
    expect(countOn(white, 0.74).nominal).toBeCloseTo(4.7102, 3);
    expect(countOn(white, 0.74).worst).toBeCloseTo(4.6004, 3);
    // Why a cluster cannot simply share the pin's value.
    expect(countOn(white, DIMMED_PIN_OPACITY).nominal).toBeCloseTo(3.8984, 3);
    expect(countOn(white, DIMMED_PIN_OPACITY).worst).toBeLessThan(COUNT_TEXT);
  });

  /**
   * THE EDGES, RECORDED — what dimming costs, said plainly. At full opacity
   * the garnet pin clears 3:1 against every edge stroke in the style; the
   * lowest are the motorway casing `#a3906a` (3.7154:1) and the country
   * boundary `#8e8676` (3.2023:1). Dimmed to 0.67 it does not against three
   * of them: the motorway casing 2.4338, the link/trunk casings `#b6a685`
   * 2.8434, the boundary 2.2175 — and NO value in the operator's range fixes
   * that (at 0.8 the motorway casing is 2.8971 and the boundary 2.5920), so
   * it is a property of dimming at all, not of this number. Where a dimmed
   * pin crosses one of those sub-pixel lines, the pixels of its outline that
   * touch the line are under 3:1 against IT, while the rest of its outline
   * is on the ground on either side, at >= 3:1. The casings are themselves
   * under 3:1 against the ground they are drawn on (#119). Asserted as
   * today's fact, so the day it changes this says so.
   */
  it("records the edge strokes a dimmed pin can cross, including the ones under 3:1", () => {
    const at = (name: string, alpha: number) => {
      const edge = edges.find((e) => e.name === name);
      expect(edge, `premise: the style still draws ${name}`).toBeDefined();
      return pinOn(edge!, alpha).nominal;
    };
    expect(at("road_motorway_casing", 1)).toBeCloseTo(3.7154, 3);
    expect(at("boundary_2", 1)).toBeCloseTo(3.2023, 3);
    expect(at("road_motorway_casing", DIMMED_PIN_OPACITY)).toBeCloseTo(2.4338, 3);
    expect(at("road_trunk_primary_casing", DIMMED_PIN_OPACITY)).toBeCloseTo(2.8434, 3);
    expect(at("boundary_2", DIMMED_PIN_OPACITY)).toBeCloseTo(2.2175, 3);
    expect(at("road_motorway_casing", 0.8)).toBeCloseTo(2.8971, 3);
    expect(at("boundary_2", 0.8)).toBeCloseTo(2.592, 3);
    // Exactly those three strokes (and their tunnel/bridge twins), no more.
    const under = new Set(
      edges
        .filter((e) => pinOn(e, DIMMED_PIN_OPACITY).nominal < PIN_NON_TEXT)
        .map((e) => hex(e.rgb)),
    );
    expect([...under].sort()).toEqual(["#8e8676", "#a3906a", "#b6a685"]);
    // Every edge clears 3:1 at full opacity: the ACTIVE pin, and every pin on
    // a map with nothing active, is unaffected.
    for (const e of edges) expect(pinOn(e, 1).nominal, e.name).toBeGreaterThanOrEqual(PIN_NON_TEXT);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { DIMMED_MARKER_OPACITY } from "$lib/property-map";

/**
 * THE DIMMED MARKERS STILL MEET THEIR CONTRAST — re-measured from the map's
 * own colours every run (operator, 2026-09-29: "whatever the active pin is
 * should stay full opacity and the rest should be slightly reduced opacity so
 * it's featured").
 *
 * "Slightly" is decided here, not by taste. A pin is an interactive graphic,
 * so once it is composited at DIMMED_MARKER_OPACITY its garnet must keep 3:1
 * (WCAG 1.4.11) against the colours ADJACENT to it. A cluster's disc is the
 * same garnet and the same rule; its count is TEXT, sand on that disc, so the
 * two must keep 4.5:1 (WCAG 1.4.3). The constant must be exactly the LOWEST
 * two-decimal value at which all of that holds, for pins and for clusters, so
 * a palette change that moves the answer either way is a red test here,
 * naming the grounds, rather than a number nobody re-derives.
 *
 * UNDER IS NOT BESIDE — the correction this file was rewritten for. A
 * see-through marker takes its colour from the ground UNDER it, but the
 * colour it is compared with is the one BESIDE it, and at a shoreline, a
 * river or a bridge those are two different grounds: inside the outline the
 * pin is garnet over land, just outside it is water. This guard first shipped
 * comparing a pin over ground X with that same X only, which chose 0.67 for
 * pins and 0.74 for clusters — and garnet at 0.67 over the background, beside
 * water, is 2.25:1 (the review that found it measured that pixel pair on a
 * production build, at the San Antonio River: 2.26:1). So every marker is now
 * measured over each ground X BESIDE each ground Y, X = Y included: the
 * "straddle" pairs.
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

// ── the pairs ─────────────────────────────────────────────────────────────

/**
 * Every distinct ground colour, with the layers that paint it. Many layers
 * share a colour (four paint water's), and a pair is a pair of COLOURS.
 */
const distinct = [
  ...grounds
    .reduce((by, g) => {
      const key = hex(g.rgb);
      const seen = by.get(key);
      if (seen) seen.name += `, ${g.name}`;
      else by.set(key, { ...g });
      return by;
    }, new Map<string, Ground>())
    .values(),
];

/**
 * A marker drawn over `under`, compared with `beside`. `under === beside` is
 * the marker in the middle of one ground; every other pair is a boundary
 * between two grounds running under the marker's edge. EVERY pair is
 * measured, not just the ones a map is sure to draw side by side, because the
 * pair that binds (the lightest ground beside the darkest) is one that does
 * meet — a white bridge deck over water, below — so modelling which grounds
 * touch would change nothing but add a claim.
 */
interface Pair {
  under: Ground;
  beside: Ground;
}
const pairs: Pair[] = distinct.flatMap((under) => distinct.map((beside) => ({ under, beside })));
const sameGround: Pair[] = distinct.map((g) => ({ under: g, beside: g }));

const PIN_NON_TEXT = 3;
const COUNT_TEXT = 4.5;

interface Measured {
  nominal: number;
  worst: number;
}
/** A dimmed pin body, or a cluster's disc: garnet over `under`, against `beside`. */
const garnetBeside =
  (token_: string) =>
  (pair: Pair, alpha: number): Measured => {
    const mark = over(token(token_), pair.under.rgb, alpha);
    return {
      nominal: contrast(mark, pair.beside.rgb),
      worst: contrastAtWorst(mark, pair.beside.rgb),
    };
  };
const pinBeside = garnetBeside(painted.body);
const discBeside = garnetBeside(painted.disc);
/** A dimmed cluster's count against its own disc. The glyph and the disc
 *  pixel next to it can sit either side of a boundary too, so the count is
 *  composited over `under` and the disc over `beside`. */
const countBeside = (pair: Pair, alpha: number): Measured => {
  const text = over(token(painted.count), pair.under.rgb, alpha);
  const disc = over(token(painted.disc), pair.beside.rgb, alpha);
  return { nominal: contrast(text, disc), worst: contrastAtWorst(text, disc) };
};

const worstOf = (measure: (p: Pair, a: number) => Measured, alpha: number, over_ = pairs) =>
  over_
    .map((pair) => ({ pair, ...measure(pair, alpha) }))
    .reduce((a, b) => (b.worst < a.worst ? b : a));

const label = (r: { pair: Pair } & Measured) =>
  `${hex(r.pair.under.rgb)} (${r.pair.under.name}) beside ${hex(r.pair.beside.rgb)} ` +
  `(${r.pair.beside.name}): ${r.nominal.toFixed(4)} (${r.worst.toFixed(4)})`;

const two = (n: number) => Math.round(n * 100) / 100;
/** The lowest two-decimal opacity at which `passes` holds. */
function floor(passes: (alpha: number) => boolean): number {
  for (let k = 1; k <= 100; k++) if (passes(k / 100)) return k / 100;
  throw new Error("nothing up to full opacity passes");
}

const pinPasses = (alpha: number, over_ = pairs) =>
  worstOf(pinBeside, alpha, over_).worst >= PIN_NON_TEXT;
const clusterPasses = (alpha: number, over_ = pairs) =>
  worstOf(discBeside, alpha, over_).worst >= PIN_NON_TEXT &&
  worstOf(countBeside, alpha, over_).worst >= COUNT_TEXT;

const PIN_FLOOR = floor((a) => pinPasses(a));
const CLUSTER_FLOOR = floor((a) => clusterPasses(a));

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

  it("measures every ground beside every other, the rivers among them", () => {
    // Positive evidence the straddles are there: a pairing that collapsed to
    // the diagonal would measure the old, wrong model and pass it.
    expect(distinct.length).toBeGreaterThan(15);
    expect(pairs).toHaveLength(distinct.length ** 2);
    const water = distinct.find((g) => hex(g.rgb) === "#a8b4b8")!;
    // Rivers and streams are LINES drawn over land, so they are grounds here,
    // not strokes: a pin sitting on land can have one along its edge.
    for (const id of ["water", "waterway_river", "waterway_other"])
      expect(water.name.split(", "), id).toContain(id);
    for (const land of ["background", "road_minor", "landuse_residential", "park"])
      expect(
        pairs.some((p) => p.under.name.split(", ").includes(land) && p.beside === water),
        `${land} beside water`,
      ).toBe(true);
    // The binding pair below is one the style really draws together: a white
    // bridge deck is, by its own filter, laid over what it crosses.
    const bridges = style.layers.filter(
      (l) =>
        /^bridge_/.test(l.id) &&
        !EDGE.test(l.id) &&
        colours(l.paint?.["line-color"]).some(
          (c) => isColour(c) && hex(parse(c).rgb) === "#ffffff",
        ),
    );
    expect(bridges.map((l) => l.id).sort()).toEqual(["bridge_path_pedestrian", "bridge_street"]);
  });

  it(`DIMMED_MARKER_OPACITY (${DIMMED_MARKER_OPACITY}) is exactly the pin's floor: 3:1 beside every ground`, () => {
    const failing = pairs
      .map((pair) => ({ pair, ...pinBeside(pair, DIMMED_MARKER_OPACITY) }))
      .filter((r) => r.worst < PIN_NON_TEXT)
      .map(label);
    expect(failing, "pairs a dimmed pin falls under 3:1 on").toEqual([]);
    expect(DIMMED_MARKER_OPACITY, "the LOWEST value that passes every pair").toBe(PIN_FLOOR);
    // 0.01 less fails, and on the pair the constant's comment names: the
    // lightest ground (a minor road or path, #ffffff) beside water.
    const below = worstOf(pinBeside, two(PIN_FLOOR - 0.01));
    expect(below.worst, label(below)).toBeLessThan(PIN_NON_TEXT);
    expect([hex(below.pair.under.rgb), hex(below.pair.beside.rgb)]).toEqual(["#ffffff", "#a8b4b8"]);
    // The figures the constant's comment quotes, so they cannot drift from it.
    const roadBesideWater = pairs.find(
      (p) => p.under === below.pair.under && p.beside === below.pair.beside,
    )!;
    expect(pinBeside(roadBesideWater, 0.81).nominal).toBeCloseTo(3.1706, 3);
    expect(pinBeside(roadBesideWater, 0.81).worst).toBeCloseTo(3.0886, 3);
    expect(pinBeside(roadBesideWater, 0.8).nominal).toBeCloseTo(3.0773, 3);
    expect(pinBeside(roadBesideWater, 0.8).worst).toBeCloseTo(2.9979, 3);
  });

  it("and the cluster's floor too: its disc 3:1 beside every ground, its count 4.5:1 on its disc", () => {
    const at = DIMMED_MARKER_OPACITY;
    const disc = pairs
      .map((pair) => ({ pair, ...discBeside(pair, at) }))
      .filter((r) => r.worst < PIN_NON_TEXT)
      .map(label);
    expect(disc, "pairs a dimmed disc falls under 3:1 on").toEqual([]);
    const count = pairs
      .map((pair) => ({ pair, ...countBeside(pair, at) }))
      .filter((r) => r.worst < COUNT_TEXT)
      .map(label);
    expect(count, "pairs a dimmed count falls under 4.5:1 on").toEqual([]);
    expect(DIMMED_MARKER_OPACITY, "the LOWEST value that passes every pair").toBe(CLUSTER_FLOOR);
    // What decides it is the disc, not the count: the count alone would
    // allow 0.79 (the glyph over water, the disc beside it over a white road).
    const countOnly = floor((a) => worstOf(countBeside, a).worst >= COUNT_TEXT);
    expect(countOnly).toBe(0.79);
    expect(countOnly).toBeLessThan(CLUSTER_FLOOR);
  });

  /**
   * WHAT THE STRADDLES CHANGED, asserted so the old model cannot come back
   * quietly. Over the SAME ground only, the floors are the numbers this
   * shipped with first — 0.67 for a pin (water) and 0.74 for a cluster's
   * count (a white road) — and at 0.67 a pin over the background beside
   * water is 2.25:1, over a white road beside water 2.10:1.
   */
  it("over one ground only, the floors would be the 0.67 and 0.74 that were wrong", () => {
    expect(floor((a) => pinPasses(a, sameGround))).toBe(0.67);
    expect(floor((a) => worstOf(countBeside, a, sameGround).worst >= COUNT_TEXT)).toBe(0.74);
    const water = distinct.find((g) => hex(g.rgb) === "#a8b4b8")!;
    const bg = distinct.find((g) => g.name.split(", ").includes("background"))!;
    const white = distinct.find((g) => hex(g.rgb) === "#ffffff")!;
    expect(pinBeside({ under: bg, beside: water }, 0.67).nominal).toBeCloseTo(2.2513, 3);
    expect(pinBeside({ under: white, beside: water }, 0.67).nominal).toBeCloseTo(2.1048, 3);
    expect(pinBeside({ under: bg, beside: water }, DIMMED_MARKER_OPACITY).worst).toBeGreaterThan(3);
  });

  /**
   * THE EDGES, RECORDED — what dimming costs, said plainly. Strokes are not
   * grounds: a road's casing, a park's outline, an administrative boundary is
   * a line under a pixel a side at the zooms these maps open on (the motorway
   * casing is 0.62px showing each side at z12, 1.07px at z16). They are
   * REPORTED here, not guarded as grounds, and W3C's Understanding 1.4.11 is
   * the reason — its test for a part of a graphic under 3:1 is "if the
   * least-contrasting area is less than 3:1, assume that area is invisible;
   * is the graphical object still understandable?" Where a dimmed pin crosses
   * one, the pixels of its outline touching the line are under 3:1 against
   * it; the rest of the outline is on the grounds either side, which the
   * pairs above hold at >= 3:1 — so with that area taken away the pin is
   * still all there.
   *
   * Measured as a crossing, the way the grounds are: the pin's edge drawn over
   * a ground beside the stroke, or over the stroke beside a ground, the worst
   * of either. At full opacity the garnet pin clears 3:1 against every edge
   * stroke in the style; the lowest are the motorway casing `#a3906a`
   * (3.7154:1) and the country boundary `#8e8676` (3.2023:1). At 0.81 three
   * do not: the motorway casing 2.1664, the link/trunk casing `#b6a685`
   * 2.8167 and the boundary 1.8672. They would need 0.93, 0.83 and 0.98,
   * which is hardly dimmed at all. Asserted as today's fact, so the day it
   * changes this says so.
   */
  it("records the edge strokes a dimmed pin can cross, including the ones under 3:1", () => {
    const crossing = (edge: Ground, alpha: number) =>
      Math.min(
        ...[edge, ...grounds].flatMap((g) => [
          pinBeside({ under: g, beside: edge }, alpha).nominal,
          pinBeside({ under: edge, beside: g }, alpha).nominal,
        ]),
      );
    const at = (name: string, alpha: number) => {
      const edge = edges.find((e) => e.name === name);
      expect(edge, `premise: the style still draws ${name}`).toBeDefined();
      return crossing(edge!, alpha);
    };
    expect(at("road_motorway_casing", 1)).toBeCloseTo(3.7154, 3);
    expect(at("boundary_2", 1)).toBeCloseTo(3.2023, 3);
    expect(at("road_motorway_casing", DIMMED_MARKER_OPACITY)).toBeCloseTo(2.1664, 3);
    expect(at("road_trunk_primary_casing", DIMMED_MARKER_OPACITY)).toBeCloseTo(2.8167, 3);
    expect(at("boundary_2", DIMMED_MARKER_OPACITY)).toBeCloseTo(1.8672, 3);
    // Exactly those three strokes (and their tunnel/bridge twins), no more.
    const under = new Set(
      edges.filter((e) => crossing(e, DIMMED_MARKER_OPACITY) < PIN_NON_TEXT).map((e) => hex(e.rgb)),
    );
    expect([...under].sort()).toEqual(["#8e8676", "#a3906a", "#b6a685"]);
    // And what it would take to lift each of them.
    const clears = (name: string) => floor((a) => at(name, a) >= PIN_NON_TEXT);
    expect(clears("road_motorway_casing")).toBe(0.93);
    expect(clears("road_trunk_primary_casing")).toBe(0.83);
    expect(clears("boundary_2")).toBe(0.98);
    // Every edge clears 3:1 at full opacity: the ACTIVE pin, and every pin on
    // a map with nothing active, is unaffected.
    for (const e of edges) expect(crossing(e, 1), e.name).toBeGreaterThanOrEqual(PIN_NON_TEXT);
  });
});

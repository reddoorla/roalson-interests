import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, it, vi } from "vitest";

import PropertyMap from "$lib/components/PropertyMap.svelte";
import { DIMMED_MARKER_OPACITY, MAP_HOME, type MapPoint } from "$lib/property-map";

vi.mock("$env/dynamic/public", () => ({ env: {} }));

// The engine, faked only as far as drawing the LIVE markers takes: a map that
// boots, loads, and reports the zoom it was built at. PropertyMap.test.ts has
// the fake that watches what the camera does.
const engine = vi.hoisted(() => {
  const loads: (() => void)[] = [];
  const handler = () => ({
    enable() {},
    disable() {},
    isEnabled: () => true,
    isActive: () => false,
    disableRotation() {},
  });
  class FakeMap {
    zoom: number;
    canvasContainer = document.createElement("div");
    canvas = document.createElement("canvas");
    scrollZoom = handler();
    boxZoom = handler();
    dragRotate = handler();
    dragPan = handler();
    keyboard = handler();
    doubleClickZoom = handler();
    touchZoomRotate = handler();
    touchPitch = handler();
    constructor(options: { container: HTMLElement; zoom: number }) {
      this.zoom = options.zoom;
      options.container.appendChild(this.canvasContainer);
      this.canvasContainer.appendChild(this.canvas);
    }
    on(name: string, fn: () => void) {
      if (name === "load") loads.push(fn);
    }
    getZoom() {
      return this.zoom;
    }
    getMaxZoom() {
      return 16;
    }
    getCenter() {
      return { lng: 0, lat: 0 };
    }
    getCanvas() {
      return this.canvas;
    }
    getCanvasContainer() {
      return this.canvasContainer;
    }
    project() {
      return { x: 0, y: 0 };
    }
    addControl() {}
    removeControl() {}
    jumpTo() {}
    easeTo() {}
    flyTo() {}
    resize() {}
    stop() {}
    remove() {}
  }
  class FakeAttributionControl {}
  return {
    loads,
    module: { default: { Map: FakeMap, AttributionControl: FakeAttributionControl } },
  };
});
vi.mock("$lib/map-engine", () => engine.module);

/**
 * THE DIMMED MARKERS STILL MEET THEIR CONTRAST — re-measured from the map's
 * own colours every run (operator, 2026-09-29: "whatever the active pin is
 * should stay full opacity and the rest should be slightly reduced opacity so
 * it's featured").
 *
 * "Slightly" is bounded here, not by taste. A pin is an interactive graphic,
 * so once it is composited at DIMMED_MARKER_OPACITY its garnet must keep 3:1
 * (WCAG 1.4.11) against the colours ADJACENT to it. A cluster's disc is the
 * same garnet and the same rule; its count is TEXT, sand on that disc, so the
 * two must keep 4.5:1 (WCAG 1.4.3). A palette change that takes any of that
 * under its ratio at DIMMED_MARKER_OPACITY is a red test here, naming the
 * grounds.
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
 * background), the pin's colours from app.css's `@theme` through the paint
 * PropertyMap renders its pins and discs with, live and in the picture.
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
const isColour = (s: string) => /^(#|rgba?\()/.test(s);

// ── the pin's own colours ─────────────────────────────────────────────────

const theme = (() => {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(read("src/app.css"));
  if (!block) throw new Error("no @theme block in src/app.css");
  const out: Record<string, string> = {};
  for (const m of block[1]!.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g))
    out[m[1]!] = m[2]!.trim();
  return out;
})();

const token = (name: string): Rgb => {
  const value = theme[name];
  if (value === undefined) throw new Error(`no --color-${name} in app.css @theme`);
  return parse(value).rgb;
};

/** A colour as it is painted: what it is, and how much of it. */
interface Paint {
  rgb: Rgb;
  alpha: number;
}

/** A colour utility — `bg-primary`, `text-light/90`, `bg-[#652323]` — with
 *  its alpha modifier, when it has one, measured along with it. */
const COLOUR_CLASS = /^(?:bg|text)-(?:\[([^\]]+)\]|([a-z0-9-]+))(?:\/(\d+(?:\.\d+)?))?$/;
const colourClass = (c: string): boolean => {
  const m = COLOUR_CLASS.exec(c);
  return m !== null && (m[1] !== undefined ? isColour(m[1]) : m[2]! in theme);
};

/**
 * What the component paints with, read off its markers as it renders them,
 * the LIVE ones (every JS visitor's, after the hand-over) and the picture's
 * (the first paint, and every no-JS visitor's for good): the pin's body, and
 * the cluster disc and its count. Each must be ONE paint on every marker of
 * both, or there is no single colour to measure — and a live marker repainted
 * on its own would otherwise go unmeasured.
 */
const painted = await (async () => {
  const { lat, lng } = MAP_HOME.full.camera;
  const at = (id: string, east: number): MapPoint => ({
    id,
    title: id,
    lat,
    lng: lng + east,
    href: null,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng + east}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng + east}`,
  });
  // A 397 x 595 box on screen, so the map boots on the full frame at
  // MAP_HOME's own zoom: one pin on the centre, and a pair 0.2 deg east that
  // the map and every frame of its picture draw as one cluster.
  const box = { width: 397, height: 595 };
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(public cb: ResizeObserverCallback) {}
      observe() {
        this.cb([{ contentRect: box } as ResizeObserverEntry], this as never);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(public cb: IntersectionObserverCallback) {}
      observe(target: Element) {
        const seen = { height: box.height } as DOMRectReadOnly;
        this.cb(
          [
            {
              isIntersecting: true,
              target,
              boundingClientRect: seen,
              intersectionRect: seen,
              rootBounds: { height: 900 } as DOMRectReadOnly,
              intersectionRatio: 1,
              time: 0,
            },
          ],
          this as never,
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  const view = render(PropertyMap, {
    props: { points: [at("pin", 0), at("a", 0.2), at("b", 0.2)], label: "Markers" },
  });
  await vi.waitFor(() => expect(engine.loads).toHaveLength(1));
  engine.loads[0]!();
  await tick();
  await tick();

  /** A paint as the markup spells it: `var(--color-x)`, a colour, or a
   *  colour utility with its optional `/NN` alpha. */
  const read = (paint: string): Paint => {
    const named = /^var\(--color-([a-z0-9-]+)\)$/.exec(paint);
    if (named) return { rgb: token(named[1]!), alpha: 1 };
    const utility = COLOUR_CLASS.exec(paint);
    if (!utility) return parse(paint);
    const [, arbitrary, name, percent] = utility;
    const { rgb, alpha } =
      arbitrary !== undefined ? parse(arbitrary) : { rgb: token(name!), alpha: 1 };
    return { rgb, alpha: alpha * (percent === undefined ? 1 : Number(percent) / 100) };
  };
  const themed = (el: Element, utility: "bg" | "text") =>
    [...el.classList].filter((c) => c.startsWith(`${utility}-`) && colourClass(c)).join(" ");
  const one = (found: Record<"live" | "picture", string[]>, what: string): Paint => {
    const all = [...found.live, ...found.picture];
    const paint = [...new Set(all)];
    if (found.live.length === 0 || found.picture.length === 0 || paint.length !== 1 || !paint[0])
      throw new Error(
        `${what}: expected ONE paint on every marker, live and picture, ` +
          `found ${JSON.stringify(found)} — update this guard with the markup`,
      );
    return read(paint[0]);
  };
  const $$ = (selector: string) => [...view.container.querySelectorAll(selector)];
  const fill = (els: Element[]) => els.map((p) => p.getAttribute("fill") ?? "");
  const discs = {
    live: $$("[data-map-cluster] > span"),
    picture: $$("[data-map-home-cluster]"),
  };
  const out = {
    body: one(
      {
        live: fill($$("[data-map-pin] svg path")),
        picture: fill($$("[data-map-home-pin] svg path")),
      },
      "pin body",
    ),
    disc: one(
      {
        live: discs.live.map((d) => themed(d, "bg")),
        picture: discs.picture.map((d) => themed(d, "bg")),
      },
      "cluster disc",
    ),
    count: one(
      {
        live: discs.live.map((d) => themed(d, "text")),
        picture: discs.picture.map((d) => themed(d, "text")),
      },
      "cluster count",
    ),
  };
  view.unmount();
  vi.unstubAllGlobals();
  return out;
})();

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
 * z16 (1.07px). They do not choose the opacity: W3C's Understanding 1.4.11
 * asks of a part under 3:1 "if the least-contrasting area is less than 3:1,
 * assume that area is invisible; is the graphical object still
 * understandable?", and with that sliver taken away the pin is still all
 * there on the grounds either side, which the pairs below hold at >= 3:1.
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
 * meet (a white bridge deck over water), so modelling which grounds touch
 * would change nothing but add a claim.
 */
interface Pair {
  under: Ground;
  beside: Ground;
}
const pairs: Pair[] = distinct.flatMap((under) => distinct.map((beside) => ({ under, beside })));

const PIN_NON_TEXT = 3;
const COUNT_TEXT = 4.5;

interface Measured {
  nominal: number;
  worst: number;
}
/** A dimmed pin body, or a cluster's disc: garnet over `under`, against `beside`. */
const garnetBeside =
  (garnet: Paint) =>
  (pair: Pair, alpha: number): Measured => {
    const mark = over(garnet.rgb, pair.under.rgb, garnet.alpha * alpha);
    return {
      nominal: contrast(mark, pair.beside.rgb),
      worst: contrastAtWorst(mark, pair.beside.rgb),
    };
  };
const pinBeside = garnetBeside(painted.body);
const discBeside = garnetBeside(painted.disc);
/** A dimmed cluster's count against its own disc. The glyph and the disc
 *  pixel next to it can sit either side of a boundary too, so the count is
 *  composited over `under` and the disc over `beside`. The marker is dimmed
 *  as ONE group, so a see-through glyph shows its own disc first. */
const countBeside = (pair: Pair, alpha: number): Measured => {
  const { count: t, disc: d } = painted;
  const cover = t.alpha + d.alpha * (1 - t.alpha);
  const text = pair.under.rgb.map((g, i) =>
    Math.round(
      alpha * (t.rgb[i]! * t.alpha + d.rgb[i]! * d.alpha * (1 - t.alpha)) + (1 - alpha * cover) * g,
    ),
  ) as Rgb;
  const disc = over(d.rgb, pair.beside.rgb, d.alpha * alpha);
  return { nominal: contrast(text, disc), worst: contrastAtWorst(text, disc) };
};

const label = (r: { pair: Pair } & Measured) =>
  `${hex(r.pair.under.rgb)} (${r.pair.under.name}) beside ${hex(r.pair.beside.rgb)} ` +
  `(${r.pair.beside.name}): ${r.nominal.toFixed(4)} (${r.worst.toFixed(4)})`;

describe("the dimmed markers, measured against the style's own grounds", () => {
  it("reads the grounds it claims to: the background, water, park and the road fills", () => {
    // Positive evidence the extraction worked. A regex that stopped matching
    // would measure against the background alone and pass everything.
    const names = new Set(grounds.map((g) => g.name));
    for (const id of ["background", "water", "park", "landuse_residential", "road_motorway"])
      expect(names, id).toContain(id);
    expect(grounds.length).toBeGreaterThan(40);
    expect(edges.some((e) => e.name === "road_motorway_casing")).toBe(true);
  });

  it("measures the darkest ground a pin can sit on: no stack of land fills is darker", () => {
    // Water is opaque and drawn over every landcover fill, so no translucent
    // stack reaches under it; the land fills are all lighter.
    const darkest = grounds.reduce((a, b) => (luminance(b.rgb) < luminance(a.rgb) ? b : a));
    // The darkest STACK of land fills — every translucent fill, in draw
    // order, over the darkest opaque land fill — is still no darker than it.
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
    expect(luminance(stack)).toBeGreaterThanOrEqual(luminance(darkest.rgb));
  });

  it("measures every ground beside every other, the rivers among them", () => {
    // Positive evidence the straddles are there: a pairing that collapsed to
    // the diagonal would measure the old, wrong model and pass it.
    expect(distinct.length).toBeGreaterThan(1);
    expect(pairs).toHaveLength(distinct.length ** 2);
    const water = distinct.find((g) => g.name.split(", ").includes("water"))!;
    // Rivers and streams are LINES drawn over land, so they are grounds here,
    // not strokes: a pin sitting on land can have one along its edge.
    const names = new Set(grounds.map((g) => g.name));
    for (const id of ["waterway_river", "waterway_other"]) expect(names, id).toContain(id);
    for (const land of ["background", "road_minor", "landuse_residential", "park"])
      expect(
        pairs.some((p) => p.under.name.split(", ").includes(land) && p.beside === water),
        `${land} beside water`,
      ).toBe(true);
  });

  it(`at DIMMED_MARKER_OPACITY (${DIMMED_MARKER_OPACITY}) a pin keeps 3:1 beside every ground`, () => {
    const failing = pairs
      .map((pair) => ({ pair, ...pinBeside(pair, DIMMED_MARKER_OPACITY) }))
      .filter((r) => r.worst < PIN_NON_TEXT)
      .map(label);
    expect(failing, "pairs a dimmed pin falls under 3:1 on").toEqual([]);
  });

  it("and a cluster: its disc 3:1 beside every ground, its count 4.5:1 on its disc", () => {
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
  });
});

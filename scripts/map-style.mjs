// Builds `static/map-style.json` — this site's brand-tinted MapLibre style —
// from OpenFreeMap's stock "liberty" style. The TILES stay OpenFreeMap's; only
// the paint is ours.
//
//   node scripts/map-style.mjs           # fetch, retint, write static/map-style.json
//   node scripts/map-style.mjs --print   # write nothing; report what would change
//
// THIS IS A MAINTENANCE TOOL AND IT IS NEVER PART OF `pnpm build`. The OUTPUT
// is committed. A build that fetches a third-party style at build time is a
// build that breaks the day that third party deploys, on a network CI does not
// control — and it would do so on a PR that touched nothing near the map.
//
// WHY A GENERATOR AND NOT A HAND-EDITED BLOB. The upstream style is 111 layers
// of plain JSON and it moves: OpenFreeMap tracks OpenMapTiles' schema, layers
// get renamed, and paint properties change shape (several are already
// `["interpolate", ["linear"], ["zoom"], 9, "<colour>", 12, "<colour>"]` rather
// than a literal). A blob cannot tell you any of that happened; it just keeps
// serving last year's map. This script re-derives the whole file from upstream
// in one command, and REFUSES to write anything unless every one of its claims
// still holds:
//
//   - every layer id in RECOLOUR, DROP_LAYERS and KEEP_AS_IS exists upstream;
//   - every upstream layer id is in exactly one of those three sets, so a NEW
//     layer is a hard failure rather than a silently un-tinted one;
//   - every paint property named in RECOLOUR exists on that layer upstream;
//   - every entry actually CHANGES a value. A recolour that quietly matched
//     what was already there would be a green that proves nothing, which is
//     the defect class CLAUDE.md opens with.
//
// DETERMINISM. Object keys are written sorted and the indent is fixed at two
// spaces, so the same upstream gives a byte-identical file every run and a real
// upstream change is the only thing that ever shows up in the diff. Arrays are
// NOT sorted — `layers` is draw order and an expression is a syntax tree.
//
// AND THE DIGEST OF THOSE BYTES IS COMMITTED, in scripts/map-style.sha256. The
// determinism above is a property of the generator; the digest is the only
// thing that makes it checkable offline, because a test that re-emits the file
// it is checking can only ever prove the indent. See DIGEST_PATH.
//
// The committed artifact is guarded offline by scripts/map-style.test.ts, which
// needs no network: it asserts the colours in the file against the table below,
// and — the assertion that closes the class — that the SET of colour literals
// in the whole file is exactly the brand set, so an upstream colour that
// survived anywhere is a red test rather than a beige road nobody notices.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const UPSTREAM_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const OUTPUT_PATH = join(ROOT, "static", "map-style.json");

/**
 * The digest of the bytes this script last wrote, committed beside it.
 *
 * WHY A SIDECAR AND NOT A SELF-CHECK (review of #113). The canonical-form test
 * used to read `expect(raw).toBe(serialise(JSON.parse(raw)))`, which derives its
 * expectation FROM THE BYTES UNDER TEST and therefore cannot fail on anything
 * `JSON.parse` + re-emit reproduces. Reversing the key order of every layer
 * object and re-emitting passed; so did editing `highway-name-major.minzoom`
 * from 12.2 to 9 by hand. It was an indent check wearing a determinism check's
 * comment.
 *
 * Half of that is fixable in place — `sortKeys` is exported now, so the test can
 * re-derive canonical form instead of assuming it. The other half is not: no
 * offline test can tell a hand-edited VALUE from a generated one without a
 * second copy of the truth. This file is that second copy. It is written by the
 * generator, so regenerating stays one command, and a hand edit to the JSON
 * alone is a red test naming both digests.
 */
export const DIGEST_PATH = join(ROOT, "scripts", "map-style.sha256");

/**
 * @param {string} bytes
 * @returns {string}
 */
export function digest(bytes) {
  return createHash("sha256").update(bytes, "utf-8").digest("hex");
}

/**
 * The attribution our source spec asserts, replacing whatever OpenFreeMap's
 * TileJSON carries.
 *
 * OpenFreeMap's own terms: "Attribution is required. […] you must add the
 * following attribution: OpenFreeMap © OpenMapTiles Data from OpenStreetMap.
 * You do not need to display the OpenFreeMap part, but it is nice if you do."
 * So OpenMapTiles and OpenStreetMap are LICENCE CONDITIONS and the OpenFreeMap
 * word is a courtesy; the operator asked for the courtesy line to go and the
 * conditions to stay.
 *
 * THE WORD "CONTRIBUTORS" IS NOT DECORATION (review of #113). Upstream's string
 * reads "Data from OpenStreetMap", and the OSM Foundation's attribution
 * guidelines ask for the credit "© OpenStreetMap contributors" — the database
 * is the contributors' collective work and ODbL §4.3 is an attribution
 * obligation to THEM, not to a project name. That wording was already absent
 * upstream, so it was never a regression; it became OUR sentence the moment it
 * moved into this file, and a sentence we own is one we are responsible for
 * getting right. The link still goes to openstreetmap.org/copyright, which is
 * where the licence itself is named.
 *
 * The test pins the OBLIGATION (`toContain("contributors")`), not today's
 * phrasing, so the rest of the sentence can be reworded without silently
 * dropping the one word the guidance actually asks for.
 *
 * This wins over the fetched TileJSON's own `attribution` because MapLibre
 * resolves a source as `pick(extend(tileJSON, options), [...])` — our spec is
 * `options`, so it is written OVER the fetched document — while `url` still
 * resolves the tile list normally. That is a claim about somebody else's code,
 * so it is proved at runtime in tests/interaction/map-palette.spec.ts rather
 * than asserted here.
 */
export const ATTRIBUTION =
  '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> ' +
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> ' +
  "contributors";

/**
 * The brand tokens, spelled exactly as `src/app.css`'s `@theme` block spells
 * them, plus the tints derived from them for surfaces the palette has no token
 * for. Naming them here is what lets the test assert the file contains NOTHING
 * else.
 */
export const PALETTE = {
  ground: "#f2efe9", // --color-background, the page's own off-white
  garnet: "#652323", // --color-primary
  darkGarnet: "#3d0707", // --color-dark
  secondary: "#646059", // --color-secondary (AA-safe text grey)
  // Tinted naturalistic: water stays blue and parks stay green, both pulled
  // toward the palette. A literally-garnet river reads as a boundary, not water.
  water: "#a8b4b8",
  park: "#d3d7bd",
  parkOutline: "#c4c9a9",
  wood: "#c2c6ab",
  grass: "#ced3b7",
  cemetery: "#cfd4ba",
  school: "#dcdcc4",
  residential: "#ebe6dc",
  hospital: "#e6ded6",
  ice: "#e4eaea",
  sandLand: "#ece3c9",
  aeroway: "#e6e0d4",
  // Roads, sand-ward, lightest class last.
  //
  // RETUNED 2026-09-22 (review of #113). The first table was sand-on-sand: at
  // the land section's fit (z6.948) the motorway casing measured 1.6956:1
  // against the ground and I-10 through Boerne was not legible as a road. The
  // fills are lighter and the casings darker, which moves two numbers at once —
  // the casing away from the ground it is drawn on, and `highway-name-major`'s
  // label away from the fill it is drawn over (4.4511 -> 4.7025:1, i.e. over
  // AA). Every figure is in src/lib/theme-contrast.test.ts.
  motorway: "#eadfbe",
  motorwayCasing: "#a3906a",
  // motorway_link, trunk_primary and link: one tone, three classes. They are
  // one key because the operator's table gives all three the same pair, not by
  // accident — split them only when a call actually distinguishes them.
  arterial: "#efe7cd",
  arterialCasing: "#b6a685",
  secondaryRoad: "#f4eee0",
  secondaryRoadCasing: "#c6b99d",
  minorRoad: "#ffffff",
  minorRoadCasing: "#d5cbb5",
  serviceRoad: "#fdfcf9",
  serviceRoadCasing: "#e4ddcc",
  rail: "#c6bfae",
  building: "#e0d9c8",
  buildingOutline: "#cfc6b1",
  boundaryMinor: "#c3bcac",
  boundaryMajor: "#8e8676",
  pathLabel: "#8a8378",
};

const P = PALETTE;

// The types below are JSDoc rather than decoration: `tsconfig.json` sets
// `checkJs`, and src/lib/theme-contrast.test.ts imports PALETTE from here, which
// pulls this file into `pnpm check`'s program. Untyped it contributed 20 errors.

/** One table value: a colour, or a colour with the upstream alpha kept. */
/** @typedef {string | { color: string; alpha: number }} Tint */
/** A layer id to the paint properties we repaint on it. */
/** @typedef {Record<string, Record<string, Tint>>} TintTable */
/** As much of a MapLibre style as this script touches. */
/** @typedef {{ id: string; paint?: Record<string, unknown> }} StyleLayer */
/** @typedef {{ name?: string; sources: Record<string, Record<string, unknown>>; layers: StyleLayer[] }} MapStyle */

/**
 * A road class, across the three prefixes that draw it.
 * @param {string} fill
 * @param {string} casing
 * @param {Record<string, "fill" | "casing">} ids
 * @returns {TintTable}
 */
function road(fill, casing, ids) {
  /** @type {TintTable} */
  const out = {};
  for (const [id, role] of Object.entries(ids)) {
    out[id] = { "line-color": role === "casing" ? casing : fill };
  }
  return out;
}

/**
 * A text layer: colour plus the halo every label on this map carries.
 * @param {string} color
 * @returns {Record<string, Tint>}
 */
function label(color) {
  return { "text-color": color, "text-halo-color": P.ground };
}

/**
 * Every layer we repaint, by its real upstream id and its real paint property.
 *
 * Written out one id at a time rather than expanded from a `tunnel_|road_|
 * bridge_` product, because the three prefixes do NOT carry the same ids —
 * upstream has `road_minor` but `bridge_street`, a
 * `bridge_path_pedestrian_casing` with no road or tunnel twin, and
 * `tunnel_street_casing` beside `road_minor_casing`. A product would have
 * invented five layers that do not exist and then failed loudly about its own
 * invention.
 *
 * A value is either a colour string or `{ color, alpha }` where the upstream
 * literal carried an alpha channel worth keeping.
 */
/** @type {TintTable} */
export const RECOLOUR = {
  // ---- ground -----------------------------------------------------------
  background: { "background-color": P.ground },
  landuse_residential: { "fill-color": P.residential },
  // The only alpha we keep. Upstream is hsla(98,61%,72%,0.7) UNDER a separate
  // `fill-opacity: 0.4`; dropping the 0.7 would make woodland 1.4x heavier than
  // upstream drew it, which on the Hill Country sections is most of the frame.
  landcover_wood: { "fill-color": { color: P.wood, alpha: 0.7 } },
  landcover_grass: { "fill-color": P.grass },
  park: { "fill-color": P.park, "fill-outline-color": P.parkOutline },
  park_outline: { "line-color": P.parkOutline },
  landuse_pitch: { "fill-color": P.park },
  landuse_track: { "fill-color": P.park },
  landuse_cemetery: { "fill-color": P.cemetery },
  landuse_school: { "fill-color": P.school },
  // Upstream is `#fde`, a pink that is the loudest thing on a tinted map.
  landuse_hospital: { "fill-color": P.hospital },
  landcover_ice: { "fill-color": P.ice },
  landcover_sand: { "fill-color": P.sandLand },
  aeroway_fill: { "fill-color": P.aeroway },
  aeroway_runway: { "line-color": P.ground },
  aeroway_taxiway: { "line-color": P.ground },

  // ---- water ------------------------------------------------------------
  water: { "fill-color": P.water },
  waterway_river: { "line-color": P.water },
  waterway_other: { "line-color": P.water },
  waterway_tunnel: { "line-color": P.water },
  waterway_line_label: label(P.darkGarnet),
  water_name_point_label: label(P.darkGarnet),
  water_name_line_label: label(P.darkGarnet),

  // ---- roads ------------------------------------------------------------
  ...road(P.motorway, P.motorwayCasing, {
    tunnel_motorway: "fill",
    tunnel_motorway_casing: "casing",
    road_motorway: "fill",
    road_motorway_casing: "casing",
    bridge_motorway: "fill",
    bridge_motorway_casing: "casing",
  }),
  ...road(P.arterial, P.arterialCasing, {
    tunnel_motorway_link: "fill",
    tunnel_motorway_link_casing: "casing",
    road_motorway_link: "fill",
    road_motorway_link_casing: "casing",
    bridge_motorway_link: "fill",
    bridge_motorway_link_casing: "casing",
    tunnel_trunk_primary: "fill",
    tunnel_trunk_primary_casing: "casing",
    road_trunk_primary: "fill",
    road_trunk_primary_casing: "casing",
    bridge_trunk_primary: "fill",
    bridge_trunk_primary_casing: "casing",
    tunnel_link: "fill",
    tunnel_link_casing: "casing",
    road_link: "fill",
    road_link_casing: "casing",
    bridge_link: "fill",
    bridge_link_casing: "casing",
  }),
  ...road(P.secondaryRoad, P.secondaryRoadCasing, {
    tunnel_secondary_tertiary: "fill",
    tunnel_secondary_tertiary_casing: "casing",
    road_secondary_tertiary: "fill",
    road_secondary_tertiary_casing: "casing",
    bridge_secondary_tertiary: "fill",
    bridge_secondary_tertiary_casing: "casing",
  }),
  ...road(P.minorRoad, P.minorRoadCasing, {
    tunnel_minor: "fill",
    tunnel_street_casing: "casing",
    road_minor: "fill",
    road_minor_casing: "casing",
    bridge_street: "fill",
    bridge_street_casing: "casing",
  }),
  ...road(P.serviceRoad, P.serviceRoadCasing, {
    tunnel_service_track: "fill",
    tunnel_service_track_casing: "casing",
    road_service_track: "fill",
    road_service_track_casing: "casing",
    bridge_service_track: "fill",
    bridge_service_track_casing: "casing",
  }),
  ...road(P.minorRoad, P.serviceRoadCasing, {
    tunnel_path_pedestrian: "fill",
    road_path_pedestrian: "fill",
    bridge_path_pedestrian: "fill",
    bridge_path_pedestrian_casing: "casing",
  }),
  ...road(P.rail, P.rail, {
    tunnel_major_rail: "fill",
    tunnel_major_rail_hatching: "fill",
    tunnel_transit_rail: "fill",
    tunnel_transit_rail_hatching: "fill",
    road_major_rail: "fill",
    road_major_rail_hatching: "fill",
    road_transit_rail: "fill",
    road_transit_rail_hatching: "fill",
    bridge_major_rail: "fill",
    bridge_major_rail_hatching: "fill",
    bridge_transit_rail: "fill",
    bridge_transit_rail_hatching: "fill",
  }),

  // ---- buildings --------------------------------------------------------
  // minzoom 13: only ever on screen once a visitor has zoomed well past any
  // section's fit (6.948 land, 9.644 improved).
  building: { "fill-color": P.building, "fill-outline-color": P.buildingOutline },
  "building-3d": { "fill-extrusion-color": P.building },

  // ---- boundaries -------------------------------------------------------
  boundary_3: { "line-color": P.boundaryMinor },
  boundary_2: { "line-color": P.boundaryMajor },
  boundary_disputed: { "line-color": P.boundaryMajor },

  // ---- labels -----------------------------------------------------------
  // Every label on this map gets the ground as its halo. `highway-name-major`
  // and `highway-name-minor` had NO `text-halo-color` upstream at all (only a
  // blur and a width, over MapLibre's transparent default), so this ADDS one —
  // see HALO_ADDED, which is why those two are exempt from the must-change
  // check below on that property.
  label_country_1: label(P.garnet),
  label_country_2: label(P.garnet),
  label_country_3: label(P.garnet),
  label_state: label(P.garnet),
  label_city: label(P.darkGarnet),
  label_city_capital: label(P.darkGarnet),
  label_town: label(P.darkGarnet),
  label_village: label(P.darkGarnet),
  label_other: label(P.darkGarnet),
  "highway-name-major": label(P.secondary),
  "highway-name-minor": label(P.secondary),
  "highway-name-path": label(P.pathLabel),
  airport: label(P.secondary),
};

/** Where a paint property is being ADDED rather than retinted. */
export const HALO_ADDED = new Set([
  "highway-name-major:text-halo-color",
  "highway-name-minor:text-halo-color",
]);

/**
 * Dropped outright.
 *
 * `natural_earth` is Natural Earth shaded relief, a RASTER layer at maxzoom 7
 * over the `ne2_shaded` source. The widest section fit on this site is z6.948
 * (see the comment at src/lib/property-map.ts:28), so it does render there
 * today — a grey-brown hillshade under a sand palette, and a whole second
 * source's worth of PNG fetches. Dropping it leaves that land flat `#f2efe9`,
 * which is the right call for a tinted map and the cheaper one.
 *
 * The four `poi_*` layers are coffee shops, chemists and bus stops. A property
 * map is not a place to find lunch, and every one of them is a label competing
 * with a pin.
 */
export const DROP_LAYERS = ["natural_earth", "poi_r1", "poi_r7", "poi_r20", "poi_transit"];
export const DROP_SOURCES = ["ne2_shaded"];

/**
 * Left exactly as upstream draws them, on purpose.
 *
 * THE HIGHWAY SHIELDS ARE NOT AN OVERSIGHT. `highway-shield-non-us`,
 * `highway-shield-us-interstate` and `road_shield_us` draw real-world signage —
 * the green-and-white FM marker, the Texas state outline, the interstate
 * shield — from the sprite, and a visitor matches them against what is on the
 * pole. Four of this client's listings sit on numbered roads (FM 1976, TX 16,
 * FM 2252, RM 12). They are the one deliberately non-palette element on this
 * map. Do not "fix" them.
 *
 * `road_one_way_arrow` / `_opposite` are sprite glyphs with no paint at all.
 *
 * `landcover_wetland` (`wetland_bg_11`) and `road_area_pattern`
 * (`pedestrian_polygon`) are FILL PATTERNS, i.e. bitmaps in OpenFreeMap's
 * sprite sheet. Retinting them means hosting our own sprite, which is a
 * different and much larger job than a style file — see the issue linked from
 * the journal entry.
 */
export const KEEP_AS_IS = [
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  "road_one_way_arrow",
  "road_one_way_arrow_opposite",
  "landcover_wetland",
  "road_area_pattern",
];

// ---------------------------------------------------------------------------

/**
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function hexToRgba(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * The literal a table value becomes in the style file.
 * @param {Tint} value
 * @returns {string}
 */
export function literal(value) {
  return typeof value === "string" ? value : hexToRgba(value.color, value.alpha);
}

/** Every colour literal this table can put in the file. */
export function expectedLiterals() {
  /** @type {Set<string>} */
  const out = new Set();
  for (const paint of Object.values(RECOLOUR)) {
    for (const value of Object.values(paint)) out.add(literal(value));
  }
  return out;
}

const COLOUR = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/;

/**
 * Replace the colour literals in one paint value, keeping the expression.
 *
 * A plain string is the whole value. An `["interpolate", <type>, <input>,
 * stop, out, stop, out, …]` keeps its shape and every OUTPUT is replaced —
 * indices 4, 6, 8 … — so a zoom ramp between two colours becomes a zoom ramp
 * between the same colour twice rather than a flat string that would drop the
 * ramp's other properties on the floor.
 *
 * @param {unknown} value the upstream paint value
 * @param {string} next the literal to write
 * @param {string} where `<layer id>.<paint property>`, for a problem line
 * @param {string[]} problems appended to, never thrown
 * @returns {{ value: unknown; changed: boolean }}
 */
function retintValue(value, next, where, problems) {
  if (typeof value === "string") {
    if (!COLOUR.test(value)) {
      problems.push(`${where}: upstream value ${JSON.stringify(value)} is not a colour literal`);
      return { value, changed: false };
    }
    return { value: next, changed: value !== next };
  }
  if (Array.isArray(value) && value[0] === "interpolate") {
    const out = value.slice();
    let replaced = 0;
    let changed = false;
    for (let i = 4; i < out.length; i += 2) {
      if (typeof out[i] !== "string" || !COLOUR.test(out[i])) {
        problems.push(`${where}: interpolate output at index ${i} is not a colour literal`);
        continue;
      }
      if (out[i] !== next) changed = true;
      out[i] = next;
      replaced += 1;
    }
    if (replaced === 0) problems.push(`${where}: interpolate expression had no colour outputs`);
    return { value: out, changed };
  }
  problems.push(`${where}: unsupported value shape ${JSON.stringify(value).slice(0, 80)}`);
  return { value, changed: false };
}

/**
 * Recursively sort object keys. Arrays keep their order — they are draw order
 * and expression syntax, never a set.
 *
 * EXPORTED so scripts/map-style.test.ts can re-derive canonical form rather
 * than assume it. `serialise(JSON.parse(raw))` preserves whatever key order the
 * FILE happens to carry, so on its own it proves only the indent.
 *
 * @param {unknown} node
 * @returns {unknown}
 */
export function sortKeys(node) {
  if (Array.isArray(node)) return node.map(sortKeys);
  if (node && typeof node === "object") {
    /** @type {Record<string, unknown>} */
    const out = {};
    const source = /** @type {Record<string, unknown>} */ (node);
    for (const key of Object.keys(source).sort()) out[key] = sortKeys(source[key]);
    return out;
  }
  return node;
}

/**
 * The whole transformation, as a pure function of the upstream style, so a test
 * can drive it without a network.
 *
 * Returns `{ style, problems, changes }`. A non-empty `problems` means NOTHING
 * is written: upstream moved and a human has to look.
 *
 * @param {MapStyle} upstream
 * @returns {{ style: MapStyle; problems: string[]; changes: string[] }}
 */
export function retint(upstream) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const changes = [];
  /** @type {MapStyle} */
  const style = structuredClone(upstream);

  const upstreamIds = new Set(style.layers.map((l) => l.id));
  const known = new Set([...Object.keys(RECOLOUR), ...DROP_LAYERS, ...KEEP_AS_IS]);

  for (const id of known) {
    if (!upstreamIds.has(id)) problems.push(`layer "${id}" is in our table but NOT upstream`);
  }
  for (const id of upstreamIds) {
    if (!known.has(id)) {
      problems.push(`layer "${id}" is NEW upstream and this table says nothing about it`);
    }
  }
  for (const id of DROP_SOURCES) {
    if (!(id in style.sources)) problems.push(`source "${id}" is in DROP_SOURCES but NOT upstream`);
  }
  if (!style.sources.openmaptiles) problems.push('the "openmaptiles" source is gone upstream');

  const dropped = new Set(DROP_LAYERS);
  style.layers = style.layers.filter((l) => !dropped.has(l.id));
  for (const id of DROP_SOURCES) delete style.sources[id];

  for (const layer of style.layers) {
    const table = RECOLOUR[layer.id];
    if (!table) continue;
    layer.paint ??= {};
    for (const [property, target] of Object.entries(table)) {
      const where = `${layer.id}.${property}`;
      const next = literal(target);
      if (!(property in layer.paint)) {
        if (HALO_ADDED.has(`${layer.id}:${property}`)) {
          layer.paint[property] = next;
          changes.push(`${where}: (absent) -> ${next}`);
          continue;
        }
        problems.push(`${where}: paint property is not on this layer upstream`);
        continue;
      }
      if (HALO_ADDED.has(`${layer.id}:${property}`)) {
        problems.push(`${where}: upstream GREW this property; HALO_ADDED is now a lie`);
        continue;
      }
      const before = layer.paint[property];
      const { value, changed } = retintValue(before, next, where, problems);
      if (!changed) {
        problems.push(
          `${where}: recolouring to ${next} changes nothing — upstream already paints it that ` +
            `way, so this table row proves nothing`,
        );
        continue;
      }
      layer.paint[property] = value;
      changes.push(`${where}: ${JSON.stringify(before)} -> ${JSON.stringify(value)}`);
    }
  }

  // OUR source spec wins over the fetched TileJSON (see ATTRIBUTION).
  if (style.sources.openmaptiles) {
    style.sources.openmaptiles.attribution = ATTRIBUTION;
    changes.push("sources.openmaptiles.attribution: set");
  }
  style.name = "Roalson Interests — liberty, tinted";

  return { style: /** @type {MapStyle} */ (sortKeys(style)), problems, changes };
}

/**
 * The exact bytes committed: sorted keys, two-space indent, trailing newline.
 * @param {unknown} style
 * @returns {string}
 */
export function serialise(style) {
  return `${JSON.stringify(style, null, 2)}\n`;
}

async function main() {
  const printOnly = process.argv.includes("--print");
  const response = await fetch(UPSTREAM_STYLE_URL);
  if (!response.ok) {
    console.error(`${UPSTREAM_STYLE_URL} answered ${response.status}`);
    process.exit(1);
  }
  const upstream = await response.json();
  const { style, problems, changes } = retint(upstream);

  const sources = Object.keys(upstream.sources).join(", ");
  console.log(`upstream: ${upstream.layers.length} layers, sources [${sources}]`);
  console.log(`ours:     ${style.layers.length} layers, ${changes.length} paint changes`);

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s) — writing NOTHING:\n`);
    for (const problem of problems) console.error(`  x ${problem}`);
    console.error("\nUpstream has moved. Read the diff, update the table in this file, re-run.");
    process.exit(1);
  }

  const next = serialise(style);
  let previous = null;
  try {
    previous = readFileSync(OUTPUT_PATH, "utf-8");
  } catch {
    /* first run */
  }
  if (printOnly) {
    for (const change of changes) console.log(`  ${change}`);
    console.log(`\nsha256 would be ${digest(next)}`);
    console.log(previous === next ? "static/map-style.json is up to date." : "WOULD REWRITE.");
    return;
  }
  const sha = digest(next);
  writeFileSync(OUTPUT_PATH, next);
  writeFileSync(DIGEST_PATH, `${sha}\n`);
  console.log(
    previous === next
      ? "static/map-style.json unchanged (byte-identical re-run)."
      : `static/map-style.json written (${Buffer.byteLength(next, "utf-8")} bytes).`,
  );
  console.log(`scripts/map-style.sha256: ${sha}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

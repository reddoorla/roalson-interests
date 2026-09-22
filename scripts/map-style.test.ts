// @vitest-environment node
//
// The guard on `static/map-style.json`, the file the site actually serves.
//
// scripts/map-style.mjs is the tool that BUILDS it, and a tool cannot vouch for
// its own output: it needs the network, it runs by hand, and it is the thing
// most likely to have been half-edited. So everything here reads the COMMITTED
// bytes and needs nothing but the filesystem.
//
// The assertion that closes the class is `the file contains no colour but ours`
// below. Checking the table's own rows one at a time only ever proves the rows
// someone remembered to write; collecting every colour literal in all 106
// layers and diffing the SET against the table catches the layer nobody
// thought about — which is exactly how this file's first run found that
// `landuse_hospital` is pink.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

import {
  ATTRIBUTION,
  DROP_LAYERS,
  DROP_SOURCES,
  expectedLiterals,
  KEEP_AS_IS,
  literal,
  RECOLOUR,
  serialise,
} from "./map-style.mjs";
import { MAP_TILE_HOST } from "../src/lib/property-map";

const ROOT = join(import.meta.dirname, "..");
const PATH = join(ROOT, "static", "map-style.json");
const raw = readFileSync(PATH, "utf-8");
const style = JSON.parse(raw);

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Every string in the document that is a CSS colour, with where it came from. */
function colourLiterals(node: Json, path = "", out = new Map<string, string[]>()) {
  if (typeof node === "string") {
    if (/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/.test(node)) {
      out.set(node, [...(out.get(node) ?? []), path]);
    }
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => colourLiterals(child, `${path}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const [key, child] of Object.entries(node)) colourLiterals(child, `${path}.${key}`, out);
  }
  return out;
}

/** Every absolute URL in the document. */
function urls(node: Json, out: string[] = []): string[] {
  if (typeof node === "string") {
    if (/^https?:\/\//.test(node)) out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => urls(child, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const child of Object.values(node)) urls(child, out);
  }
  return out;
}

const byId = new Map<string, { id: string; paint?: Record<string, Json> }>(
  style.layers.map((l: { id: string }) => [l.id, l]),
);

describe("the committed map style", () => {
  it("is in the generator's canonical form, byte for byte", () => {
    // Sorted keys, two-space indent, trailing newline. A hand edit, a prettier
    // pass or a non-deterministic generator all fail here, and this is the
    // assertion that lets every other test below treat the file as generated.
    expect(raw).toBe(serialise(style));
  });

  it("is the whole liberty style minus what we dropped", () => {
    // 111 upstream - 5 dropped. A bare `toBeGreaterThan(0)` would pass on a
    // file with two layers in it.
    expect(style.layers.length).toBe(106);
    expect(Object.keys(style.sources)).toEqual(["openmaptiles"]);
  });

  describe("the colours", () => {
    it.each(
      Object.entries(RECOLOUR).flatMap(([id, paint]) =>
        Object.entries(paint).map(([property, value]) => ({ id, property, value })),
      ),
      // `$id.$property` would be read as a NESTED property path and print
      // "undefined"; the space is what keeps both names in the title.
    )("$id $property is $value", ({ id, property, value }) => {
      const layer = byId.get(id);
      expect(layer, `layer ${id} is missing from the committed style`).toBeDefined();
      const painted = layer!.paint?.[property];
      const want = literal(value);
      if (typeof painted === "string") {
        expect(painted).toBe(want);
        return;
      }
      // An expression keeps its shape; only its outputs moved.
      expect(Array.isArray(painted), `${id}.${property} is neither a string nor an array`).toBe(
        true,
      );
      const expression = painted as Json[];
      expect(expression[0]).toBe("interpolate");
      const outputs = expression.filter((_, i) => i >= 4 && i % 2 === 0);
      expect(outputs.length).toBeGreaterThan(0);
      expect(
        outputs.every((o) => o === want),
        `${id}.${property} outputs: ${outputs}`,
      ).toBe(true);
    });

    // THE ONE THAT CLOSES THE CLASS.
    it("contains no colour but ours, anywhere in the file", () => {
      const found = colourLiterals(style);
      const expected = expectedLiterals();
      const strays = [...found.keys()]
        .filter((c) => !expected.has(c))
        .map((c) => `${c} at ${found.get(c)!.slice(0, 2).join(", ")}`);
      expect(
        strays,
        "these colour literals survived from upstream and belong to nobody's table",
      ).toEqual([]);
      // And nothing in the table went missing: a row whose layer got deleted
      // would otherwise pass the check above by simply not being there.
      expect([...expected].filter((c) => !found.has(c))).toEqual([]);
      expect(found.size).toBe(expected.size);
    });
  });

  describe("what was dropped, and what was deliberately not", () => {
    it.each(DROP_LAYERS)("has no %s layer", (id) => {
      expect(byId.has(id)).toBe(false);
    });

    it.each(DROP_SOURCES)("has no %s source", (id) => {
      expect(style.sources[id]).toBeUndefined();
    });

    // The Natural Earth raster is gone as a SOURCE; this is the assertion that
    // nothing still points at its tiles from somewhere else in the document.
    it("makes no request to the Natural Earth raster at all", () => {
      expect(raw).not.toContain("natural_earth");
      expect(raw).not.toContain("ne2sr");
    });

    // Highway shields are real-world signage, not brand surface — four of this
    // client's listings sit on numbered roads (FM 1976, TX 16, FM 2252, RM 12).
    // They are the one deliberately non-palette element on the map. This test
    // exists so that "the shields are still upstream's" reads as a decision
    // rather than as an oversight somebody later tidies up.
    it.each(KEEP_AS_IS)("keeps %s exactly as upstream draws it", (id) => {
      expect(byId.has(id)).toBe(true);
    });
  });

  describe("the attribution", () => {
    it("credits OpenMapTiles and OpenStreetMap, and not OpenFreeMap", () => {
      // OpenFreeMap's terms make OpenMapTiles and OpenStreetMap conditions and
      // the OpenFreeMap word a courtesy ("You do not need to display the
      // OpenFreeMap part"). The operator dropped the courtesy.
      expect(style.sources.openmaptiles.attribution).toBe(ATTRIBUTION);
      expect(ATTRIBUTION).toContain("OpenMapTiles");
      expect(ATTRIBUTION).toContain("openstreetmap.org/copyright");
      expect(ATTRIBUTION).not.toContain("OpenFreeMap");
    });

    // Our spec beats the fetched TileJSON only because MapLibre extends the
    // fetched document WITH the spec. That is somebody else's code, so the
    // claim is proved in a browser, not here — this only asserts the half we
    // own: that we set it at all, on the source that carries `url`.
    it("sets it on the source that still resolves its tiles from a TileJSON", () => {
      expect(style.sources.openmaptiles.url).toBe(`${MAP_TILE_HOST}/planet`);
      expect(style.sources.openmaptiles.tiles).toBeUndefined();
    });
  });

  it("points at exactly one external host, and it is the CSP entry", () => {
    // The style is ours and same-origin; everything it REFERENCES is still
    // OpenFreeMap's. This is what keeps `connect-src` a one-line change: if a
    // future upstream moved the glyphs to a different domain, the map would go
    // silently unlabelled in production and this is where that is caught.
    const hosts = new Set(urls(style).map((u) => new URL(u).origin));
    expect([...hosts].filter((h) => h !== MAP_TILE_HOST)).toEqual([]);
    expect(hosts.size).toBe(1);
    expect(style.sprite.startsWith(`${MAP_TILE_HOST}/`)).toBe(true);
    expect(style.glyphs.startsWith(`${MAP_TILE_HOST}/`)).toBe(true);
  });
});

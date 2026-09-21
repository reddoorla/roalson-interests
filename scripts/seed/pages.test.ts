import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  localSliceModels,
  propertyRefs,
  resolveRefs,
  sliceIds,
  toPayload,
  // @ts-expect-error — plain ESM scripts, no declarations
} from "./pages.mjs";
// @ts-expect-error — plain ESM scripts, no declarations
import { canonical, remoteSliceChoices, sliceOutOfSync } from "./lib.mjs";

type Slice = { slice_type: string; variation: string; primary: Record<string, unknown> };
type Entry = {
  uid: string;
  title: string;
  data: Record<string, unknown> & { slices?: Slice[] };
  source: Record<string, string>;
};
type Field = { type: string; config?: { fields?: Record<string, Field>; choices?: object } };

const root = process.cwd();
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const pages = read("scripts/seed/pages.json") as Entry[];
const pageModel = read("customtypes/page/index.json");
const pageFields: Record<string, Field> = Object.assign(
  {},
  ...Object.values(pageModel.json as Record<string, object>),
);
const models = localSliceModels(root) as Record<
  string,
  { id: string; variations: { id: string; primary?: Record<string, Field> }[] }
>;
const listings = (read("scripts/seed/listings.json") as { uid: string }[]).map((l) => l.uid);

const headers = { auth: { repository: "r", Authorization: "Bearer t" } };
const answer = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status });

describe("the pages data file", () => {
  it("holds the home page, and says where every part of it came from", () => {
    expect(pages.map((p) => p.uid)).toContain("home");
    for (const page of pages) {
      const parts = [...Object.keys(page.data).filter((k) => k !== "slices"), ...sliceIds(page)];
      expect(Object.keys(page.source).sort(), page.uid).toEqual([...new Set(parts)].sort());
      for (const note of Object.values(page.source)) {
        expect(note).toMatch(/^(MEASURED|COMPUTED|INFERRED) — /);
      }
    }
  });

  it("uses only fields the page model declares", () => {
    const unknown = pages.flatMap((p) => Object.keys(p.data).filter((k) => !pageFields[k]));
    expect(unknown).toEqual([]);
  });

  it("writes only slices this repo models AND the page type offers — the API drops the rest without a word", () => {
    const offered = Object.keys(pageFields.slices.config?.choices ?? {});
    for (const page of pages) {
      for (const id of sliceIds(page)) {
        expect(models[id], `${id} has a local model`).toBeDefined();
        expect(offered, `page offers ${id}`).toContain(id);
      }
    }
  });

  it("fills only fields the slice's variation declares, down into its groups", () => {
    const undeclared: string[] = [];
    for (const page of pages) {
      for (const slice of page.data.slices ?? []) {
        const variation = models[slice.slice_type]?.variations.find(
          (v) => v.id === slice.variation,
        );
        expect(variation, `${slice.slice_type}/${slice.variation}`).toBeDefined();
        for (const [key, value] of Object.entries(slice.primary)) {
          const field = variation?.primary?.[key];
          if (!field) undeclared.push(`${slice.slice_type}.${key}`);
          else if (field.type === "Group") {
            for (const row of value as Record<string, unknown>[]) {
              for (const sub of Object.keys(row)) {
                if (!field.config?.fields?.[sub])
                  undeclared.push(`${slice.slice_type}.${key}.${sub}`);
              }
            }
          }
        }
      }
    }
    expect(undeclared).toEqual([]);
  });

  it("names only listings the listings seed stages", () => {
    const strangers = pages
      .flatMap((p) => propertyRefs(p.data))
      .filter((u) => !listings.includes(u));
    expect(strangers).toEqual([]);
  });

  it("links to this site's own pages by path", () => {
    const urls: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (o.link_type === "Web" && typeof o.url === "string") urls.push(o.url);
        Object.values(o).forEach(walk);
      }
    };
    walk(pages);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^(\/[a-z0-9/-]*|https:\/\/[^/].*)$/);
  });
});

describe("resolving listings into content relationships", () => {
  const data = {
    slices: [
      { primary: { listings: [{ listing: { $property: "a" } }, { listing: { $property: "b" } }] } },
    ],
  };

  it("finds every reference, in document order", () => {
    expect(propertyRefs(data)).toEqual(["a", "b"]);
  });

  it("swaps each for the Document link the Migration API takes", () => {
    const out = resolveRefs(data, { a: "ID-A", b: "ID-B" });
    expect(out.slices[0].primary.listings).toEqual([
      { listing: { link_type: "Document", id: "ID-A" } },
      { listing: { link_type: "Document", id: "ID-B" } },
    ]);
  });

  it("STOPS on a listing it holds no id for — an empty relationship would stage happily", () => {
    expect(() => resolveRefs(data, { a: "ID-A" })).toThrow(/no staged id for property "b"/);
  });
});

describe("toPayload", () => {
  it("sends the whole document: every slice with its items, no empty values, the editor's title", () => {
    const home = pages.find((p) => p.uid === "home") as Entry;
    const payload = toPayload(home, Object.fromEntries(listings.map((u) => [u, `ID-${u}`])));
    expect(payload.type).toBe("page");
    expect(payload.uid).toBe("home");
    expect(payload.title).toBe("Home");
    expect(payload.data.slices.length).toBe(home.data.slices?.length);
    for (const slice of payload.data.slices) expect(slice.items).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("$property");
    expect(JSON.stringify(payload)).not.toMatch(/:(null|""|\{\})[,}]/);
  });
});

describe("the models-in-sync preflight", () => {
  const model = {
    id: "home_hero",
    variations: [{ id: "default", primary: { a: { type: "Text" } } }],
  };

  it("compares models by content, not by the order their keys were written in", () => {
    expect(JSON.stringify(canonical({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } }))).toBe(
      JSON.stringify({ a: { c: 3, d: [{ y: 2, z: 1 }] }, b: 1 }),
    );
    const reordered = {
      variations: [{ primary: { a: { type: "Text" } }, id: "default" }],
      id: "home_hero",
    };
    return expect(
      sliceOutOfSync("home_hero", model, headers, answer(200, reordered)),
    ).resolves.toBeNull();
  });

  it("names a slice Prismic does not have, and one whose model differs", async () => {
    await expect(sliceOutOfSync("home_hero", model, headers, answer(404, {}))).resolves.toMatch(
      /not registered/,
    );
    const stale = { ...model, variations: [{ id: "default", primary: {} }] };
    await expect(sliceOutOfSync("home_hero", model, headers, answer(200, stale))).resolves.toMatch(
      /differs/,
    );
  });

  it("refuses to read an unreadable answer as either", async () => {
    await expect(sliceOutOfSync("home_hero", model, headers, answer(500, {}))).rejects.toThrow(
      /read slice model home_hero: 500/,
    );
  });

  it("reads what the repository's page type offers, from whichever tab holds the zone", async () => {
    const type = {
      json: {
        SEO: { meta: { type: "Text" } },
        Main: { slices: { type: "Slices", config: { choices: { home_hero: {}, rich_text: {} } } } },
      },
    };
    await expect(remoteSliceChoices("page", "slices", headers, answer(200, type))).resolves.toEqual(
      ["home_hero", "rich_text"],
    );
    await expect(remoteSliceChoices("page", "slices", headers, answer(403, {}))).rejects.toThrow(
      /read custom type page: 403/,
    );
    await expect(remoteSliceChoices("page", "body", headers, answer(200, type))).rejects.toThrow(
      /no slice zone named "body"/,
    );
  });
});

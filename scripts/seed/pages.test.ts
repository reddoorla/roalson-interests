import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  imageRefs,
  localSliceModels,
  propertyRefs,
  resolveRefs,
  sliceIds,
  toPayload,
  // @ts-expect-error — plain ESM scripts, no declarations
} from "./pages.mjs";
// @ts-expect-error — plain ESM scripts, no declarations
import { canonical, contentSignature, remoteSliceChoices, sliceOutOfSync } from "./lib.mjs";
// @ts-expect-error — plain ESM scripts, no declarations
import { notYetLive } from "./publish-release.mjs";

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

  it("puts an $image only where the slice's variation declares an Image field", () => {
    const isImageRef = (v: unknown) =>
      !!v && typeof v === "object" && typeof (v as { $image?: unknown }).$image === "string";
    const misplaced: string[] = [];
    for (const page of pages) {
      for (const slice of page.data.slices ?? []) {
        const variation = models[slice.slice_type]?.variations.find(
          (v) => v.id === slice.variation,
        );
        for (const [key, value] of Object.entries(slice.primary)) {
          const field = variation?.primary?.[key];
          if (isImageRef(value) && field?.type !== "Image")
            misplaced.push(`${slice.slice_type}.${key}`);
          if (field?.type === "Group" && Array.isArray(value)) {
            for (const row of value as Record<string, unknown>[]) {
              for (const [sub, v] of Object.entries(row)) {
                if (isImageRef(v) && field.config?.fields?.[sub]?.type !== "Image")
                  misplaced.push(`${slice.slice_type}.${key}.${sub}`);
              }
            }
          }
        }
      }
    }
    expect(misplaced).toEqual([]);
    // …and the walk above has something to measure. Without this the test
    // passes just as happily on a file with no photograph in it at all.
    expect(pages.flatMap((p) => imageRefs(p.data)).length).toBeGreaterThan(0);
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

describe("the home document's bands", () => {
  const home = pages.find((p) => p.uid === "home") as Entry;
  const ids = Object.fromEntries(listings.map((uid) => [uid, `ID-${uid}`]));
  const order = (home.data.slices ?? []).map((s) => s.slice_type);
  // The media library as `existingAssets()` returns it, for whatever the file
  // names — so the assertions below cannot pass by naming a photograph the
  // data does not actually reference.
  const library = Object.fromEntries(
    (imageRefs(home.data) as string[]).map((f) => [f, { id: `ASSET-${f}`, url: `https://x/${f}` }]),
  );

  it("features the comp's three listings, in its order, and asks the model for nothing else", () => {
    const band = (home.data.slices ?? []).find((s) => s.slice_type === "featured_properties");
    const picks = band?.primary.properties as { property: { $property: string } }[];
    expect(picks.map((p) => p.property.$property)).toEqual([
      "25331-ih-10-west",
      "101-w-commerce-street",
      "13810-lookout-road",
    ]);
    // The heading is not set: the slice's own default reads "Featured
    // Properties", and a second copy in the seed is a second thing to edit.
    expect(Object.keys(band!.primary)).toEqual(["properties"]);
  });

  it("opens on the hero and ends on the photo band — which pins only as the LAST slice", () => {
    expect(order[0]).toBe("home_hero");
    expect(order.at(-1)).toBe("photo_band");
    expect(order.filter((s) => s === "photo_band")).toHaveLength(1);
  });

  it("names the four photographs the media library holds, in document order", () => {
    expect(imageRefs(home.data)).toEqual([
      "home-hero-poster-suburban-to-country.jpg",
      "partner-matt-howard.jpg",
      "partner-bart-wilson.jpg",
      "home-photo-band-san-antonio-skyline.jpg",
    ]);
  });

  it("fills the photo band: a band with no image was the launch state, and is not any more", () => {
    const payload = toPayload(home, ids, library);
    const band = payload.data.slices.find((s: Slice) => s.slice_type === "photo_band");
    expect(band.primary).toEqual({
      image: { id: "ASSET-home-photo-band-san-antonio-skyline.jpg" },
    });
    expect(band.items).toEqual([]);
  });

  it("keeps an EMPTY band's primary as {} all the same — a slice with nothing in it, not no slice", () => {
    // The home page no longer exercises this, so it is exercised here: it is
    // `stripEmpty(...) ?? {}` in toPayload, and the API has nothing to
    // validate a slice against if the key goes missing altogether.
    const bare = {
      uid: "bare",
      title: "Bare",
      data: { slices: [{ slice_type: "photo_band", variation: "default", primary: {} }] },
    };
    const band = toPayload(bare).data.slices[0];
    expect(band.primary).toEqual({});
    expect(band.items).toEqual([]);
  });

  it("gives each partner a name, a role and the client's own headshot — and still no bio or address", () => {
    const partners = (home.data.slices ?? []).find((s) => s.slice_type === "partners");
    const rows = partners?.primary.partners as Record<string, { $image?: string }>[];
    expect(rows.map((r) => r.name)).toEqual(["Matt Howard", "Bart Wilson"]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["name", "photo", "role"]);
    // Bart Wilson's file is 140×177 in a 153px box and renders soft — #73, not
    // a defect of this seed, and the only file that exists of him.
    expect(rows.map((r) => r.photo?.$image)).toEqual([
      "partner-matt-howard.jpg",
      "partner-bart-wilson.jpg",
    ]);
  });

  it("gives the hero the poster its own Vimeo film opens on", () => {
    const hero = (home.data.slices ?? []).find((s) => s.slice_type === "home_hero");
    expect(hero?.primary.vimeo_id).toBe("1229048743");
    const payload = toPayload(home, ids, library);
    const staged = payload.data.slices.find((s: Slice) => s.slice_type === "home_hero");
    expect(staged.primary.poster).toEqual({
      id: "ASSET-home-hero-poster-suburban-to-country.jpg",
    });
    expect(staged.primary.vimeo_id).toBe("1229048743");
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

describe("resolving photographs into Image fields", () => {
  const data = {
    slices: [
      {
        primary: {
          image: { $image: "band.jpg" },
          rows: [{ photo: { $image: "headshot.jpg" } }],
        },
      },
    ],
  };
  // What `existingAssets()` returns: keyed by FILENAME, because a filename is
  // reviewable in a diff and a sixteen-character asset id is not.
  const library = {
    "band.jpg": { id: "ASSET-BAND", url: "https://images.prismic.io/r/ASSET-BAND_band.jpg" },
    "headshot.jpg": { id: "ASSET-HEAD", url: "https://images.prismic.io/r/ASSET-HEAD_head.jpg" },
  };

  it("finds every reference, in document order", () => {
    expect(imageRefs(data)).toEqual(["band.jpg", "headshot.jpg"]);
  });

  it("swaps each for { id } — the asset id alone, which is the whole of what an Image field takes", () => {
    const out = resolveRefs(data, {}, library);
    expect(out.slices[0].primary.image).toEqual({ id: "ASSET-BAND" });
    expect(out.slices[0].primary.rows).toEqual([{ photo: { id: "ASSET-HEAD" } }]);
  });

  it("sends no url, alt or dimensions: Prismic writes those into the document off the asset", () => {
    const out = resolveRefs({ image: { $image: "band.jpg" } }, {}, library);
    expect(Object.keys(out.image)).toEqual(["id"]);
  });

  it("STOPS on a filename the media library does not hold — the API takes a bad Image with a 200", () => {
    expect(() => resolveRefs(data, {}, { "band.jpg": library["band.jpg"] })).toThrow(
      /no asset in the media library named "headshot\.jpg"/,
    );
    expect(() => resolveRefs(data, {}, {})).toThrow(
      /no asset in the media library named "band\.jpg"/,
    );
    // An entry with no id is not an asset either — a half-written state file
    // must not resolve to `{ id: undefined }`, which stages as an empty image.
    expect(() => resolveRefs(data, {}, { ...library, "band.jpg": { url: "u" } })).toThrow(
      /no asset in the media library named "band\.jpg"/,
    );
  });

  it("leaves a document with no photographs exactly as it was", () => {
    const plain = { slices: [{ primary: { heading: "H" } }] };
    expect(imageRefs(plain)).toEqual([]);
    expect(resolveRefs(plain, {}, {})).toEqual(plain);
  });
});

describe("toPayload", () => {
  it("sends the whole document: every slice with its items, no empty values, the editor's title", () => {
    const home = pages.find((p) => p.uid === "home") as Entry;
    const payload = toPayload(
      home,
      Object.fromEntries(listings.map((u) => [u, `ID-${u}`])),
      Object.fromEntries((imageRefs(home.data) as string[]).map((f) => [f, { id: `ASSET-${f}` }])),
    );
    expect(payload.type).toBe("page");
    expect(payload.uid).toBe("home");
    expect(payload.title).toBe("Home");
    expect(payload.data.slices.length).toBe(home.data.slices?.length);
    for (const slice of payload.data.slices) expect(slice.items).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("$property");
    expect(JSON.stringify(payload)).not.toContain("$image");
    // No empty value anywhere — EXCEPT a slice's own `primary`, which is what
    // an unfilled band is. Every band on the home page is filled today, so the
    // replacement below has nothing to do; the contract is held by its own
    // test in "the home document's bands".
    const withoutPrimaries = JSON.stringify(payload).replaceAll(
      '"primary":{}',
      '"primary":{"x":1}',
    );
    expect(withoutPrimaries).not.toMatch(/:(null|""|\{\})[,}]/);
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

describe("the content signature — what makes a publish's pass positive evidence", () => {
  const home = {
    title: [{ type: "heading1", text: "Home" }],
    meta_title: "T",
    slices: [{ slice_type: "home_hero", variation: "default", primary: {} }],
  };

  it("changes when a slice is added, which is the case the uid check could not see", () => {
    const withBands = {
      ...home,
      slices: [...home.slices, { slice_type: "partners", variation: "default", primary: {} }],
    };
    expect(contentSignature(withBands)).not.toBe(contentSignature(home));
    expect(JSON.parse(contentSignature(withBands)).slices).toEqual([
      "home_hero/default()",
      "partners/default()",
    ]);
  });

  it("changes when a slice's primary gains a field — which is what a photograph arriving looks like", () => {
    // The 2026-09-21 defect, one step along: `photo_band` went from an empty
    // primary to one holding an image, and a signature that read a slice as
    // type + variation alone did not move. The publisher's pass IS this
    // string, so it would have reported the page live and left the photograph
    // unpublished in the migration release.
    const filled = {
      ...home,
      slices: [{ slice_type: "home_hero", variation: "default", primary: { poster: { id: "A" } } }],
    };
    expect(contentSignature(filled)).not.toBe(contentSignature(home));
    expect(JSON.parse(contentSignature(filled)).slices).toEqual(["home_hero/default(poster)"]);
    expect(JSON.parse(contentSignature(home)).slices).toEqual(["home_hero/default()"]);
  });

  it("reads a slice's unfilled group the same whether the API returns [] or the payload omits it", () => {
    // Measured on the live `home` document: the delivered `partners` band
    // carries `buttons: []` for a group the comp draws none of, and the
    // payload that staged it has no `buttons` key at all. Without the
    // empty-array filter inside the slice, those two never agree and the
    // publisher can never pass.
    const sent = {
      slices: [{ slice_type: "partners", variation: "default", primary: { a: "A" } }],
    };
    const delivered = {
      slices: [
        {
          slice_type: "partners",
          variation: "default",
          primary: { a: "A", buttons: [], heading: [], eyebrow: null },
        },
      ],
    };
    expect(contentSignature(delivered)).toBe(contentSignature(sent));
  });

  it("leaves a document with no slices where it was, byte for byte — the 22 live listings", () => {
    expect(contentSignature({ title: "T", size_label: "S", tracts: [] })).toBe(
      '{"slices":[],"keys":["size_label","title"],"scalars":["size_label=S","title=T"]}',
    );
  });

  it("changes when the slices are reordered, or a scalar is edited", () => {
    const flipped = {
      ...home,
      slices: [{ slice_type: "partners", variation: "default", primary: {} }, ...home.slices],
    };
    expect(contentSignature(flipped)).not.toBe(contentSignature(home));
    expect(contentSignature({ ...home, meta_title: "U" })).not.toBe(contentSignature(home));
  });

  // The two sides are a payload and a delivered document. They disagree about
  // an unfilled field unless both are normalised: the API returns every Group
  // the model declares, unfilled ones as [], and a payload omits them.
  it("reads an unfilled field the same whether it is absent or empty", () => {
    expect(contentSignature({ ...home, tracts: [], note: "", extra: null })).toBe(
      contentSignature(home),
    );
  });

  it("says what it cannot see: a word changed inside rich text", () => {
    const edited = { ...home, title: [{ type: "heading1", text: "Somewhere else" }] };
    expect(contentSignature(edited)).toBe(contentSignature(home));
  });
});

describe("notYetLive", () => {
  const staged = { page: { home: { id: "X", signature: contentSignature({ meta_title: "T" }) } } };
  const api = (docs: unknown[]) => async (url: string) =>
    new Response(
      JSON.stringify(
        url.includes("/documents/search")
          ? { results: docs, total_pages: 1 }
          : { refs: [{ isMasterRef: true, ref: "R" }] },
      ),
      { status: 200 },
    );

  it("holds a published document to the content that was staged, not to its uid", async () => {
    await expect(
      notYetLive("r", staged, api([{ uid: "home", id: "X", data: { meta_title: "T" } }])),
    ).resolves.toEqual([]);
    // The defect this replaced: same uid, different content, reported as live.
    await expect(
      notYetLive("r", staged, api([{ uid: "home", id: "X", data: { meta_title: "OLD" } }])),
    ).resolves.toEqual([
      { type: "page", uid: "home", why: "live content differs from what was staged" },
    ]);
  });

  it("refuses to pass a document it cannot check, and names why", async () => {
    await expect(notYetLive("r", staged, api([]))).resolves.toEqual([
      { type: "page", uid: "home", why: "not published" },
    ]);
    const unsigned = { page: { home: { id: "X" } } };
    await expect(
      notYetLive("r", unsigned, api([{ uid: "home", id: "X", data: { meta_title: "T" } }])),
    ).resolves.toEqual([{ type: "page", uid: "home", why: "no signature recorded" }]);
  });
});

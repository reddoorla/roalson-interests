import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error — plain ESM scripts, no declarations
import { assetFilename, toPayload } from "./listings.mjs";
// @ts-expect-error — plain ESM scripts, no declarations
import { notYetLive, stagedByType } from "./publish-release.mjs";
import {
  contentSignature,
  fetchWithRetry,
  publishMigrationRelease,
  readToken,
  repositoryName,
  stageDocument,
  stripEmpty,
  tokenEnvName,
  typeExists,
  // @ts-expect-error — plain ESM scripts, no declarations
} from "./lib.mjs";

type Entry = {
  uid: string;
  data: Record<string, unknown>;
  assets: Record<string, { url: string; bytes?: number; filename?: string; alt?: string }>;
  source: Record<string, string>;
};

const root = process.cwd();
const listings = JSON.parse(
  readFileSync(resolve(root, "scripts/seed/listings.json"), "utf8"),
) as Entry[];
const model = JSON.parse(readFileSync(resolve(root, "customtypes/property/index.json"), "utf8"));

/** Every field of the `property` model, across its tabs. */
const fields: Record<
  string,
  { type: string; config?: { options?: string[]; fields?: Record<string, unknown> } }
> = Object.assign({}, ...Object.values(model.json as Record<string, object>));

describe("the listings data file", () => {
  it("holds the 22 listings of the client's table, under unique short uids", () => {
    expect(listings).toHaveLength(22);
    const uids = listings.map((l) => l.uid);
    expect(new Set(uids).size).toBe(22);
    for (const uid of uids) expect(uid, uid).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const uid of uids) expect(uid.length, uid).toBeLessThanOrEqual(40);
  });

  it("uses only fields the property model declares", () => {
    const unknown = listings.flatMap((l) =>
      Object.keys(l.data)
        .filter((k) => !(k in fields))
        .map((k) => `${l.uid}.${k}`),
    );
    expect(unknown).toEqual([]);
  });

  // The land categories contain U+2014 EM DASH. A hyphen typed in its place is
  // accepted by the Migration API and then matches no section on the page.
  it("every Select value is one of the model's options, byte for byte", () => {
    const wrong: string[] = [];
    for (const l of listings) {
      for (const [key, value] of Object.entries(l.data)) {
        const options = fields[key]?.type === "Select" ? fields[key].config?.options : undefined;
        if (options && !options.includes(value as string))
          wrong.push(`${l.uid}.${key} = ${JSON.stringify(value)}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(listings.filter((l) => String(l.data.category).includes("—")).length).toBe(17);
  });

  it("types every value as the model does", () => {
    const wrong: string[] = [];
    for (const l of listings) {
      for (const [key, value] of Object.entries(l.data)) {
        const type = fields[key]?.type;
        const ok =
          type === "Number"
            ? typeof value === "number" && Number.isFinite(value)
            : type === "Boolean"
              ? typeof value === "boolean"
              : type === "Group"
                ? Array.isArray(value)
                : type === "GeoPoint"
                  ? typeof (value as { latitude?: unknown }).latitude === "number" &&
                    typeof (value as { longitude?: unknown }).longitude === "number"
                  : typeof value === "string" && value !== "";
        if (!ok) wrong.push(`${l.uid}.${key} (${type}) = ${JSON.stringify(value)}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("puts every listing in San Antonio's part of Texas, and says where each field came from", () => {
    for (const l of listings) {
      const { latitude, longitude } = l.data.location as { latitude: number; longitude: number };
      expect(latitude, l.uid).toBeGreaterThan(27);
      expect(latitude, l.uid).toBeLessThan(31);
      expect(longitude, l.uid).toBeGreaterThan(-100);
      expect(longitude, l.uid).toBeLessThan(-97);
      const unsourced = Object.keys(l.data).filter((k) => !l.source[k]);
      expect(unsourced, l.uid).toEqual([]);
    }
  });

  // Superseded on 2026-09-21: this used to require that exactly one listing
  // carried a photo, off the client's Google My Map. Twenty more now come out
  // of the packages themselves — see feature-images.test.ts, which owns the
  // rules about them. What stays here is the invariant this file is for: every
  // listing names a package on the client's own site, and no photo is attached
  // without alt text.
  it("names a package PDF on the client's own site for every listing, and alt text for every photo", () => {
    for (const l of listings)
      expect(l.assets.package_pdf?.url, l.uid).toMatch(
        /^https:\/\/www\.roalson\.com\/props\/.+\.pdf$/i,
      );
    const photos = listings.filter((l) => l.assets.feature_image);
    expect(photos.length).toBe(21);
    for (const l of photos) expect(l.assets.feature_image.alt, l.uid).toBeTruthy();
    // The one that is not lifted out of a package: it came off the client's own
    // Google My Map, so it has a url and `feature-images.mjs` leaves it alone.
    expect(photos.filter((l) => l.assets.feature_image.url).map((l) => l.uid)).toEqual([
      "25331-ih-10-west",
    ]);
  });
});

describe("toPayload", () => {
  const entry = listings.find((l) => l.uid === "25331-ih-10-west")!;

  it("sends the whole document, with no empty values for Prismic to reject", () => {
    const payload = toPayload({
      ...entry,
      data: { ...entry.data, zoning: "", tracts: [], meta_image: {} },
    });
    expect(payload).toMatchObject({
      type: "property",
      uid: "25331-ih-10-west",
      title: "25331 IH 10 West",
    });
    expect(payload.data).not.toHaveProperty("zoning");
    expect(payload.data).not.toHaveProperty("meta_image");
    expect(payload.data.is_new).toBe(false);
    expect(payload.data.highlights).toHaveLength(5);
  });

  it("attaches uploaded assets in the shapes the Migration API takes", () => {
    const payload = toPayload(entry, {
      "25331-ih-10-west:package_pdf": "pdf1",
      "25331-ih-10-west:feature_image": "img1",
    });
    expect(payload.data.package_pdf).toEqual({ link_type: "Media", id: "pdf1" });
    expect(payload.data.feature_image).toEqual({ id: "img1" });
    expect(toPayload(entry).data).not.toHaveProperty("package_pdf");
  });

  it("names assets by listing, so a re-run finds them again", () => {
    expect(
      assetFilename("x", "package_pdf", { url: "https://www.roalson.com/props/A%20B/A%20B.pdf" }),
    ).toBe("x-package.pdf");
    expect(
      assetFilename("x", "feature_image", { url: "https://h/i?fife=s1", filename: "x.jpg" }),
    ).toBe("x.jpg");
  });
});

describe("seed lib", () => {
  it("drops null, empty strings and empty objects, and keeps false and 0", () => {
    expect(
      stripEmpty({ a: "", b: null, c: {}, d: { e: {} }, f: false, g: 0, h: [{ t: "x" }, {}] }),
    ).toEqual({
      f: false,
      g: 0,
      h: [{ t: "x" }],
    });
  });

  it("targets the repository the models CLI targets: the sentinel is skipped, never used", () => {
    const dir = mkdtempSync(join(tmpdir(), "seed-"));
    writeFileSync(
      join(dir, "slicemachine.config.json"),
      JSON.stringify({ repositoryName: "your-prismic-repo-name" }),
    );
    expect(() => repositoryName(dir)).toThrow(/no real Prismic repository/);
    writeFileSync(
      join(dir, "prismic.config.json"),
      JSON.stringify({ repositoryName: "roalson-interests" }),
    );
    expect(repositoryName(dir)).toBe("roalson-interests");
    writeFileSync(
      join(dir, "slicemachine.config.json"),
      JSON.stringify({ repositoryName: "the-real-one" }),
    );
    expect(repositoryName(dir)).toBe("the-real-one");
  });

  it("derives the per-repository token name as the fleet does, and refuses without one", () => {
    expect(tokenEnvName("roalson-interests")).toBe("PRISMIC_TOKEN_ROALSON_INTERESTS");
    expect(readToken("r", { PRISMIC_WRITE_TOKEN: "a" }, "/nonexistent")).toBe("a");
    expect(readToken("r-x", { PRISMIC_TOKEN_R_X: "b" }, "/nonexistent")).toBe("b");
    expect(() => readToken("r", {}, "/nonexistent")).toThrow(/no write token/);
    const dir = mkdtempSync(join(tmpdir(), "cred-"));
    writeFileSync(join(dir, "c.env"), 'OTHER=1\nexport PRISMIC_TOKEN_R="from-file"\n');
    expect(readToken("r", {}, join(dir, "c.env"))).toBe("from-file");
  });

  it("asks the Custom Types API whether a type exists, and refuses to guess from anything but 200 or 404", async () => {
    const headers = { auth: { repository: "r" }, json: {} };
    const answer = (status: number) =>
      vi.fn(async () => ({ status, ok: status < 400, text: async () => "nope" }));
    const yes = answer(200);
    expect(await typeExists("property", headers, yes)).toBe(true);
    expect(yes.mock.calls[0][0]).toBe("https://customtypes.prismic.io/customtypes/property");
    expect(await typeExists("property", headers, answer(404))).toBe(false);
    await expect(typeExists("property", headers, answer(403))).rejects.toThrow(
      /read custom type property: 403/,
    );
  });

  it("backs off on 429 and gives up with the last answer", async () => {
    const wait = vi.fn(async () => {});
    const answers = [{ status: 429 }, { status: 429 }, { status: 200 }];
    const fetchImpl = vi.fn(async () => answers.shift());
    expect((await fetchWithRetry("u", {}, { fetchImpl, wait })).status).toBe(200);
    expect(wait.mock.calls.map((c) => c[0])).toEqual([1500, 3000]);
  });

  it("creates on 201, replaces when an id is known, and STOPS on 'already exists' with no id", async () => {
    const headers = { auth: {}, json: {} };
    const ok = vi.fn(async () => ({ status: 201, ok: true, json: async () => ({ id: "new1" }) }));
    expect(
      await stageDocument({
        type: "property",
        uid: "a",
        title: "A",
        data: {},
        headers,
        fetchImpl: ok,
      }),
    ).toEqual({
      id: "new1",
      created: true,
    });
    expect(ok.mock.calls[0][1].method).toBe("POST");

    const put = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({}) }));
    await stageDocument({
      id: "known",
      type: "property",
      uid: "a",
      title: "A",
      data: {},
      headers,
      fetchImpl: put,
    });
    expect(put.mock.calls[0][0]).toBe("https://migration.prismic.io/documents/known");
    expect(put.mock.calls[0][1].method).toBe("PUT");

    const exists = vi.fn(async () => ({
      status: 400,
      ok: false,
      text: async () => "A document with this UID already exists",
    }));
    await expect(
      stageDocument({
        type: "property",
        uid: "a",
        title: "A",
        data: {},
        headers,
        fetchImpl: exists,
      }),
    ).rejects.toThrow(/no id is stored/);
    expect(exists).toHaveBeenCalledTimes(1);
  });
});

describe("publishing the migration release", () => {
  it("succeeds on 202 only, and says how many items are releasing", async () => {
    const headers = { auth: {}, json: { repository: "r" } };
    const ok = vi.fn(async () => ({
      status: 202,
      ok: true,
      json: async () => ({ totalItems: 23 }),
    }));
    expect(await publishMigrationRelease(headers, ok)).toEqual({ totalItems: 23 });
    expect(ok.mock.calls[0][0]).toBe("https://migration.prismic.io/migration-release/publish");
    expect(ok.mock.calls[0][1]).toMatchObject({ method: "POST", body: "{}" });

    const no = vi.fn(async () => ({ status: 200, ok: true, text: async () => "unexpected" }));
    await expect(publishMigrationRelease(headers, no)).rejects.toThrow(
      /publish the migration release: 200/,
    );
  });

  it("reads what was staged from the state files, by type — the whole record, not just the uid", () => {
    const dir = mkdtempSync(join(tmpdir(), "staged-"));
    const documents = { a: { id: "1", signature: "SIG-A" }, b: { id: "2" } };
    writeFileSync(join(dir, "listings.state.json"), JSON.stringify({ documents, assets: {} }));
    writeFileSync(join(dir, "unrelated.json"), "{}");
    expect(stagedByType(dir)).toEqual({ property: documents });
  });

  // This test used to read "the pass is the public API listing every staged
  // uid — not the 202", and that was the defect, not the contract: a re-staged
  // document keeps its uid, so on 2026-09-21 a three-band `home` was staged and
  // the publisher reported it live while the one-band version stayed on the
  // site. The pass is the live CONTENT matching what was staged.
  it("the pass is the live content matching what was staged — not the 202, and not the uid", async () => {
    const api = (data: unknown) =>
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          String(url).endsWith("/api/v2")
            ? { refs: [{ isMasterRef: true, ref: "m" }] }
            : { results: [{ uid: "a", id: "1", data }], total_pages: 1 },
      }));
    const staged = {
      property: {
        a: { id: "1", signature: contentSignature({ title: "A", price: 8.5 }) },
        b: { id: "2", signature: "anything" },
      },
    };
    expect(await notYetLive("r", staged, api({ title: "A", price: 8.5 }))).toEqual([
      { type: "property", uid: "b", why: "not published" },
    ]);
    // Same uid, same id, one number edited: caught.
    expect(await notYetLive("r", staged, api({ title: "A", price: 9 }))).toContainEqual({
      type: "property",
      uid: "a",
      why: "live content differs from what was staged",
    });
  });
});

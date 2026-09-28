// pages.mjs's relationship preflight, `refsLive`. Until #174 it lived inline in
// main(), and removing its `$person` half left every test green: nothing ran
// it. A partner row whose PROFILE names an unpublished Person would then stage
// as an id Prismic cannot resolve, and the card would lose its PROFILE link.
import { describe, expect, it } from "vitest";

import { refsLive } from "./pages.mjs";

/** The public API's search, answering with `live[type]` as `{ uid: id }`. */
const api =
  (live: Record<string, Record<string, string>>): typeof fetch =>
  async (input) => {
    const type = /document\.type,"(\w+)"/.exec(decodeURIComponent(String(input)))?.[1] ?? "";
    const results = Object.entries(live[type] ?? {}).map(([uid, id]) => ({ uid, id }));
    return new Response(JSON.stringify({ results, total_pages: 1 }), { status: 200 });
  };

const home = {
  uid: "home",
  data: {
    slices: [
      { primary: { listings: [{ listing: { $property: "scenic-loop" } }] } },
      { primary: { partners: [{ profile: { $person: "matt-howard" } }] } },
    ],
  },
};
const listingIds = { "scenic-loop": "L1" };
const personIds = { "matt-howard": "P1" };

describe("refsLive", () => {
  it("passes when every listing and person is live under the id the state holds", async () => {
    const live = { property: { "scenic-loop": "L1" }, person: { "matt-howard": "P1" } };
    await expect(
      refsLive("r", "R", [home], listingIds, personIds, api(live)),
    ).resolves.toBeUndefined();
  });

  it("refuses a person that is not published", async () => {
    const live = { property: { "scenic-loop": "L1" }, person: {} };
    await expect(refsLive("r", "R", [home], listingIds, personIds, api(live))).rejects.toThrow(
      /these people are not live .*: matt-howard/,
    );
  });

  it("refuses a person published under a different id than the state holds", async () => {
    const live = { property: { "scenic-loop": "L1" }, person: { "matt-howard": "P2" } };
    await expect(refsLive("r", "R", [home], listingIds, personIds, api(live))).rejects.toThrow(
      /these people are not live .*: matt-howard/,
    );
  });

  it("refuses a listing that is not published", async () => {
    const live = { property: {}, person: { "matt-howard": "P1" } };
    await expect(refsLive("r", "R", [home], listingIds, personIds, api(live))).rejects.toThrow(
      /these listings are not live .*: scenic-loop/,
    );
  });
});

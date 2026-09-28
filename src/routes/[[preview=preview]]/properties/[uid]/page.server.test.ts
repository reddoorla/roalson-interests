import { describe, expect, it, vi } from "vitest";

import { propertyFixture } from "$lib/property-fixture";

// The build prerenders exactly what entries() names. The mock mirrors the
// sitemap test's: a wired repository whose listings are the fixtures below.
vi.mock("$lib/prismicio", () => ({
  isPlaceholderRepo: false,
  createClient: () => ({
    getAllByType: async () => [
      propertyFixture({}, { uid: "listed" }),
      propertyFixture({ status: "Sold" }, { uid: "sold" }),
      propertyFixture({ listing_state: "Past project" }, { uid: "marked-past" }),
      propertyFixture({ listing_state: "Archived" }, { uid: "archived" }),
    ],
  }),
}));

const { entries } = await import("./+page.server");

describe("properties/[uid] entries()", () => {
  it("prerenders past projects but not archived listings", async () => {
    expect(await entries()).toEqual([{ uid: "listed" }, { uid: "sold" }, { uid: "marked-past" }]);
  });
});

import { describe, expect, it } from "vitest";
import { RepositoryNotFoundError } from "@prismicio/client";

import { propertyListingFixture } from "./property-fixture";
import { emptyListing, loadPropertyListing, type ListingClient } from "./property-listing-load";

describe("loadPropertyListing", () => {
  it("asks for every property and returns the page's sections with its head payload", async () => {
    const asked: string[] = [];
    const client = {
      getAllByType: async (type: string) => {
        asked.push(type);
        return propertyListingFixture();
      },
    } as unknown as ListingClient;
    const data = await loadPropertyListing(client);
    expect(asked).toEqual(["property"]);
    expect(data.title).toBe("Our Properties");
    expect(data.meta_description).toMatch(/San Antonio/);
    expect(data.sections.map((s) => s.id)).toEqual(["land", "improved", "sold"]);
  });

  it("rethrows a Prismic failure instead of serving an empty listing", async () => {
    const wrongRepo = new RepositoryNotFoundError("Repository not found", "https://x", undefined);
    const client = {
      getAllByType: async () => Promise.reject(wrongRepo),
    } as unknown as ListingClient;
    await expect(loadPropertyListing(client)).rejects.toBe(wrongRepo);
  });

  it("describes an empty listing the same way, so the starter renders before Prismic exists", () => {
    expect(emptyListing()).toEqual({
      sections: [],
      title: "Our Properties",
      meta_description: expect.stringMatching(/Roalson/),
    });
  });
});

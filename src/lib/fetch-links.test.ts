import { describe, expect, it } from "vitest";

import { fetchLinksOf, PAGE_FETCH_LINKS } from "./fetch-links";

describe("PAGE_FETCH_LINKS", () => {
  it("asks for every field the slice models embed — the featured picks' AND the partners' Persons", () => {
    // Both lists, because `fetchLinks` replaces a model's own list: with the
    // person fields alone, the live featured picks came back with `data: {}`.
    expect(PAGE_FETCH_LINKS).toEqual([
      "person.email",
      "person.name",
      "person.photo",
      "person.role",
      "property.feature_image",
      "property.highlights",
      "property.listing_state",
      "property.location",
      "property.size_label",
      "property.status",
      "property.title",
    ]);
  });
});

describe("fetchLinksOf", () => {
  it("reads Link fields in primary, items and groups, and asks for a nested group whole", () => {
    const link = (customtypes: unknown[]) => ({ type: "Link", config: { customtypes } });
    const models = [
      {
        variations: [
          {
            primary: {
              one: link([{ id: "a", fields: ["x", { id: "g", fields: ["y"] }] }]),
              rows: {
                type: "Group",
                config: { fields: { two: link([{ id: "b", fields: ["z"] }]) } },
              },
              bare: link(["c"]),
              text: { type: "Text" },
            },
            items: { three: link([{ id: "a", fields: ["x", "w"] }]) },
          },
        ],
      },
      {},
    ];
    expect(fetchLinksOf(models)).toEqual(["a.g", "a.w", "a.x", "b.z"]);
  });
});

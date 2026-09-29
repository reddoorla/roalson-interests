import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { featuredLaunchFixture, featuredPropertiesFixture } from "./home-fixture";

// #76. The fixture restates listing copy whose first copy is the seed file,
// and the two were edited by different batches: `accesssibility` sat in the
// seed, spelled right here, for as long as both existed. The seed is the copy
// that reaches Prismic, so the fixture follows it.
type Listing = {
  uid: string;
  data: { title: string; size_label?: string; highlights?: { text: string }[] };
};
const seed = new Map(
  (
    JSON.parse(
      readFileSync(resolve(process.cwd(), "scripts/seed/listings.json"), "utf8"),
    ) as Listing[]
  ).map((l) => [l.uid, l.data]),
);

type Pick = {
  property: {
    uid: string;
    data: { title: string; size_label: string | null; highlights: { text: string }[] };
  };
};
const picks = (slice: { primary: { properties: unknown } }) =>
  (slice.primary.properties as Pick[]).map((p) => p.property);

describe("home-fixture's featured listings are the seed's, word for word", () => {
  it.each([
    ["the comp's band", featuredPropertiesFixture()],
    ["launch day", featuredLaunchFixture()],
  ])("%s: title, size and highlights", (_state, slice) => {
    const properties = picks(slice);
    expect(properties).toHaveLength(3);
    for (const { uid, data } of properties) {
      const listing = seed.get(uid);
      expect(listing, uid).toBeDefined();
      expect(data.title, uid).toBe(listing!.title);
      expect(data.size_label, uid).toBe(listing!.size_label);
      // A slide may carry fewer bullets than its listing (the comp draws two),
      // never other words, and never in another order.
      const texts = data.highlights.map((h) => h.text);
      const seeded = (listing!.highlights ?? []).map((h) => h.text);
      expect(texts, uid).toEqual(seeded.filter((t) => texts.includes(t)));
      expect(texts.length, uid).toBeGreaterThan(0);
    }
  });

  it("launch day's photographed listing carries every bullet its document has", () => {
    const [first] = picks(featuredLaunchFixture());
    expect(first.data.highlights).toEqual(seed.get(first.uid)!.highlights);
  });
});

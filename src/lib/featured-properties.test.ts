import { describe, expect, it } from "vitest";

import { featuredListings } from "./featured-properties";
import { featuredPickFixture, featuredPropertiesFixture } from "./home-fixture";

// Which of an editor's picks reach the homepage's featured band, and — the part
// that matters most — WHY a pick did not. Every drop below is a way the band
// can end up empty on a live page, and the counts are how that is told apart
// from "the API never embedded the fields" without a debugger.

const PHOTO = {
  url: "https://images.prismic.io/roalson-interests/a.jpg?auto=format,compress",
  alt: "The building from the access road",
  dimensions: { width: 1856, height: 1084 },
  copyright: null,
  id: "img",
  edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
} as never;

const pick = (uid: string, data: Record<string, unknown> = {}, relationship = {}) =>
  featuredPickFixture(
    uid,
    `id-${uid}`,
    { title: uid, feature_image: PHOTO, ...data } as never,
    relationship,
  );

describe("featuredListings", () => {
  it("keeps the editor's order and hands the slide exactly what it draws", () => {
    const { slides, picked, unembedded } = featuredListings(
      featuredPropertiesFixture().primary.properties,
    );
    expect(slides.map((s) => s.title)).toEqual([
      "25331 IH 10 West",
      "101 W. Commerce Street",
      "13810 Lookout Road",
    ]);
    expect(slides.map((s) => s.href)).toEqual([
      "/properties/25331-ih-10-west",
      "/properties/101-w-commerce-street",
      "/properties/13810-lookout-road",
    ]);
    expect(slides[0].sizeLabel).toBe("Up to 16,700 SF");
    expect(slides[0].highlights).toEqual([
      "New Ownership and Property Management!",
      "Great visibility and excellent location in the far NW submarket",
    ]);
    expect(slides[0].id).toBe("arFgoxIAAC4ALcBx");
    expect(slides[0].image.url).toMatch(/^data:image\/svg\+xml,/);
    expect({ picked, unembedded }).toEqual({ picked: 3, unembedded: 0 });
  });

  it("trims what an editor typed, and drops blank highlight lines", () => {
    const { slides } = featuredListings([
      pick("a", {
        title: "  12 Main Street ",
        size_label: " 4,000 SF  ",
        highlights: [{ text: " Corner lot " }, { text: "   " }, { text: null }],
      }),
    ]);
    expect(slides[0]).toMatchObject({
      title: "12 Main Street",
      sizeLabel: "4,000 SF",
      highlights: ["Corner lot"],
    });
  });

  it("drops a listing with no feature image — a slide 542px shorter than its neighbours", () => {
    const { slides, picked } = featuredListings([
      pick("with-photo"),
      pick("no-photo", { feature_image: {} }),
    ]);
    expect(slides.map((s) => s.title)).toEqual(["with-photo"]);
    // Still COUNTED as picked: the editor chose it, the band declined it.
    expect(picked).toBe(2);
  });

  it("drops a Sold listing, and keeps one that is Under Contract", () => {
    const { slides } = featuredListings([
      pick("sold", { status: "Sold" }),
      pick("pending", { status: "Under Contract" }),
      pick("unset", { status: null }),
    ]);
    expect(slides.map((s) => s.title)).toEqual(["pending", "unset"]);
  });

  it("drops an empty row, a broken relationship, a title-less listing and a duplicate", () => {
    const empty = { property: { link_type: "Document" } } as never;
    const { slides, picked, unembedded } = featuredListings([
      empty,
      pick("gone", {}, { isBroken: true }),
      pick("untitled", { title: "   " }),
      pick("kept"),
      pick("kept"),
    ]);
    expect(slides.map((s) => s.title)).toEqual(["kept"]);
    // The empty row is not a pick; the other four are.
    expect(picked).toBe(4);
    expect(unembedded).toBe(0);
  });

  it("counts a pick that arrived with NO data separately — that is the API, not the editor", () => {
    // What the Content API sends if it does not embed the model's picked
    // fields: a filled, unbroken relationship with no `data` key at all.
    const { slides, picked, unembedded } = featuredListings([
      pick("bare-1", {}, { data: undefined }),
      pick("bare-2", {}, { data: undefined }),
      pick("embedded"),
    ]);
    expect(slides.map((s) => s.title)).toEqual(["embedded"]);
    expect({ picked, unembedded }).toEqual({ picked: 3, unembedded: 2 });
  });

  it("survives an embed that carries no highlights group at all", () => {
    const { slides } = featuredListings([pick("a", { highlights: undefined })]);
    expect(slides[0].highlights).toEqual([]);
  });

  it("is empty, not an error, for a slice whose group never arrived", () => {
    const nothing = { slides: [], picked: 0, unembedded: 0 };
    expect(featuredListings(undefined)).toEqual(nothing);
    expect(featuredListings(null)).toEqual(nothing);
    expect(featuredListings([])).toEqual(nothing);
  });
});

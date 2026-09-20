import { describe, expect, it } from "vitest";

import { PROPERTY_CATEGORIES } from "./property";
import { propertyFixture, propertyListingFixture } from "./property-fixture";
import { groupListings, LISTING_SECTIONS, listingOrder } from "./property-listing";

const titles = (section: { properties: { data: { title: string | null } }[] } | undefined) =>
  section?.properties.map((p) => p.data.title) ?? [];

describe("LISTING_SECTIONS", () => {
  it("claims every category in the model exactly once, so a new option cannot go stray unnoticed", () => {
    const claimed = LISTING_SECTIONS.flatMap((s) => s.categories);
    expect([...claimed].sort()).toEqual([...PROPERTY_CATEGORIES].sort());
  });
});

describe("groupListings", () => {
  it("draws Land, then Improved Projects, then Sold — the comp's order at every width", () => {
    const sections = groupListings(propertyListingFixture());
    expect(sections.map((s) => s.label)).toEqual(["Land", "Improved Projects", "Sold"]);
    expect(sections.map((s) => s.sold)).toEqual([false, false, true]);
  });

  it("holds both land categories in the one Land section", () => {
    const [land] = groupListings(propertyListingFixture());
    expect(land.properties.map((p) => p.data.category)).toEqual([
      "Land — SA Metro & Surrounding",
      "Land — SA Metro & Surrounding",
      "Land — Out of San Antonio",
      "Land — Out of San Antonio",
    ]);
  });

  it("moves a sold listing to Sold whatever its category, and leaves its section", () => {
    const sections = groupListings(propertyListingFixture());
    const sold = sections.find((s) => s.sold);
    expect(titles(sold)).toEqual(["5001 Walzem Road", "Culebra Road tract"]);
    for (const section of sections.filter((s) => !s.sold)) {
      expect(section.properties.every((p) => p.data.status !== "Sold")).toBe(true);
    }
  });

  it("sorts by order, lowest first, with an empty order last, then by title", () => {
    const [land] = groupListings(propertyListingFixture());
    expect(titles(land)).toEqual([
      "FM 1560 & Galm Road",
      "Potranco Road tract",
      "Hwy 90 West, Castroville",
      "IH-35, New Braunfels",
    ]);
    expect(land.properties.map((p) => p.data.order)).toEqual([1, 2, 3, null]);
  });

  it("breaks an order tie by title, so the listing never reshuffles between builds", () => {
    const b = propertyFixture({ title: "B Street", order: 1 }, { id: "b", uid: "b" });
    const a = propertyFixture({ title: "A Street", order: 1 }, { id: "a", uid: "a" });
    expect([b, a].sort(listingOrder).map((p) => p.data.title)).toEqual(["A Street", "B Street"]);
  });

  it("keeps an active listing with no category visible, at the end of the last active section", () => {
    const stray = propertyFixture(
      { title: "Uncategorised", category: null as never, order: 1 },
      { id: "stray", uid: "stray" },
    );
    const sections = groupListings([...propertyListingFixture(), stray]);
    const improved = sections.find((s) => s.id === "improved");
    expect(titles(improved).at(-1)).toBe("Uncategorised");
    expect(sections.flatMap((s) => s.properties)).toHaveLength(propertyListingFixture().length + 1);
  });

  it("leaves out a section with nothing in it", () => {
    const onlyImproved = propertyListingFixture().filter(
      (p) => p.data.category === "Improved" && p.data.status !== "Sold",
    );
    expect(groupListings(onlyImproved).map((s) => s.id)).toEqual(["improved"]);
    expect(groupListings([])).toEqual([]);
  });
});

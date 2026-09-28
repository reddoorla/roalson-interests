import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isArchived, isListed, PROPERTY_CATEGORIES } from "./property";
import { propertyFixture, propertyListingFixture } from "./property-fixture";
import {
  groupListings,
  LISTING_SECTIONS,
  LISTING_VIEWS,
  listingOrder,
  listingViews,
  viewFromHash,
} from "./property-listing";
import { sectionPoints } from "./property-map";

const titles = (section: { properties: { data: { title: string | null } }[] } | undefined) =>
  section?.properties.map((p) => p.data.title) ?? [];

describe("LISTING_SECTIONS", () => {
  it("claims every category in the model exactly once, so a new option cannot go stray unnoticed", () => {
    const claimed = LISTING_SECTIONS.flatMap((s) => s.categories);
    expect([...claimed].sort()).toEqual([...PROPERTY_CATEGORIES].sort());
  });
});

describe("groupListings", () => {
  it("draws Land, then Improved Projects, then Past Projects — the comp's order at every width", () => {
    const sections = groupListings(propertyListingFixture());
    expect(sections.map((s) => s.label)).toEqual(["Land", "Improved Projects", "Past Projects"]);
    expect(sections.map((s) => s.past)).toEqual([false, false, true]);
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

  it("moves a sold or marked past project to Past Projects whatever its category", () => {
    const sections = groupListings(propertyListingFixture());
    const past = sections.find((s) => s.past);
    // Walzem and Culebra are Sold; 1604 & Bandera is Available but marked.
    expect(titles(past)).toEqual(["5001 Walzem Road", "Culebra Road tract", "1604 & Bandera Road"]);
    for (const section of sections.filter((s) => !s.past)) {
      expect(section.properties.every(isListed)).toBe(true);
    }
  });

  it("puts an archived listing in no section and on no map", () => {
    const fixture = propertyListingFixture();
    expect(fixture.some(isArchived)).toBe(true);
    const sections = groupListings(fixture);
    const shown = sections.flatMap((s) => s.properties);
    expect(shown.some(isArchived)).toBe(false);
    const [land] = sections;
    expect(sectionPoints(land.properties)).toHaveLength(4);
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
    expect(sections.flatMap((s) => s.properties)).toHaveLength(
      propertyListingFixture().filter((p) => !isArchived(p)).length + 1,
    );
  });

  it("leaves out a section with nothing in it", () => {
    const onlyImproved = propertyListingFixture().filter(
      (p) => p.data.category === "Improved" && isListed(p),
    );
    expect(groupListings(onlyImproved).map((s) => s.id)).toEqual(["improved"]);
    expect(groupListings([])).toEqual([]);
  });
});

describe("the view tabs", () => {
  it("offers Land, Improved Projects, All — in that order", () => {
    const views = listingViews(groupListings(propertyListingFixture()));
    expect(views.map((v) => v.id)).toEqual(["land", "improved", "all"]);
    expect(views.map((v) => v.label)).toEqual(["Land", "Improved Projects", "All"]);
  });

  it("offers none with fewer than two active sections — Past Projects is not a view", () => {
    const improvedAndPast = propertyListingFixture().filter(
      (p) => p.data.category === "Improved" && !isArchived(p),
    );
    expect(groupListings(improvedAndPast).map((s) => s.id)).toEqual(["improved", "past"]);
    expect(listingViews(groupListings(improvedAndPast))).toEqual([]);
  });

  it("reads the view from a fragment, and keeps the current one for any other fragment", () => {
    expect(viewFromHash("#land")).toBe("land");
    expect(viewFromHash("#improved")).toBe("improved");
    expect(viewFromHash("#all")).toBe("all");
    expect(viewFromHash("")).toBe("all");
    expect(viewFromHash("#main-content")).toBeNull();
    expect(viewFromHash("#listing-land")).toBeNull();
  });

  // The filter is CSS, keyed by view id in both forms (hydrated and :target).
  // Renaming a view here, or dropping a rule there, is caught at this line.
  it("has a hide rule and a selected rule in app.css for every view", () => {
    const css = readFileSync(join(import.meta.dirname, "../app.css"), "utf8").replace(/\s+/g, " ");
    for (const { id } of LISTING_VIEWS) {
      const selected = `[data-view-tab="${id}"]`;
      expect(css, `selected: ${id}`).toContain(selected);
      if (id === "all") continue;
      expect(css, `hydrated hide: ${id}`).toContain(
        `[data-view="${id}"], :not([data-view]):has(#${id}:target)) section[data-view-section]:not([data-view-section="${id}"])`,
      );
    }
  });
});

import { cleanup, render, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import PropertyListing from "./PropertyListing.svelte";
import { propertyListingFixture } from "$lib/property-fixture";
import { groupListings } from "$lib/property-listing";

afterEach(cleanup);

// Eight cards of accessible-name computation under jsdom: the first test in
// this file carried the cold-start cost past the 5s default and failed on
// time, not on an assertion.
vi.setConfig({ testTimeout: 20_000 });

const sections = () => groupListings(propertyListingFixture());

describe("PropertyListing", () => {
  it("renders one labelled region per section, headed by an h2 the region is named after", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const regions = getAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-labelledby"))).toEqual([
      "listing-land",
      "listing-improved",
      "listing-sold",
    ]);
    const h2s = getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(["Land", "Improved Projects", "Sold"]);
    h2s.forEach((h, i) => expect(h.id).toBe(regions[i].getAttribute("aria-labelledby")));
  });

  it("features only the first card of each active section, and none in Sold", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    for (const region of getAllByRole("region")) {
      const cards = [...region.querySelectorAll("article")];
      const garnet = cards.map((c) => /\bbg-primary\b/.test(c.className));
      const sold = region.getAttribute("aria-labelledby") === "listing-sold";
      expect(garnet).toEqual(cards.map((_, i) => i === 0 && !sold));
    }
  });

  it("gives the flat cards the light token their section's ground does not use", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, sold] = getAllByRole("region");
    const flat = (region: HTMLElement) =>
      [...region.querySelectorAll("article")].filter((c) => !/\bbg-primary\b/.test(c.className));
    expect(flat(land).every((c) => /\bbg-light\b/.test(c.className))).toBe(true);
    expect(flat(improved).every((c) => /\bbg-background\b/.test(c.className))).toBe(true);
    expect(flat(sold).every((c) => /\bbg-background\b/.test(c.className))).toBe(true);
    expect(flat(land).length + flat(improved).length + flat(sold).length).toBe(6);
  });

  it("links every active listing and none of the sold ones", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, sold] = getAllByRole("region");
    // The map's own list is in the section too, one Google Maps link per pin
    // (#13) — the no-JS state PropertyMap server-renders. Excluded here so
    // this stays a statement about the CARDS: it used to read 4 and 2 by
    // counting everything, and would now read 8 and 4 for a reason that has
    // nothing to do with which listing got a link.
    const cards = (el: HTMLElement) =>
      within(el)
        .getAllByRole("link")
        .filter((a) => !a.hasAttribute("data-map-link"));
    expect(cards(land!)).toHaveLength(4);
    expect(cards(improved!)).toHaveLength(2);
    // Sold has no map either, so this stays an unqualified none.
    expect(within(sold!).queryAllByRole("link")).toEqual([]);
  });

  it("pins every divider but the first, on large screens only, and never the first", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const dividers = getAllByRole("heading", { level: 2 }).map(
      (h) => h.closest("section")!.firstElementChild as HTMLElement,
    );
    expect(dividers.map((d) => /\blg:sticky\b/.test(d.className))).toEqual([false, true, true]);
    expect(dividers.every((d) => !/(^|\s)sticky\b/.test(d.className))).toBe(true);
  });

  it("warms the ground once, at the second section: the first stays on the page ground", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const regions = getAllByRole("region");
    expect(regions.map((r) => /\bbg-light\b/.test(r.className))).toEqual([false, true, true]);
    const strips = regions.map((r) => r.firstElementChild!.firstElementChild as HTMLElement);
    expect(strips.map((s) => /from-background to-light/.test(s.className))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("lays the Sold section out as a grid and the active ones as a column beside the map", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, , sold] = getAllByRole("region");
    expect(sold!.querySelector("ul")!.className).toMatch(/\blg:grid-cols-3\b/);
    // `:not([data-map-list])`: the map is FIRST in the grid, so its own list
    // of Google Maps links is the first <ul> in the section now. Reading
    // `querySelector("ul")` measured that one and said the cards had lost
    // their column.
    const cards = land!.querySelector<HTMLElement>("ul:not([data-map-list])")!;
    expect(cards.className).toMatch(/\blg:col-start-2\b/);
    expect(cards.parentElement!.className).toMatch(/lg:grid-cols-\[397fr_847fr\]/);
  });

  it("puts a map in column 1 of every active section and none in Sold (#13)", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, sold] = getAllByRole("region");
    for (const [name, section, pins] of [
      ["land", land!, 4],
      ["improved", improved!, 2],
    ] as const) {
      const map = section.querySelector<HTMLElement>("[data-property-map]");
      expect(map, `${name} has a map`).not.toBeNull();
      expect(map!.className, `${name}: the comp's 200 / 595, never stretched`).toMatch(
        /\bh-50\b.*\blg:h-\[595px\]/,
      );
      expect(map!.className, `${name}: column 1, row 1`).toMatch(/lg:col-start-1/);
      expect(map!.querySelectorAll("[data-map-link]"), `${name}: one link per pin`).toHaveLength(
        pins,
      );
      // It is FIRST, so the comp's 390 order (map, then cards) needs no CSS.
      expect(
        map!.compareDocumentPosition(section.querySelector("article")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `${name}: the map precedes the first card`,
      ).toBeTruthy();
    }
    expect(sold!.querySelector("[data-property-map]"), "Sold gets no map").toBeNull();
  });

  it("says so, rather than rendering nothing, when there are no listings", () => {
    const { getByText, queryAllByRole } = render(PropertyListing, { props: { sections: [] } });
    expect(getByText(/No properties are listed/)).not.toBeNull();
    expect(queryAllByRole("region")).toEqual([]);
  });
});

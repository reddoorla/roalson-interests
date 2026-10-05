import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  LISTING_STATES,
  PROPERTY_CATEGORIES,
  PROPERTY_STATUSES,
  isArchived,
  isListed,
  isPastProject,
  mapsUrl,
  propertyFacts,
  propertyHighlights,
  propertyPackage,
  propertyTracts,
  statusLabel,
} from "./property";
import { propertyFixture } from "./property-fixture";

const model = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../customtypes/property/index.json"), "utf8"),
);

describe("the property vocabulary", () => {
  // Prismic returns a Select's option STRING. If an editor-facing label is
  // reworded in the model and not here, every comparison silently stops
  // matching — a sold listing would stop being noindexed, with no error.
  it("matches the model's category options exactly", () => {
    expect(model.json.Main.category.config.options).toEqual([...PROPERTY_CATEGORIES]);
  });

  it("matches the model's status options — the listing's and each tract's", () => {
    expect(model.json.Main.status.config.options).toEqual([...PROPERTY_STATUSES]);
    expect(model.json.Details.tracts.config.fields.tract_status.config.options).toEqual([
      ...PROPERTY_STATUSES,
    ]);
  });

  it("matches the model's listing_state options, with no default", () => {
    expect(model.json.Main.listing_state.config.options).toEqual([...LISTING_STATES]);
    // A default would type the field as always filled while the 22 documents
    // that predate it come back null.
    expect(model.json.Main.listing_state.config.default_value).toBeUndefined();
  });
});

describe("listing state", () => {
  const state = (p: ReturnType<typeof propertyFixture>) =>
    isArchived(p) ? "archived" : isPastProject(p) ? "past" : isListed(p) ? "listed" : "none";

  it("reads an empty state and Listed as listed, whatever the status but Sold", () => {
    expect(state(propertyFixture({ listing_state: null }))).toBe("listed");
    expect(state(propertyFixture({ listing_state: "Listed" }))).toBe("listed");
    expect(state(propertyFixture({ status: "Under Contract" }))).toBe("listed");
  });

  it("makes a Sold listing a past project without it being marked", () => {
    expect(state(propertyFixture({ status: "Sold" }))).toBe("past");
    expect(state(propertyFixture({ status: "Sold", listing_state: "Listed" }))).toBe("past");
    expect(state(propertyFixture({ listing_state: "Past project" }))).toBe("past");
  });

  it("lets Archived win over everything, Sold included", () => {
    expect(state(propertyFixture({ listing_state: "Archived" }))).toBe("archived");
    const soldArchived = propertyFixture({ status: "Sold", listing_state: "Archived" });
    expect(isPastProject(soldArchived)).toBe(false);
    expect(isListed(soldArchived)).toBe(false);
  });
});

describe("status", () => {
  it("labels Under Contract and Sold, and leaves Available unmarked", () => {
    expect(statusLabel(propertyFixture({ status: "Sold" }))).toBe("Sold");
    expect(statusLabel(propertyFixture({ status: "Under Contract" }))).toBe("Under Contract");
    expect(statusLabel(propertyFixture({ status: "Available" }))).toBeNull();
  });
});

describe("propertyHighlights", () => {
  it("drops blank lines an editor left behind", () => {
    const p = propertyFixture({
      highlights: [{ text: "Corner lot" }, { text: "  " }, { text: null }],
    });
    expect(propertyHighlights(p)).toEqual(["Corner lot"]);
  });
});

describe("propertyFacts", () => {
  it("lists only filled fields, formatted, in reading order", () => {
    expect(propertyFacts(propertyFixture())).toEqual([
      { label: "Offered for", value: "Sale or Lease" },
      { label: "Price", value: "Contact Broker" },
      { label: "Price per SF", value: "$22.50" },
      { label: "Building size", value: "16,700 SF" },
      { label: "Office", value: "1,340 SF" },
      { label: "Warehouse", value: "2,890 SF" },
      { label: "Land", value: "2.09 acres" },
      { label: "Zoning", value: "C-3, City of Boerne" },
    ]);
  });

  it("drops the three deal rows with pricing off, for a past project", () => {
    const labels = propertyFacts(propertyFixture(), { pricing: false }).map((f) => f.label);
    expect(labels).toEqual(["Building size", "Office", "Warehouse", "Land", "Zoning"]);
  });

  it("returns nothing for a listing with an empty Details tab", () => {
    const p = propertyFixture({
      transaction_type: null,
      total_price: null,
      price_per_unit: "",
      size_total_sf: null,
      size_office_sf: null,
      size_warehouse_sf: null,
      acres: null,
      zoning: null,
    });
    expect(propertyFacts(p)).toEqual([]);
  });

  it("keeps a zero — it is a value, not an empty field", () => {
    expect(propertyFacts(propertyFixture({ size_retail_sf: 0 }))).toContainEqual({
      label: "Retail",
      value: "0 SF",
    });
  });

  it("says acre, not acres, for exactly one", () => {
    expect(propertyFacts(propertyFixture({ acres: 1 }))).toContainEqual({
      label: "Land",
      value: "1 acre",
    });
  });

  // The client struck "Total" from the price line (Figma 1838699126), so the
  // total is "Price" and the per-unit row names its unit instead.
  it("names the per-unit row by the unit the editor typed", () => {
    const perUnit = (price_per_unit: string) =>
      propertyFacts(propertyFixture({ transaction_type: null, price_per_unit }))[1];
    // Every value live in Prismic on 2026-09-30, exactly as spelled there.
    expect(perUnit("$17.00 / SF")).toEqual({ label: "Price per SF", value: "$17.00" });
    expect(perUnit("$375.17 / SF")).toEqual({ label: "Price per SF", value: "$375.17" });
    expect(perUnit("$4.50 / SF")).toEqual({ label: "Price per SF", value: "$4.50" });
    expect(perUnit("$8.50 / SF")).toEqual({ label: "Price per SF", value: "$8.50" });
    // Variants an editor could type; none of these is live.
    expect(perUnit("$8.50/sq. ft.")).toEqual({ label: "Price per SF", value: "$8.50" });
    expect(perUnit("$375,000 / acre")).toEqual({ label: "Price per acre", value: "$375,000" });
    expect(perUnit("$40,000 / AC")).toEqual({ label: "Price per acre", value: "$40,000" });
    expect(perUnit("$18.00 / SF / yr")).toEqual({ label: "Unit price", value: "$18.00 / SF / yr" });
    expect(perUnit("Call for pricing")).toEqual({ label: "Unit price", value: "Call for pricing" });
  });

  it("never says Total, and never shows two rows with one label", () => {
    for (const price_per_unit of ["$375.17 / SF", "$1 / acre", "$18 / SF / yr", "TBD"]) {
      const labels = propertyFacts(propertyFixture({ price_per_unit })).map((f) => f.label);
      expect(labels).toContain("Price");
      expect(labels.join(" ")).not.toMatch(/total/i);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});

describe("propertyTracts", () => {
  it("carries each tract's own status", () => {
    expect(propertyTracts(propertyFixture())).toEqual([
      { name: "Tract 1", acres: "0.721 acres", status: "Under Contract" },
      { name: "Tract 3", acres: "1.369 acres", status: "Available" },
    ]);
  });

  it("drops a row with no name", () => {
    const p = propertyFixture({
      tracts: [{ tract_name: "", tract_acres: 3, tract_status: "Available" }],
    });
    expect(propertyTracts(p)).toEqual([]);
  });
});

describe("propertyPackage", () => {
  it("is the PDF's URL", () => {
    expect(propertyPackage(propertyFixture())).toEqual({ url: "/fixture-package.pdf" });
  });

  it("is null when no PDF is attached", () => {
    expect(propertyPackage(propertyFixture({ package_pdf: { link_type: "Any" } }))).toBeNull();
  });
});

describe("mapsUrl", () => {
  it("links the pin to Google Maps without an API key", () => {
    expect(mapsUrl(propertyFixture())).toBe(
      "https://www.google.com/maps/search/?api=1&query=29.6572,-98.6297",
    );
  });

  it("is null for a listing with no pin", () => {
    expect(mapsUrl(propertyFixture({ location: {} }))).toBeNull();
  });
});

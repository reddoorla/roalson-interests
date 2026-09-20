import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PROPERTY_CATEGORIES,
  PROPERTY_STATUSES,
  isSold,
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
});

describe("status", () => {
  it("treats only Sold as sold", () => {
    expect(isSold(propertyFixture({ status: "Sold" }))).toBe(true);
    expect(isSold(propertyFixture({ status: "Under Contract" }))).toBe(false);
    expect(isSold(propertyFixture({ status: "Available" }))).toBe(false);
  });

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
      { label: "Total price", value: "Contact Broker" },
      { label: "Price", value: "$22.50 / SF" },
      { label: "Building size", value: "16,700 SF" },
      { label: "Office", value: "1,340 SF" },
      { label: "Warehouse", value: "2,890 SF" },
      { label: "Land", value: "2.09 acres" },
      { label: "Zoning", value: "C-3, City of Boerne" },
    ]);
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
  it("reports the PDF's size in decimal MB", () => {
    expect(propertyPackage(propertyFixture())).toEqual({
      url: "/fixture-package.pdf",
      size: "6.2 MB",
    });
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

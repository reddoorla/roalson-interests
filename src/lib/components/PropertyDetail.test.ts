import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PropertyDetail from "./PropertyDetail.svelte";
import { propertyFixture } from "$lib/property-fixture";

afterEach(cleanup);

describe("PropertyDetail", () => {
  it("names the page with the property as its only h1", () => {
    const { getAllByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    const h1s = getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("25331 IH 10 West");
  });

  it("gives the panel the full width when a listing has no photo — the common case", () => {
    const { container, queryByRole } = render(PropertyDetail, {
      props: { property: propertyFixture({ feature_image: {} }) },
    });
    expect(queryByRole("img")).toBeNull();
    expect(container.querySelector(".lg\\:grid-cols-2")).toBeNull();
  });

  it("sets the photo beside the panel when there is one", () => {
    const { container, getByRole } = render(PropertyDetail, {
      props: { property: propertyFixture() },
    });
    expect(getByRole("img").getAttribute("alt")).toContain("limestone office building");
    expect(container.querySelector(".lg\\:grid-cols-2")).not.toBeNull();
  });

  it("links back to the listing", () => {
    const { getByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    expect(getByRole("link", { name: "All properties" }).getAttribute("href")).toBe("/properties");
  });

  it("announces a sold listing, and marks nothing on an available one", () => {
    const sold = render(PropertyDetail, {
      props: { property: propertyFixture({ status: "Sold", is_new: false }) },
    });
    expect(sold.getByRole("list", { name: "Listing status" }).textContent).toContain("Sold");
    sold.unmount();

    const available = render(PropertyDetail, {
      props: { property: propertyFixture({ status: "Available", is_new: false }) },
    });
    const tags = available.getByRole("list", { name: "Listing status" });
    expect(tags.textContent).not.toMatch(/Sold|Under Contract|Available/);
  });

  it("gives the package link its file type and size in its accessible name", () => {
    const { getByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    const link = getByRole("link", { name: /Property package/ });
    expect(link.getAttribute("href")).toBe("/fixture-package.pdf");
    expect(link.textContent).toContain("(PDF, 6.2 MB)");
  });

  it("opens the map in a new tab and says so", () => {
    const { getByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    const link = getByRole("link", { name: /View on Google Maps/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("opens in a new tab");
  });

  it("renders no action row, no details and no dangling labels for a bare listing", () => {
    const bare = propertyFixture({
      package_pdf: { link_type: "Any" },
      location: {},
      transaction_type: null,
      total_price: null,
      price_per_unit: null,
      size_total_sf: null,
      size_office_sf: null,
      size_warehouse_sf: null,
      acres: null,
      zoning: null,
      tracts: [],
    });
    const { queryByRole, container } = render(PropertyDetail, { props: { property: bare } });
    expect(queryByRole("link", { name: /package/i })).toBeNull();
    expect(queryByRole("link", { name: /Google Maps/ })).toBeNull();
    expect(queryByRole("heading", { name: "Details" })).toBeNull();
    expect(container.querySelector("dl")).toBeNull();
  });

  it("lists the facts as a description list and the tracts as a table", () => {
    const { container, getByRole } = render(PropertyDetail, {
      props: { property: propertyFixture() },
    });
    const terms = [...container.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(terms).toContain("Zoning");
    const table = getByRole("table", { name: "Tracts" });
    expect(table.textContent).toContain("Under Contract");
  });
});

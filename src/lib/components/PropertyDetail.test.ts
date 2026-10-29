import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PropertyDetail from "./PropertyDetail.svelte";
import { propertyFixture } from "$lib/property-fixture";

afterEach(cleanup);

const bulletsOf = (container: HTMLElement) =>
  [...container.querySelectorAll("ul:not([aria-label='Listing status']) > li")].map(
    (li) => li.textContent?.trim() ?? "",
  );

describe("PropertyDetail", () => {
  it("names the page with the property as its only h1", () => {
    const { getAllByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    const h1s = getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("25331 IH 10 West");
  });

  it("renders no photo when a listing has none — the common case", () => {
    const { queryByRole } = render(PropertyDetail, {
      props: { property: propertyFixture({ feature_image: {} }) },
    });
    expect(queryByRole("img")).toBeNull();
  });

  it("shows the photo, with its alt text, when there is one", () => {
    const { getByRole } = render(PropertyDetail, {
      props: { property: propertyFixture() },
    });
    expect(getByRole("img").getAttribute("alt")).toContain("limestone office building");
  });

  it("links back to the listing", () => {
    const { getByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    expect(getByRole("link", { name: "All properties" }).getAttribute("href")).toBe("/properties");
  });

  it("tags a sold listing as a past project, and marks nothing on an available one", () => {
    const sold = render(PropertyDetail, {
      props: { property: propertyFixture({ status: "Sold", is_new: false }) },
    });
    const soldTags = sold.getByRole("list", { name: "Listing status" }).textContent;
    expect(soldTags).toContain("Past project");
    expect(soldTags).not.toContain("Sold");
    sold.unmount();

    const available = render(PropertyDetail, {
      props: { property: propertyFixture({ status: "Available", is_new: false }) },
    });
    const tags = available.getByRole("list", { name: "Listing status" });
    expect(tags.textContent).not.toMatch(/Sold|Under Contract|Available/);
  });

  it("shows a past project as a record — no package, no price rows, no tracts, no NEW", () => {
    const { getByRole, queryByRole, queryByText, container } = render(PropertyDetail, {
      props: { property: propertyFixture({ listing_state: "Past project", is_new: true }) },
    });
    expect(getByRole("list", { name: "Listing status" }).textContent).toContain("Past project");
    expect(getByRole("list", { name: "Listing status" }).textContent).not.toContain("New");
    expect(queryByRole("link", { name: /Property package/ })).toBeNull();
    expect(queryByText(/^PDF/)).toBeNull();
    const items = bulletsOf(container);
    expect(items.some((b) => b.startsWith("Offered for"))).toBe(false);
    expect(items.join(" ")).not.toMatch(/price/i);
    expect(items).toContain("Building size: 16,700 SF");
    expect(items.some((b) => b.startsWith("Tract"))).toBe(false);
    expect(getByRole("link", { name: /Aerial Map/ })).toBeTruthy();
  });

  it("opens the package in the browser, in a new tab, and says so", () => {
    const { getByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    const link = getByRole("link", { name: /Property package/ });
    expect(link.getAttribute("href")).toBe("/fixture-package.pdf");
    expect(link.hasAttribute("download")).toBe(false);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("(PDF, opens in a new tab)");
  });

  it("prints no file size anywhere on the page", () => {
    const { container } = render(PropertyDetail, { props: { property: propertyFixture() } });
    expect(container.textContent).not.toMatch(/\d(\.\d)?\s*MB\b/);
  });

  it("labels the map button Aerial Map, opens the listing's Land ID map, and says where it goes", () => {
    const { getByRole } = render(PropertyDetail, { props: { property: propertyFixture() } });
    const link = getByRole("link", { name: /^Aerial Map/ });
    expect(link.firstChild?.textContent?.trim()).toBe("Aerial Map");
    expect(link.getAttribute("href")).toBe(
      "https://id.land/maps/fb13b61e0279b421a419bd8e3ed516aa/share",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("Land ID, opens in a new tab");
  });

  it("falls back to satellite imagery on the pin for a listing with no Land ID map", () => {
    const { getByRole } = render(PropertyDetail, {
      props: { property: propertyFixture({}, { uid: "no-land-id-map" }) },
    });
    const link = getByRole("link", { name: /^Aerial Map/ });
    const url = new URL(link.getAttribute("href")!);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/@");
    expect(url.searchParams.get("basemap")).toBe("satellite");
    expect(url.searchParams.get("center")).toBe("29.6572,-98.6297");
    expect(link.textContent).toContain("Google Maps, opens in a new tab");
  });

  it("renders no action row, no details and no dangling labels for a bare listing", () => {
    const bare = propertyFixture(
      {
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
      },
      { uid: "no-land-id-map" },
    );
    const { queryByRole, container } = render(PropertyDetail, { props: { property: bare } });
    expect(queryByRole("link", { name: /package/i })).toBeNull();
    expect(queryByRole("link", { name: /Aerial Map/ })).toBeNull();
    expect(queryByRole("heading", { name: "Details" })).toBeNull();
    expect(bulletsOf(container)).toEqual([
      "New ownership and property management!",
      "Great visibility and excellent location in the far NW submarket",
    ]);
  });

  it("drops the price bullets and the tracts for a sold listing, as for a marked one", () => {
    const { container } = render(PropertyDetail, {
      props: { property: propertyFixture({ status: "Sold" }) },
    });
    const items = bulletsOf(container);
    expect(items).toContain("Zoning: C-3, City of Boerne");
    expect(items.join(" ")).not.toMatch(/price|offered for/i);
    expect(items.some((b) => b.startsWith("Tract"))).toBe(false);
  });

  it("writes a tract with no acres as its name and status", () => {
    const { container } = render(PropertyDetail, {
      props: {
        property: propertyFixture({
          tracts: [{ tract_name: "Tract 2", tract_acres: null, tract_status: "Available" }],
        }),
      },
    });
    expect(bulletsOf(container).at(-1)).toBe("Tract 2: Available");
  });

  it("prices the listing under Price and never says Total", () => {
    const { container } = render(PropertyDetail, { props: { property: propertyFixture() } });
    expect(bulletsOf(container)).toContain("Price: Contact Broker");
    expect(bulletsOf(container)).toContain("Price per SF: $22.50");
    expect(container.textContent).not.toMatch(/total/i);
  });

  it("has no Details section: the facts and tracts follow the highlights in the one list", () => {
    const { container, queryByRole } = render(PropertyDetail, {
      props: { property: propertyFixture() },
    });
    expect(queryByRole("heading", { name: "Details" })).toBeNull();
    expect(queryByRole("table")).toBeNull();
    expect(container.querySelector("dl")).toBeNull();
    expect(bulletsOf(container)).toEqual([
      "New ownership and property management!",
      "Great visibility and excellent location in the far NW submarket",
      "Offered for: Sale or Lease",
      "Price: Contact Broker",
      "Price per SF: $22.50",
      "Building size: 16,700 SF",
      "Office: 1,340 SF",
      "Warehouse: 2,890 SF",
      "Land: 2.09 acres",
      "Zoning: C-3, City of Boerne",
      "Tract 1: 0.721 acres, Under Contract",
      "Tract 3: 1.369 acres, Available",
    ]);
  });
});

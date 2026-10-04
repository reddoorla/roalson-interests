import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PropertyCard from "./PropertyCard.svelte";
import { propertyFixture } from "$lib/property-fixture";

afterEach(cleanup);

describe("PropertyCard", () => {
  it("names the listing as an h3 — the section divider is the h2, the masthead the h1", () => {
    const { getByRole } = render(PropertyCard, { props: { property: propertyFixture() } });
    expect(getByRole("heading", { level: 3 }).textContent).toBe("25331 IH 10 West");
  });

  it("links LEARN MORE to the listing's page and says which listing, since the label repeats down the column", () => {
    const { getByRole } = render(PropertyCard, { props: { property: propertyFixture() } });
    const link = getByRole("link", { name: "Learn more about 25331 IH 10 West" });
    expect(link.getAttribute("href")).toBe("/properties/25331-ih-10-west");
  });

  it("renders a sold listing unlinked — its card does not lead to its page, as the comp draws it", () => {
    const { queryAllByRole } = render(PropertyCard, {
      props: { property: propertyFixture({ status: "Sold" }) },
    });
    expect(queryAllByRole("link").map((a) => a.getAttribute("href"))).not.toContain(
      "/properties/25331-ih-10-west",
    );
  });

  it("shows a past project as photo, address and bullets only — no badges, size or link", () => {
    const { container, getAllByRole, getByRole, queryAllByRole, queryByRole, queryByText } = render(
      PropertyCard,
      {
        props: {
          property: propertyFixture({ listing_state: "Past project", is_new: true }),
          variant: "cream",
          layout: "column",
        },
      },
    );
    expect(container.querySelector("img")).not.toBeNull();
    expect(getByRole("heading", { level: 3 }).textContent).toBe("25331 IH 10 West");
    expect(getAllByRole("listitem").map((li) => li.textContent)).toContain(
      "New ownership and property management!",
    );
    expect(queryAllByRole("link").map((a) => a.getAttribute("href"))).not.toContain(
      "/properties/25331-ih-10-west",
    );
    expect(queryByRole("list", { name: "Listing status" })).toBeNull();
    expect(queryByText("Up to 16,700 SF")).toBeNull();
  });

  it("announces Under Contract and New, and marks nothing on a plain available listing", () => {
    const marked = render(PropertyCard, {
      props: { property: propertyFixture({ status: "Under Contract", is_new: true }) },
    });
    const items = marked.getByRole("list", { name: "Listing status" }).querySelectorAll("li");
    expect([...items].map((li) => li.textContent?.trim())).toEqual(["Under Contract", "New"]);
    cleanup();
    const plain = render(PropertyCard, {
      props: { property: propertyFixture({ status: "Available", is_new: false }) },
    });
    expect(plain.queryByRole("list", { name: "Listing status" })).toBeNull();
  });

  it("shows the photo only when there is one", () => {
    const withPhoto = render(PropertyCard, { props: { property: propertyFixture() } });
    expect(withPhoto.container.querySelector("img")).not.toBeNull();
    cleanup();
    const without = render(PropertyCard, {
      props: { property: propertyFixture({ feature_image: {} }) },
    });
    expect(without.container.querySelector("img")).toBeNull();
  });

  it("shows the size line and the highlights as bullets, each only when filled", () => {
    const full = render(PropertyCard, { props: { property: propertyFixture() } });
    expect(full.getByText("Up to 16,700 SF")).not.toBeNull();
    expect(full.getAllByRole("listitem").map((li) => li.textContent)).toContain(
      "New ownership and property management!",
    );
    cleanup();
    const bare = render(PropertyCard, {
      props: { property: propertyFixture({ size_label: null, highlights: [], is_new: false }) },
    });
    expect(bare.queryByText("Up to 16,700 SF")).toBeNull();
    expect(bare.queryAllByRole("listitem")).toEqual([]);
  });
});

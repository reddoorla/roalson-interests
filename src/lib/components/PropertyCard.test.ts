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

  it("renders a sold listing with no link at all — its card is unlinked, as the comp draws it", () => {
    const { queryAllByRole } = render(PropertyCard, {
      props: { property: propertyFixture({ status: "Sold" }) },
    });
    expect(queryAllByRole("link")).toEqual([]);
  });

  it("is the garnet card when featured and the flat card otherwise, button tone to match", () => {
    const featured = render(PropertyCard, {
      props: { property: propertyFixture(), variant: "featured" },
    });
    const article = featured.container.querySelector("article")!;
    expect(article.className).toMatch(/\bbg-primary\b/);
    expect(article.className).toMatch(/\btext-background\b/);
    expect(featured.getByRole("link").className).toMatch(/\bborder-background\b/);
    cleanup();
    const flat = render(PropertyCard, { props: { property: propertyFixture() } });
    const flatArticle = flat.container.querySelector("article")!;
    expect(flatArticle.className).toMatch(/\bbg-background\b/);
    expect(flatArticle.className).not.toMatch(/\bbg-primary\b/);
    expect(flat.getByRole("link").className).toMatch(/\bborder-primary\b/);
  });

  it("takes sand on request — the flat card's tone on the off-white first section", () => {
    const { container, getByRole } = render(PropertyCard, {
      props: { property: propertyFixture(), variant: "sand" },
    });
    const article = container.querySelector("article")!;
    expect(article.className).toMatch(/\bbg-light\b/);
    expect(article.className).toMatch(/\btext-primary\b/);
    expect(getByRole("link").className).toMatch(/\bborder-primary\b/);
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

  it("shows the photo beside the panel only when there is one — no empty box for the common case", () => {
    const withPhoto = render(PropertyCard, { props: { property: propertyFixture() } });
    expect(withPhoto.container.querySelector("img")).not.toBeNull();
    expect(withPhoto.container.querySelector(".md\\:w-1\\/2")).not.toBeNull();
    cleanup();
    const without = render(PropertyCard, {
      props: { property: propertyFixture({ feature_image: {} }) },
    });
    expect(without.container.querySelector("img")).toBeNull();
    expect(without.container.querySelector(".aspect-\\[423\\.5\\/267\\.5\\]")).toBeNull();
  });

  it("stacks the photo above the text in the column layout, at every width", () => {
    const { container } = render(PropertyCard, {
      props: { property: propertyFixture(), layout: "column" },
    });
    expect(container.querySelector("article")!.className).not.toMatch(/md:flex-row/);
    expect(container.querySelector(".md\\:w-1\\/2")).toBeNull();
  });

  it("lists the size line over the title and the highlights as bullets, each only when filled", () => {
    const full = render(PropertyCard, { props: { property: propertyFixture() } });
    expect(full.getByText("Up to 16,700 SF").className).toMatch(/\bt-h4\b/);
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

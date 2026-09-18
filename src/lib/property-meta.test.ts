import { describe, expect, it } from "vitest";

import { propertyDescription, propertyJsonLd, propertyMeta } from "./property-meta";
import { propertyFixture } from "./property-fixture";

const url = new URL("https://www.roalson.com/preview/properties/25331-ih-10-west?utm_source=email");

describe("propertyMeta", () => {
  it("noindexes a sold listing — and only a sold one", () => {
    expect(propertyMeta(propertyFixture({ status: "Sold" }), url).noindex).toBe(true);
    expect(propertyMeta(propertyFixture({ status: "Under Contract" }), url).noindex).toBe(false);
    expect(propertyMeta(propertyFixture({ status: "Available" }), url).noindex).toBe(false);
  });

  it("titles the page with the property name", () => {
    expect(propertyMeta(propertyFixture(), url).title).toBe("25331 IH 10 West");
  });

  it("prefers the editor's meta description", () => {
    const p = propertyFixture({ meta_description: "Hand-written summary." });
    expect(propertyMeta(p, url).meta_description).toBe("Hand-written summary.");
  });

  it("falls back to the listing's own size line and highlights, as sentences", () => {
    expect(propertyMeta(propertyFixture(), url).meta_description).toBe(
      "Up to 16,700 SF. New ownership and property management! Great visibility and excellent location in the far NW submarket.",
    );
  });

  it("uses the feature photo as the share card when no meta image is set", () => {
    const meta = propertyMeta(propertyFixture(), url);
    expect(meta.meta_image).toMatch(/^data:image\/gif/);
    expect(meta.meta_image_alt).toContain("limestone office building");
  });
});

describe("propertyDescription", () => {
  it("is undefined when there is nothing specific to say", () => {
    expect(
      propertyDescription(propertyFixture({ size_label: null, highlights: [] })),
    ).toBeUndefined();
  });
});

describe("propertyJsonLd", () => {
  it("is a RealEstateListing at the canonical URL, pinned to its coordinates", () => {
    const ld = propertyMeta(propertyFixture(), url).jsonLd;
    expect(ld).toMatchObject({
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      name: "25331 IH 10 West",
      // /preview and the query string stripped — the same canonical <Seo> emits.
      url: "https://www.roalson.com/properties/25331-ih-10-west",
      datePosted: "2026-09-01T00:00:00+0000",
      about: {
        "@type": "Place",
        geo: { "@type": "GeoCoordinates", latitude: 29.6572, longitude: -98.6297 },
      },
    });
  });

  it("omits what the listing does not have rather than emitting empties", () => {
    const ld = propertyJsonLd(
      propertyFixture({ location: {}, feature_image: {} }),
      "https://www.roalson.com/properties/x",
    );
    expect(ld).not.toHaveProperty("about");
    expect(ld).not.toHaveProperty("image");
    expect(ld).not.toHaveProperty("description");
  });
});

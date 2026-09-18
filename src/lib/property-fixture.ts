import type { PropertyDocument } from "../prismicio-types";

/** Inline pixel, so a fixture never depends on an external host — the axe run
 *  must stay hermetic (see /dev/a11y-fixtures). */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

/** A fully filled `property` document, for the a11y fixtures page and tests.
 *  Content is the outline's real listing shape (improved, split SF, a land
 *  tract under contract), not the comp's placeholder — every card in the comp
 *  is the same photo and the same two bullets. Pass `data` to override fields. */
export function propertyFixture(
  data: Partial<PropertyDocument["data"]> = {},
  doc: Partial<Omit<PropertyDocument, "data">> = {},
): PropertyDocument {
  return {
    id: "fixture-property",
    uid: "25331-ih-10-west",
    type: "property",
    lang: "en-us",
    tags: [],
    url: null,
    href: "",
    slugs: [],
    linked_documents: [],
    alternate_languages: [],
    first_publication_date: "2026-09-01T00:00:00+0000",
    last_publication_date: "2026-09-13T00:00:00+0000",
    ...doc,
    data: {
      title: "25331 IH 10 West",
      category: "Improved",
      status: "Available",
      is_new: true,
      order: 1,
      size_label: "Up to 16,700 SF",
      feature_image: {
        url: PIXEL,
        alt: "Two-storey limestone office building with a paved forecourt",
        dimensions: { width: 1600, height: 1010 },
        copyright: null,
        id: "fixture-image",
        edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
      },
      highlights: [
        { text: "New ownership and property management!" },
        { text: "Great visibility and excellent location in the far NW submarket" },
      ],
      package_pdf: {
        link_type: "Media",
        key: "fixture-pdf",
        kind: "document",
        id: "fixture-pdf",
        url: "/fixture-package.pdf",
        name: "25331 IH 10 West package.pdf",
        size: "6205367",
      },
      location: { latitude: 29.6572, longitude: -98.6297 },
      transaction_type: "Sale or Lease",
      total_price: "Contact Broker",
      price_per_unit: "$22.50 / SF",
      size_total_sf: 16700,
      size_office_sf: 1340,
      size_retail_sf: null,
      size_warehouse_sf: 2890,
      acres: 2.09,
      tracts: [
        { tract_name: "Tract 1", tract_acres: 0.721, tract_status: "Under Contract" },
        { tract_name: "Tract 3", tract_acres: 1.369, tract_status: "Available" },
      ],
      zoning: "C-3, City of Boerne",
      meta_title: null,
      meta_description: null,
      meta_image: {},
      ...data,
    },
  } as PropertyDocument;
}

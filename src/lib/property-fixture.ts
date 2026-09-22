import type { ImageField } from "@prismicio/client";

import type { PropertyDocument } from "../prismicio-types";

/** Inline pixel, so a fixture never depends on an external host — the axe run
 *  must stay hermetic (see /dev/a11y-fixtures). */
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

/** A drawn stand-in for the Properties masthead photograph, on
 *  HOME_POSTER_FIXTURE's precedent: the real file is a placeholder the client
 *  replaces and lives in the CMS, never in this public repo.
 *
 *  Deliberately the WORST case rather than a flattering one. Every value in it
 *  is >= #d8cfbb, and the top band is pure white — so /dev/properties and the
 *  axe fixtures render the masthead over the brightest ground a photograph can
 *  present, which is exactly the ground PageMasthead's scrim is sized against.
 *  A pretty fixture would have hidden that the scrim is load-bearing.
 *  2560x1739 — the aspect of the real asset, so the object-cover crop matches. */
const MASTHEAD_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2560 1739">` +
  `<defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#ffffff"/><stop offset="0.58" stop-color="#fdfaf3"/>` +
  `<stop offset="1" stop-color="#f4ecdc"/>` +
  `</linearGradient></defs>` +
  `<rect width="2560" height="1739" fill="url(#m)"/>` +
  `<g fill="#e8e1d1">` +
  `<rect x="180" y="980" width="220" height="759"/>` +
  `<rect x="520" y="820" width="160" height="919"/>` +
  `<rect x="1180" y="620" width="150" height="1119"/>` +
  `<rect x="1560" y="900" width="260" height="839"/>` +
  `<rect x="2040" y="1040" width="300" height="699"/>` +
  `</g>` +
  `<g fill="#d8cfbb">` +
  `<rect x="0" y="1360" width="2560" height="379"/>` +
  `<rect x="880" y="700" width="90" height="1039"/>` +
  `<ellipse cx="925" cy="700" rx="130" ry="46"/>` +
  `</g></svg>`;

export const PROPERTIES_MASTHEAD_FIXTURE = {
  url: `data:image/svg+xml,${encodeURIComponent(MASTHEAD_SVG)}`,
  alt: "A drawn San Antonio skyline at sunrise, the Tower of the Americas at its centre",
  dimensions: { width: 2560, height: 1739 },
  copyright: null,
  id: "fixture-properties-masthead",
  edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
} as unknown as ImageField;

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

/** A small portfolio for the listing page: both land categories, improved
 *  listings with and without a photo, an order tie-breaker case, an empty
 *  order, and sold listings from BOTH categories so the Sold section proves it
 *  is a status, not a category. Titles are the outline's real listings.
 *
 *  THE COORDINATES ARE CONSTRUCTED, and deliberately. `propertyFixture` gives
 *  every listing 25331 IH 10 West's pin, so before the map (#13) every card on
 *  /dev/properties stood on the same spot — a map fixture that would have
 *  drawn one marker at maximum zoom and proved nothing. Each listing below now
 *  carries a pin near the road it is named for, and the LAND section's four
 *  are shaped to put both of the map's jobs on the page at once: Potranco Road
 *  and FM 1560 & Galm Road are 0.589 km apart, so they cluster at every zoom
 *  the panel fits to, while Castroville and New Braunfels are 83.08 km apart,
 *  so the
 *  fit has to open up to hold them. The real portfolio's own numbers — the
 *  ones the clustering was tuned against — are in property-map.test.ts. */
export function propertyListingFixture(): PropertyDocument[] {
  const at = (
    id: string,
    data: Partial<PropertyDocument["data"]>,
    doc: Partial<Omit<PropertyDocument, "data">> = {},
  ) => propertyFixture(data, { id, uid: id, ...doc });

  return [
    at("25331-ih-10-west", {
      category: "Improved",
      order: 1,
      is_new: true,
      location: { latitude: 29.6773878, longitude: -98.638346 },
    }),
    at("402-nueva", {
      title: "402 Nueva",
      category: "Improved",
      order: 2,
      is_new: false,
      size_label: "12,400 SF",
      feature_image: {},
      location: { latitude: 29.4231304, longitude: -98.5008086 },
    }),
    at("potranco-road", {
      title: "Potranco Road tract",
      category: "Land — SA Metro & Surrounding",
      status: "Under Contract",
      order: 2,
      is_new: false,
      size_label: "38.6 acres",
      location: { latitude: 29.529, longitude: -98.7101 },
    }),
    at("fm-1560-galm", {
      title: "FM 1560 & Galm Road",
      category: "Land — SA Metro & Surrounding",
      order: 1,
      is_new: false,
      size_label: "12.2 acres",
      feature_image: {},
      location: { latitude: 29.5316, longitude: -98.7154 },
    }),
    at("hwy-90-castroville", {
      title: "Hwy 90 West, Castroville",
      category: "Land — Out of San Antonio",
      order: 3,
      is_new: false,
      size_label: "210 acres",
      feature_image: {},
      location: { latitude: 29.3552, longitude: -98.8845 },
    }),
    at("ih-35-new-braunfels", {
      title: "IH-35, New Braunfels",
      category: "Land — Out of San Antonio",
      order: null,
      is_new: false,
      size_label: "4.8 acres",
      location: { latitude: 29.703, longitude: -98.1245 },
    }),
    at("5001-walzem-road", {
      title: "5001 Walzem Road",
      category: "Improved",
      status: "Sold",
      order: 1,
      is_new: false,
      size_label: "22,000 SF",
      location: { latitude: 29.510603, longitude: -98.39129 },
    }),
    at("culebra-road", {
      title: "Culebra Road tract",
      category: "Land — SA Metro & Surrounding",
      status: "Sold",
      order: 2,
      is_new: false,
      size_label: "6.1 acres",
      feature_image: {},
      location: { latitude: 29.4692, longitude: -98.6621 },
    }),
  ];
}

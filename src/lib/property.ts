import { isFilled } from "@prismicio/client";

import type { PropertyDocument } from "../prismicio-types";

/** The `category` Select's options, exactly as customtypes/property declares
 *  them. Prismic hands back the option STRING, so code that groups listings
 *  compares against these — and property.test.ts fails if the model and this
 *  list ever disagree. The comp draws ONE Land section; the two land values
 *  are the outline's split, kept in the data (operator call, 2026-09-18). */
export const PROPERTY_CATEGORIES = [
  "Improved",
  "Land — SA Metro & Surrounding",
  "Land — Out of San Antonio",
] as const;

/** The `status` Select's options (and each tract's), as the model declares. */
export const PROPERTY_STATUSES = ["Available", "Under Contract", "Sold"] as const;

export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

/** Anything carrying these fields of a listing's `data` — a whole
 *  `PropertyDocument`, or the handful of fields a content relationship embeds
 *  (the homepage's featured band holds listings that way, and they are not
 *  documents). The three helpers below read one field each, so they ask for
 *  one field each rather than being re-derived wherever a listing arrives in
 *  another shape. */
type WithPropertyData<K extends keyof PropertyDocument["data"]> = {
  data: Pick<PropertyDocument["data"], K>;
};

/** A sold listing keeps its page — links already shared keep working — but
 *  leaves the index and the sitemap, and its card goes unlinked. */
export function isSold(property: WithPropertyData<"status">): boolean {
  return property.data.status === "Sold";
}

/** Status worth announcing. "Available" is the unmarked default, so it gets no
 *  label; an empty Select reads as Available too. */
export function statusLabel(
  property: WithPropertyData<"status">,
): Exclude<PropertyStatus, "Available"> | null {
  const status = property.data.status;
  return status === "Under Contract" || status === "Sold" ? status : null;
}

/** The editor-entered highlight lines, blanks dropped. */
export function propertyHighlights(property: WithPropertyData<"highlights">): string[] {
  return property.data.highlights.map((h) => h.text?.trim() ?? "").filter(Boolean);
}

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });
const sf = (n: number) => `${number.format(n)} SF`;
const acres = (n: number) => `${number.format(n)} ${n === 1 ? "acre" : "acres"}`;

export interface PropertyFact {
  label: string;
  value: string;
}

/** The Details tab as label/value rows, in reading order, filled fields only —
 *  an empty field is omitted rather than shown as a dash, because most
 *  listings fill fewer than half of these. */
export function propertyFacts(property: PropertyDocument): PropertyFact[] {
  const d = property.data;
  const rows: [string, string | null][] = [
    ["Offered for", d.transaction_type ?? null],
    ["Total price", d.total_price?.trim() || null],
    ["Price", d.price_per_unit?.trim() || null],
    ["Building size", isFilled.number(d.size_total_sf) ? sf(d.size_total_sf) : null],
    ["Office", isFilled.number(d.size_office_sf) ? sf(d.size_office_sf) : null],
    ["Retail", isFilled.number(d.size_retail_sf) ? sf(d.size_retail_sf) : null],
    ["Warehouse", isFilled.number(d.size_warehouse_sf) ? sf(d.size_warehouse_sf) : null],
    ["Land", isFilled.number(d.acres) ? acres(d.acres) : null],
    ["Zoning", d.zoning?.trim() || null],
  ];
  return rows
    .filter((r): r is [string, string] => r[1] !== null)
    .map(([label, value]) => ({ label, value }));
}

export interface PropertyTract {
  name: string;
  acres: string | null;
  status: PropertyStatus;
}

/** Land sold in tracts, each with its own status. A row with no name is
 *  dropped — it cannot be told apart from its neighbours. */
export function propertyTracts(property: PropertyDocument): PropertyTract[] {
  return property.data.tracts
    .filter((t) => t.tract_name?.trim())
    .map((t) => ({
      name: t.tract_name!.trim(),
      acres: isFilled.number(t.tract_acres) ? acres(t.tract_acres) : null,
      status: t.tract_status ?? "Available",
    }));
}

export interface PropertyPackage {
  url: string;
  /** e.g. "14.4 MB" — shown beside the link because these PDFs run to 14 MB
   *  and a visitor on a phone deserves to know before tapping. */
  size: string | null;
}

const megabytes = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** The package PDF, if one is attached. Sizes are decimal MB (10⁶ bytes), the
 *  unit macOS, iOS and Windows' download UI all show. */
export function propertyPackage(property: PropertyDocument): PropertyPackage | null {
  const pdf = property.data.package_pdf;
  if (!isFilled.linkToMedia(pdf)) return null;
  const bytes = Number(pdf.size);
  return {
    url: pdf.url,
    size: bytes > 0 ? `${megabytes.format(Math.max(bytes / 1e6, 0.1))} MB` : null,
  };
}

/** A plain Google Maps link to the pin — no API key, no script, no CSP host.
 *  The interactive map is a separate build (brief Q4–Q6); this is the link a
 *  visitor on a phone actually wants. */
export function mapsUrl(property: PropertyDocument): string | null {
  const loc = property.data.location;
  if (!isFilled.geoPoint(loc)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`;
}

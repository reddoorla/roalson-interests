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
 *  documents). The helpers below read one or two fields each, so they ask for
 *  those fields rather than being re-derived wherever a listing arrives in
 *  another shape. */
type WithPropertyData<K extends keyof PropertyDocument["data"]> = {
  data: Pick<PropertyDocument["data"], K>;
};

/** The `listing_state` Select's options, as the model declares. No default:
 *  empty and "Listed" both mean listed, so the 22 documents that predate the
 *  field need no migration. */
export const LISTING_STATES = ["Listed", "Past project", "Archived"] as const;

type WithListingState = WithPropertyData<"status" | "listing_state">;

/** Hidden everywhere: no card, no pin, no featured slide, no sitemap entry, and
 *  its page 404s. Wins over every other field. */
export function isArchived(property: WithListingState): boolean {
  return property.data.listing_state === "Archived";
}

/** A past project keeps its page — links already shared keep working — but
 *  leaves the index and the sitemap, and its card goes unlinked, with no price,
 *  size or package. A sold listing is one without being marked. */
export function isPastProject(property: WithListingState): boolean {
  return (
    !isArchived(property) &&
    (property.data.listing_state === "Past project" || property.data.status === "Sold")
  );
}

/** On the market: shown in its category's section, linked, indexed. */
export function isListed(property: WithListingState): boolean {
  return !isArchived(property) && !isPastProject(property);
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

const UNITS: [RegExp, string][] = [
  [/^(?:sf|sq\.?\s*ft\.?|sqft|square\s+f(?:oo|ee)t)$/i, "SF"],
  [/^(?:acres?|ac\.?)$/i, "acre"],
];

/** The per-unit price as its own row: "$375.17 / SF" reads "Price per SF
 *  $375.17", so it never sits under a second "Price" beside the total (the
 *  client struck "Total" from that one, Figma 1838699126). A value whose unit
 *  is not one of these keeps its own words under "Unit price". */
function unitPrice(value: string): [string, string] {
  const [, amount, unit] = /^(.*?\S)\s*\/\s*(.+?)$/.exec(value) ?? [];
  const named = unit && UNITS.find(([re]) => re.test(unit.trim()))?.[1];
  return named ? [`Price per ${named}`, amount] : ["Unit price", value];
}

/** The Details tab as label/value rows, in reading order, filled fields only —
 *  an empty field is omitted rather than shown as a dash, because most
 *  listings fill fewer than half of these. `pricing: false` drops the three
 *  deal rows, for a past project. */
export function propertyFacts(
  property: PropertyDocument,
  { pricing = true }: { pricing?: boolean } = {},
): PropertyFact[] {
  const d = property.data;
  const deal = (value: string | null) => (pricing ? value : null);
  const perUnit = deal(d.price_per_unit?.trim() || null);
  const rows: [string, string | null][] = [
    ["Offered for", deal(d.transaction_type ?? null)],
    ["Price", deal(d.total_price?.trim() || null)],
    ...(perUnit ? [unitPrice(perUnit)] : []),
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
  /** The name the file is saved under: the upload's own name as Prismic
   *  keeps it (all 22 live packages carry one), never the CDN path's `<id>_`
   *  prefix. */
  filename: string;
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
    filename: pdf.name || "property-package.pdf",
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

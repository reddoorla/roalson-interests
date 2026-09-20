import type { PropertyDocument } from "../prismicio-types";
import { isSold, PROPERTY_CATEGORIES } from "$lib/property";

/**
 * The Properties page's active sections, in the order the comp draws them at
 * every width (Land, then Improved Projects; Sold follows). The comp's layer
 * names are swapped — the frame called `Improved` carries the "Land" divider —
 * so the ORDER here is read from the divider text, not the layers, and it is
 * the only signal in the file: the content outline lists Improved first, and
 * Stage A recorded "do not infer section order from the comps". It is a
 * constant so that flipping it is a one-line change, not a redesign.
 *
 * The comp draws ONE Land section; the two land categories are the outline's
 * split, kept in the data (Stage B call 6). Sold is a status, never a category,
 * so a sold listing leaves whichever section it was in.
 */
export const LISTING_SECTIONS = [
  {
    id: "land",
    label: "Land",
    categories: ["Land — SA Metro & Surrounding", "Land — Out of San Antonio"],
  },
  { id: "improved", label: "Improved Projects", categories: ["Improved"] },
] as const satisfies readonly {
  id: string;
  label: string;
  categories: readonly (typeof PROPERTY_CATEGORIES)[number][];
}[];

export const SOLD_SECTION = { id: "sold", label: "Sold" } as const;

export interface ListingSection {
  id: string;
  label: string;
  /** Sold listings: cards go unlinked and lay out as a grid, with no map. */
  sold: boolean;
  properties: PropertyDocument[];
}

/** `order` ascending with empty last (the model says "lowest first; empty sorts
 *  last"), then title, so two listings with the same order never swap between
 *  builds. */
export function listingOrder(a: PropertyDocument, b: PropertyDocument): number {
  const ao = typeof a.data.order === "number" ? a.data.order : Infinity;
  const bo = typeof b.data.order === "number" ? b.data.order : Infinity;
  if (ao !== bo) return ao - bo;
  return (a.data.title ?? "").localeCompare(b.data.title ?? "");
}

/**
 * Every listing into its section. Sold listings go to Sold whatever their
 * category. An active listing whose `category` is empty — the Select is
 * optional in Prismic — is an editorial slip, not a reason to hide it: it lands
 * at the end of the last active section, where it is at least visible and
 * therefore gets fixed. Sections with nothing in them are left out: a heading
 * over an empty list is noise, and Sold may well be empty at launch.
 */
export function groupListings(properties: PropertyDocument[]): ListingSection[] {
  const sorted = [...properties].sort(listingOrder);
  const active = sorted.filter((p) => !isSold(p));
  const placed = new Set<PropertyDocument>();

  const sections: ListingSection[] = LISTING_SECTIONS.map((section) => {
    const own = active.filter((p) =>
      (section.categories as readonly string[]).includes(p.data.category ?? ""),
    );
    own.forEach((p) => placed.add(p));
    return { id: section.id, label: section.label, sold: false, properties: own };
  });

  const stray = active.filter((p) => !placed.has(p));
  sections[sections.length - 1].properties.push(...stray);

  sections.push({ ...SOLD_SECTION, sold: true, properties: sorted.filter(isSold) });

  return sections.filter((s) => s.properties.length > 0);
}

import type { PropertyDocument } from "../prismicio-types";
import { isArchived, isListed, isPastProject, PROPERTY_CATEGORIES } from "$lib/property";

/**
 * The Properties page's active sections, in the order the comp draws them at
 * every width (Land, then Improved Projects; Past Projects follows). The comp's layer
 * names are swapped — the frame called `Improved` carries the "Land" divider —
 * so the ORDER here is read from the divider text, not the layers, and it is
 * the only signal in the file: the content outline lists Improved first, and
 * Stage A recorded "do not infer section order from the comps". It is a
 * constant so that flipping it is a one-line change, not a redesign.
 *
 * The comp draws ONE Land section; the two land categories are the outline's
 * split, kept in the data (Stage B call 6). A past project (marked, or Sold) is
 * never a category, so it leaves whichever section it was in; an archived
 * listing leaves the page.
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

export const PAST_SECTION = { id: "past", label: "Past Projects" } as const;

export interface ListingSection {
  id: string;
  label: string;
  /** Past projects: cards go unlinked and lay out as a grid, with no map. */
  past: boolean;
  properties: PropertyDocument[];
}

/** The view tabs over the active sections (P5, client meeting 2026-09-25:
 *  "land / improved projects / all"). The id is also the URL fragment and the
 *  `:target` app.css filters by, so the page filters with no script. */
export const LISTING_VIEWS = [
  { id: "land", label: "Land" },
  { id: "improved", label: "Improved Projects" },
  { id: "all", label: "All" },
] as const;

export type ListingView = (typeof LISTING_VIEWS)[number]["id"];

/** The tabs worth drawing: none unless two active sections are on the page
 *  (a tab that filters nothing out is noise), otherwise the present ones and
 *  All, in LISTING_VIEWS order. */
export function listingViews(sections: readonly ListingSection[]) {
  const active = new Set(sections.filter((s) => !s.past).map((s) => s.id));
  if (active.size < 2) return [];
  return LISTING_VIEWS.filter((v) => v.id === "all" || active.has(v.id));
}

/** The view a fragment names: "" is All, a view id is itself, and any other
 *  fragment (the skip link's `#main-content`) is null — keep the current view. */
export function viewFromHash(hash: string): ListingView | null {
  const id = hash.replace(/^#/, "");
  if (id === "") return "all";
  return LISTING_VIEWS.find((v) => v.id === id)?.id ?? null;
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
 * Every listing into its section. Archived listings go nowhere; past projects
 * go to Past Projects whatever their category. An active listing whose `category` is empty — the Select is
 * optional in Prismic — is an editorial slip, not a reason to hide it: it lands
 * at the end of the last active section, where it is at least visible and
 * therefore gets fixed. Sections with nothing in them are left out: a heading
 * over an empty list is noise, and Past Projects is empty at launch.
 */
export function groupListings(properties: PropertyDocument[]): ListingSection[] {
  const sorted = [...properties].sort(listingOrder);
  const visible = sorted.filter((p) => !isArchived(p));
  const active = visible.filter(isListed);
  const placed = new Set<PropertyDocument>();

  const sections: ListingSection[] = LISTING_SECTIONS.map((section) => {
    const own = active.filter((p) =>
      (section.categories as readonly string[]).includes(p.data.category ?? ""),
    );
    own.forEach((p) => placed.add(p));
    return { id: section.id, label: section.label, past: false, properties: own };
  });

  const stray = active.filter((p) => !placed.has(p));
  sections[sections.length - 1].properties.push(...stray);

  sections.push({ ...PAST_SECTION, past: true, properties: visible.filter(isPastProject) });

  return sections.filter((s) => s.properties.length > 0);
}

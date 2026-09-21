import type { PropertyDocument } from "../prismicio-types";
import { groupListings, type ListingSection } from "$lib/property-listing";

/** The minimal client surface the loader needs (see PageClient). */
export type ListingClient = {
  getAllByType(type: "property"): Promise<PropertyDocument[]>;
};

export const LISTING_TITLE = "Our Properties";
export const LISTING_DESCRIPTION =
  "Land and improved commercial properties for sale or lease in San Antonio and across Texas, from Roalson Interests.";

export interface ListingData {
  sections: ListingSection[];
  title: string;
  meta_description: string;
}

/** The listing page with nothing published — also the unconfigured starter's
 *  state. An empty listing is a real page, not a missing document. */
export function emptyListing(): ListingData {
  return { sections: [], title: LISTING_TITLE, meta_description: LISTING_DESCRIPTION };
}

/** Every `property` document, grouped for the page. There is no 404 case here:
 *  a Prismic failure stays loud (5xx at runtime, a failed prerender at build)
 *  rather than baking an empty listing into the build. */
export async function loadPropertyListing(client: ListingClient): Promise<ListingData> {
  const properties = await client.getAllByType("property");
  return { ...emptyListing(), sections: groupListings(properties) };
}

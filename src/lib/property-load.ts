import type { PropertyDocument } from "../prismicio-types";
import { orNotFound } from "$lib/page-load";
import { propertyMeta } from "$lib/property-meta";

/** The minimal client surface the loader needs (see PageClient). */
export type PropertyClient = {
  getByUID(type: "property", uid: string): Promise<PropertyDocument>;
};

/** Load one `property` document and the layout's head payload for it. A miss
 *  is a 404; anything else stays loud (see orNotFound). */
export async function loadProperty(client: PropertyClient, uid: string, url: URL) {
  const property = await orNotFound(client.getByUID("property", uid));
  return { property, ...propertyMeta(property, url) };
}

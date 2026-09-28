import { error } from "@sveltejs/kit";

import type { PropertyDocument } from "../prismicio-types";
import { orNotFound } from "$lib/page-load";
import { isArchived } from "$lib/property";
import { propertyMeta } from "$lib/property-meta";

/** The minimal client surface the loader needs (see PageClient). */
export type PropertyClient = {
  getByUID(type: "property", uid: string): Promise<PropertyDocument>;
};

/** Load one `property` document and the layout's head payload for it. A miss
 *  is a 404; anything else stays loud (see orNotFound). An archived listing is
 *  a 404 too — here and not only in `entries()`, because the layout's
 *  `prerender = "auto"` still server-renders a uid the build left out. */
export async function loadProperty(client: PropertyClient, uid: string, url: URL) {
  const property = await orNotFound(client.getByUID("property", uid));
  if (isArchived(property)) error(404, { message: "Page not found" });
  return { property, ...propertyMeta(property, url) };
}

import { error } from "@sveltejs/kit";

import type { PropertyDocument } from "../prismicio-types";
import { orNotFound } from "$lib/page-load";
import { isArchived } from "$lib/property";
import { propertyMeta } from "$lib/property-meta";

/** The minimal client surface the loader needs (see PageClient). */
export type PropertyClient = {
  getByUID(type: "property", uid: string): Promise<PropertyDocument>;
};

/** The uids of archived listings this process has 404'd. svelte.config.js's
 *  `handleHttpError` sees only a status and a path, so a page still linking
 *  to an archived listing failed the build with a bare 404 (#176); it reads
 *  this set to name the cause instead. The prerenderer loads the config and
 *  the built server into one process, so the two share `globalThis`. */
export const ARCHIVED_LISTINGS = Symbol.for("roalson.archivedListings");

function noteArchived(uid: string) {
  const g = globalThis as { [ARCHIVED_LISTINGS]?: Set<string> };
  (g[ARCHIVED_LISTINGS] ??= new Set()).add(uid);
}

/** Load one `property` document and the layout's head payload for it. A miss
 *  is a 404; anything else stays loud (see orNotFound). An archived listing is
 *  a 404 too — here and not only in `entries()`, because the layout's
 *  `prerender = "auto"` still server-renders a uid the build left out. */
export async function loadProperty(client: PropertyClient, uid: string, url: URL) {
  const property = await orNotFound(client.getByUID("property", uid));
  if (isArchived(property)) {
    noteArchived(uid);
    error(404, { message: "Page not found" });
  }
  return { property, ...propertyMeta(property, url) };
}

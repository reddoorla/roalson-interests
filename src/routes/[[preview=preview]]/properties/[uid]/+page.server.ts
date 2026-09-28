import { error } from "@sveltejs/kit";

import { loadProperty } from "$lib/property-load";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";
import { isArchived } from "$lib/property";

export async function load({ params, fetch, cookies, url }) {
  // See the root route: an unconfigured template answers 404 rather than
  // asking a repository that does not exist.
  if (isPlaceholderRepo) error(404, { message: "Page not found" });

  return loadProperty(createClient({ fetch, cookies }), params.uid, url);
}

// Prerender every listing but the archived, past projects included: a past
// project keeps its page so a link a broker already emailed still resolves — it
// only leaves the index and the sitemap (see $lib/property-meta and
// sitemap.xml). An archived one has no page (loadProperty 404s it). Empty on an
// unconfigured starter so `pnpm build` succeeds before the Prismic repo is wired.
export async function entries() {
  if (isPlaceholderRepo) return [];

  const properties = await createClient().getAllByType("property");
  return properties.filter((p) => !isArchived(p)).map((property) => ({ uid: property.uid }));
}

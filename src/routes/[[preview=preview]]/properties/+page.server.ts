import { loadPropertiesMasthead } from "$lib/page-media-load";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";
import { emptyListing, loadPropertyListing } from "$lib/property-listing-load";

// Prerendered, and named in entries() so the prerenderer builds it although
// nothing links to it yet (the nav batch adds the link). The optional
// `preview` segment stays server-rendered, as on the home route.
export const prerender = true;

export async function load({ fetch, cookies }) {
  // The one CMS-backed route that renders on an unconfigured starter: an empty
  // listing is a real state — nothing published yet — not a missing document,
  // so this answers 200 where the document routes answer 404. It also lets the
  // smoke run cover the page before the Prismic repo exists.
  const client = isPlaceholderRepo ? null : createClient({ fetch, cookies });
  const listing = client ? await loadPropertyListing(client) : emptyListing();

  // The band's photograph (#15), from the `page_media` singleton. `null` on an
  // unconfigured starter, with no such document, or with the field left empty —
  // every one of which PageMasthead draws as the brand gradient. It is NOT a
  // `page` document with uid `properties`: see $lib/page-media-load for the
  // prerender collision that would be.
  const masthead = client ? await loadPropertiesMasthead(client) : null;

  // The page opens on PageMasthead, which runs under the bar as the comp draws
  // it — so the bar floats over it in its reverse tone (see Nav.svelte).
  return { ...listing, masthead, navOver: "dark" as const };
}

export function entries() {
  return [{}];
}

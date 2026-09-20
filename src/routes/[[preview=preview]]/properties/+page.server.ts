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
  if (isPlaceholderRepo) return emptyListing();

  return loadPropertyListing(createClient({ fetch, cookies }));
}

export function entries() {
  return [{}];
}

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

  // No `navOver`, and so no `canvasTop`: the page opens on PageMasthead but the
  // bar does NOT float over it. It is the solid bar from the top — off-white
  // ground, garnet wordmark and CONTACT US, as it is on every page once
  // scrolled — and the layout pads <main> by its height, so the photo starts
  // below it. The client's call (Discord, 2026-09-29, approved by the
  // designer): "use the garnet and sand one … and remove the dark cloud all
  // together". The cloud was `.masthead-shade`, which existed only to keep a
  // floating bar's sand controls legible over the photo. With nothing above the
  // document but the page ground, #91 (garnet above a darkened photo) is moot.
  return { ...listing, masthead };
}

export function entries() {
  return [{}];
}

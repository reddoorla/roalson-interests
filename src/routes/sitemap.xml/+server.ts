import { asLink, type PrismicDocument } from "@prismicio/client";

import { isNetlifyMirrorHost } from "$lib/indexability";
import { createClient, isPlaceholderRepo, linkResolver } from "$lib/prismicio";
import { isSold } from "$lib/property";
import type { RequestHandler } from "./$types";

// Rendered PER REQUEST, not prerendered (#140): a prerendered sitemap lists the
// build origin's URLs on every host the build is served from, including the
// netlify.app mirror. See robots.txt/+server.ts.
export const prerender = false;

/** Indexable routes that exist in the FILESYSTEM rather than in Prismic.
 *
 *  Everything below is discovered by querying the CMS, which structurally
 *  cannot see a hard-coded route — so /contact, linked from the template's own
 *  chrome and returning 200, was missing from the sitemap entirely. It is also
 *  `prerender = false` (a form action cannot live on a prerendered route), so
 *  no build-output census would have caught it either. Emitted even on an
 *  un-wired placeholder clone, because the route exists there too.
 *
 *  Only genuinely public, indexable routes belong here — never /dev/*, the
 *  slice simulator or /preview (see NOINDEX_PREFIXES in $lib/seo). */
// Filesystem routes the CMS cannot see. /properties is the listing page — its
// documents are discovered below, the page itself is not.
const STATIC_ROUTES = ["/properties", "/contact"];

export const GET: RequestHandler = async ({ fetch, url }) => {
  const origin = url.origin;
  // The netlify.app mirror offers nothing to crawl — and so does not spend a
  // Prismic query per request building a list it would throw away.
  const mirror = isNetlifyMirrorHost(url.hostname);

  // One entry per routable document, its path from linkResolver so the sitemap
  // and the site can never disagree about where a document lives ("home"
  // renders at "/"). Sold listings are left out: their pages stay up for links
  // already shared, but carry noindex, and a sitemap that lists a noindexed URL
  // contradicts itself. Empty on an unconfigured starter so the route works
  // before Prismic is wired.
  type Entry = { path: string; lastmod?: string };
  const toEntry = (doc: PrismicDocument) => ({
    path: asLink(doc, { linkResolver }) ?? "",
    lastmod: new Date(doc.last_publication_date ?? Date.now()).toISOString(),
  });
  let docEntries: Entry[] = [];
  if (!mirror && !isPlaceholderRepo) {
    const client = createClient({ fetch });
    const [pages, properties] = await Promise.all([
      client.getAllByType("page"),
      client.getAllByType("property"),
    ]);
    docEntries = [...pages, ...properties.filter((p) => !isSold(p))]
      .map(toEntry)
      .filter((e) => e.path);
  }

  // A static route carries no <lastmod>. While this was prerendered, build time
  // stood in for it; rendered per request, "now" would claim the page changed on
  // every fetch, and a crawler that catches a lastmod lying stops trusting it
  // for the whole sitemap. The element is optional, so omitting it is honest.
  const entries: Entry[] = [
    ...docEntries,
    ...(mirror ? [] : STATIC_ROUTES).map((path) => ({ path })),
  ];

  const urls = entries.map(
    ({ path, lastmod }) => `  <url>
    <loc>${origin}${path}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
  </url>`,
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};

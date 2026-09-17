import { isNetlifyMirrorHost } from "$lib/indexability";
import { createClient, isPlaceholderRepo } from "$lib/prismicio";
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
const STATIC_ROUTES = ["/contact"];

export const GET: RequestHandler = async ({ fetch, url }) => {
  const origin = url.origin;
  // The netlify.app mirror offers nothing to crawl — and so does not spend a
  // Prismic query per request building a list it would throw away.
  const mirror = isNetlifyMirrorHost(url.hostname);

  // One entry per page document ("home" renders at "/"). Empty on an
  // unconfigured starter so the route works before Prismic is wired.
  type Entry = { path: string; lastmod?: string };
  const pageEntries: Entry[] =
    mirror || isPlaceholderRepo
      ? []
      : (await createClient({ fetch }).getAllByType("page")).map((page) => ({
          path: page.uid === "home" ? "/" : `/${page.uid}`,
          lastmod: new Date(page.last_publication_date ?? Date.now()).toISOString(),
        }));

  // A static route carries no <lastmod>. While this was prerendered, build time
  // stood in for it; rendered per request, "now" would claim the page changed on
  // every fetch, and a crawler that catches a lastmod lying stops trusting it
  // for the whole sitemap. The element is optional, so omitting it is honest.
  const entries: Entry[] = [
    ...pageEntries,
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

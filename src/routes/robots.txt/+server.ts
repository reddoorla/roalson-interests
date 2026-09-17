import { isNetlifyMirrorHost } from "$lib/indexability";
import { NOINDEX_ENFORCED, NOINDEX_PREFIXES } from "$lib/seo";
import type { RequestHandler } from "./$types";

// Rendered PER REQUEST, not prerendered (#140). A prerendered robots.txt bakes
// one origin (kit.prerender.origin, from Netlify's URL env) into one file, and
// Netlify serves those bytes on every host the build answers on — so the
// netlify.app mirror advertised a sitemap and could not be told apart from the
// client's domain. Per request, `url.origin` is the host that actually asked.
export const prerender = false;

// Replaces static/robots.txt so the Sitemap line can carry an absolute URL —
// the robots spec requires one, and a static file can't know its own origin.
export const GET: RequestHandler = ({ url }) => {
  // Fence crawlers off the dev/tooling routes (which `prerender = "auto"`
  // still emits as public static HTML) and Prismic preview URLs (which
  // canonicalize to the real page anyway). Content routes stay open. The list
  // is NOINDEX_PREFIXES in $lib/seo — the same one the layout's `noindex` meta
  // reads, so the two cannot drift. On the vite dev server the fence drops
  // entirely (a bare `Disallow:` is the spec's allow-everything rule) so the
  // fleet lighthouse audit can still score the fixtures page.
  //
  // On the netlify.app mirror the Sitemap line is dropped — it would invite the
  // crawl of a duplicate site. Crawling itself is deliberately NOT refused
  // there (no `Disallow: /`): every mirror response carries `X-Robots-Tag:
  // noindex` from netlify/edge-functions/mirror-noindex.ts, and a crawler that
  // is refused the fetch never reads that header, so a disallowed URL can still
  // be listed URL-only.
  const fence = NOINDEX_ENFORCED
    ? NOINDEX_PREFIXES.map((p) => `Disallow: ${p}`).join("\n")
    : "Disallow:";
  const sitemap = isNetlifyMirrorHost(url.hostname) ? "" : `\nSitemap: ${url.origin}/sitemap.xml\n`;
  const body = `User-agent: *
${fence}
${sitemap}`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
};

// Which HOST a request arrived on decides whether it may be indexed (#140).
//
// Every Netlify site answers on two kinds of host from the SAME build: the
// client's domain, and `<site>.netlify.app` (plus `<branch>--<site>` and
// `deploy-preview-N--<site>`). Left alone the netlify.app copy is a full,
// crawlable duplicate of the client's site. This module is the single answer
// to "is this the mirror?", read by the edge function that sets X-Robots-Tag
// (netlify/edge-functions/mirror-noindex.ts) and by robots.txt / sitemap.xml.
//
// DEPENDENCY-FREE ON PURPOSE: the edge function imports this file directly and
// runs on Deno, which cannot resolve `$lib` aliases or SvelteKit modules.

const MIRROR_SUFFIX = ".netlify.app";

/** The X-Robots-Tag value the mirror serves on every response. */
export const MIRROR_ROBOTS_TAG = "noindex, nofollow";

/**
 * True for a `*.netlify.app` host. The predicate is deliberately "this is a
 * netlify.app host", never "this is not <client domain>": it cannot match the
 * client's real domain, needs no edit at DNS cutover, and keeps protecting the
 * mirror after launch, when the duplicate matters most. It matches a whole
 * dot-bounded label, so `netlify.app.example.com` or `mynetlify.app` — someone
 * else's domain — stays indexable.
 */
export function isNetlifyMirrorHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host.endsWith(MIRROR_SUFFIX) && host.length > MIRROR_SUFFIX.length;
}

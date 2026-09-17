// Tell crawlers not to index the site's `*.netlify.app` mirror (#140).
//
// WHY AN EDGE FUNCTION, and not the three cheaper-looking places:
//
//   - netlify.toml [[headers]] / _headers: Netlify header rules match a PATH,
//     never a host, so a noindex there would ride onto the client's real
//     domain and delist the launched site.
//   - a build-time env (CONTEXT / URL / DEPLOY_PRIME_URL): the production
//     deploy is ONE build served on both the client's domain and the
//     netlify.app host, so nothing known at build time can tell them apart.
//   - hooks.server.ts: it only runs for responses the SvelteKit FUNCTION
//     renders. Prerendered pages — nearly every Prismic page — are served
//     straight from the CDN, with identical bytes on every host.
//
// An edge function runs in front of all of those, per request, knowing the
// host. It returns `undefined` on every other host, which continues the request
// chain untouched, so the client's domain is never modified.
//
// Imported with its extension because this file runs on Deno, not Vite.
import { isNetlifyMirrorHost, MIRROR_ROBOTS_TAG } from "../../src/lib/indexability.ts";

interface EdgeContext {
  next: () => Promise<Response>;
}

export default async function mirrorNoindex(
  request: Request,
  context: EdgeContext,
): Promise<Response | undefined> {
  if (!isNetlifyMirrorHost(new URL(request.url).hostname)) return undefined;

  // Re-wrapped rather than mutated in place: a Response obtained by fetch can
  // carry an immutable Headers guard. The body is streamed, never buffered.
  const upstream = await context.next();
  const response = new Response(upstream.body, upstream);
  response.headers.set("X-Robots-Tag", MIRROR_ROBOTS_TAG);
  return response;
}

export const config = {
  path: "/*",
  // Fail OPEN: a broken crawl hint must never take the site down. The cost of
  // a bypass is one un-tagged response, which robots.txt's missing Sitemap
  // line and the empty mirror sitemap still discourage.
  onError: "bypass",
};

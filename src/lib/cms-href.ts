// A CMS Link field as the href a button should carry.
//
// WHY THIS EXISTS. Two of this site's pages — /contact and /properties — are
// filesystem routes, not Prismic documents, so an editor cannot pick them as a
// document link: the only way to point a CMS button at them is a Web link, and
// a Web link wants a URL. What that field ends up holding for the one intent
// "this site's /contact" is a family, not a value:
//
//   /contact                          typed as a path (or seeded that way)
//   contact                           typed bare
//   https:///contact                  the editor glued a scheme onto the path,
//   https://contact                     …or onto the bare word
//   https://www.roalson.com/contact   pasted from the address bar
//
// Rendered as written, the first works, the second resolves against whatever
// page it is on, the next two leave the site for a host that does not exist,
// and the last sends a deploy-preview visitor to production — which, until
// cutover, is still the OLD site. So every one of them is reduced to the path,
// and the path resolves against whatever host is serving.
//
// Document links go through `linkResolver` first, because the client is
// routes-free and the API fills no `url` on them (#10) — the same
// `asLink(field, { linkResolver })` PropertyCard uses.
//
// NOT verified against the live Prismic editor: which of those shapes it
// really stores for a bare path is the scouts' report, not a measurement (the
// repo is not wired yet). The helper takes all of them for that reason.
import { asLink, type LinkField, type LinkResolverFunction } from "@prismicio/client";

/** Hosts that ARE this site, `www.` aside. The client's live domain — the one
 *  an editor will paste. A Netlify or preview host never needs listing: nobody
 *  pastes one into the CMS, and a path needs no host. */
export const SITE_HOSTS: readonly string[] = ["roalson.com"];

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Reduce a URL string to a path on this site when that is what it means;
 *  anything else — a real external URL, `mailto:`, `tel:`, `#anchor`, a
 *  protocol-relative URL — comes back exactly as written. */
const PHONE = /^\+?[\d\s().-]+$/;

export function sitePath(raw: string, siteHosts: readonly string[] = SITE_HOSTS): string {
  const value = raw.trim();
  if (value === "") return value;

  // Already a path. (`//host/…` is protocol-relative — a host, not a path.)
  if (value.startsWith("/")) return value;
  if (value.startsWith("#") || value.startsWith("?")) return value;

  // A phone number typed where a URL was wanted: without this it is a dotless
  // bare word, which below means a route — `/2104965800`, a 404. (An ADDRESS
  // needs no line here: bare, it takes the no-scheme branch, gains `https://`,
  // and is caught with the editor's own `https://user@host` shape further
  // down. A separate regex for it was written first and a mutation showed it
  // was dead code.)
  if (PHONE.test(value) && value.replace(/\D/g, "").length >= 7) {
    return `tel:${value.replace(/[^\d+]/g, "")}`;
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1].toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") return value;

  if (!scheme) {
    // No scheme and no leading slash: a bare word is a route ("contact"); a
    // bare DOMAIN ("example.com/listing") is a host that lost its scheme, and
    // as a relative href it would resolve under the current page.
    const first = value.split(/[/?#]/, 1)[0];
    if (!first.includes(".")) return `/${value}`;
    return sitePath(`https://${value}`, siteHosts);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }

  const rest = `${url.search}${url.hash}`;

  // An email address where a URL was wanted — a CONTACT link's label invites
  // exactly that. Typed bare or with the `https://` an editor's Link field puts
  // in front of it, it parses as "user mhoward at this site's own host, path
  // /", and used to send the visitor to the homepage without a word. A
  // username, no password, and nothing after the host is an address.
  if (url.username && !url.password && url.pathname === "/" && rest === "") {
    return `mailto:${decodeURIComponent(url.username)}@${url.hostname}`;
  }
  const own = siteHosts.some((host) => stripWww(host) === stripWww(url.hostname));
  if (own && url.port === "") return `${url.pathname}${rest}`;

  // A scheme glued onto a path. WHATWG parsing drops the empty host of
  // `https:///contact` and promotes the first segment, so it arrives here as
  // host "contact" — the same shape `https://contact` has. No public host is
  // dotless; `localhost` and anything with a port is a developer's, not an
  // editor's, and is left alone.
  const dotless = /^[a-z0-9-]+$/.test(url.hostname);
  if (dotless && url.hostname !== "localhost" && url.port === "") {
    return `/${url.hostname}${url.pathname === "/" ? "" : url.pathname}${rest}`;
  }

  return value;
}

/** The href for a Prismic Link field, or null when there is nothing to link
 *  to — so a caller renders no anchor rather than an empty one. */
export function cmsHref(
  field: LinkField | null | undefined,
  options: { linkResolver: LinkResolverFunction; siteHosts?: readonly string[] },
): string | null {
  const resolved = asLink(field, { linkResolver: options.linkResolver });
  if (typeof resolved !== "string" || resolved.trim() === "") return null;
  return sitePath(resolved, options.siteHosts);
}

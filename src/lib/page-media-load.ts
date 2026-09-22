/**
 * The `page_media` singleton: media for pages that have no Prismic document.
 *
 * WHY A SINGLETON AND NOT THE `page` TYPE. `/properties` is a filesystem route
 * (`src/routes/[[preview=preview]]/properties/`) — the listing is assembled
 * from `property` documents and no `page` document stands behind it. The
 * obvious home for a masthead image was therefore a `masthead` field on `page`
 * plus a `page` document with uid `properties`, and that is a trap: the
 * catch-all `[uid]` route enumerates every published `page` in `entries()`, so
 * such a document would emit a SECOND prerender entry for `/properties` —
 * competing with the filesystem route that actually renders the listing, and
 * for a path SvelteKit resolves to the static route anyway, so the document's
 * own masthead would never reach a pixel. Closing that would mean teaching
 * `[uid]`'s `entries()` (and its `load`) about a list of paths the filesystem
 * owns: a rule in the CMS's route layer about the router, re-derived by anyone
 * who adds the next filesystem page.
 *
 * A UID-less singleton cannot collide, because a UID is the only thing the
 * catch-all enumerates. It also generalises: /contact is the same shape, and
 * takes one more Image field here rather than one more trap.
 *
 * THE DOCUMENT MAY NOT EXIST. Models reach Prismic through CI and the document
 * is created by an editor afterwards, so "no `page_media` yet" is an ordinary
 * state for this loader — and so is a `page_media` whose image field is empty.
 * Both mean the same thing to the page: the brand gradient (see PageMasthead).
 */
import {
  isFilled,
  NotFoundError,
  RepositoryNotFoundError,
  type ImageField,
} from "@prismicio/client";

import type { PageMediaDocument } from "../prismicio-types";

/** The minimal client surface this loader needs (cf. ListingClient). */
export type PageMediaClient = {
  getSingle(type: "page_media"): Promise<PageMediaDocument>;
};

/**
 * The Properties masthead photo, or `null` when there is none to draw.
 *
 * `null` covers exactly two things — no `page_media` document, and a document
 * whose image field is empty. Everything else throws. That distinction is the
 * point of the `catch`: **`RepositoryNotFoundError` extends `NotFoundError`**,
 * so an `instanceof NotFoundError` test alone would read a misconfigured
 * repository name as "no masthead yet" and quietly ship the gradient on every
 * page of a site whose CMS is not connected at all.
 */
export async function loadPropertiesMasthead(client: PageMediaClient): Promise<ImageField | null> {
  let media: PageMediaDocument;
  try {
    media = await client.getSingle("page_media");
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) throw error;
    if (error instanceof NotFoundError) return null;
    throw error;
  }
  const image = media.data.properties_masthead;
  return isFilled.image(image) ? image : null;
}

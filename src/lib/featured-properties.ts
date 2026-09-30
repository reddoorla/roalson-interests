// Which of the editor's picks the homepage's featured band can actually show.
//
// The band is a PHOTO-led slideshow, and the portfolio is not: on the day this
// was written the live repository held 22 listings and exactly ONE feature
// image (25331 IH 10 West). A listing with no photo would be a slide 542px
// shorter than its neighbours, so it is dropped — as is a past project or an
// archived listing (unlinked or hidden everywhere else too), a relationship to a document that has
// since been unpublished, an empty row, and a listing picked twice. The
// model's placeholder tells the editor so. Of what is left, the band shows the
// first FEATURED_MAX in the editor's order (the client's cap, Figma
// 1908699278); the model's label says "up to 10".
//
// HOW THE LISTINGS GET HERE. Slices do not fetch. The slice's model is a Group
// of content relationships whose `customtypes` entry names the fields to embed
// (title, status, listing_state, size_label, feature_image, highlights.text,
// location), so the page query that loads the `home` document brings each
// listing's fields along inside the relationship, typed by the codegen — no
// second query. (Since #179 that query also names them in `fetchLinks`, built
// from this same model: see $lib/fetch-links.)
//
// THAT EMBEDDING IS OBSERVED on the live `home` document (2026-09-29, #179): the
// Content API answers with `data` on each relationship. It is also how the band
// can vanish: a query whose `fetchLinks` names only other fields REPLACES this
// model's list, every pick arrives filled but bare, and every one is dropped.
// So a bare pick is COUNTED, separately from an editorial drop, and the slice
// prints the counts on its element. `unembedded > 0` on a published page means
// the query did not ask for the fields ($lib/fetch-links), not "the editor
// picked badly".
import { isFilled, type Content, type GeoPointField, type ImageField } from "@prismicio/client";

import { cmsHref } from "$lib/cms-href";
import { linkResolver } from "$lib/prismicio";
import { isListed, propertyHighlights } from "$lib/property";

type FeaturedPick = Content.FeaturedPropertiesSliceDefaultPrimaryPropertiesItem;

export const FEATURED_MAX = 10;

export interface FeaturedSlide {
  /** The listing's document id — the slide's key. */
  id: string;
  /** `/properties/<uid>`, or null when the relationship carries no uid. */
  href: string | null;
  title: string;
  sizeLabel: string;
  image: ImageField<never, "filled">;
  highlights: string[];
  /** The listing's map pin, or null when the GeoPoint is empty. The model's
   *  `customtypes` entry has always asked for `location`, so it was arriving
   *  and being dropped on the floor here; the band's map (#13) is what reads
   *  it. A slide with no pin still shows — the photo is what the band is for,
   *  and the map simply has one fewer marker than the carousel has slides. */
  location: GeoPointField<"filled"> | null;
}

export interface FeaturedListings {
  slides: FeaturedSlide[];
  /** Rows the editor filled. */
  picked: number;
  /** Filled rows that arrived with no `data` at all: the API did not embed the
   *  model's picked fields. Never an editor's doing — see the header. */
  unembedded: number;
}

export function featuredListings(
  picks: readonly FeaturedPick[] | null | undefined,
): FeaturedListings {
  const slides: FeaturedSlide[] = [];
  const seen = new Set<string>();
  let picked = 0;
  let unembedded = 0;

  for (const { property } of picks ?? []) {
    if (!isFilled.contentRelationship(property)) continue;
    picked += 1;
    // Unpublished or deleted since it was picked: there is no page to link to.
    if (property.isBroken) continue;
    const data = property.data;
    if (!data) {
      unembedded += 1;
      continue;
    }
    if (seen.has(property.id)) continue;

    const title = data.title?.trim() ?? "";
    if (title === "" || !isFilled.image(data.feature_image)) continue;
    // `highlights` is absent, not empty, if the embed ever carries the group
    // without its sub-field; the helpers take the structural minimum.
    const listing = {
      data: {
        status: data.status,
        listing_state: data.listing_state ?? null,
        highlights: data.highlights ?? [],
      },
    };
    if (!isListed(listing)) continue;

    seen.add(property.id);
    slides.push({
      id: property.id,
      href: cmsHref(property, { linkResolver }),
      title,
      sizeLabel: data.size_label?.trim() ?? "",
      image: data.feature_image,
      highlights: propertyHighlights(listing),
      location: isFilled.geoPoint(data.location) ? data.location : null,
    });
  }

  return { slides: slides.slice(0, FEATURED_MAX), picked, unembedded };
}

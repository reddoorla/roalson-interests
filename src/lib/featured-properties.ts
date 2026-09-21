// Which of the editor's picks the homepage's featured band can actually show.
//
// The band is a PHOTO-led slideshow, and the portfolio is not: on the day this
// was written the live repository held 22 listings and exactly ONE feature
// image (25331 IH 10 West). A listing with no photo would be a slide 542px
// shorter than its neighbours, so it is dropped — as is a sold listing (its
// card is unlinked everywhere else too), a relationship to a document that has
// since been unpublished, an empty row, and a listing picked twice. The
// model's placeholder tells the editor so.
//
// HOW THE LISTINGS GET HERE. Slices do not fetch. The slice's model is a Group
// of content relationships whose `customtypes` entry names the fields to embed
// (title, status, size_label, feature_image, highlights.text, location), so the
// page query that loads the `home` document brings each listing's fields along
// inside the relationship, typed by the codegen — no second query, no loader
// change, no `fetchLinks`.
//
// THAT EMBEDDING IS DOCUMENTED, NOT YET OBSERVED. No document in the live
// repository holds this slice, so nothing here has seen the Content API answer
// with `data` on the relationship. If it does not, every pick arrives filled
// but bare, every one is dropped, and the band would vanish without a word —
// so a bare pick is COUNTED, separately from an editorial drop, and the slice
// prints the counts on its element. `unembedded > 0` on a published page means
// "add `fetchLinks` to $lib/page-load" (the response shape is the same, and
// nothing in here changes), not "the editor picked badly".
import { isFilled, type Content, type ImageField } from "@prismicio/client";

import { cmsHref } from "$lib/cms-href";
import { linkResolver } from "$lib/prismicio";
import { isSold, propertyHighlights } from "$lib/property";

type FeaturedPick = Content.FeaturedPropertiesSliceDefaultPrimaryPropertiesItem;

export interface FeaturedSlide {
  /** The listing's document id — the slide's key. */
  id: string;
  /** `/properties/<uid>`, or null when the relationship carries no uid. */
  href: string | null;
  title: string;
  sizeLabel: string;
  image: ImageField<never, "filled">;
  highlights: string[];
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
    const listing = { data: { status: data.status, highlights: data.highlights ?? [] } };
    if (isSold(listing)) continue;

    seen.add(property.id);
    slides.push({
      id: property.id,
      href: cmsHref(property, { linkResolver }),
      title,
      sizeLabel: data.size_label?.trim() ?? "",
      image: data.feature_image,
      highlights: propertyHighlights(listing),
    });
  }

  return { slides, picked, unembedded };
}

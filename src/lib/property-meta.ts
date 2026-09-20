import { isFilled } from "@prismicio/client";

import type { PropertyDocument } from "../prismicio-types";
import { isSold, propertyHighlights } from "$lib/property";
import { canonicalUrl } from "$lib/seo";
import { imgix } from "$lib/utils/image";

/** End each part as a sentence, so "Up to 16,700 SF" and "New ownership!"
 *  join into prose rather than a run-on or a doubled full stop. */
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** The description a share card and a search result show when the editor left
 *  Meta Description empty — which, for a client adding listings weekly, is
 *  most of the time. Built from the listing's own size line and highlights, so
 *  it is specific to the property; never a generic sentence repeated on every
 *  listing (see DEFAULT_DESCRIPTION in $lib/seo for why that is worse than
 *  nothing). Undefined when there is nothing specific to say. */
export function propertyDescription(property: PropertyDocument): string | undefined {
  const parts = [property.data.size_label?.trim() ?? "", ...propertyHighlights(property)]
    .filter(Boolean)
    .map(sentence);
  return parts.length ? parts.join(" ") : undefined;
}

/** schema.org structured data for one listing. `RealEstateListing` is a
 *  WebPage subtype; Google offers no rich result for it, so this is emitted
 *  for correctness, not for a SERP feature — do not expect it to change how
 *  a result looks. Only filled values are emitted. */
export function propertyJsonLd(
  property: PropertyDocument,
  canonical: string,
  description?: string,
) {
  const d = property.data;
  const image = d.feature_image?.url ? imgix(d.feature_image.url, { w: 1200 }) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: d.title ?? "",
    url: canonical,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(property.first_publication_date ? { datePosted: property.first_publication_date } : {}),
    ...(isFilled.geoPoint(d.location)
      ? {
          about: {
            "@type": "Place",
            name: d.title ?? "",
            geo: {
              "@type": "GeoCoordinates",
              latitude: d.location.latitude,
              longitude: d.location.longitude,
            },
          },
        }
      : {}),
  };
}

/** The layout's head payload for a property page (see <Seo> in +layout.svelte)
 *  — the same shape pageMeta returns, plus the two things only a listing
 *  supplies: its structured data, and `noindex` once it has sold. */
export function propertyMeta(property: PropertyDocument, url: URL) {
  const d = property.data;
  const description = d.meta_description?.trim() || propertyDescription(property);
  const image = d.meta_image?.url ? d.meta_image : d.feature_image;
  return {
    title: d.title ?? "",
    meta_title: d.meta_title,
    meta_description: description,
    meta_image: image?.url ?? undefined,
    meta_image_alt: image?.alt ?? undefined,
    noindex: isSold(property),
    jsonLd: propertyJsonLd(property, canonicalUrl(url), description),
  };
}

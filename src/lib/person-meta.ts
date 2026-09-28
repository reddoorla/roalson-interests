import type { PersonDocument } from "../prismicio-types";
import { emailHref, isPlaceholderBio, personDisplayName, phoneHref } from "$lib/person";
import { SITE_NAME, canonicalUrl } from "$lib/seo";
import { imgix } from "$lib/utils/image";

/** schema.org `Person` for a profile page. Only filled values are emitted. */
export function personJsonLd(person: PersonDocument, canonical: string) {
  const d = person.data;
  const image = d.photo?.url ? imgix(d.photo.url, { w: 612 }) : undefined;
  const email = emailHref(d.email)?.slice("mailto:".length);
  const telephone = phoneHref(d.phone)?.slice("tel:".length);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: d.name?.trim() ?? "",
    ...(d.role?.trim() ? { jobTitle: d.role.trim() } : {}),
    worksFor: { "@type": "Organization", name: SITE_NAME },
    url: canonical,
    ...(image ? { image } : {}),
    ...(email ? { email } : {}),
    ...(telephone ? { telephone } : {}),
  };
}

/** The layout's head payload for a profile page (see <Seo> in +layout.svelte).
 *  A placeholder biography keeps the page out of search. */
export function personMeta(person: PersonDocument, url: URL) {
  const d = person.data;
  const role = d.role?.trim();
  const description =
    d.meta_description?.trim() ||
    `${personDisplayName(person)}${role ? `, ${role}` : ""} at ${SITE_NAME} — San Antonio commercial real estate.`;
  const image = d.meta_image?.url ? d.meta_image : d.photo;
  return {
    title: personDisplayName(person),
    meta_title: d.meta_title,
    meta_description: description,
    meta_image: image?.url ?? undefined,
    meta_image_alt: image?.alt ?? undefined,
    noindex: isPlaceholderBio(person),
    jsonLd: personJsonLd(person, canonicalUrl(url)),
  };
}

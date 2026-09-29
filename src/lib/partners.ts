// Which partner rows the homepage's "Our Legacy" band can draw, and what each
// card says (#179).
//
// THE PERSON DOCUMENT IS THE ONE SOURCE. A row is a relationship to the
// partner's `person` document plus an optional CONTACT override; the name,
// role, headshot and email are that document's, so an editor renames or
// re-photographs a partner once. Until 2026-09-29 the row carried its own copy
// of all four (decision D10), and nothing checked that the two agreed.
//
// HOW THE FIELDS GET HERE: the model's `customtypes` entry on `profile` names
// them, and $lib/page-load asks the Content API for them with `fetchLinks`
// built from that same entry ($lib/fetch-links says why both, and why the
// list carries the featured band's fields too).
//
// A row is dropped when its Person is unset, unpublished or deleted (`isBroken`
// — /team/<uid> would 404), arrived with no `data`, or has no name. The
// no-`data` case is COUNTED apart from the others, as the featured band does:
// it is never the editor's doing, it means the query did not ask for the
// fields.
import { isFilled, type Content, type ImageField } from "@prismicio/client";

import { cmsHref } from "$lib/cms-href";
import { emailHref } from "$lib/person";
import { linkResolver } from "$lib/prismicio";

type PartnerRow = Content.PartnersSliceDefaultPrimaryPartnersItem;

/** Where CONTACT goes when the row has no link and the Person no email. */
export const CONTACT_FALLBACK = "/contact";

export interface PartnerCard {
  name: string;
  role: string;
  photo: ImageField<never, "filled"> | undefined;
  /** `/team/<uid>`, or null when the relationship resolves to no path. */
  profile: string | null;
  /** The row's override, else `mailto:` the Person's email, else /contact. */
  contact: string;
}

export interface PartnerCards {
  cards: PartnerCard[];
  /** Rows linking a live Person. */
  linked: number;
  /** Live links that arrived with no `data`: the API did not embed the
   *  model's fields. Never an editor's doing — see the header. */
  unembedded: number;
}

export function partnerCards(rows: readonly PartnerRow[] | null | undefined): PartnerCards {
  const cards: PartnerCard[] = [];
  let linked = 0;
  let unembedded = 0;

  for (const row of rows ?? []) {
    const person = row.profile;
    if (!isFilled.contentRelationship(person) || person.isBroken) continue;
    linked += 1;
    const data = person.data;
    if (!data) {
      unembedded += 1;
      continue;
    }
    const name = data.name?.trim() ?? "";
    if (name === "") continue;
    cards.push({
      name,
      role: data.role?.trim() ?? "",
      photo: isFilled.image(data.photo) ? data.photo : undefined,
      profile: cmsHref(person, { linkResolver }),
      contact:
        cmsHref(row.contact_link, { linkResolver }) ?? emailHref(data.email) ?? CONTACT_FALLBACK,
    });
  }
  return { cards, linked, unembedded };
}

// A `person` document's contact fields as links. Both are editor TEXT, so both
// answer null on anything unusable rather than throwing: `office.ts`'s
// `telHref` throws on purpose for the one hard-coded number, and a throw here
// would turn a typo in the CMS into a 500.
import type { PersonDocument } from "../prismicio-types";

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** One plain address → a `mailto:` href; anything else → null. */
export function emailHref(text: string | null | undefined): string | null {
  const address = text?.trim() ?? "";
  return EMAIL.test(address) ? `mailto:${address}` : null;
}

/** A ten-digit US number, however it is punctuated → a `tel:` href; anything
 *  else → null. A leading country code 1 is accepted. */
export function phoneHref(text: string | null | undefined): string | null {
  const digits = (text ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `tel:+1${digits}` : null;
}

/** The editor has marked the biography as a stand-in (operator decision
 *  2026-09-28): the page shows a chip, is noindexed and left out of the
 *  sitemap. */
export const isPlaceholderBio = (person: Pick<PersonDocument, "data">): boolean =>
  person.data.bio_is_placeholder === true;

/** "Matt Howard" or "Jonathan Collins, CCIM". */
export function personDisplayName(person: Pick<PersonDocument, "data">): string {
  const name = person.data.name?.trim() ?? "";
  const credentials = person.data.credentials?.trim() ?? "";
  return credentials ? `${name}, ${credentials}` : name;
}

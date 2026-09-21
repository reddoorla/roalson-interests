// The firm's one office — the ONE place its address and numbers are written.
// The footer reads it on every page; the contact page and the site's
// RealEstateAgent JSON-LD are its next two readers. It is structured rather
// than a list of display lines because `organizationJsonLd` (seo.ts) wants a
// PostalAddress, and lines cannot be turned back into one.
//
// THE ZIP IS NOT THE COMP'S. Every frame of the design prints the last address
// line as "San Antonio, TX 7825" — four digits, ten times over, at every width
// and on both pages. The client's own live site prints
// "17721 Rogers Ranch Parkway - Suite 125 - San Antonio - Texas - 78258" and
// "(210) 496-5800 Phone - (210) 496-5809 Fax" (roalson.com/mainFrame.htm, and
// the footer of every listing page). The comp dropped a digit; this follows
// the client. office.test.ts pins the five digits so a "fix" back to the comp
// goes red.
import type { OrganizationInput } from "$lib/seo";

/** A US number as people read it → the `tel:` href a phone dials. Derived, so
 *  the link cannot drift from the digits printed beside it. Throws on anything
 *  that is not ten digits rather than shipping a link that dials nowhere. */
export function telHref(display: string): string {
  const digits = display.replace(/\D/g, "");
  if (digits.length !== 10) {
    throw new Error(`"${display}" is not a ten-digit US number — cannot build a tel: link from it`);
  }
  return `tel:+1${digits}`;
}

const PHONE = "(210) 496-5800";

export const OFFICE = {
  street: "17721 Rogers Ranch Parkway",
  suite: "Suite 125",
  city: "San Antonio",
  region: "TX",
  postalCode: "78258",
  phone: { display: PHONE, href: telHref(PHONE) },
  /** On the client's live site; HIDDEN in every frame of the comp (6843:829),
   *  so nothing renders it yet. No href: nobody taps a fax number. */
  fax: { display: "(210) 496-5809" },
} as const;

/** The address as the comp sets it — three lines. */
export function officeAddressLines(): string[] {
  return [OFFICE.street, OFFICE.suite, `${OFFICE.city}, ${OFFICE.region} ${OFFICE.postalCode}`];
}

/** The same address as schema.org's PostalAddress, in the shape
 *  `organizationJsonLd` takes. The suite rides in `streetAddress`, which is
 *  where schema.org puts it. */
export function officePostalAddress(): NonNullable<OrganizationInput["address"]> {
  return {
    streetAddress: `${OFFICE.street}, ${OFFICE.suite}`,
    addressLocality: OFFICE.city,
    addressRegion: OFFICE.region,
    postalCode: OFFICE.postalCode,
  };
}

/** A plain Google Maps link to the building — no API key, no script, no CSP
 *  host (the same kind of link as property.ts's `mapsUrl`). The suite is left
 *  out: it sends Maps looking for a business listing instead of the address. */
export function officeDirectionsUrl(): string {
  const query = `${OFFICE.street}, ${OFFICE.city}, ${OFFICE.region} ${OFFICE.postalCode}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

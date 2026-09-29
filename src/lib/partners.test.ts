import { describe, expect, it } from "vitest";
import type { Content } from "@prismicio/client";

import { CONTACT_FALLBACK, partnerCards } from "./partners";

type Row = Content.PartnersSliceDefaultPrimaryPartnersItem;

/** One row of the live `home` document as the Content API answers it with the
 *  Person's four fields embedded — read 2026-09-29 (master ref arrWohIAAC4AQLFQ),
 *  photo trimmed to the keys the card reads. */
const LIVE_ROW = {
  profile: {
    id: "arrAaRIAACoAQHGr",
    type: "person",
    tags: [],
    lang: "en-us",
    slug: "matt-howard",
    first_publication_date: "2026-09-28T21:05:38+0000",
    last_publication_date: "2026-09-28T21:05:38+0000",
    uid: "matt-howard",
    data: {
      name: "Matt Howard",
      role: "Partner",
      photo: {
        dimensions: { width: 612, height: 612 },
        alt: "Matt Howard",
        copyright: null,
        url: "https://images.prismic.io/roalson-interests/FQHPWT2UEH21pF58_partner-matt-howard.jpg?auto=format%2Ccompress&rect=0%2C0%2C847%2C847&w=612&h=612",
        id: "FQHPWT2UEH21pF58",
        edit: { x: 0, y: 0, zoom: 1, background: "#ffffff" },
      },
      email: "mhoward@roalson.com",
    },
    link_type: "Document",
    key: "5cfa479b-b502-4029-b78e-b3897548f568",
    isBroken: false,
  },
  contact_link: { link_type: "Any" },
} as unknown as Row;

const withProfile = (profile: object): Row => ({ ...LIVE_ROW, profile }) as unknown as Row;

describe("partnerCards", () => {
  it("draws a live Person's card entirely from the Person", () => {
    const { cards, linked, unembedded } = partnerCards([LIVE_ROW]);
    expect(cards).toEqual([
      {
        name: "Matt Howard",
        role: "Partner",
        photo: (LIVE_ROW.profile as { data: { photo: unknown } }).data.photo,
        profile: "/team/matt-howard",
        contact: "mailto:mhoward@roalson.com",
      },
    ]);
    expect([linked, unembedded]).toEqual([1, 0]);
  });

  it("drops an unpublished Person without counting it as linked", () => {
    // What the API sends for a link whose document is unpublished: no uid, no data.
    const gone = withProfile({
      id: "arrAaxIAACwAQHGx",
      type: "person",
      tags: [],
      lang: "en-us",
      link_type: "Document",
      isBroken: true,
    });
    expect(partnerCards([gone])).toEqual({ cards: [], linked: 0, unembedded: 0 });
  });

  it("drops a live Person the API sent without its fields, and counts it", () => {
    const { data: _, ...bare } = LIVE_ROW.profile as { data: unknown };
    expect(partnerCards([withProfile(bare)])).toEqual({ cards: [], linked: 1, unembedded: 1 });
  });

  it("drops an unset row, and answers an absent group with nothing", () => {
    expect(partnerCards([withProfile({ link_type: "Any" })]).cards).toEqual([]);
    expect(partnerCards(undefined)).toEqual({ cards: [], linked: 0, unembedded: 0 });
    expect(partnerCards(null).cards).toEqual([]);
  });

  it("falls back to /contact when there is neither an override nor a usable email", () => {
    const person = LIVE_ROW.profile as { data: object };
    const noEmail = withProfile({ ...person, data: { ...person.data, email: null } });
    expect(partnerCards([noEmail]).cards[0].contact).toBe(CONTACT_FALLBACK);
  });
});

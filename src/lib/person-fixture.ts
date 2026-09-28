import type { PersonDocument } from "../prismicio-types";

/** A `person` document for the dev routes, the a11y fixtures and tests: Matt
 *  Howard with a PLACEHOLDER biography, which is the launch state. The bio says
 *  nothing about him — he is a real person and has not supplied one. No photo
 *  by default; pass `photo: PARTNER_PHOTO_FIXTURE` ($lib/home-fixture) for one. */
export function personFixture(
  data: Partial<PersonDocument["data"]> = {},
  doc: Partial<Omit<PersonDocument, "data">> = {},
): PersonDocument {
  return {
    id: "fixture-person-matt",
    uid: "matt-howard",
    type: "person",
    lang: "en-us",
    tags: [],
    url: null,
    href: "",
    slugs: [],
    linked_documents: [],
    alternate_languages: [],
    first_publication_date: "2026-09-28T00:00:00+0000",
    last_publication_date: "2026-09-28T00:00:00+0000",
    ...doc,
    data: {
      name: "Matt Howard",
      credentials: null,
      role: "Partner",
      photo: {},
      email: "mhoward@roalson.com",
      phone: "(210) 496-5800",
      license: null,
      bio: [
        {
          type: "paragraph",
          text: "Placeholder biography. Matt Howard's biography has not been supplied yet; this paragraph holds its place until his own words replace it.",
          spans: [],
        },
      ],
      bio_is_placeholder: true,
      meta_title: null,
      meta_description: null,
      meta_image: {},
      ...data,
    },
  } as PersonDocument;
}

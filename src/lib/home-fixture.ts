// The homepage as fixture data — what /dev/home renders through the real
// layout, and what /dev/a11y-fixtures and the unit tests build on. `/` answers
// 404 until the Prismic repo is wired and a `home` document exists, so this is
// where the homepage is reviewed until then.
//
// ONE builder per band, and `homeFixture()` strings them together in page
// order. Every later homepage batch adds its band's builder here and one line
// to `homeFixture()` — nothing else about /dev/home needs to change.
import type { Content } from "@prismicio/client";

type HomeHeroPrimary = Content.HomeHeroSlice["primary"];

/** A generated poster for the `?poster` state of /dev/home: flat blocks in the
 *  brand's own tones, so the crop (`object-position: 50% 68.2%`) has something
 *  to be read against. It is a drawing, not a photograph — the comp's hero
 *  still is a watermarked iStock preview (#3) and never enters this repo — and
 *  it is inline so the fixture depends on no host. */
const POSTER_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">` +
  `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#b2ac9f"/><stop offset="1" stop-color="#e8e1d1"/>` +
  `</linearGradient></defs>` +
  `<rect width="1600" height="900" fill="url(#s)"/>` +
  `<g fill="#3d0707">` +
  `<rect x="0" y="640" width="1600" height="260"/>` +
  `<rect x="140" y="420" width="180" height="240"/>` +
  `<rect x="380" y="300" width="140" height="360"/>` +
  `<rect x="600" y="470" width="260" height="190"/>` +
  `<rect x="930" y="220" width="120" height="440"/>` +
  `<rect x="1110" y="380" width="220" height="280"/>` +
  `<rect x="1390" y="500" width="150" height="160"/>` +
  `</g></svg>`;

export const HOME_POSTER_FIXTURE = {
  url: `data:image/svg+xml,${encodeURIComponent(POSTER_SVG)}`,
  alt: "",
  dimensions: { width: 1600, height: 900 },
  copyright: null,
  id: "fixture-home-poster",
  edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
};

/** The `home_hero` slice, filled with the comp's own words (6802:1428,
 *  6806:51, 6802:1437, 6802:1441, 6802:1459). Pass `primary` to override.
 *
 *  No poster and no Vimeo id by default: that IS the launch state (operator
 *  call 11 — the hero runs on the dark ground until a licensed photo exists).
 *
 *  The two buttons deliberately store their targets two different ways. Both
 *  routes are filesystem routes an editor can only reach through a Web link,
 *  and `https:///contact` is what the editor makes of a typed `/contact` — so
 *  every render of this fixture runs $lib/cms-href end to end. */
export function homeHeroFixture(primary: Partial<HomeHeroPrimary> = {}): Content.HomeHeroSlice {
  return {
    id: "fixture-home-hero",
    slice_type: "home_hero",
    slice_label: null,
    variation: "default",
    version: "initial",
    primary: {
      poster: {},
      vimeo_id: null,
      // "\n" is how Prismic stores Shift+Enter; the comp has U+2028 there.
      heading: [
        {
          type: "heading1",
          text: "San Antonio's Commercial Real Estate Experts.\nSince 1983.",
          spans: [],
        },
      ],
      buttons: [
        { label: "Contact us", link: { link_type: "Web", url: "https:///contact" } },
        { label: "Our portfolio", link: { link_type: "Web", url: "/properties" } },
      ],
      specialty_label: "Our specialty",
      specialties: [
        { text: "Consulting and brokerage" },
        { text: "Acquisition and disposition properties" },
        { text: "Buyer and tenant representation" },
      ],
      ...primary,
    },
    items: [],
  } as unknown as Content.HomeHeroSlice;
}

type PhotoBandPrimary = Content.PhotoBandSlice["primary"];

/** A generated picture for the `?photo` state of /dev/home: a 3:2 drawing in
 *  the brand's own tones, NOT a photograph — the comp's photo is unlicensed
 *  Unsplash stock (#3) and never enters this repo. Inline, so the fixture
 *  depends on no host.
 *
 *  It is drawn to make the band's crop legible, which is `cover` anchored to
 *  the bottom: the dark ground strip along its foot must sit ON the band's
 *  bottom edge at every width, and the garnet stripe across its top 100 units
 *  is never seen WHERE THE COMP HAS A FRAME — the band crops 160px (320 units)
 *  off the top at 1440, 53px at 1280 and 20px (148 units) at 390. It IS seen
 *  at layout widths 1009–1199 (measured: a 42px garnet bar at 1024): there the
 *  800px band is taller than a full-width 3:2 picture, so `cover` crops the
 *  SIDES and nothing off the top. That is the fixture being honest about the
 *  crop, not a broken band. */
const PHOTO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="2880" height="1920" viewBox="0 0 2880 1920">` +
  `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="#b2ac9f"/><stop offset="1" stop-color="#f2efe9"/>` +
  `</linearGradient></defs>` +
  `<rect width="2880" height="1920" fill="url(#s)"/>` +
  `<rect width="2880" height="100" fill="#652323"/>` +
  `<g fill="#652323">` +
  `<rect x="180" y="1180" width="300" height="560"/>` +
  `<rect x="560" y="900" width="220" height="840"/>` +
  `<rect x="860" y="1320" width="420" height="420"/>` +
  `<rect x="1400" y="700" width="200" height="1040"/>` +
  `<rect x="1680" y="1060" width="360" height="680"/>` +
  `<rect x="2140" y="1260" width="260" height="480"/>` +
  `<rect x="2480" y="1000" width="240" height="740"/>` +
  `</g>` +
  `<rect y="1720" width="2880" height="200" fill="#3d0707"/>` +
  `</svg>`;

export const HOME_PHOTO_FIXTURE = {
  url: `data:image/svg+xml,${encodeURIComponent(PHOTO_SVG)}`,
  alt: "A drawn skyline standing on a dark ground strip",
  dimensions: { width: 2880, height: 1920 },
  copyright: null,
  id: "fixture-home-photo",
  edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
};

/** The `photo_band` slice. EMPTY by default: that IS the launch state — no
 *  licensed photo exists yet, so the band is the garnet gradient at the comp's
 *  height. Pass `{ image: HOME_PHOTO_FIXTURE }` for the filled state. */
export function photoBandFixture(primary: Partial<PhotoBandPrimary> = {}): Content.PhotoBandSlice {
  return {
    id: "fixture-photo-band",
    slice_type: "photo_band",
    slice_label: null,
    variation: "default",
    version: "initial",
    primary: { image: {}, ...primary },
    items: [],
  } as unknown as Content.PhotoBandSlice;
}

type PartnersPrimary = Content.PartnersSlice["primary"];
type PartnerRow = PartnersPrimary["partners"][number];

/** A generated headshot for the `?photos` state of /dev/home: a bust in the
 *  brand's tones, so the 153px box and its `object-cover` crop can be read. A
 *  drawing, not a photograph — both headshots in the comp are placeholders of
 *  unknown licence (#3) and never enter this repo — and inline, so the fixture
 *  depends on no host. Square, as the model's crop constraint is. */
const HEADSHOT_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 612">` +
  `<rect width="612" height="612" fill="#b2ac9f"/>` +
  `<circle cx="306" cy="236" r="112" fill="#652323"/>` +
  `<path d="M74 612c0-128 104-214 232-214s232 86 232 214z" fill="#652323"/>` +
  `</svg>`;

export const PARTNER_PHOTO_FIXTURE = {
  url: `data:image/svg+xml,${encodeURIComponent(HEADSHOT_SVG)}`,
  alt: "",
  dimensions: { width: 612, height: 612 },
  copyright: null,
  id: "fixture-partner-headshot",
  edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
};

/** A bio for the `?bio` state. It is about the FIXTURE on purpose: these are
 *  real people, neither has given the site a bio, and an invented one is one
 *  seed script away from being published. Two paragraphs, so the space
 *  between them can be measured. */
export const PARTNER_BIO_FIXTURE = [
  {
    type: "paragraph",
    text: "Fixture copy, not a biography. The partners' bios are written in Prismic, and neither has one yet, so this paragraph stands in for one: PROFILE appears on a card only when its bio is filled, and this is what it opens.",
    spans: [],
  },
  {
    type: "paragraph",
    text: "A second paragraph, so the space between two of them can be measured. It says nothing about anyone.",
    spans: [],
  },
];

/** One partner row. Bare by default — no photo, no bio, no contact link —
 *  which is every partner's launch state: the card is text only, PROFILE does
 *  not render, and CONTACT falls back to /contact (operator call 12). */
export function partnerFixture(row: Partial<PartnerRow> = {}): PartnerRow {
  return {
    name: "Matt Howard",
    role: "Partner",
    photo: {},
    contact_link: { link_type: "Any" },
    bio: [],
    ...row,
  } as unknown as PartnerRow;
}

/** The `partners` slice — the "Our Legacy" band — with the comp's own words
 *  (6820:119, 6802:1477, 6822:489) and its two VISIBLE rows (6822:491,
 *  6822:505; the founder's row 6822:457 is hidden at every width). Pass
 *  `primary` to override; `partners: [partnerFixture({...}), …]` for the rows.
 *
 *  No buttons: the comp draws none under the body. */
export function partnersFixture(primary: Partial<PartnersPrimary> = {}): Content.PartnersSlice {
  return {
    id: "fixture-partners",
    slice_type: "partners",
    slice_label: null,
    variation: "default",
    version: "initial",
    primary: {
      eyebrow: "Our legacy",
      heading: [
        {
          type: "heading2",
          text: "Representing Your Best Interests in Acquisition and Disposition",
          spans: [],
        },
      ],
      body: [
        {
          type: "paragraph",
          text: "Roalson Interests was formed in 1983. The firm specializes in commercial / investment brokerage, site selection and tenant representation. Roalson Interests has extensive experience in corporate America real estate acquisition and surplus property disposition as well as representation of individual clients. The firm has also completed a variety of consulting assignments for the real estate community, financial institutions, law firms and government.",
          spans: [],
        },
        {
          type: "paragraph",
          text: "Roalson Interests has a reputation for leadership and exceptional client service in metropolitan San Antonio and South Texas.",
          spans: [],
        },
      ],
      buttons: [],
      partners: [partnerFixture(), partnerFixture({ name: "Bart Wilson" })],
      ...primary,
    },
    items: [],
  } as unknown as Content.PartnersSlice;
}

/** The partner cards' other states, as /dev/home's query string asks for them:
 *  `bio` gives the FIRST partner a bio (so one card has PROFILE and one does
 *  not, side by side), `photos` gives both a headshot. Neither is the default
 *  because neither is the launch state. */
export function partnersFixtureState(state: {
  bio?: boolean;
  photos?: boolean;
}): Content.PartnersSlice {
  const photo = state.photos ? { photo: PARTNER_PHOTO_FIXTURE } : {};
  return partnersFixture({
    partners: [
      partnerFixture({ ...photo, ...(state.bio ? { bio: PARTNER_BIO_FIXTURE } : {}) } as never),
      partnerFixture({ name: "Bart Wilson", ...photo } as never),
    ],
  });
}

// ── Featured properties ─────────────────────────────────────────────────────

type FeaturedPrimary = Content.FeaturedPropertiesSlice["primary"];
type FeaturedPick = FeaturedPrimary["properties"][number];
type FeaturedListingData = NonNullable<Extract<FeaturedPick["property"], { id: string }>["data"]>;

/** A generated stand-in for a listing photo, at the band's own 928 × 542 ratio:
 *  flat blocks in the brand's tones, a different skyline per listing so a
 *  dissolve between two of them can be SEEN. Drawings, not photographs — the
 *  comp's slide photos are not in this repo (#3), and a fixture depends on no
 *  host. */
function listingDrawing(id: string, blocks: [number, number, number, number][], alt: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1856 1084">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#b2ac9f"/><stop offset="1" stop-color="#f2efe9"/>` +
    `</linearGradient></defs>` +
    `<rect width="1856" height="1084" fill="url(#s)"/>` +
    `<g fill="#652323">` +
    blocks.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join("") +
    `</g><rect y="820" width="1856" height="264" fill="#3d0707"/></svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    alt,
    dimensions: { width: 1856, height: 1084 },
    copyright: null,
    id: `fixture-featured-${id}`,
    edit: { x: 0, y: 0, zoom: 1, background: "transparent" },
  };
}

/** One row of the slice's `properties` Group: a content relationship as the
 *  Content API returns it WITH the model's picked fields embedded. Pass
 *  `relationship` to override the link itself (`{ isBroken: true }`,
 *  `{ data: undefined }` for a pick the API did not embed). */
export function featuredPickFixture(
  uid: string,
  id: string,
  data: Partial<FeaturedListingData> = {},
  relationship: Record<string, unknown> = {},
): FeaturedPick {
  return {
    property: {
      link_type: "Document",
      id,
      uid,
      type: "property",
      tags: [],
      lang: "en-us",
      slug: uid,
      first_publication_date: "2026-09-21T16:54:38+0000",
      last_publication_date: "2026-09-21T16:54:38+0000",
      isBroken: false,
      data: {
        title: uid,
        status: "Available",
        size_label: null,
        feature_image: {},
        highlights: [],
        location: {},
        ...data,
      },
      ...relationship,
    },
  } as unknown as FeaturedPick;
}

/** The three listings the comp features (6843:993 / 6843:1089 / 6846:1185),
 *  in the client's own words from the seeded documents; the `id`s are those
 *  documents' (scripts/seed/listings.state.json). Slide 1 carries the comp's
 *  two bullets — the live listing has five, see `featuredLaunchFixture`. */
const featuredPicks = (): FeaturedPick[] => [
  featuredPickFixture("25331-ih-10-west", "arFgoxIAAC4ALcBx", {
    title: "25331 IH 10 West",
    size_label: "Up to 16,700 SF",
    feature_image: listingDrawing(
      "25331",
      [
        [180, 470, 620, 350],
        [860, 560, 420, 260],
        [1360, 380, 300, 440],
      ],
      "Drawing standing in for the photo of 25331 IH 10 West",
    ) as never,
    highlights: [
      { text: "New Ownership and Property Management!" },
      { text: "Great visibility and excellent location in the far NW submarket" },
    ],
    location: { latitude: 29.6572, longitude: -98.6297 },
  }),
  featuredPickFixture("101-w-commerce-street", "arFhaRIAACcALcQN", {
    title: "101 W. Commerce Street",
    size_label: "7,863 SF",
    feature_image: listingDrawing(
      "101",
      [
        [260, 160, 360, 660],
        [680, 300, 300, 520],
        [1040, 90, 420, 730],
      ],
      "Drawing standing in for the photo of 101 W. Commerce Street",
    ) as never,
    highlights: [
      {
        text: "The property is one block from the San Antonio River Walk, across the street from Main Plaza and the San Fernando Cathedral.",
      },
      {
        text: "The property is also one block away from the new apartment project called, “300 Main.”",
      },
    ],
    location: { latitude: 29.4246, longitude: -98.4946 },
  }),
  featuredPickFixture("13810-lookout-road", "arFhUhIAACkALcOD", {
    title: "13810 Lookout Road",
    size_label: "4,230 SF",
    feature_image: listingDrawing(
      "13810",
      [
        [120, 600, 900, 220],
        [1100, 520, 560, 300],
      ],
      "Drawing standing in for the photo of 13810 Lookout Road",
    ) as never,
    highlights: [
      { text: "Excellent accessibility to IH 35 and Loop 1604" },
      {
        text: "Office area consists of three offices, wet bar/break area and large open office with counter",
      },
    ],
    location: { latitude: 29.5702, longitude: -98.3358 },
  }),
];

/** The `featured_properties` slice as the comp draws it: three listings with
 *  photos. Pass `primary` to override — `{ properties: [] }` is the empty band. */
export function featuredPropertiesFixture(
  primary: Partial<FeaturedPrimary> = {},
): Content.FeaturedPropertiesSlice {
  return {
    id: "fixture-featured-properties",
    slice_type: "featured_properties",
    slice_label: null,
    variation: "default",
    version: "initial",
    primary: {
      heading: "Featured Properties",
      properties: featuredPicks(),
      ...primary,
    },
    items: [],
  } as unknown as Content.FeaturedPropertiesSlice;
}

/** What the band holds on launch day. The editor picks the comp's three and
 *  ONE of them has a photo (25331 IH 10 West — measured on the live repository
 *  2026-09-21: 22 listings, one feature image — here with that document's five
 *  bullets). So this is the ONE-slide state: no arrows, no bar, no rotation. */
export function featuredLaunchFixture(
  primary: Partial<FeaturedPrimary> = {},
): Content.FeaturedPropertiesSlice {
  const picks = featuredPicks();
  const data = (pick: FeaturedPick) =>
    (pick.property as unknown as { data: FeaturedListingData }).data;
  data(picks[0]).highlights = [
    { text: "Office Bldg: 975 - 10,000SF" },
    { text: "Retail Bldg: 1200 - 6700SF" },
    ...data(picks[0]).highlights,
    { text: "Good access to the IH 10 and Ralph Fair intersection" },
  ] as FeaturedListingData["highlights"];
  for (const pick of picks.slice(1)) data(pick).feature_image = {} as never;
  return featuredPropertiesFixture({ properties: picks as never, ...primary });
}

/** /dev/home's `?featured=` states: "one" is launch day (above); "none" is a
 *  band whose every pick is photo-less — the empty state, which draws no band
 *  at all. Anything else leaves the slices as they are. */
export function stageFeatured<T extends { slice_type: string }>(
  slices: readonly T[],
  state: string | null,
): T[] {
  if (state !== "one" && state !== "none") return [...slices];
  const launch = featuredLaunchFixture();
  const staged =
    state === "one"
      ? launch
      : featuredPropertiesFixture({ properties: launch.primary.properties.slice(1) as never });
  return slices.map((slice) =>
    slice.slice_type === "featured_properties" ? (staged as unknown as T) : slice,
  );
}

/** The homepage's slices, in page order — the shape of `page.data.slices` on
 *  the `home` document. The photo band is LAST, as in the comp: it only pins
 *  as the last thing in <main> (see app.css). */
export function homeFixture(
  hero: Partial<HomeHeroPrimary> = {},
  photo: Partial<PhotoBandPrimary> = {},
): Content.PageDocument["data"]["slices"] {
  return [
    homeHeroFixture(hero),
    featuredPropertiesFixture(),
    // "Our Legacy" — in page order it follows the featured-properties band.
    partnersFixture(),
    // LAST, always: the photo band only pins as the last thing in <main>.
    photoBandFixture(photo),
  ];
}

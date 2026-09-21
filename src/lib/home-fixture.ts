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
 *  must NEVER be seen — the band crops 160px (320 units) off the top at 1440
 *  and 20px (148 units) at 390. */
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

/** The homepage's slices, in page order — the shape of `page.data.slices` on
 *  the `home` document. The photo band is LAST, as in the comp: it only pins
 *  as the last thing in <main> (see app.css). */
export function homeFixture(
  hero: Partial<HomeHeroPrimary> = {},
  photo: Partial<PhotoBandPrimary> = {},
): Content.PageDocument["data"]["slices"] {
  return [homeHeroFixture(hero), photoBandFixture(photo)];
}

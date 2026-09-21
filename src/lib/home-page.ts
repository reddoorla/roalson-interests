// The home route's shape, as data.
//
// The homepage claims `navOver: "dark"` — the bar floats over its first band in
// the reverse tone and the layout does not pad <main>. That claim is a literal
// in the route's load, made before any CMS content has been read, so it has to
// be true of EVERY `home` document: one whose editor dragged a text slice above
// the hero, or deleted the hero outright, would otherwise put a white wordmark
// on an off-white page with src/routes/nav-over.test.ts still green.
//
// So the route does not leave the hero to the SliceZone. It lifts the first
// `home_hero` out of the document's slices, renders it FIRST and
// unconditionally — with no slice, HomeHero still paints the dark 528px ground —
// and hands the rest to the SliceZone in the editor's order.
import type { Content } from "@prismicio/client";

type PageSlices = Content.PageDocument["data"]["slices"];
type PageSlice = PageSlices[number];

export interface HomeSlices {
  /** The first `home_hero` in the document, wherever the editor put it. */
  hero: Content.HomeHeroSlice | undefined;
  /** Every other slice, in document order. A SECOND `home_hero` stays here and
   *  renders where the editor put it: visibly wrong in a preview beats
   *  silently dropped. */
  rest: PageSlice[];
}

export function splitHomeHero(slices: readonly PageSlice[] | null | undefined): HomeSlices {
  const all = [...(slices ?? [])];
  const at = all.findIndex((slice) => slice.slice_type === "home_hero");
  if (at === -1) return { hero: undefined, rest: all };
  const [hero] = all.splice(at, 1);
  return { hero: hero as Content.HomeHeroSlice, rest: all };
}

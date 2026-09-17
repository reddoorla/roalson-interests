import { describe, expect, it } from "vitest";

import { pageMeta } from "./page-meta";
import type { PageDocument } from "../prismicio-types";

// The five keys here are exactly what +layout.svelte's <Seo> reads from
// page.data (title / meta_title / meta_description / meta_image /
// meta_image_alt). Rename one and this test, not a silent blank <title>, fails.
//
// Left untyped (not `as PageDocument`) so it stays a plain object — that's
// what lets the spread below build a variant of it; each call site below
// casts to PageDocument only where pageMeta requires it.
const page = {
  uid: "team",
  type: "page",
  data: {
    title: [{ type: "heading1", text: "Our Team", spans: [] }],
    meta_title: "Our Team | Clinic",
    meta_description: "Meet the team.",
    meta_image: { url: "https://images.prismic.io/og.png", alt: "Team photo" },
    slices: [],
  },
};

describe("pageMeta", () => {
  it("maps a page document onto the layout's <Seo> payload", () => {
    expect(pageMeta(page as unknown as PageDocument)).toEqual({
      title: "Our Team",
      meta_title: "Our Team | Clinic",
      meta_description: "Meet the team.",
      meta_image: "https://images.prismic.io/og.png",
      meta_image_alt: "Team photo",
    });
  });

  it("is undefined-safe when the SEO tab is empty", () => {
    const bare = { ...page, data: { ...page.data, meta_image: undefined } };
    expect(pageMeta(bare as unknown as PageDocument)).toMatchObject({
      title: "Our Team",
      meta_image: undefined,
      meta_image_alt: undefined,
    });
  });
});

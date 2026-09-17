import { asText } from "@prismicio/client";

import type { PageDocument } from "../prismicio-types";

/** The layout's SEO/head payload for a page document (see <Seo> in
 *  +layout.svelte). Shared by both `[[preview]]` loaders so the two stay
 *  identical.
 *  The optional chaining on meta_image is deliberate — Prismic's empty-image
 *  shape has changed across API versions, so an unfilled image never throws. */
export function pageMeta(page: PageDocument) {
  return {
    title: asText(page.data.title),
    meta_description: page.data.meta_description,
    meta_title: page.data.meta_title,
    meta_image: page.data.meta_image?.url,
    meta_image_alt: page.data.meta_image?.alt ?? undefined,
  };
}

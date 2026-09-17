/**
 * Alt text for the testimonial avatar.
 *
 * `PrismicImage` only lets code declare an image *decorative* (`alt=""` /
 * `fallbackAlt=""`); any real alternative text has to come off the image field
 * itself. So the fallback chain is resolved here and written back onto the
 * field the component renders:
 *
 *   1. the alt authored on the asset in Prismic (the editor knows best),
 *   2. the credited person's name (what the headshot depicts),
 *   3. `null` — no alt to offer, so the component hands `PrismicImage` a
 *      `fallbackAlt=""` and the avatar becomes decorative. An `<img>` with no
 *      alt attribute at all is an axe `image-alt` violation; an empty one is
 *      correct here, because the credit text sits right beside the image.
 *
 * Whitespace-only values count as absent — Prismic hands back `""` for a
 * cleared Text field, and a stray space in an alt box should not win over the
 * name. The chosen value is returned trimmed.
 */
export function resolveAvatarAlt(
  authoredAlt: string | null | undefined,
  name: string | null | undefined,
): string | null {
  return authoredAlt?.trim() || name?.trim() || null;
}

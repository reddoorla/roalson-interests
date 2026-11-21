/**
 * Helpers for serving responsively-sized Prismic and Unsplash (imgix) images.
 *
 * Prismic image URLs are imgix URLs, so appending `w`/`auto`/`q` query params
 * makes the CDN return a correctly-sized, modern-format (WebP/AVIF) image.
 * Without a width param the full-resolution source is shipped — typically the
 * single largest Lighthouse performance cost (multi-MB heroes served into
 * ~800px boxes). See `srcset()` / `imgix()` below.
 */

const PRISMIC_IMAGE_HOST = "images.prismic.io";

/** Unsplash serves its photos through imgix too, so the same `w`/`auto`/`q`
 *  params size them. A photo picked from a Prismic image field's Unsplash tab
 *  is stored as this host's URL with no width: the full original. */
const UNSPLASH_IMAGE_HOST = "images.unsplash.com";

/** Width breakpoints used to build srcset candidates (device-pixel aware). */
export const DEFAULT_IMAGE_WIDTHS = [480, 768, 1024, 1440, 1920, 2560];

/**
 * True when `url` is a Prismic/imgix asset we can transform with query params.
 * Matches on the parsed hostname (not a substring) so a non-imgix URL that
 * merely mentions the host in its path can't be rewritten.
 */
export function isPrismicImageUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  try {
    return new URL(url).hostname === PRISMIC_IMAGE_HOST;
  } catch {
    return false;
  }
}

/** True when `url` is on an imgix-backed host whose sizing params we can set:
 *  Prismic's, or Unsplash's. Hostname match, as in `isPrismicImageUrl`. */
export function isResizableImageUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  try {
    const host = new URL(url).hostname;
    return host === PRISMIC_IMAGE_HOST || host === UNSPLASH_IMAGE_HOST;
  } catch {
    return false;
  }
}

/**
 * Return `url` with imgix params applied. Always sets `auto=format,compress`.
 * URLs on any other host, or malformed, are returned unchanged.
 */
export function imgix(
  url: string | null | undefined,
  params: Record<string, string | number> = {},
): string {
  if (!url) return "";
  if (!isResizableImageUrl(url)) return url;
  const u = new URL(url);
  u.searchParams.set("auto", "format,compress");
  // Prismic crop URLs ship `rect` + `w` + `h` together. Overriding only `w`
  // would leave the stale `h` behind, and imgix's default `fit=clip` then caps
  // the real output width to preserve that (now wrong) box — so the srcset
  // width descriptor would lie about the delivered pixels. Setting one
  // dimension drops the other unless the caller supplies both.
  if ("w" in params && !("h" in params)) u.searchParams.delete("h");
  if ("h" in params && !("w" in params)) u.searchParams.delete("w");
  for (const [key, value] of Object.entries(params)) {
    u.searchParams.set(key, String(value));
  }
  return u.toString();
}

/**
 * Build a width-descriptor srcset for a Prismic or Unsplash image URL.
 * Returns `undefined` for any other URL so the attribute can be omitted.
 */
export function srcset(
  url: string | null | undefined,
  widths: number[] = DEFAULT_IMAGE_WIDTHS,
): string | undefined {
  if (!isResizableImageUrl(url)) return undefined;
  return widths.map((w) => `${imgix(url, { w })} ${w}w`).join(", ");
}

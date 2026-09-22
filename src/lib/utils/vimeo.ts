/**
 * True when the Vimeo video exists and is embeddable (oEmbed responds 200).
 *
 * Intended for server-side load functions: validating the ID up front lets a
 * page fall back to its poster instead of rendering a dead player iframe.
 * The explicit User-Agent matters — Vimeo's oEmbed endpoint rejects requests
 * without one (Node's fetch sends none by default).
 */
export async function checkVimeoVideo(videoId: string): Promise<boolean> {
  if (!videoId) return false;

  try {
    const response = await fetch(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}`,
      {
        headers: {
          "User-Agent": "SvelteKit App",
        },
      },
    );

    return response.ok;
  } catch (error) {
    console.error(`Failed to check Vimeo video ${videoId}:`, error);
    return false;
  }
}

/** Digits only — the shape `home_hero.vimeo_id` is modelled as, and the ONLY
 *  shape this module ever hands back. */
const DIGITS = /^\d+$/;

/** A pasted Vimeo URL, which is what an editor copies out of the address bar
 *  far more often than the bare id the field's placeholder asks for.
 *  `vimeo.com/123`, `https://vimeo.com/123?share=copy`, `player.vimeo.com/
 *  video/123` and the unlisted `vimeo.com/123/abcdef` all resolve to `123`.
 *  Anchored on both sides of the host, so `evilvimeo.com` and `vimeo.com.evil`
 *  match nothing. */
const VIMEO_URL = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*vimeo\.com\/(?:video\/)?(\d+)(?:[/?#]|$)/i;

/**
 * The Vimeo id in whatever the editor actually typed, or `null`.
 *
 * `vimeo_id` is a free-text CMS field whose value is interpolated into an
 * iframe `src`. Nothing stops an editor pasting a URL, a stray space, or —
 * since it is free text — something that would change the meaning of that URL
 * (`123?autoplay=1`, `123/../evil`, a whole other origin). So the id is parsed
 * rather than trusted, and the return value is ALWAYS `^\d+$` or `null`:
 * callers can interpolate it without escaping, and an unparseable field means
 * no player rather than a malformed one.
 */
export function parseVimeoId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "") return null;
  if (DIGITS.test(value)) return value;
  const match = VIMEO_URL.exec(value);
  return match ? match[1] : null;
}

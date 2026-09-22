import { readFileSync } from "node:fs";
import adapter from "@sveltejs/adapter-netlify";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { SVELTE_EVENT_REPLAY_HASH } from "@reddoorla/maintenance/configs/svelte";

const slicemachine = JSON.parse(
  readFileSync(new URL("./slicemachine.config.json", import.meta.url), "utf-8"),
);
const PLACEHOLDER_SENTINEL = "your-prismic-repo-name";
const isPlaceholderRepo =
  (process.env.VITE_PRISMIC_ENVIRONMENT || slicemachine.repositoryName) === PLACEHOLDER_SENTINEL;

// The env-var route to the sentinel is a LOCAL-ONLY hatch (#120). Set in CI
// or on Netlify it makes `entries()` return [] so `/` is never prerendered,
// then tolerates the resulting 404s — a green build with no home page, from a
// variable that is invisible in the diff and persists indefinitely. Refuse it
// at module load so the failure is loud at the point someone reaches for it.
// The sentinel IN slicemachine.config.json is untouched: that is the
// documented fresh-clone state, and it is visible in the repo.
// Mirrored in tests/smoke/routes.ts, which reads the same variable.
if (
  process.env.VITE_PRISMIC_ENVIRONMENT === PLACEHOLDER_SENTINEL &&
  (process.env.CI || process.env.NETLIFY)
) {
  throw new Error(
    `VITE_PRISMIC_ENVIRONMENT=${PLACEHOLDER_SENTINEL} is a local-only hatch and is set in ` +
      "CI/Netlify: it would green a deploy that emits no home page (every Prismic route " +
      "prerenders as a tolerated 404). Unset it there; a site whose Prismic repository is " +
      "not ready should stay red, or keep the sentinel in slicemachine.config.json.",
  );
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    warningFilter: (warning) => warning.code !== "element_invalid_self_closing_tag",
  },
  kit: {
    adapter: adapter(),
    // Until a clone is wired to a real Prismic repo, every Prismic-backed
    // route returns 404 during prerender. Tolerate that on the placeholder
    // so `pnpm build` (and Netlify CI) succeed; real sites still fail loudly
    // because `repositoryName` no longer matches the sentinel.
    prerender: {
      // Prerendered pages bake `url.origin` (canonical and og:url, via
      // $lib/seo) into their output at build time; without this it would be
      // SvelteKit's "http://sveltekit-prerender" placeholder. Netlify sets URL
      // to the site's production origin during builds. Local builds keep the
      // placeholder, which only shows up in build/ output, never in dev.
      // robots.txt and sitemap.xml are NOT prerendered: they must answer per
      // host, so the netlify.app mirror can differ from the real domain (#140).
      ...(process.env.URL ? { origin: process.env.URL } : {}),
      handleHttpError: ({ path, status, message, referrer }) => {
        if (isPlaceholderRepo && status === 404) {
          return;
        }
        throw new Error(
          `${status} ${path}${referrer ? ` (linked from ${referrer})` : ""}: ${message}`,
        );
      },
      // A malformed URL in CMS-pasted rich text (e.g. a school name typed into a
      // hyperlink) is unparseable — it can never be a real route to crawl, and
      // one editor's typo must not fail the whole build. Warn (so it surfaces
      // for cleanup) and keep prerendering. Unlike handleHttpError's fail-loud
      // 404 policy, an invalid URL has no valid interpretation to preserve.
      handleInvalidUrl: ({ href, referrer, message }) => {
        console.warn(
          `[prerender] skipped invalid URL ${JSON.stringify(href)}` +
            `${referrer ? ` (linked from ${referrer})` : ""} — fix the CMS link` +
            `${message ? ` [${message}]` : ""}`,
        );
      },
    },
    alias: {
      $components: "src/lib/components",
      "$components/*": "src/lib/components/*",
      $utils: "src/lib/utils",
      "$utils/*": "src/lib/utils/*",
      $stores: "src/lib/stores",
      "$stores/*": "src/lib/stores/*",
      $assets: "src/lib/assets",
      "$assets/*": "src/lib/assets/*",
    },
    // Baseline CSP for Prismic + Vimeo + Turnstile + Google Fonts. EXTEND PER
    // PROJECT — every new host (a Typekit kit, YouTube, a donation platform,
    // analytics, Maps) must be added to the relevant directive or the browser
    // blocks it silently. SvelteKit adds nonces for the inline scripts it emits;
    // styles are covered by 'unsafe-inline' below, which is LOAD-BEARING: the
    // template sets style attributes (ContentBand's fallback height, the
    // animate-in transitions, app.html) and a nonce never authorises a style
    // *attribute* — removing it silently breaks those in production only.
    csp: {
      mode: "auto",
      // Violations POST to /api/csp-report. To stage a stricter policy without
      // blocking, copy `directives` below into a sibling `reportOnly: { ... }`
      // block — SvelteKit will then emit a Content-Security-Policy-Report-Only
      // header alongside the enforced one.
      directives: {
        "default-src": ["self"],
        "object-src": ["none"],
        "script-src": [
          "self",
          "https://static.cdn.prismic.io",
          "https://player.vimeo.com",
          // Svelte 5 server-renders `onload="this.__e=event"` (and onerror) on
          // every element carrying an attribute spread — i.e. every
          // `<img {...getImageProps(field)} />` the Prismic helpers produce.
          // It is the replay stub for a load/error that fires before hydration.
          // A nonce NEVER covers an event-handler attribute, so without both of
          // the entries below the browser refuses to run it: the pre-hydration
          // load is dropped (anything keyed on it can strand) and one violation
          // is POSTed to /api/csp-report per image per page view — 12 on `/`
          // alone, measured on beachfront-dentistry 2026-08-13 — burying real
          // violations. 'unsafe-hashes' widens hash matching to event handlers
          // and NOTHING else, so only this exact one-liner is permitted; pair it
          // with 'unsafe-inline' and that guarantee is gone (scripts/csp-policy.test.ts
          // asserts we do not). The hash is imported, never transcribed: the
          // stub's text is upstream's to change, and a copied string cannot be
          // told apart from a stale one.
          //
          // Both entries sit in script-src to match the shared baseline in
          // @reddoorla/maintenance/configs/svelte (verified there in Chrome,
          // 2026-08-17). This file overrides script-src wholesale, so it has to
          // carry them itself.
          //
          // This comment used to say the `script-src-attr` form (vida-legacy-
          // foundation's) was avoided because Safari ignores that directive and
          // falls back to script-src. That was asserted without a measurement
          // (#132), and a measurement refuted it (2026-09-16, re
          // vida-legacy-foundation#79): Playwright's WebKit 26.5 and Chromium
          // 151 behaved identically. Handler ran / blocked, WebKit / Chromium:
          //   vida's served policy (allowance in script-src-attr)   ran / ran
          //   the same policy minus script-src-attr                 blocked / blocked
          //   control, no allowance                                 blocked / blocked
          //   control, 'unsafe-hashes' + hash in script-src         ran / ran
          // So WebKit honours script-src-attr, and both forms work in both
          // engines. Caveat: that is Playwright's WebKit build, not a shipping
          // Safari.app. The form here is a consistency choice, not a Safari
          // workaround.
          "unsafe-hashes",
          SVELTE_EVENT_REPLAY_HASH,
          // Cloudflare Turnstile contact-form widget (enable via PUBLIC_TURNSTILE_SITE_KEY).
          "https://challenges.cloudflare.com",
        ],
        // Google Fonts stylesheet host (paired with fonts.gstatic.com under
        // font-src). Self-hosted fonts need nothing extra.
        "style-src": ["self", "unsafe-inline", "https://fonts.googleapis.com"],
        "img-src": ["self", "data:", "https://*.prismic.io"],
        // Prismic hosts non-image media (e.g. .mp4 assets) on
        // <repo>.cdn.prismic.io — first-party content, same origin family as
        // images.prismic.io already allowed under img-src.
        "media-src": ["self", "https://*.vimeocdn.com", "https://*.prismic.io"],
        "frame-src": [
          "self",
          "https://player.vimeo.com",
          // Cloudflare Turnstile renders its challenge in an iframe from this host.
          "https://challenges.cloudflare.com",
        ],
        // THE PROPERTY MAP'S ONLY CSP ENTRY (#13). Measured in Chromium
        // against the built site on 2026-09-22: with the policy otherwise
        // untouched, `https://tiles.openfreemap.org` is the single blocked
        // host, and adding it here alone takes the map to zero violations.
        //
        // What it covers is everything, and that is not obvious: MapLibre
        // fetches the style JSON, the TileJSON, the vector .pbf tiles, the
        // low-zoom Natural Earth raster .png AND the sprite sheet and the
        // glyph .pbf ranges with `fetch()` — never as an <img> or a webfont —
        // so img-src and font-src need nothing. Its worker is same-origin
        // (see $lib/map-engine on why that takes an explicit URL), so it
        // resolves through child-src to `script-src 'self'` and worker-src
        // needs nothing either. NO 'unsafe-eval': MapLibre 6 compiles its
        // style expressions without it.
        //
        // The host is a pair with PUBLIC_MAP_STYLE_URL's default
        // ($lib/property-map). Point that variable at a keyed provider and
        // this line is the other half of the swap.
        "connect-src": ["self", "https://*.prismic.io", "https://tiles.openfreemap.org"],
        "font-src": ["self", "data:", "https://fonts.gstatic.com"],
        "base-uri": ["self"],
        "form-action": ["self"],
        "frame-ancestors": ["self"],
        // report-uri is deprecated in favour of report-to, but Firefox still
        // honours only report-uri and SvelteKit exposes no report-to hook.
        "report-uri": ["/api/csp-report"],
      },
    },
  },
  preprocess: vitePreprocess(),
};

export default config;

// Committed per-site smoke manifest. `tests/smoke/pages.spec.ts` iterates this
// list, asserting each route returns its expected status and paints a hydration
// marker with no console errors. This ships the SAFE DEFAULT every reddoor-starter
// clone inherits; each site's figma-slices build grows the list as real routes
// land (add `{ path, name, hydrationMarker }` entries).
//
// NOTE on the default `/` entry: on the bare placeholder starter, `/`
// intentionally 404s (getByUID("page","home") can't resolve against the
// placeholder repo → error(404)), so the entry below gates its expectation on
// the repository name — mirroring `isPlaceholderRepo` in src/lib/prismicio.ts
// and the entries() prerender guard in the home route. The moment a fork wires
// a real Prismic repo in slicemachine.config.json, the same entry expects 200
// with zero edits. The hydration marker `footer` is the shared layout footer,
// present on every page including the error page.

// Playwright runs this file as native ESM in Node, where JSON imports require
// the explicit attribute (unlike Vite-bundled src/lib/prismicio.ts).
import slicemachineConfig from "../../slicemachine.config.json" with { type: "json" };

export type SmokeRoute = {
  /** Route path to visit, e.g. "/" or "/about". */
  path: string;
  /** Human-readable label used in the test title. */
  name: string;
  /** CSS selector asserted visible after load (hydration proof). Default: skip. */
  hydrationMarker?: string;
  /** Expected HTTP status. Default: 200. */
  expectStatus?: number;
};

// Same resolution order as src/lib/prismicio.ts (VITE_PRISMIC_ENVIRONMENT
// override, then slicemachine.config.json). This file runs in the Playwright
// process, so read process.env rather than import.meta.env.
const PLACEHOLDER_SENTINEL = "your-prismic-repo-name";
const repositoryName = process.env.VITE_PRISMIC_ENVIRONMENT || slicemachineConfig.repositoryName;
const isPlaceholderRepo = repositoryName === PLACEHOLDER_SENTINEL;

// The env-var route to the sentinel is a LOCAL-ONLY hatch (#120). Under CI or
// Netlify it would flip `/`'s expectation to 404 and pass — the smoke half of a
// gate agreeing with a build that emitted no home page. Throw, never flip:
// Playwright fails to load this manifest and the run exits non-zero. Mirrors
// the guard in svelte.config.js, which reads the same variable at build time.
if (
  process.env.VITE_PRISMIC_ENVIRONMENT === PLACEHOLDER_SENTINEL &&
  (process.env.CI || process.env.NETLIFY)
) {
  throw new Error(
    `VITE_PRISMIC_ENVIRONMENT=${PLACEHOLDER_SENTINEL} is a local-only hatch and is set in ` +
      "CI/Netlify: it would make this smoke run expect no home page and pass. Unset it " +
      "there; a site whose Prismic repository is not ready should stay red, or keep the " +
      "sentinel in slicemachine.config.json.",
  );
}

export const smokeRoutes: SmokeRoute[] = [
  isPlaceholderRepo
    ? // Bare starter: home intentionally 404s until Prismic is wired (see the
      // NOTE above). Surface that in the test title so a green run can't be
      // mistaken for a wired-up 200.
      {
        path: "/",
        name: "home — placeholder repo, expecting 404",
        hydrationMarker: "footer",
        expectStatus: 404,
      }
    : { path: "/", name: "home", hydrationMarker: "footer" },
];

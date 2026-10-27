// A prerendered file may name this site only as the production origin,
// https://roalson-interests.netlify.app: never kit 3's placeholder and never
// over plain http. Kit 3 prerenders with the placeholder origin
// "http://sveltekit-prerender" (paths.origin is deliberately unset:
// sveltekit.config.js says why), and $lib/seo's siteOrigin swaps it for
// Netlify's URL, which vite.config.ts hands in at build time. A read of
// page.url that skips siteOrigin builds green and ships the placeholder;
// Beachfront's three review rounds (beachfront-dentistry#90) showed a source
// scan never lists every spelling of that read, so this checks the output: it
// builds the site exactly as Netlify does, with URL set to the production
// origin, and fails on any built file that names a wrong one. Copied from
// beachfront-dentistry's scripts/prerender-origin.mjs (reddoor-maintenance
// P1-53), via revogen#108 and medical-solutions-of-texas#91.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const PLACEHOLDER = "http://sveltekit-prerender";
// The bare host, so an encoded (`http%3A%2F%2Fsveltekit-prerender`), host-only
// or protocol-relative form of the placeholder is caught too. A clean build
// names it nowhere outside `_app/immutable`.
const NEEDLE = "sveltekit-prerender";
const PRODUCTION = "https://roalson-interests.netlify.app";
// This host over plain http: an origin assembled from page.url.protocol keeps
// the placeholder's "http:" and names the right host, so the needle above
// never sees it; percent-encoded too, as in a share link (revogen#108).
const WRONG_ORIGIN = /http(?::|%3A)(?:\/\/|%2F%2F)roalson-interests\.netlify\.app(?![\w-]|\.\w)/i;
// The production origin as a whole origin (not a prefix of another host), for
// the control's count. A regex, not `includes`: CodeQL reads a URL literal in
// `includes` as a host check (js/incomplete-url-substring-sanitization).
const CARRIES_PRODUCTION = /https:\/\/roalson-interests\.netlify\.app(?![\w.-])/;
// Built files that carry the production origin whatever the CMS holds: every
// prerendered page's canonical and og:url, so the home page and the listings
// index. (robots.txt and sitemap.xml are not prerendered here: they answer per
// host, #140.)
const CONTROL_FILES = ["index.html", "properties.html"];

export function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Built files that name the placeholder or a wrong origin, and which name production. */
export function scan(root) {
  const files = walk(root).filter((f) => !/[\\/]_app[\\/]immutable[\\/]/.test(f));
  const offenders = [];
  const production = [];
  for (const file of files) {
    // Every file, whatever its extension (a prerendered endpoint can be named
    // anything); a NUL byte marks a binary (image, font), which cannot carry it.
    const bytes = readFileSync(file);
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    if (text.includes(NEEDLE) || WRONG_ORIGIN.test(text)) offenders.push(relative(root, file));
    if (CARRIES_PRODUCTION.test(text)) production.push(relative(root, file));
  }
  return { files: files.length, offenders, production };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const env = { ...process.env, URL: PRODUCTION };
  delete env.VITEST;
  const built = spawnSync("pnpm", ["exec", "vite", "build"], {
    env,
    stdio: "inherit",
  });
  if (built.status !== 0) process.exit(built.status ?? 1);
  const { files, offenders, production } = scan("build");
  // Offenders first: a page built from `url` also drops out of the control's
  // count below, whose message would hide the real defect.
  if (offenders.length > 0) {
    console.error(
      `prerender-origin: ${offenders.length} built file(s) carry ${PLACEHOLDER}, ` +
        `kit 3's prerender placeholder, or this host over http, instead of ${PRODUCTION}. In code, ` +
        `build absolute URLs through $lib/seo's siteOrigin or canonicalUrl, never from page.url or ` +
        `a load's url directly. A link an editor typed into Prismic (http://roalson-...) lands ` +
        `in the page's __data.json too: fix that one in Prismic, not here.\n  ` +
        offenders.join("\n  "),
    );
    process.exit(1);
  }
  // The instrument's control: a build that emitted nothing, or that never
  // took the production URL, would pass the checks above vacuously. Measured
  // 2026-10-24: 72 files outside _app/immutable, 53 carrying the production
  // origin; the control names two pages rather than a count, which a listing
  // archived in Prismic would move.
  const missing = CONTROL_FILES.filter((f) => !production.includes(f));
  if (missing.length > 0) {
    console.error(
      `prerender-origin: expected ${missing.join(", ")} to carry ${PRODUCTION}; ` +
        `the build has ${files} files, ${production.length} naming it`,
    );
    process.exit(1);
  }
  console.log(
    `prerender-origin: ${files} built files, ${production.length} carry ${PRODUCTION}, none a wrong origin`,
  );
}

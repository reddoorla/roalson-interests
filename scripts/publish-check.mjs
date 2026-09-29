// THE MAP'S FILES ARE IN WHAT IS PUBLISHED, AT THE PATH THE MAP ASKS FOR (#120).
//
// Runs after every `vite build` (package.json's `build`), which is the one
// place that always runs after a build: CI, `pnpm verify`, Netlify's deploy and
// the preview gate's own webServer all build through that script.
//
// WHY IT EXISTS. The property map requests three files by ABSOLUTE URL at
// runtime — its style (`DEFAULT_MAP_STYLE_URL`) and the two opening pictures
// (`MAP_HOME[*].file`, as inline `url(/…)`). The dev server serves `static/`
// directly, and every browser gate runs against the dev server, so if
// `static/` stopped reaching the publish directory, or a `kit.paths.base` put
// the site under a prefix, the map would boot with NO STYLE — MapLibre draws a
// blank canvas and logs nothing a gate reads — and every test would pass.
//
// WHAT IT OBSERVES, named for exactly that: the bytes in the publish directory
// at the root, compared with `static/`, and the base the BUILT server manifest
// was compiled with. It does not serve anything: it is what a build produced,
// not what a CDN answers.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Everything the map requests by absolute URL. scripts/publish-check.test.ts
 *  asserts this is exactly `DEFAULT_MAP_STYLE_URL` and `MAP_HOME`'s files, so
 *  a fourth one cannot be added to the map without being added here. */
export const MAP_FILES = ["map-style.json", "map-home-full.webp", "map-home-compact.webp"];

/** netlify.toml's `publish`; the test holds the two together. */
export const PUBLISH_DIR = "build";

/**
 * What is wrong with `publish` for `files`, as sentences; [] when nothing is.
 *
 * `appDir` and `appPath` are the built server manifest's: SvelteKit writes
 * `appPath` as `<base without its slash>/<appDir>`, so the two differ exactly
 * when the site was built under a base path.
 */
export function publishProblems({
  root,
  appDir,
  appPath,
  publish = PUBLISH_DIR,
  files = MAP_FILES,
}) {
  const problems = [];
  if (appPath !== appDir)
    problems.push(
      `the site was built under a base path (appPath "${appPath}", appDir "${appDir}"), and ` +
        `the map requests ${files.map((f) => `/${f}`).join(", ")} from the ORIGIN root — ` +
        "they would 404 and the map would draw nothing. Make those URLs base-relative first.",
    );
  for (const file of files) {
    const published = join(root, publish, file);
    if (!existsSync(published)) {
      problems.push(
        `${publish}/${file} is missing: the map requests /${file} and the publish ` +
          "directory does not carry it (is static/ still copied into it?).",
      );
      continue;
    }
    if (!readFileSync(published).equals(readFileSync(join(root, "static", file))))
      problems.push(
        `${publish}/${file} is not static/${file}: the map would load bytes the ` +
          "repository does not have.",
      );
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const manifestPath = join(root, ".svelte-kit", "output", "server", "manifest.js");
  const { manifest } = await import(pathToFileURL(manifestPath).href);
  const problems = publishProblems({
    root,
    appDir: manifest.appDir,
    appPath: manifest.appPath,
  });
  if (problems.length) {
    console.error(`publish-check: ${problems.length} problem(s) with the map's files (#120):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `publish-check: ${MAP_FILES.join(", ")} are in ${PUBLISH_DIR}/ at the root, ` +
      "byte-identical to static/",
  );
}

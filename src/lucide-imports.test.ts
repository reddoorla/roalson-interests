import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// `@lucide/svelte` (and its `./icons` alias) is a barrel over ~1,500 icons,
// each its own .svelte file, and reaching it makes Vitest transform all of
// them in every worker that imports a component that imports it. Measured
// (#97): Modal.test.ts 27.89s (transform 23.10s) through the barrel, 2.89s
// (transform 1.66s) through `@lucide/svelte/icons/x`. Same component either way.
//
// Resolved from the project root: under jsdom `import.meta.url` is not a file:
// URL (see reduced-motion-reset.test.ts).
const ROOT = process.cwd();

/** Where Vitest reaches (vite.config.ts `test.include`). */
const SCANNED = ["src", "scripts"];
const CODE = /\.(svelte|ts|js|mjs)$/;

/** A static import/export or a dynamic import, and the specifier it names.
 *  Anchored to the start of a statement, so a comment that quotes the barrel
 *  (PropertyMap.svelte's does) is not an import. */
const SPECIFIER =
  /(?:^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*|\bimport\(\s*)(["'])(@lucide\/svelte[^"']*)\1/gm;
const DEEP = /^@lucide\/svelte\/icons\/[a-z0-9-]+$/;

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* files(rel);
    else if (CODE.test(entry.name)) yield rel;
  }
}

function lucideImports(): Array<[file: string, specifier: string]> {
  const found: Array<[string, string]> = [];
  for (const dir of SCANNED) {
    for (const rel of files(dir)) {
      for (const m of readFileSync(join(ROOT, rel), "utf8").matchAll(SPECIFIER)) {
        found.push([rel, m[2]]);
      }
    }
  }
  return found;
}

describe("@lucide/svelte imports", () => {
  const found = lucideImports();

  it("sees an icon import that exists — the scan is not blind", () => {
    expect(found).toContainEqual(["src/lib/components/Modal.svelte", "@lucide/svelte/icons/x"]);
  });

  it("takes every icon by its deep path, never the barrel", () => {
    expect(found.filter(([, spec]) => !DEEP.test(spec))).toEqual([]);
  });
});

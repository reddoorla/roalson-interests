import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Tailwind's source scan reads every text file the repo does not gitignore, and
// ships whatever spells a whole utility — markup or not. On 2026-09-21 the built
// CSS carried rules for Tailwind's default red that nothing rendered: their only
// sources were a COMMENT in Form.svelte recording the classes it had replaced,
// the same sentence in two tests, and docs/workJournal.md. The rendered-HTML
// guards (Field.test.ts, Form.test.ts) cannot see this — Svelte strips comments.
//
// So this reads what Tailwind reads. The default palette is the class worth
// holding: none of it is in the theme, so theme-contrast.test.ts measures none
// of it, and a utility that is spelled is one `class=` away from being spent.
//
// Resolved from the project root: under jsdom `import.meta.url` is not a file:
// URL (see reduced-motion-reset.test.ts).
const ROOT = process.cwd();

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
/** A whole colour utility from the default palette, variants and all. */
const UTILITY = new RegExp(
  `(?<![\\w-])(?:[\\w-]+(?:\\[[^\\]\\s]*\\])?:)*` +
    `(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow)` +
    `-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?(?![\\w-])`,
  "g",
);

/** Where code lives. docs/ is not here because app.css takes it out of the scan. */
const SCANNED = ["src", "tests", "scripts"];
const TEXT = /\.(svelte|ts|js|mjs|cjs|html|json|css|md)$/;

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* files(rel);
    else if (TEXT.test(entry.name)) yield rel;
  }
}

describe("what Tailwind's source scan can see", () => {
  it("spells no default-palette utility — in markup, a comment or a test", () => {
    const found: Record<string, string[]> = {};
    for (const dir of SCANNED) {
      for (const rel of files(dir)) {
        const hits = readFileSync(join(ROOT, rel), "utf8").match(UTILITY);
        if (hits) found[rel] = [...new Set(hits)].sort();
      }
    }
    // Empty since Slider.svelte's six greys went to tokens (#58), which were
    // the one listed exception.
    expect(found).toEqual({});
  });

  it("does not read docs/, where the journal names old classes on purpose", () => {
    const css = readFileSync(resolve(ROOT, "src/app.css"), "utf8");
    expect(css).toMatch(/^@source not "\.\.\/docs";$/m);
  });
});

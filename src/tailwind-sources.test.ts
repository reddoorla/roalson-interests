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

/** Slider.svelte is the template's carousel, mounted only on /dev/a11y-fixtures,
 *  and still wears the template's greys. Found and left by the contact batch,
 *  and tracked as an issue rather than a comment; listed here so the day they
 *  go, this goes red and the exception is deleted with them. */
/** This file spells KNOWN's utilities, so it is skipped — and ships nothing new
 *  by it: every one of them is already spent by the file it is listed under. */
const SELF = "src/tailwind-sources.test.ts";

const KNOWN: Record<string, string[]> = {
  "src/lib/components/Slider.svelte": [
    "bg-gray-500",
    "bg-gray-800",
    "group-active:bg-gray-700",
    "group-hover:bg-gray-600",
    "hover:bg-gray-200",
    "text-gray-700",
  ],
};

describe("what Tailwind's source scan can see", () => {
  it("spells no default-palette utility — in markup, a comment or a test", () => {
    const found: Record<string, string[]> = {};
    for (const dir of SCANNED) {
      for (const rel of files(dir)) {
        if (rel === SELF) continue;
        const hits = readFileSync(join(ROOT, rel), "utf8").match(UTILITY);
        if (hits) found[rel] = [...new Set(hits)].sort();
      }
    }
    expect(found).toEqual(KNOWN);
  });

  it("does not read docs/, where the journal names old classes on purpose", () => {
    const css = readFileSync(resolve(ROOT, "src/app.css"), "utf8");
    expect(css).toMatch(/^@source not "\.\.\/docs";$/m);
  });
});

// Generates docs/COMPONENTS.md — the inventory of behaviour this repo already
// has, so an agent recognises it instead of having to remember to go looking.
//
// WHY THIS AND NOT A CHECK. A test or a CI audit that catches a reinvented
// component fires after the component has been written: the hour is already
// spent and the only thing saved is the merge. Three times in two days a slice
// in this repo re-derived something $lib already shipped — Slider.svelte,
// actions/trapFocus.ts, and prefersReducedMotion — and in every case the agent
// had read CLAUDE.md and still never opened the directory. The missing thing was
// never a rule. It was the DATA: nowhere in this repo does the string
// "Slider.svelte" appear next to the word "carousel".
//
// WHY PROP NAMES CARRY IT. Deliberately no `@provides` tags to author: a tag
// nobody updates is worse than no tag, and the tax falls on exactly the person
// who is already not reading the directory. A module's prop names are its
// capability surface and they cost nothing to extract — `autoplay`, `showDots`,
// `showArrows`, `loop`, `mode` on Slider says "carousel" more plainly than a
// sentence would, and they cannot drift from the code because they ARE the code.
//
//   node scripts/capability-index.mjs           # write docs/COMPONENTS.md
//   node scripts/capability-index.mjs --check    # exit 1 if it is stale
//
// Staleness is caught by scripts/capability-index.test.ts, which runs inside
// `pnpm verify` already — the --check form is for hooks and CI that want an exit
// code without a test runner. Either way that check IS retroactive, and
// correctly so: what it guards is the INDEX going stale, never the reuse
// decision. The index itself is the pre-cost half, and it only works if it is
// read before the work starts.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Where shared behaviour lives: all of `src/lib` except the slices themselves.
 *
 * This began as an explicit list — components, actions, utils, stores — and the
 * test below caught it immediately: `transitions.ts` sits at the TOP level of
 * src/lib and was invisible, and `prefersReducedMotion` (one of the three
 * modules actually re-derived) is exported from it. An allowlist of directories
 * is a guess about where people put things; the exclusion is the honest shape,
 * because a new shared directory then appears without anyone remembering to add
 * it here.
 */
export const SOURCES = ["src/lib"];

/** Slices are the CALLERS. Listing them would bury the things they can reuse. */
export const EXCLUDE = ["src/lib/slices"];

const isTest = (f) => /\.(test|spec)\.[jt]s$/.test(f);
const isSource = (f) => /\.(svelte|ts|js)$/.test(f) && !isTest(f) && !f.endsWith(".d.ts");

/** Every source module under SOURCES, repo-relative, sorted. */
export function listModules(root = ROOT, sources = SOURCES, exclude = EXCLUDE) {
  const out = new Set();
  const walk = (dir) => {
    if (!existsSync(join(root, dir)) || exclude.includes(dir)) return;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (isSource(entry.name)) out.add(rel);
    }
  };
  sources.forEach(walk);
  return [...out].sort();
}

/** `export`ed names in a script. `indented` for one inside a <script> tag. */
function exportsOf(source, names, indented = false) {
  const at = indented ? "^\\s*" : "^";
  for (const m of source.matchAll(
    new RegExp(
      `${at}export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+([a-zA-Z_$][\\w$]*)`,
      "gm",
    ),
  ))
    names.add(m[1]);
  for (const m of source.matchAll(new RegExp(`${at}export\\s+\\{([^}]*)\\}`, "gm")))
    for (const p of m[1].matchAll(/([a-zA-Z_$][\w$]*)/g)) names.add(p[1]);
}

/**
 * The prop/export surface — what a caller can actually reach.
 *
 * Svelte 5 components declare props two ways and this repo uses both: a named
 * `interface Props`/`interface XProps` block, or a bare `$props()` destructure.
 * Reading only one of them would silently under-report half the library, which
 * is the failure this whole file exists to prevent. A component's
 * `<script module>` exports are surface too — BrandButton's classes, for a
 * caller that must render a different element — and were invisible until #59.
 */
export function surfaceOf(source, file) {
  const names = new Set();
  if (extname(file) === ".svelte") {
    for (const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))
      if (/\bmodule\b/.test(m[1])) exportsOf(m[2], names, true);
    for (const m of source.matchAll(/interface\s+\w*Props\b[^{]*\{([\s\S]*?)\n\s*\}/g))
      for (const p of m[1].matchAll(/^\s*(?:\/\*[\s\S]*?\*\/\s*)?([a-zA-Z_$][\w$]*)\??\s*:/gm))
        names.add(p[1]);
    for (const m of source.matchAll(/let\s*\{([^}]*)\}\s*(?::[^=]*)?=\s*\$props\(\)/g))
      for (const p of m[1].matchAll(/(?:^|,)\s*([a-zA-Z_$][\w$]*)/g)) names.add(p[1]);
  } else {
    exportsOf(source, names);
  }
  names.delete("class");
  return [...names];
}

/**
 * The module's own first paragraph, where it left one. Never invented.
 *
 * A paragraph, not a sentence (#59): BrandButton named its exports in the
 * comment's second sentence and the row never carried them, while a drafted
 * issue described them as indexed. Where the author broke the comment is the
 * author's own statement of what the summary is.
 *
 * Falls back to the first PROP docblock, which is not a nicety: Slider.svelte
 * has no leading comment at all and documents itself entirely on its props —
 * "Accessible name for the carousel region" — so without this fallback its row
 * never contains the word "carousel", which is the word a request actually uses.
 * Measured: the hook that matches requests against this index could not find
 * Slider.svelte from "build the hero carousel" until this existed.
 */
export function summaryOf(source) {
  const body = source.replace(/^<script[^>]*>\n/, "");
  const block = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(body);
  const run = /^((?:\s*\/\/.*\n)+)/.exec(body);
  const prop = /interface\s+\w*Props\b[^{]*\{[\s\S]*?\/\*\*([\s\S]*?)\*\//.exec(body);
  const raw = block ? block[1] : run ? run[1].replace(/^\s*\/\/ ?/gm, "") : prop ? prop[1] : "";
  const paragraph =
    raw
      .replace(/^\s*\*ipsum?/gm, "")
      .replace(/^\s*\* ?/gm, "")
      .split(/\n\s*\n/)
      .find((p) => p.trim()) ?? "";
  return paragraph.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

const stemOf = (file) => basename(file, extname(file));

/**
 * Every co-located suite for a module: `<stem>.test.ts`, and any
 * `<stem>.<concern>.test.ts` split out of it (Nav.premount, animateIn.marker,
 * PropertyMap.camera.svelte). Only the first exact name used to count, so Nav
 * read 33 with 43 behind it (#46). A suite belongs to the LONGEST sibling
 * module stem it extends: `carousel.svelte.test.ts` is `carousel.svelte.ts`'s,
 * never a `carousel.ts`'s.
 */
export function testFilesFor(rel, root = ROOT) {
  const dir = dirname(rel);
  const stem = stemOf(rel);
  const siblings = readdirSync(join(root, dir));
  const stems = siblings.filter(isSource).map(stemOf);
  const owner = (base) =>
    stems
      .filter((s) => base === s || base.startsWith(`${s}.`))
      .sort((a, b) => b.length - a.length)[0];
  return siblings
    .filter((f) => {
      const base = /^(.*)\.(test|spec)\.[jt]s$/.exec(f)?.[1];
      return base !== undefined && owner(base) === stem;
    })
    .sort()
    .map((f) => `${dir}/${f}`);
}

/** How many `it(`/`test(` a module's co-located suites run — the battle-testedness. */
export function testCountFor(rel, root = ROOT) {
  return testFilesFor(rel, root).reduce(
    (n, f) => n + (readFileSync(join(root, f), "utf8").match(/^\s*(it|test)\(/gm) ?? []).length,
    0,
  );
}

export function buildIndex(root = ROOT, sources = SOURCES, exclude = EXCLUDE) {
  return listModules(root, sources, exclude).map((rel) => {
    const source = readFileSync(join(root, rel), "utf8");
    return {
      rel,
      name: basename(rel),
      surface: surfaceOf(source, rel),
      summary: summaryOf(source),
      tests: testCountFor(rel, root),
    };
  });
}

/**
 * The matching harness rewrites the caveat, because on a pixel-matched rebuild
 * "just use the shared component" is often wrong and a reader needs to know
 * that here rather than discover it after a failed gate run. Detected from the
 * tree rather than hard-coded: this file ships to every site from the starter,
 * and most of them have no harness at all.
 */
const matchingCaveat = (root) =>
  existsSync(join(root, "matching/harness.json"))
    ? `Reuse is not always possible here: this site has a matching harness, and its
geometry gate diffs slice DOM against transcribed reference markup — a component
that owns its own markup often cannot be dropped in. That is an argument against
reusing the **component** and never against reading it: the logic is usually
liftable when the markup is not. Declining one gets a line in
\`matching/LEDGER.md\` naming the module and why.`
    : `Reuse is not always the answer — a component whose markup fights the design is
a reason to lift its LOGIC, not to reach for it whole. But that is a decision to
make after reading the module, not instead of reading it.`;

const header = (root) => `<!-- GENERATED by scripts/capability-index.mjs — do not edit by hand.
     Regenerate with: node scripts/capability-index.mjs
     Kept honest by: scripts/capability-index.test.ts -->

# What this repo already does

Read this **before writing interactive behaviour into a slice** — a carousel, a
dialog, a disclosure, a focus trap, a reduced-motion check. Not as a rule, as a
list: the failure it exists to stop is never disagreement, it is not knowing.

${matchingCaveat(root)}

The **surface** column is the module's real prop/export names, extracted from the
source. It is the fastest way to recognise what a thing does.
`;

export function renderIndex(entries, root = ROOT) {
  const rows = entries.map((e) => {
    const surface = e.surface.length ? e.surface.map((s) => `\`${s}\``).join(", ") : "—";
    const tests = e.tests ? `${e.tests}` : "—";
    const summary = e.summary ? e.summary.replace(/\|/g, "\\|") : "";
    return `| [\`${e.name}\`](../${e.rel}) | ${surface} | ${tests} | ${summary} |`;
  });
  return `${header(root)}
| module | surface | tests | its own first paragraph |
| --- | --- | --- | --- |
${rows.join("\n")}

${entries.length} modules, ${entries.reduce((n, e) => n + e.tests, 0)} tests behind them.
`;
}

export const OUT = "docs/COMPONENTS.md";

function main(argv) {
  const check = argv.includes("--check");
  const want = renderIndex(buildIndex());
  const path = join(ROOT, OUT);
  const have = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (!check) {
    writeFileSync(path, want);
    console.log(`${OUT}: ${buildIndex().length} modules`);
    return 0;
  }
  if (have === want) {
    console.log(`${OUT} is current.`);
    return 0;
  }
  console.error(
    `${OUT} is stale — a module under ${SOURCES.join(", ")} changed its surface\n` +
      `and the index an agent reads still describes the old one.\n\n` +
      `  node scripts/capability-index.mjs\n`,
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  process.exit(main(process.argv.slice(2)));

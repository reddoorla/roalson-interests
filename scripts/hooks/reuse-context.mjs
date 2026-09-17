// UserPromptSubmit hook: when a request mentions behaviour this repo already
// ships, put the matching rows of docs/COMPONENTS.md in front of the agent
// BEFORE it plans.
//
// WHY A HOOK AND NOT A CHECK. A test or CI audit that catches a reinvented
// component fires after the component exists: the hour is spent and all it
// saves is the merge. The operator's words, which are the whole design brief
// for this file — "by the time you've run the check the cost of failing has
// already occurred". This is the earliest surface available: it runs on the
// prompt, before a single tool call.
//
// WHY IT ONLY ADDS CONTEXT. It never blocks and never rewrites the prompt. A
// PreToolUse hook could refuse a Write, and one false refusal makes the whole
// mechanism something to route around — the failure mode that kills guards. The
// claim here is modest and testable: recognition beats recall. CLAUDE.md already
// told three sessions to check for existing work and all three re-derived
// something anyway, because nothing put the string "Slider.svelte" next to the
// word "carousel" at the moment it mattered.
//
// Reads the hook payload as JSON on stdin, writes context to stdout, exit 0.
// Silent (no output) when nothing matches, which is the common case.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Words that mean "I am about to build behaviour", mapped to nothing — the
 * module they should reach for is discovered from the index, not hard-coded
 * here. A second list of module names would be a second thing to keep in sync,
 * and the index already knows.
 *
 * These are the CONCEPT words a request uses. Prop names are matched separately
 * and directly, which is what catches "autoplay" or "focus trap" without anyone
 * having predicted the phrasing.
 */
export const CONCEPTS = [
  "carousel",
  "slider",
  "slideshow",
  "modal",
  "dialog",
  "popup",
  "lightbox",
  "overlay",
  "accordion",
  "disclosure",
  "collapse",
  "focus trap",
  "trap focus",
  "reduced motion",
  "prefers-reduced-motion",
  "autoplay",
  "count up",
  "countup",
  "tooltip",
  "drawer",
  "tabs",
];

/** Parse the index back into rows. The generated file is the single source. */
export function parseIndex(markdown) {
  return markdown
    .split("\n")
    .filter((l) => l.startsWith("| [`"))
    .map((line) => {
      const name = /^\| \[`([^`]+)`\]\(([^)]+)\)/.exec(line);
      const cells = line.split("|").map((c) => c.trim());
      return name
        ? {
            name: name[1],
            path: name[2].replace(/^\.\.\//, ""),
            surface: (cells[2] ?? "")
              .split(",")
              .map((s) => s.replace(/`/g, "").trim())
              .filter(Boolean),
            tests: Number((cells[3] ?? "").replace(/\D/g, "")) || 0,
            line,
          }
        : null;
    })
    .filter(Boolean);
}

const norm = (s) => s.toLowerCase().replace(/[_-]+/g, " ");

/**
 * camelCase into words, so `prefersReducedMotion` can be found by someone who
 * typed "reduced motion". Without this, transitions.ts — one of the three
 * modules actually re-derived — was unreachable from the phrase its own
 * re-derivation used.
 */
const phrase = (s) => norm(s.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));

/** Everything about a row a request could plausibly name. */
const blobOf = (row) => `${norm(row.line)} ${row.surface.map(phrase).join(" ")}`;

/**
 * Rows worth showing for this prompt.
 *
 * Two signals trigger, one only annotates. A CONCEPT word ("carousel" — which
 * shares no substring with "Slider.svelte") and a PROP name ("autoplay", the
 * word a request actually uses) each mean the request is about behaviour. A bare
 * filename mention does not, so it decorates a row that already matched rather
 * than surfacing one on its own.
 */
export function matchRows(prompt, rows) {
  const p = norm(prompt);
  if (!p.trim()) return [];
  const hit = new Map();
  const add = (row, why) => {
    if (!hit.has(row.name)) hit.set(row.name, { row, why: new Set() });
    hit.get(row.name).why.add(why);
  };

  for (const row of rows) {
    const blob = blobOf(row);
    // A CONCEPT is a strong signal — the request is describing behaviour. It
    // only pulls a row whose own text carries the same word, so "modal" does
    // not drag in the library.
    for (const concept of CONCEPTS)
      if (p.includes(concept) && blob.includes(concept)) add(row, concept);
    // A PROP name is the other strong signal, and often the only one: nobody
    // says "carousel" when they say "the autoplay timer should reset".
    // Word-boundary, not substring — "mode" must not fire on "model".
    for (const prop of row.surface) {
      const ph = phrase(prop);
      if (ph.length > 4 && new RegExp(`\\b${ph}\\b`).test(p)) add(row, prop);
    }
  }

  // A bare filename mention ANNOTATES a row that already matched; it never
  // triggers one on its own. "fix the typo in the footer copyright year" is not
  // a request to build behaviour, and surfacing Footer.svelte for it is the
  // noise that gets a mechanism like this scrolled past and then deleted.
  for (const { row, why } of hit.values()) {
    const stem = norm(row.name.replace(/\.(svelte|ts|js)$/, ""));
    if (stem.length > 2 && new RegExp(`\\b${stem}\\b`).test(p)) why.add(stem);
  }
  return [...hit.values()].map(({ row, why }) => ({ ...row, why: [...why] }));
}

export function render(matches) {
  if (!matches.length) return "";
  const lines = matches
    .sort((a, b) => b.tests - a.tests)
    .map(
      (m) =>
        `  ${m.path} — ${m.tests} tests — matched on ${m.why.map((w) => `"${w}"`).join(", ")}\n` +
        `    surface: ${m.surface.join(", ") || "(none exported)"}`,
    );
  return (
    `This repo already ships behaviour related to that request. Read these before ` +
    `writing your own — docs/COMPONENTS.md is the full list:\n\n${lines.join("\n")}\n\n` +
    `Reusing the component is often NOT the answer (markup constraints are real). ` +
    `Reading it before deciding always is. If you re-derive one, say which and why.`
  );
}

export function contextFor(prompt, root = ROOT) {
  const index = join(root, "docs/COMPONENTS.md");
  if (!existsSync(index)) return "";
  return render(matchRows(prompt, parseIndex(readFileSync(index, "utf8"))));
}

/** The payload shape is not something to assume — fall back to raw text. */
export function promptFrom(raw) {
  try {
    const j = JSON.parse(raw);
    return j.prompt ?? j.user_prompt ?? j.message ?? "";
  } catch {
    return raw ?? "";
  }
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const out = contextFor(promptFrom(raw));
  if (out) process.stdout.write(out);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exit(await main());

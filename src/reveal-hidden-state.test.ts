import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { animateIn } from "$lib/actions/animateIn";

// The scroll reveal's hidden state has two halves that have to agree, and the
// CSS half is not reachable from jsdom (which resolves no stylesheets):
//
//   1. app.css hides `[data-reveal]` under `prefers-reduced-motion:
//      no-preference`, so server-rendered markup is hidden at FIRST PAINT
//      rather than yanked to opacity 0 at hydration.
//   2. animateIn's inline write has to be byte-identical to (1), or hydration
//      is a visible state change instead of the no-op it is meant to be.
//
// That the hidden state is in force at first paint, and that app.html's
// <noscript> style lets a scripting-off browser out of it, is measured in a
// browser by tests/interaction/reveal-no-js.spec.ts. What a browser trace of
// opacity cannot see is the two halves hiding at different distances.
//
// Resolved from the project root, not `import.meta.url`: under the jsdom
// environment vite serves this module over http, so `new URL(..., import.meta.url)`
// is not a file: URL and readFileSync rejects it.
const root = process.cwd();
const css = readFileSync(resolve(root, "src/app.css"), "utf-8");

/** The body of the `[data-reveal]` rule in `source`, or null unless it sits
 *  inside a `prefers-reduced-motion: no-preference` block. Located by string
 *  and sliced to the closing brace rather than matched by regex: a selector
 *  regex with `[^)]*` in it stops at a nested `)` and matches nothing however
 *  good the CSS is, which is how a check that can only ever fail gets written. */
function gatedRule(source: string) {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const at = bare.indexOf("[data-reveal] {");
  if (at === -1) return null;
  const gate = bare.lastIndexOf("@media", at);
  if (gate === -1) return null;
  const between = bare.slice(gate, at);
  const depth = between.split("{").length - between.split("}").length;
  if (depth < 1 || !between.startsWith("@media (prefers-reduced-motion: no-preference)")) {
    return null;
  }
  return bare.slice(at, bare.indexOf("}", at) + 1);
}

/** The declaration `property` sets in `rule`, if any. */
const declared = (rule: string | null, property: string) =>
  new RegExp(`(?<![\\w-])${property}:\\s*([^;}]+)`).exec(rule ?? "")?.[1]?.trim();

/** What animateIn writes on an element it hides with its default options. */
const hiddenByAction = (() => {
  const node = document.createElement("div");
  const { destroy } = animateIn(node);
  const state = { opacity: node.style.opacity, transform: node.style.transform };
  destroy();
  return state;
})();

const DEFAULT_TRAVEL = /^translateY\((.+)\)$/.exec(hiddenByAction.transform)?.[1]?.trim();

describe("the scroll reveal's first-paint hidden state", () => {
  // If the CSS hides an element 50% down and the action reveals it from 24px,
  // hydration is a jump rather than the byte-identical no-op the whole design
  // rests on. The two are asserted against each other so they cannot drift.
  it("hides [data-reveal] in app.css exactly as animateIn does, gated on no-preference", () => {
    const rule = gatedRule(css);
    expect(rule, "no [data-reveal] rule inside a no-preference block").not.toBeNull();
    expect(DEFAULT_TRAVEL, "animateIn wrote no translateY when hiding").toBeTruthy();
    expect(declared(rule, "opacity")).toBe(hiddenByAction.opacity);
    expect(declared(rule, "transform")).toBe(hiddenByAction.transform);
  });
});

// A call site that ships `data-reveal` from the SERVER owes two things the
// rules above cannot see from app.css: a `failSafe` (the element is hidden
// before script runs), and — if it passes its own `translateY` — a rule of its
// own that hides it at THAT travel, or CSS hides it at one distance and the
// action reveals it from another. The featured card is the first such site
// (#105); this reads every component rather than naming it, so the next one
// is held to the same pair.
describe("every server-rendered reveal target", () => {
  const svelteFiles = (readdirSync(resolve(root, "src"), { recursive: true }) as string[])
    .filter((f) => f.endsWith(".svelte"))
    .map((f) => resolve(root, "src", f));

  const subjects = svelteFiles.flatMap((file) => {
    const source = readFileSync(file, "utf-8");
    const styleAt = source.lastIndexOf("<style>");
    const markup = source
      .slice(source.lastIndexOf("</script>"), styleAt === -1 ? undefined : styleAt)
      .replace(/<!--[\s\S]*?-->/g, "");
    const style = styleAt === -1 ? "" : source.slice(styleAt);
    return [...markup.matchAll(/<[a-z][^>]*\sdata-reveal[\s=>/][^>]*>/g)].map(([tag]) => {
      // The options: an inline `{{ … }}`, or a `const NAME = { … }` it names.
      const inline = /use:animateIn=\{\{([^}]*)\}\}/.exec(tag)?.[1];
      const named = /use:animateIn=\{(\w+)\}/.exec(tag)?.[1];
      const options =
        inline ??
        (named ? new RegExp(`const ${named} = \\{([^}]*)\\}`).exec(source)?.[1] : undefined);
      return { file: file.slice(root.length + 1), options, style };
    });
  });

  it("finds them (the demo page at least)", () => {
    expect(subjects.map((s) => s.file)).toContain("src/routes/dev/animate-in/+page.svelte");
  });

  it("each is driven by animateIn with a failSafe", () => {
    for (const { file, options } of subjects) {
      expect(options, `${file}: data-reveal without use:animateIn options`).toBeDefined();
      expect(options, `${file}: no failSafe`).toMatch(/failSafe:\s*\d+/);
    }
  });

  it("each is hidden at the distance it reveals from", () => {
    for (const { file, options, style } of subjects) {
      const travel = /translateY:\s*"([^"]+)"/.exec(options ?? "")?.[1] ?? DEFAULT_TRAVEL;
      if (travel === DEFAULT_TRAVEL) continue; // app.css's rule, checked above
      const rule = gatedRule(style);
      expect(
        rule,
        `${file}: travels ${travel} but has no [data-reveal] rule behind no-preference`,
      ).not.toBeNull();
      expect(/transform:\s*translateY\(([^)]+)\)/.exec(rule!)?.[1]?.trim(), file).toBe(travel);
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  SOURCES,
  EXCLUDE,
  OUT,
  listModules,
  surfaceOf,
  summaryOf,
  buildIndex,
  renderIndex,
} from "./capability-index.mjs";

const ROOT = join(import.meta.dirname, "..");

describe("the capability index", () => {
  it("is committed and current", () => {
    // The index is the only pre-cost defence against re-deriving something the
    // repo already has: it is read BEFORE the decision, where a check that fails
    // in CI is read after the work is already paid for. A stale index is worse
    // than none, because it is trusted.
    const path = join(ROOT, OUT);
    expect(existsSync(path), `${OUT} is missing — node scripts/capability-index.mjs`).toBe(true);
    expect(readFileSync(path, "utf8"), `${OUT} is stale — node scripts/capability-index.mjs`).toBe(
      renderIndex(buildIndex()),
    );
  });

  it("covers every directory a slice could reuse from", () => {
    // An EXCLUSION, not an allowlist. The first cut of this listed components,
    // actions, utils and stores — and missed src/lib/transitions.ts, which
    // exports one of the three functions that actually got re-derived. An
    // allowlist encodes a guess about where people put things; the next shared
    // directory would have been invisible too.
    expect(SOURCES).toEqual(["src/lib"]);
    expect(EXCLUDE).toEqual(["src/lib/slices"]);
    expect(listModules().some((m) => m === "src/lib/transitions.ts")).toBe(true);
    expect(listModules().some((m) => m.startsWith("src/lib/slices/"))).toBe(false);
    const mods = listModules();
    expect(mods.length).toBeGreaterThan(30);
    expect(mods.every((m) => SOURCES.some((s) => m.startsWith(`${s}/`)))).toBe(true);
    // No tests, no type declarations — they are not reusable behaviour and they
    // would bury the things that are.
    expect(mods.filter((m) => /\.(test|spec)\./.test(m) || m.endsWith(".d.ts"))).toEqual([]);
  });

  it("names the three modules that were actually re-derived", () => {
    // Not decoration. On 29-navy, Slider.svelte, trapFocus.ts and transitions.ts
    // were each re-implemented inside a slice on 2026-09-10/11 while sitting in
    // the tree. All three ship from this starter, so the case generalises: if
    // the index ever stops listing one of them it has stopped doing the one job
    // it was built for.
    const index = readFileSync(join(ROOT, OUT), "utf8");
    for (const m of ["Slider.svelte", "trapFocus.ts", "transitions.ts"])
      expect(index, `${m} missing from the index`).toContain(m);
    // …and the surface is what makes them recognisable at a glance. A row that
    // says only "Slider.svelte" is a filename; one that says `autoplay` is an
    // answer.
    const slider = index.split("\n").find((l) => l.includes("Slider.svelte"))!;
    for (const prop of ["autoplay", "showDots", "showArrows", "loop"])
      expect(slider, `Slider row missing \`${prop}\``).toContain(prop);
  });
});

describe("the portability caveat", () => {
  // This file ships to every site from the starter, and 29 of the 30 repos in
  // the fleet have no matching harness. The branch that runs THERE is the one
  // nobody here can see, so it gets the test.
  it("names the geometry gate only where a harness actually exists", () => {
    // Both branches are asserted from either kind of repo, because this file is
    // identical in the starter and in every site generated from it — a test
    // that only exercised the local branch would leave the OTHER one, the one
    // running in 29 of 30 repos, permanently unverified.
    const entries = buildIndex();

    // A root that has a harness: this repo if it is a matching site, otherwise
    // any directory works, since the branch is chosen by the file's presence.
    const harnessRoot = existsSync(join(ROOT, "matching/harness.json")) ? ROOT : null;
    if (harnessRoot) {
      const withHarness = renderIndex(entries, harnessRoot);
      expect(withHarness).toContain("this site has a matching harness");
      expect(withHarness).toContain("matching/LEDGER.md");
    }

    // A root with no harness — the starter, and every non-matching site.
    const plain = renderIndex(entries, join(ROOT, "src"));
    expect(plain).not.toContain("matching harness");
    expect(plain).not.toContain("matching/LEDGER.md");
    // The caveat is rewritten, never dropped: reuse stays a decision made AFTER
    // reading the module rather than instead of reading it.
    expect(plain).toContain("after reading the module, not instead of reading it");

    // The table is identical either way — only the caveat differs.
    const table = (md: string) => md.slice(md.indexOf("| module |"));
    if (harnessRoot) expect(table(plain)).toBe(table(renderIndex(entries, harnessRoot)));
  });
});

describe("surfaceOf", () => {
  it("reads a named Props interface", () => {
    const src = `<script lang="ts">
  interface Props {
    itemCount: number;
    /** doc */
    autoplay?: number;
    class?: string;
  }
</script>`;
    // `class` is dropped: every component takes one and it says nothing.
    expect(surfaceOf(src, "X.svelte")).toEqual(["itemCount", "autoplay"]);
  });

  it("also reads a bare $props() destructure", () => {
    // Both forms are in use in this repo. Reading only the interface form would
    // silently under-report half the library — and an index that is quietly
    // partial is exactly the failure mode it exists to prevent.
    const src = `<script lang="ts">
  let { open, onclose, children } = $props();
</script>`;
    expect(surfaceOf(src, "X.svelte")).toEqual(["open", "onclose", "children"]);
  });

  it("reads exports from a plain module", () => {
    const src = `export const trapFocus = () => {};\nexport function helper() {}\n`;
    expect(surfaceOf(src, "x.ts")).toEqual(["trapFocus", "helper"]);
  });
});

describe("summaryOf", () => {
  it("takes the module's own first sentence, never inventing one", () => {
    expect(summaryOf("// Focus management for overlays. More text here.\nexport {};")).toBe(
      "Focus management for overlays",
    );
    expect(summaryOf(`<script lang="ts">\n  // Progressive wrapper. Details.\n</script>`)).toBe(
      "Progressive wrapper",
    );
  });

  it("is empty when the module documented nothing", () => {
    // Deliberately blank rather than guessed. A generated sentence that sounds
    // authoritative and is wrong would be worse than an obvious gap — and the
    // gap is itself a readable signal that the module needs a line.
    expect(summaryOf(`<script lang="ts">\n  import x from "y";\n</script>`)).toBe("");
  });
});

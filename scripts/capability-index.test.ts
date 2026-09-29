import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SOURCES,
  EXCLUDE,
  OUT,
  listModules,
  surfaceOf,
  summaryOf,
  testFilesFor,
  testCountFor,
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
    // Slider's OWN row, by its module cell. `includes("Slider.svelte")` took the
    // first row that merely MENTIONED it — carousel.svelte.ts's summary says
    // what Slider's layout cannot hold, sorts earlier, and was read as Slider.
    const slider = index.split("\n").find((l) => l.startsWith("| [`Slider.svelte`]"))!;
    expect(slider, "no row whose module is Slider.svelte").toBeTruthy();
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

  it("reads a component's <script module> exports, in either attribute order (#59)", () => {
    // BrandButton exports its classes so a <button> can wear them, and the
    // index could not see them: a caller looking for "the button classes" found
    // a component that takes `href`.
    const a = `<script module lang="ts">
  export const buttonBase = "x";
  export function tone() {}
</script>
<script lang="ts">
  let { href } = $props();
</script>`;
    expect(surfaceOf(a, "X.svelte")).toEqual(["buttonBase", "tone", "href"]);
    const b = `<script lang="ts" module>\n  export const MAP_TONES = {};\n</script>`;
    expect(surfaceOf(b, "X.svelte")).toEqual(["MAP_TONES"]);
    // The real rows: every `export const` in BrandButton's module script.
    const row = readFileSync(join(ROOT, OUT), "utf8")
      .split("\n")
      .find((l) => l.startsWith("| [`BrandButton.svelte`]"))!;
    const surface = row.split(" | ")[1];
    for (const name of ["brandButtonBase", "BRAND_BUTTON_TONES", "brandButtonPadding"])
      expect(surface).toContain(`\`${name}\``);
  });
});

describe("testCountFor", () => {
  it("sums every co-located suite a module has, split by concern or not (#46)", () => {
    // Nav.premount.test.ts held 10 of Nav's tests and the row said 33, not 43.
    const dir = mkdtempSync(join(tmpdir(), "capability-index-"));
    try {
      const put = (name: string, body = "") => writeFileSync(join(dir, name), body);
      const its = (n: number) => Array.from({ length: n }, () => `it("x", () => {});`).join("\n");
      put("Nav.svelte");
      put("Nav.test.ts", its(3));
      put("Nav.premount.test.ts", its(2));
      put("Nav.drawer.svelte.test.ts", its(1));
      put("Navigation.svelte");
      put("Navigation.test.ts", its(7)); // a longer name, not a Nav suite
      put("carousel.ts");
      put("carousel.svelte.ts");
      put("carousel.svelte.test.ts", its(4)); // the longest stem owns it
      expect(testFilesFor("Nav.svelte", dir)).toEqual([
        "./Nav.drawer.svelte.test.ts",
        "./Nav.premount.test.ts",
        "./Nav.test.ts",
      ]);
      expect(testCountFor("Nav.svelte", dir)).toBe(6);
      expect(testCountFor("Navigation.svelte", dir)).toBe(7);
      expect(testCountFor("carousel.svelte.ts", dir)).toBe(4);
      expect(testCountFor("carousel.ts", dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds Nav's split suite in this repo", () => {
    expect(testFilesFor("src/lib/components/Nav.svelte")).toEqual([
      "src/lib/components/Nav.premount.test.ts",
      "src/lib/components/Nav.test.ts",
    ]);
  });
});

describe("summaryOf", () => {
  it("takes the module's own first paragraph, never inventing one", () => {
    // A paragraph, not a sentence (#59): a second sentence naming exports was
    // dropped from the row while an issue described it as indexed.
    expect(summaryOf("// Focus management for overlays. More text here.\nexport {};")).toBe(
      "Focus management for overlays. More text here",
    );
    expect(
      summaryOf(
        `<script lang="ts">\n  // Progressive wrapper.\n  // Details.\n  //\n  // Aside.\n</script>`,
      ),
    ).toBe("Progressive wrapper. Details");
    expect(summaryOf("/**\n * Lead. Second.\n *\n * Later paragraph.\n */\nexport {};")).toBe(
      "Lead. Second",
    );
  });

  it("is empty when the module documented nothing", () => {
    // Deliberately blank rather than guessed. A generated sentence that sounds
    // authoritative and is wrong would be worse than an obvious gap — and the
    // gap is itself a readable signal that the module needs a line.
    expect(summaryOf(`<script lang="ts">\n  import x from "y";\n</script>`)).toBe("");
  });
});

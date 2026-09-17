import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONCEPTS,
  parseIndex,
  matchRows,
  render,
  contextFor,
  promptFrom,
} from "./reuse-context.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const INDEX = readFileSync(join(ROOT, "docs/COMPONENTS.md"), "utf8");
const ROWS = parseIndex(INDEX);

describe("parseIndex", () => {
  it("reads every module row out of the generated index", () => {
    expect(ROWS.length).toBeGreaterThan(40);
    const slider = ROWS.find((r) => r.name === "Slider.svelte")!;
    expect(slider.path).toBe("src/lib/components/Slider.svelte");
    expect(slider.surface).toContain("autoplay");
    expect(slider.tests).toBeGreaterThan(20);
  });
});

describe("matchRows", () => {
  // The three re-derivations this exists to have prevented, in the words the
  // request actually used at the time.
  it("finds Slider.svelte from the word the operator used: carousel", () => {
    // "carousel" shares no substring with "Slider.svelte". A filename match
    // alone would miss it, which is exactly how it got missed.
    const hits = matchRows("build the hero carousel for this slice", ROWS);
    expect(hits.map((h) => h.name)).toContain("Slider.svelte");
  });

  it("finds Slider.svelte from a prop name nobody would think to search", () => {
    const hits = matchRows("the autoplay timer should reset on click", ROWS);
    expect(hits.map((h) => h.name)).toContain("Slider.svelte");
    expect(hits.find((h) => h.name === "Slider.svelte")!.why).toContain("autoplay");
  });

  it("finds trapFocus from 'modal', which is not in its filename", () => {
    const hits = matchRows("the modals in the resident section need work", ROWS);
    const names = hits.map((h) => h.name);
    expect(names).toContain("trapFocus.ts");
    expect(names).toContain("Modal.svelte");
  });

  it("finds transitions.ts from 'reduced motion'", () => {
    expect(matchRows("skip the animation under reduced motion", ROWS).map((h) => h.name)).toContain(
      "transitions.ts",
    );
  });

  it("says nothing about an unrelated request", () => {
    // The cost of a false positive is that the whole thing becomes noise to
    // scroll past, so silence is the default and has to be tested for.
    expect(matchRows("fix the typo in the footer copyright year", ROWS)).toEqual([]);
    expect(matchRows("bump the prismic client dependency", ROWS)).toEqual([]);
    expect(matchRows("", ROWS)).toEqual([]);
  });

  it("matches on word boundaries, not substrings", () => {
    // `Img.svelte` firing on every mention of "image" would put a row in front
    // of the agent on half the prompts in this repo. Two-character stems are
    // skipped entirely for the same reason.
    const hits = matchRows("swap the hero image for the new photograph", ROWS);
    expect(hits.map((h) => h.name)).not.toContain("Img.svelte");
  });

  it("keeps a concept word from dragging in the whole library", () => {
    // "overlay" appears in several docblocks; it must only pull modules whose
    // own row contains it, never everything.
    const hits = matchRows("add an overlay", ROWS);
    expect(hits.length).toBeLessThan(ROWS.length / 3);
  });

  it("covers the concepts the fleet actually builds", () => {
    for (const c of ["carousel", "modal", "accordion", "focus trap", "reduced motion"])
      expect(CONCEPTS).toContain(c);
  });
});

describe("render", () => {
  it("leads with the most-tested module and says why each matched", () => {
    const out = render(matchRows("build a carousel with autoplay", ROWS));
    expect(out).toContain("src/lib/components/Slider.svelte");
    expect(out).toContain("tests");
    expect(out).toMatch(/matched on "(carousel|autoplay|slider)"/);
    // The honest caveat travels with it, or the hook starts pushing agents into
    // reuse that a pixel-matched rebuild cannot actually do.
    expect(out).toContain("often NOT the answer");
    expect(out).toContain("say which and why");
  });

  it("is completely silent when nothing matched", () => {
    expect(render([])).toBe("");
    expect(contextFor("update the readme")).toBe("");
  });
});

describe("promptFrom", () => {
  it("reads the documented field but survives an undocumented payload", () => {
    // The hook contract is the host's, not ours. A schema change must degrade
    // to "match nothing useful", never to a crash that breaks every prompt in
    // the repo — that is the one way an additive hook can become destructive.
    expect(promptFrom(JSON.stringify({ prompt: "build a carousel" }))).toBe("build a carousel");
    expect(promptFrom(JSON.stringify({ user_prompt: "x" }))).toBe("x");
    expect(promptFrom("not json at all")).toBe("not json at all");
    expect(promptFrom(JSON.stringify({ unexpected: 1 }))).toBe("");
    expect(promptFrom("")).toBe("");
  });
});

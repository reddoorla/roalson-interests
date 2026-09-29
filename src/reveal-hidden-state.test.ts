import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The scroll reveal's hidden state has three halves that have to agree, and
// none of them is reachable from jsdom (which resolves no stylesheets and
// never parses app.html):
//
//   1. app.css hides `[data-reveal]` under `prefers-reduced-motion:
//      no-preference`, so server-rendered markup is hidden at FIRST PAINT
//      rather than yanked to opacity 0 at hydration.
//   2. app.html's <noscript> style forces it back, so a browser that will
//      never run the reveal is never shown less than a crawler gets.
//   3. animateIn's inline write has to be byte-identical to (1), or hydration
//      is a visible state change instead of the no-op it is meant to be.
//
// Resolved from the project root, not `import.meta.url`: under the jsdom
// environment vite serves this module over http, so `new URL(..., import.meta.url)`
// is not a file: URL and readFileSync rejects it.
const root = process.cwd();
const css = readFileSync(resolve(root, "src/app.css"), "utf-8");
const html = readFileSync(resolve(root, "src/app.html"), "utf-8");
const action = readFileSync(resolve(root, "src/lib/actions/animateIn.ts"), "utf-8");

/** The body of the first rule whose selector starts at `from`. Located by
 *  string and sliced to the closing brace rather than matched by regex: a
 *  selector regex with `[^)]*` in it stops at a nested `)` and matches nothing
 *  however good the CSS is, which is how a check that can only ever fail gets
 *  written (see src/focus-floor.test.ts, same trap). */
function ruleAt(source: string, selector: string, from = 0) {
  const at = source.indexOf(selector, from);
  if (at === -1) return null;
  return source.slice(at, source.indexOf("}", at) + 1);
}

describe("the scroll reveal's first-paint hidden state", () => {
  it("hides [data-reveal] in app.css, gated on no-preference", () => {
    const gate = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(gate, "no no-preference block in app.css").toBeGreaterThan(-1);
    const rule = ruleAt(css, "[data-reveal]", gate);
    expect(rule, "no [data-reveal] rule inside the no-preference block").not.toBeNull();
    expect(rule).toMatch(/opacity:\s*0/);
    expect(rule).toMatch(/transform:\s*translateY\(/);
  });

  // If the CSS hides an element 50% down and the action reveals it from 24px,
  // hydration is a jump rather than the byte-identical no-op the whole design
  // rests on. The two are asserted against each other so they cannot drift.
  it("hides it at exactly the distance the action's default reveals from", () => {
    const gate = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const rule = ruleAt(css, "[data-reveal]", gate)!;
    const cssTravel = /transform:\s*translateY\(([^)]+)\)/.exec(rule)?.[1]?.trim();
    const jsTravel = /translateY\s*\?\?\s*"([^"]+)"/.exec(action)?.[1]?.trim();
    expect(cssTravel, "could not read the travel out of app.css").toBeTruthy();
    expect(jsTravel, "could not read animateIn's default translateY").toBeTruthy();
    expect(cssTravel).toBe(jsTravel);
  });

  it("gives scripting-off browsers a way back out, in app.html", () => {
    const noscript = html.slice(html.indexOf("<noscript>"), html.indexOf("</noscript>"));
    expect(noscript, "no <noscript> block in app.html").toContain("data-reveal");
    expect(noscript).toMatch(/opacity:\s*1\s*!important/);
    expect(noscript).toMatch(/transform:\s*none\s*!important/);
  });

  // The guard has to be a STYLE, not an inline `classList.add("js")` script:
  // this template's CSP ships script-src without 'unsafe-inline', so on
  // server-rendered routes (policy as a nonce-bearing header) the script is
  // silently dropped while prerendered routes keep it. A guard that is live on
  // some routes and dead on others is worse than no guard. style-src already
  // allows inline styles, so this half works identically everywhere.
  it("uses a style for that escape hatch, never a script", () => {
    const noscript = html.slice(html.indexOf("<noscript>"), html.indexOf("</noscript>"));
    expect(noscript).toContain("<style>");
    expect(noscript).not.toContain("<script");
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

  const DEFAULT_TRAVEL = /translateY\s*\?\?\s*"([^"]+)"/.exec(action)![1];

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

  it("finds them (the demo page and the featured card at least)", () => {
    expect(subjects.map((s) => s.file)).toEqual(
      expect.arrayContaining([
        "src/routes/dev/animate-in/+page.svelte",
        "src/lib/slices/FeaturedProperties/index.svelte",
      ]),
    );
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
      const gate = style.indexOf("@media (prefers-reduced-motion: no-preference)");
      expect(gate, `${file}: its own rule must sit behind no-preference`).toBeGreaterThan(-1);
      const rule = ruleAt(style, "[data-reveal]", gate);
      expect(rule, `${file}: travels ${travel} but has no [data-reveal] rule`).not.toBeNull();
      expect(/transform:\s*translateY\(([^)]+)\)/.exec(rule!)?.[1]?.trim(), file).toBe(travel);
    }
  });
});

// tests/interaction/palette.ts is the one place the browser specs spell the
// brand's colours. This holds it to app.css, and holds every other file under
// tests/ to it.
//
// WHY A SECOND COPY AT ALL. The specs compare what a browser COMPUTES —
// `rgb(243, 241, 239)`, a screenshot pixel, the theme-color meta — and
// Playwright cannot read app.css's `@theme` block at spec time without a parser
// of its own. So the copy is unavoidable, and the answer is the one
// src/lib/canvas-top.ts already gives for `theme-color`: keep ONE copy, and
// fail in milliseconds when it stops being the variable it claims to be.
//
// WHY THE SCAN. The palette moved on 2026-09-28 (#f2efe9 -> #f3f1ef,
// #e8e1d1 -> #eae7e4) and fourteen spec files carried their own copies. A
// missed copy in an EQUALITY goes red in a browser run; a missed copy in a
// NEGATIVE assertion (`.not.toBe(SAND)`) stays green forever while testing
// nothing. So a spec may not spell any brand colour itself, and may not spell
// the pair the off-white and the sand replaced either. The scan reads the TypeScript syntax
// tree, so comments — where dated measurements quote the old colours, and must
// be free to — are not code and are never matched.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { PALETTE_HEX } from "../tests/interaction/palette";

const ROOT = join(import.meta.dirname, "..");
const PALETTE_FILE = join(ROOT, "tests", "interaction", "palette.ts");

const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(readFileSync(join(ROOT, "src/app.css"), "utf8"))![1];
const themeHex = (token: string) =>
  new RegExp(`--color-${token}:\\s*([^;]+);`).exec(theme)?.[1].trim().toLowerCase();

/** The tokens a spec must import rather than spell: all four (#166). */
const ENFORCED = ["background", "light", "primary", "dark"] as const;

/** Values this palette has RETIRED. A spec still spelling one is a copy that
 *  was missed when the palette moved. */
const RETIRED = ["#f2efe9", "#e8e1d1"];

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Every way a spec has spelled a colour: hex, and `rgb(`/`rgba(` channels. */
function spellings(hex: string): RegExp {
  const [r, g, b] = channels(hex);
  return new RegExp(`${hex}(?![0-9a-f])|rgba?\\(\\s*${r}\\s*,\\s*${g}\\s*,\\s*${b}\\b`, "i");
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** String, template and regex text, and `[r, g, b]` number triples, in `file`.
 *  A regex's escapes are dropped, so `/rgb\(101, 35, 35\)/` reads as a spelling. */
function literals(file: string, text = readFileSync(file, "utf8")) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest);
  const strings: { text: string; line: number }[] = [];
  const triples: { rgb: number[]; line: number }[] = [];
  const line = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      strings.push({ text: node.text, line: line(node) });
    } else if (ts.isRegularExpressionLiteral(node)) {
      strings.push({ text: node.text.replace(/\\/g, ""), line: line(node) });
    } else if (
      ts.isArrayLiteralExpression(node) &&
      node.elements.length === 3 &&
      node.elements.every(ts.isNumericLiteral)
    ) {
      triples.push({
        rgb: node.elements.map((e) => Number((e as ts.NumericLiteral).text)),
        line: line(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { strings, triples };
}

/** Where, outside palette.ts, a file under tests/ spells any of `hexes`. */
function spelled(hexes: string[]) {
  const found: string[] = [];
  for (const file of tsFiles(join(ROOT, "tests"))) {
    if (file === PALETTE_FILE) continue;
    const { strings, triples } = literals(file);
    for (const hex of hexes) {
      const pattern = spellings(hex);
      const want = channels(hex);
      for (const s of strings)
        if (pattern.test(s.text)) found.push(`${relative(ROOT, file)}:${s.line} spells ${hex}`);
      for (const t of triples)
        if (t.rgb.every((c, i) => c === want[i]))
          found.push(`${relative(ROOT, file)}:${t.line} spells ${hex} as [${t.rgb.join(", ")}]`);
    }
  }
  return found;
}

describe("the specs' palette", () => {
  it.each(Object.keys(PALETTE_HEX))("%s is still what app.css's @theme says", (token) => {
    expect(PALETTE_HEX[token as keyof typeof PALETTE_HEX]).toBe(themeHex(token));
  });

  it("is the only place a spec spells a brand colour", () => {
    const hexes = ENFORCED.map((token) => PALETTE_HEX[token]);
    expect(spelled(hexes), "import these from tests/interaction/palette.ts").toEqual([]);
  });

  it("leaves no spec on a colour the palette has retired", () => {
    for (const hex of RETIRED)
      expect(Object.values(PALETTE_HEX), `${hex} is retired`).not.toContain(hex);
    expect(spelled(RETIRED), "a copy missed when the palette moved").toEqual([]);
  });

  // Guard the guard: a scan that parsed nothing would pass everything above.
  it("finds the literals it scans for", () => {
    const { strings } = literals(join(ROOT, "tests", "interaction", "canvas-ground.spec.ts"));
    expect(strings.length).toBeGreaterThan(50);
    const { strings: own } = literals(PALETTE_FILE);
    expect(own.some((s) => spellings(PALETTE_HEX.background).test(s.text))).toBe(true);
    // The two other spellings, synthetic since #166 converted the last real ones
    // (canvas-ground.spec.ts's `[61, 7, 7]`, contact.spec.ts's regex).
    const { strings: regex, triples } = literals(
      "x.ts",
      String.raw`x.toMatch(/rgb\(101, 35, 35\) 0/); const c = [61, 7, 7];`,
    );
    expect(regex.some((s) => spellings(PALETTE_HEX.primary).test(s.text))).toBe(true);
    expect(triples.map((t) => t.rgb)).toEqual([[61, 7, 7]]);
  });
});

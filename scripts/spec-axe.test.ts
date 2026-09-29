// tests/interaction/axe.ts is the one place a spec builds axe (#52). Anywhere
// else, `new AxeBuilder` brings the default preload back, and a later
// `.options()` silently replaces `preload: false` along with everything else.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const HELPER = "tests/interaction/axe.ts";
/** The control that proves the default builder still trips the CSP. */
const CONTROL = "tests/interaction/axe-preload.spec.ts";

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

function offenders(pattern: RegExp, allowed: string[]) {
  return tsFiles(join(ROOT, "tests"))
    .map((file) => relative(ROOT, file))
    .filter((rel) => !allowed.includes(rel))
    .filter((rel) => pattern.test(code(readFileSync(join(ROOT, rel), "utf8"))));
}

describe("the specs build axe in one place", () => {
  it("finds the builder where it is", () => {
    expect(code(readFileSync(join(ROOT, HELPER), "utf8"))).toMatch(/new AxeBuilder\(/);
  });

  it("constructs AxeBuilder nowhere else", () => {
    expect(offenders(/new AxeBuilder\(/, [HELPER, CONTROL])).toEqual([]);
  });

  it("never re-sets axe's options after the helper", () => {
    expect(offenders(/\.options\(/, [HELPER])).toEqual([]);
  });
});

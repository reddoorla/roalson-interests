// scripts/**/*.ts is outside svelte-check's program: `.svelte-kit/tsconfig.json`
// includes src/, tests/, test/ and vite.config.*, and CI runs svelte-check
// against the root tsconfig directly. So the tests of the seed, map and index
// scripts were transpiled by vitest and never type-checked (#168). This runs
// `tsc` over scripts/tsconfig.json, which says what it checks and why its
// `.mjs` stay out, and fails on any diagnostic — from `pnpm test`, which CI
// does run.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/** Every `.ts` under scripts/, as repo-relative paths. */
function scriptsTs(dir = join(repoRoot, "scripts")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? scriptsTs(join(dir, d.name))
      : d.name.endsWith(".ts")
        ? [relative(repoRoot, join(dir, d.name))]
        : [],
  );
}

describe("scripts/ type-check", () => {
  it("covers every .ts under scripts/ but the migration template, and finds no error", () => {
    const r = spawnSync(
      process.execPath,
      [tsc, "-p", "scripts/tsconfig.json", "--noEmit", "--pretty", "false", "--listFiles"],
      { cwd: repoRoot, encoding: "utf-8" },
    );
    const listed = new Set(
      r.stdout
        .split("\n")
        .filter((line) => line.startsWith(repoRoot))
        .map((line) => relative(repoRoot, line.trim())),
    );
    // Positive evidence first: a program that silently matched nothing (or
    // half of it) would also report no error.
    const expected = scriptsTs().filter((f) => f !== "scripts/import/migrate.example.ts");
    expect(expected.length).toBeGreaterThan(10);
    expect(expected.filter((f) => !listed.has(f))).toEqual([]);
    expect(r.stdout.split("\n").filter((line) => / error TS\d+/.test(line))).toEqual([]);
    expect(r.status).toBe(0);
  }, 120_000);
});

// The `VITE_PRISMIC_ENVIRONMENT=your-prismic-repo-name` hatch is LOCAL-ONLY
// (reddoor-starter#120). Set in CI or on Netlify it greens a build that emits
// no home page AND a smoke run that expects `/` to 404 — both halves of the
// gate agreeing about a site that does not exist. `svelte.config.js` and
// `tests/smoke/routes.ts` each refuse to load under that combination.
//
// Proven by spawning a real Node import of each file, because the guard is a
// module-load throw: an in-process import would be cached after the first
// evaluation and could not be observed under two different environments.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SENTINEL = "your-prismic-repo-name";

/** Node's own runtime warnings — `(node:123) [UNDICI-EHPA] Warning: …`, an
 *  ExperimentalWarning, a DeprecationWarning — plus the one `(Use \`node
 *  --trace-…\`)` hint line after them. The environment prints these, not the
 *  guard: `NODE_USE_ENV_PROXY=1`, which a proxied cloud container needs for the
 *  build's Prismic fetches, puts one on EVERY child Node (#165). Only whole
 *  lines in exactly that shape go; anything else, the guard's throw included,
 *  survives. */
const NODE_WARNING = /^\(node:\d+\) (?:\[[\w-]+\] )?\w*Warning: .*$/;
const TRACE_HINT = /^\(Use `node --trace-[\w-]+ \.\.\.` to show where the warning was created\)$/;
function withoutNodeWarnings(stderr: string): string {
  return stderr
    .split("\n")
    .filter((line) => !NODE_WARNING.test(line) && !TRACE_HINT.test(line))
    .join("\n")
    .trim();
}

/** Import `file` in a child Node with exactly the env described. `CI`,
 *  `NETLIFY` and the hatch are always stripped first so the CONTROL case is a
 *  real control even when vitest itself runs under Actions (where `CI=true` is
 *  inherited) or on a machine whose shell exports the hatch. `warn` has the
 *  child print a Node warning of its own before the import, so the tolerance
 *  above is exercised whatever the machine running vitest exports. */
function importUnder(
  file: string,
  env: { ci?: boolean; netlify?: boolean; hatch?: boolean; warn?: boolean },
): { status: number | null; stderr: string } {
  const child = { ...process.env };
  delete child.CI;
  delete child.NETLIFY;
  delete child.VITE_PRISMIC_ENVIRONMENT;
  if (env.ci) child.CI = "true";
  if (env.netlify) child.NETLIFY = "true";
  if (env.hatch) child.VITE_PRISMIC_ENVIRONMENT = SENTINEL;
  const warn = env.warn ? `process.emitWarning("probe", "ExperimentalWarning");` : "";
  const r = spawnSync(process.execPath, ["-e", `${warn}import(${JSON.stringify(file)})`], {
    cwd: repoRoot,
    env: child,
    encoding: "utf-8",
  });
  return { status: r.status, stderr: r.stderr };
}

const FILES = [
  { label: "svelte.config.js", file: "./svelte.config.js" },
  // Node 24 strips types, so the Playwright manifest loads under a bare `node`.
  { label: "tests/smoke/routes.ts", file: "./tests/smoke/routes.ts" },
];

describe.each(FILES)("$label placeholder hatch", ({ file }) => {
  it("loads cleanly with neither the hatch nor CI set (the control)", () => {
    const r = importUnder(file, {});
    expect(withoutNodeWarnings(r.stderr)).toBe("");
    expect(r.status).toBe(0);
  });

  it("loads cleanly with the hatch set on a developer machine (its one legitimate use)", () => {
    const r = importUnder(file, { hatch: true });
    expect(withoutNodeWarnings(r.stderr)).toBe("");
    expect(r.status).toBe(0);
  });

  it("loads cleanly in CI without the hatch (a wired site, or the sentinel in the config file)", () => {
    const r = importUnder(file, { ci: true });
    expect(withoutNodeWarnings(r.stderr)).toBe("");
    expect(r.status).toBe(0);
  });

  it("refuses to load with the hatch set under CI, naming what it would have hidden", () => {
    const r = importUnder(file, { hatch: true, ci: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/local-only/i);
    expect(r.stderr).toMatch(/no home page/i);
    expect(r.stderr).toMatch(/VITE_PRISMIC_ENVIRONMENT/);
  });

  it("refuses to load with the hatch set under Netlify", () => {
    const r = importUnder(file, { hatch: true, netlify: true });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/local-only/i);
  });

  it("loads cleanly when the child Node prints a runtime warning of its own (#165)", () => {
    const r = importUnder(file, { warn: true });
    expect(r.stderr).toMatch(/ExperimentalWarning: probe/);
    expect(withoutNodeWarnings(r.stderr)).toBe("");
    expect(r.status).toBe(0);
  });
});

describe("withoutNodeWarnings", () => {
  it("strips Node's warning lines and hint, and keeps every other line", () => {
    const stderr = [
      "(node:9156) [UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental, expect them to change at any time.",
      "(Use `node --trace-warnings ...` to show where the warning was created)",
      "(node:9156) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.",
      "Error: VITE_PRISMIC_ENVIRONMENT=your-prismic-repo-name is a local-only hatch",
      "    at file:///svelte.config.js:22:9",
      "",
    ].join("\n");
    expect(withoutNodeWarnings(stderr)).toBe(
      "Error: VITE_PRISMIC_ENVIRONMENT=your-prismic-repo-name is a local-only hatch\n" +
        "    at file:///svelte.config.js:22:9",
    );
  });
});

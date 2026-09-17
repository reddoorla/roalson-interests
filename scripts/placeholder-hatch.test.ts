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

/** Import `file` in a child Node with exactly the env described. `CI`,
 *  `NETLIFY` and the hatch are always stripped first so the CONTROL case is a
 *  real control even when vitest itself runs under Actions (where `CI=true` is
 *  inherited) or on a machine whose shell exports the hatch. */
function importUnder(
  file: string,
  env: { ci?: boolean; netlify?: boolean; hatch?: boolean },
): { status: number | null; stderr: string } {
  const child = { ...process.env };
  delete child.CI;
  delete child.NETLIFY;
  delete child.VITE_PRISMIC_ENVIRONMENT;
  if (env.ci) child.CI = "true";
  if (env.netlify) child.NETLIFY = "true";
  if (env.hatch) child.VITE_PRISMIC_ENVIRONMENT = SENTINEL;
  const r = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(file)})`], {
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
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("loads cleanly with the hatch set on a developer machine (its one legitimate use)", () => {
    const r = importUnder(file, { hatch: true });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("loads cleanly in CI without the hatch (a wired site, or the sentinel in the config file)", () => {
    const r = importUnder(file, { ci: true });
    expect(r.stderr).toBe("");
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
});

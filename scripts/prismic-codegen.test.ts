// @vitest-environment node
//
// The generated Prismic files are current with every committed model.
//
// This is the gate the required `ci / ci` job runs, inside `pnpm test` and
// `pnpm verify`. The `prismic-codegen` workflow does the same diff in its own
// job, but that job is not a required check, so on its own a model edited
// without `pnpm prismic:gen` could merge past a red X. The old
// scripts/prismic-types.test.ts held this line until the Prismic CLI move.
//
// The CLI writes into its working directory, so it runs in a scratch copy and
// the checkout is never touched. It runs with a minimal environment: the CLI
// refuses an agent session (it reads variables such as CLAUDECODE) that does
// not pass a real `--task-id`, and this gate must behave the same for a person,
// an agent and CI.
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const GENERATED = ["prismicio-types.d.ts", "src/lib/slices/index.ts"];

function regenerate(): string {
  const dir = mkdtempSync(join(tmpdir(), "prismic-codegen-"));
  // tsconfig.json is load-bearing: without it the CLI writes the slice index as
  // index.js, and the copied index.ts would be compared with itself.
  for (const file of ["package.json", "prismic.config.json", "tsconfig.json"])
    cpSync(join(ROOT, file), join(dir, file));
  cpSync(join(ROOT, "customtypes"), join(dir, "customtypes"), { recursive: true });
  cpSync(join(ROOT, "src/lib/slices"), join(dir, "src/lib/slices"), { recursive: true });
  // Written fresh, so the comparison never depends on what was copied in.
  for (const file of GENERATED) rmSync(join(dir, file), { force: true });
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? dir,
    PRISMIC_TELEMETRY_ENABLED: "false",
  };
  const cli = join(ROOT, "node_modules/.bin/prismic");
  for (const command of ["types", "slice-index"])
    execFileSync(cli, ["gen", command], { cwd: dir, env, stdio: "pipe" });
  return dir;
}

describe("the generated Prismic files", () => {
  it("are what `pnpm prismic:gen` writes from the committed models", () => {
    const dir = regenerate();
    for (const file of GENERATED)
      expect(
        readFileSync(join(ROOT, file), "utf8"),
        `${file} is stale: run pnpm prismic:gen and commit the result`,
      ).toBe(readFileSync(join(dir, file), "utf8"));
  }, 60_000);
});

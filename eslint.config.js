import { createEslintConfig } from "@reddoorla/maintenance/configs/eslint";
import svelteConfig from "./svelte.config.js";

export default [
  // Agent sessions work in git worktrees under `.claude/worktrees/` — inside
  // this directory, gitignored, and full of another branch's unfinished code.
  // `eslint .` from the root walked into them and failed `pnpm verify` on a
  // branch that had not touched a single linted file (2026-09-21, three
  // worktrees open). CLAUDE.md tells concurrent sessions to use worktrees, so
  // the gate has to tolerate them. `vite.config.ts` ignores the same directory
  // for the dev server's watcher.
  { ignores: [".claude/"] },
  ...createEslintConfig({ svelteConfig }),
];

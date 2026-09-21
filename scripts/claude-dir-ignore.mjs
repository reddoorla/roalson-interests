// What the dev server's file watcher must not watch: THIS checkout's `.claude/`
// directory, where agent worktrees live (`.claude/worktrees/<id>/`).
//
// It is anchored to a root on purpose. The first version was the glob
// "**/.claude/**", which matches anywhere in a path — and an agent's worktree
// IS a path under `.claude/`, so from inside one the glob matched every file of
// the project: a `vite dev` started there never saw an edit. No HMR, no log
// line, no error — and a mutation "survived" because the server never read it
// (issue #39). Anchored, the main checkout still ignores its worktrees, and a
// worktree ignores only a `.claude/` of its own.
import { resolve, sep } from "node:path";

/** A chokidar `ignored` matcher for `<root>/.claude/` and everything in it. */
export function claudeDirIgnore(root) {
  const dir = resolve(root, ".claude");
  return (path) => path === dir || path.startsWith(dir + sep);
}

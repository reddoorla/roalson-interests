import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no declarations
import { claudeDirIgnore } from "./claude-dir-ignore.mjs";

const REPO = "/Users/x/GitHub/site";
const WORKTREE = `${REPO}/.claude/worktrees/agent-1`;

describe("the dev server's watcher and agent worktrees", () => {
  it("in the main checkout, ignores every worktree and nothing of its own", () => {
    const ignored = claudeDirIgnore(REPO);
    expect(ignored(`${WORKTREE}/.svelte-kit/tsconfig.json`)).toBe(true);
    expect(ignored(`${WORKTREE}/src/app.css`)).toBe(true);
    expect(ignored(`${REPO}/.claude`)).toBe(true);
    expect(ignored(`${REPO}/src/app.css`)).toBe(false);
    expect(ignored(`${REPO}/.claude-notes/a.md`)).toBe(false);
  });

  // The defect: "**/.claude/**" matched every one of these, so a dev server
  // started inside a worktree watched nothing.
  it("inside a worktree, still watches the worktree's own files", () => {
    const ignored = claudeDirIgnore(WORKTREE);
    expect(ignored(`${WORKTREE}/src/app.css`)).toBe(false);
    expect(ignored(`${WORKTREE}/.svelte-kit/tsconfig.json`)).toBe(false);
    expect(ignored(`${WORKTREE}/.claude/worktrees/nested/src/app.css`)).toBe(true);
  });
});

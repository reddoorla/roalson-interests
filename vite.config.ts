import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import { imagetools } from "@zerodevx/svelte-img/vite";
import tailwindcss from "@tailwindcss/vite";

import { claudeDirIgnore } from "./scripts/claude-dir-ignore.mjs";

export default defineConfig({
  plugins: [sveltekit(), imagetools(), tailwindcss()],
  server: {
    fs: {
      // Allow access to files from the project root.
      allow: [".."],
    },
    watch: {
      // Agent worktrees live under `.claude/worktrees/`, inside the root this
      // server watches. A write in one of them ("changed tsconfig file
      // detected: …/.claude/worktrees/…/.svelte-kit/tsconfig.json") cleared
      // the cache and forced a full reload here, mid-request — a 500 on a page
      // that was fine (2026-09-21). eslint.config.js ignores the same directory.
      // Anchored to THIS root, not "**/.claude/**": from inside a worktree that
      // glob matched every file of the project, and a dev server started there
      // watched nothing (#39).
      ignored: [claudeDirIgnore(import.meta.dirname)],
    },
  },
  test: {
    environment: "jsdom",
    // scripts/ too: the capability index and its prompt hook live there, and a
    // repo-invariant test that never runs is a comment.
    include: ["src/**/*.test.{js,ts}", "scripts/**/*.test.{js,ts}"],
    setupFiles: ["./vitest-setup.ts"],
    server: {
      deps: {
        inline: ["@testing-library/svelte"],
      },
    },
  },
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
});

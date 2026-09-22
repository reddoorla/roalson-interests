import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";
import { imagetools } from "@zerodevx/svelte-img/vite";
import tailwindcss from "@tailwindcss/vite";

import { claudeDirIgnore } from "./scripts/claude-dir-ignore.mjs";

export default defineConfig({
  plugins: [sveltekit(), imagetools(), tailwindcss()],
  // maplibre-gl is pre-bundled at dev-server START rather than discovered when
  // the first map mounts. It is only reached through a dynamic import (see
  // $lib/map-engine), so Vite would otherwise not find it during its initial
  // scan and would optimize it mid-session — a second-long stall, and on a
  // first page view of /dev/home it lands inside the featured carousel's first
  // 4s dwell. Measured there: 2609.8ms of overshoot on a turn the spec allows
  // 300ms of slack. None of this exists in a production build, where the chunk
  // is already built (#103).
  optimizeDeps: { include: ["maplibre-gl"] },
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
    // The property map's engine is not transformed for unit tests. `?worker&url`
    // inside $lib/map-engine makes Vite BUILD maplibre's 507 KB worker at
    // transform time, once per Vitest worker that reaches PropertyMap.svelte —
    // measured at 95.4s to import that component and assert nothing, against
    // 33.2s without the worker import. See vitest-map-engine-stub.ts for what
    // is lost (nothing jsdom could have measured) and where it is measured
    // instead.
    alias: [
      {
        find: /^\$lib\/map-engine$/,
        replacement: new URL("./vitest-map-engine-stub.ts", import.meta.url).pathname,
      },
    ],
    server: {
      deps: {
        inline: ["@testing-library/svelte"],
      },
    },
  },
  resolve: process.env.VITEST ? { conditions: ["browser"] } : undefined,
});

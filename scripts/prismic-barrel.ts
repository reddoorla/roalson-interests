import type { Plugin } from "vite";

export const PRISMIC_SVELTE_BARREL = /[\\/]@prismicio[\\/]svelte[\\/]dist[\\/]index\.js$/;

const REEXPORT = /export\s+(?:type\s+)?\{[^}]*[\w$][^}]*\}\s+from\s+(["'])[^"']+\1\s*;?/g;
const COMMENT = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

export function isReexportOnly(code: string): boolean {
  return code.replace(COMMENT, "").replace(REEXPORT, "").trim() === "";
}

export function prismicBarrel(): Plugin {
  return {
    name: "prismic-svelte-barrel",
    transform(code, id) {
      if (!PRISMIC_SVELTE_BARREL.test(id)) return null;
      if (!isReexportOnly(code)) {
        this.error(
          `${id} is no longer re-exports only, so it cannot be declared side-effect-free; review scripts/prismic-barrel.ts`,
        );
      }
      return { code, map: null, moduleSideEffects: false };
    },
  };
}

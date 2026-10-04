import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import {
  deriveBuildServices,
  type BuildServices,
  type CspDirectives,
  type SourceFile,
} from "../src/lib/privacy/services.ts";

export const VIRTUAL_ID = "virtual:privacy-services";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

const CODE_FILE = /\.(svelte|ts|js|mjs|cjs|mts|cts|css|html)$/;
const SKIPPED_FILE = /\.(test|spec)\.[cm]?[jt]s$|\.d\.ts$/;
const SKIPPED_DIRS = ["src/lib/privacy", "src/routes/privacy", "src/routes/dev"];

function walk(root: string, dir: string, out: SourceFile[], seen = new Set<string>()): void {
  let real: string;
  try {
    real = realpathSync(dir);
  } catch {
    return;
  }
  if (seen.has(real)) return;
  seen.add(real);
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full).split(sep).join("/");
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      if (!SKIPPED_DIRS.includes(rel) && entry !== "node_modules") walk(root, full, out, seen);
    } else if (CODE_FILE.test(entry) && !SKIPPED_FILE.test(entry)) {
      out.push({ path: rel, text: readFileSync(full, "utf8") });
    }
  }
}

type KitConfig = { kit?: { csp?: { directives?: CspDirectives }; adapter?: { name?: string } } };

async function readSvelteConfig(root: string): Promise<KitConfig> {
  const path = join(root, "svelte.config.js");
  if (!existsSync(path)) return {};
  const href = pathToFileURL(path).href;
  const fresh = process.env.VITEST ? href : `${href}?t=${statSync(path).mtimeMs}`;
  const mod = (await import(fresh)) as {
    default?: KitConfig;
  };
  return mod.default ?? {};
}

export async function collectBuildServices(root: string): Promise<BuildServices> {
  const config = await readSvelteConfig(root);
  const sources: SourceFile[] = [];
  if (existsSync(join(root, "src"))) walk(root, join(root, "src"), sources);
  const directives = config.kit?.csp?.directives;
  return deriveBuildServices({
    csp: directives && Object.keys(directives).length > 0 ? directives : null,
    adapterName: config.kit?.adapter?.name,
    sources,
  });
}

export function privacyServices(): Plugin {
  let root = process.cwd();
  return {
    name: "reddoor:privacy-services",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      const invalidate = (file: string) => {
        const rel = relative(root, file).split(sep).join("/");
        if (!rel.startsWith("src/") && rel !== "svelte.config.js") return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
      };
      server.watcher.on("add", invalidate);
      server.watcher.on("change", invalidate);
      server.watcher.on("unlink", invalidate);
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    async load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return `export default ${JSON.stringify(await collectBuildServices(root))};`;
    },
  };
}

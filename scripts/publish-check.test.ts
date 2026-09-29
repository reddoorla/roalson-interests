// @vitest-environment node
//
// The instrument behind `pnpm build`'s publish check (#120), proved on a
// known-good publish directory before any of its failures is believed, and
// then broken once for each thing it claims to catch. The check itself runs
// after every real build; this file needs no build, so it runs on every
// `pnpm test:unit` too.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { MAP_FILES, PUBLISH_DIR, publishProblems } from "./publish-check.mjs";
import { MAP_HOME } from "../src/lib/map-home";
import { DEFAULT_MAP_STYLE_URL } from "../src/lib/property-map";

const ROOT = join(import.meta.dirname, "..");

/** A throwaway root with `static/` holding the real files and a publish
 *  directory holding whatever `publish` copies in. */
const roots: string[] = [];
function fixture(publish: (dir: string) => void = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "publish-check-"));
  roots.push(root);
  mkdirSync(join(root, "static"));
  mkdirSync(join(root, PUBLISH_DIR));
  for (const f of MAP_FILES) {
    copyFileSync(join(ROOT, "static", f), join(root, "static", f));
    copyFileSync(join(ROOT, "static", f), join(root, PUBLISH_DIR, f));
  }
  publish(join(root, PUBLISH_DIR));
  return root;
}
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

const unbased = { appDir: "_app", appPath: "_app" };

describe("the files it checks are the files the map requests", () => {
  it("is exactly the style URL and the opening pictures, all at the origin root", () => {
    expect(DEFAULT_MAP_STYLE_URL.startsWith("/")).toBe(true);
    expect([...MAP_FILES].sort()).toEqual(
      [
        DEFAULT_MAP_STYLE_URL.slice(1),
        ...Object.values(MAP_HOME).map((frame) => frame.file),
      ].sort(),
    );
  });

  it("checks the directory Netlify publishes, after every build", () => {
    const toml = readFileSync(join(ROOT, "netlify.toml"), "utf-8");
    expect(/^\s*publish\s*=\s*"([^"]+)"/m.exec(toml)?.[1]?.replace(/\/$/, "")).toBe(PUBLISH_DIR);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts.build).toBe("vite build && node scripts/publish-check.mjs");
  });
});

describe("the check", () => {
  it("passes a publish directory that carries every file, byte for byte, at the root", () => {
    expect(publishProblems({ root: fixture(), ...unbased })).toEqual([]);
  });

  it("fails naming a file static/ no longer delivered", () => {
    const root = fixture((dir) => rmSync(join(dir, "map-style.json")));
    const problems = publishProblems({ root, ...unbased });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/build\/map-style\.json is missing/);
  });

  it("fails naming a file whose published bytes are not the committed ones", () => {
    const root = fixture((dir) => writeFileSync(join(dir, "map-home-full.webp"), "not a webp"));
    const problems = publishProblems({ root, ...unbased });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/build\/map-home-full\.webp is not static\/map-home-full\.webp/);
  });

  it("fails a build under a base path, where /map-style.json would not resolve", () => {
    const problems = publishProblems({ root: fixture(), appDir: "_app", appPath: "roalson/_app" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/built under a base path/);
  });
});

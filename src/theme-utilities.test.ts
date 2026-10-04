import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile } from "tailwindcss";
import { animateIn } from "$lib/actions/animateIn";

// A class that names a theme key Tailwind v4 does not have compiles to NOTHING,
// silently. `ease-fast-slow` shipped that way in both Animation components:
// the token was `--transition-fast-slow`, a v3 name, and v4 builds `ease-*`
// only from `--ease-*` (#183). `--screen-*` was the same defect for
// breakpoints (#171). So this compiles app.css with Tailwind itself and asks
// it about every class the markup spells.
//
// What it reads: the static text of `class=` / `*Class=` attribute values in
// src/**/*.svelte, the string literals inside their `{…}` expressions, and
// `class:` directives. Class strings kept in script constants are not read.
//
// Resolved from the project root: under jsdom `import.meta.url` is not a file:
// URL (see reduced-motion-reset.test.ts).
const ROOT = process.cwd();
const CSS = readFileSync(resolve(ROOT, "src/app.css"), "utf8");

/** Spelled like a utility and emitting nothing, on purpose. */
const HOOKS: Record<string, string> = {
  "mt-copy":
    "MediaText's copy-column hook, twin of `.mt-media`; `mt-` is the slice, not margin-top",
};

function* files(dir: string, re: RegExp): Generator<string> {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* files(rel, re);
    else if (re.test(entry.name)) yield rel;
  }
}

/** The attribute value that starts at `s[i]` — quoted or a bare `{…}`. */
function valueAt(s: string, i: number): string {
  const open = s[i];
  const close = open === "{" ? "}" : open;
  if (open !== '"' && open !== "'" && open !== "{") return "";
  let depth = open === "{" ? 1 : 0;
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && open !== "{") depth--;
    else if (s[j] === "}" && --depth === 0) return `{${s.slice(i + 1, j)}}`;
    else if (s[j] === close && depth === 0) return s.slice(i + 1, j);
  }
  return "";
}

/** Static text outside braces, plus '…' and "…" literals inside them. */
function classTokens(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let text = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) text += ch;
    else if (ch === "'" || ch === '"' || ch === "`") {
      const end = value.indexOf(ch, i + 1);
      if (end === -1) break;
      if (ch !== "`") parts.push(value.slice(i + 1, end));
      i = end;
    }
    if (ch === "{" || ch === "}") text += " ";
  }
  parts.push(text);
  return parts
    .join(" ")
    .split(/\s+/)
    .filter((t) => t && !/[`${}]/.test(t));
}

function spelledClasses(): Map<string, string> {
  const found = new Map<string, string>();
  for (const rel of files("src", /\.svelte$/)) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    for (const m of src.matchAll(/\s(?:class|[a-z]+Class)=/g)) {
      for (const t of classTokens(valueAt(src, m.index + m[0].length))) {
        if (!found.has(t)) found.set(t, rel);
      }
    }
    for (const m of src.matchAll(/\sclass:([^\s=>]+)/g)) {
      if (!found.has(m[1]!)) found.set(m[1]!, rel);
    }
  }
  return found;
}

/** A selector for `cls` as Tailwind escapes it. */
const selector = (cls: string) => `.${cls.replace(/[^\w-]/g, (ch) => `\\${ch}`)}`;
const literally = (s: string) =>
  new RegExp(`${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);

let tailwind: Awaited<ReturnType<typeof compile>>;
beforeAll(async () => {
  const index = resolve(ROOT, "node_modules/tailwindcss/index.css");
  tailwind = await compile(CSS, {
    base: resolve(ROOT, "src"),
    loadStylesheet: async (id) => {
      if (id !== "tailwindcss")
        throw new Error(`app.css imports ${id}; teach this test to load it`);
      return { path: index, base: dirname(index), content: readFileSync(index, "utf8") };
    },
  });
});

describe("classes the markup spells", () => {
  it("reads markup, and Tailwind answers for it — the instrument is not blind", () => {
    const spelled = [...spelledClasses().keys()];
    const css = tailwind.build(spelled);
    expect(
      spelled.filter((cls) => literally(selector(cls)).test(css)).length,
      "no class the markup spells compiles",
    ).toBeGreaterThan(0);
    expect(tailwind.build(["ease-out"])).toContain("transition-timing-function: var(--ease-out)");
    // Its answer for a key the theme lacks is nothing, which is the whole test.
    expect(tailwind.build(["ease-not-a-token"])).not.toContain(selector("ease-not-a-token"));
  });

  it("never names a theme key Tailwind does not have", () => {
    const spelled = spelledClasses();
    const css = tailwind.build([...spelled.keys()]);
    const styles = [...files("src", /\.(svelte|css)$/)]
      .map((rel) => readFileSync(join(ROOT, rel), "utf8"))
      .join("\n");
    /** Whether Tailwind has a utility by this root: `root-(--x)` compiles. */
    const knownRoot = (cls: string) => {
      const utility = cls.slice(cls.lastIndexOf(":") + 1).replace(/^!?-?/, "");
      const roots = utility.split("-").map((_, i, a) => a.slice(0, i + 1).join("-"));
      return roots
        .slice(0, -1)
        .some((r) => tailwind.build([`${r}-(--x)`]).includes(selector(`${r}-(--x)`)));
    };
    const dead = [...spelled]
      .filter(([cls]) => !literally(selector(cls)).test(css))
      .filter(([cls]) => !literally(selector(cls)).test(styles))
      .filter(([cls]) => !(cls in HOOKS) && knownRoot(cls))
      .map(([cls, rel]) => `${cls} (${rel})`);
    expect(dead).toEqual([]);
  });
});

describe("the easing animateIn writes", () => {
  it("is a token app.css's @theme declares", () => {
    const node = document.createElement("div");
    const { destroy } = animateIn(node);
    const transition = node.style.transition;
    destroy();
    expect(transition, "animateIn wrote no transition to read").not.toBe("");
    const reads = [...new Set([...transition.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]!))];
    const theme = CSS.slice(CSS.indexOf("@theme {"), CSS.indexOf("\n}\n", CSS.indexOf("@theme {")));
    for (const name of reads) expect(theme).toMatch(new RegExp(`^\\s*${name}:`, "m"));
  });
});

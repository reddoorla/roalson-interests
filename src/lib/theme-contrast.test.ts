import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The palette a site sets in `app.css` has to be legible where the TEMPLATE
 * already spends it, and nothing checked that.
 *
 * What went wrong, on roalson-interests 2026-09-17: the brand's secondary
 * colour is a light warm grey, it was assigned to `--color-secondary`, and that
 * token is a TEXT role in eight places the site never touched — the footer
 * copyright, `Field.svelte`'s description, the eyebrows on LeadText,
 * TextColumns and Testimonial, the testimonial role line, the contact intro and
 * a dev fixture. So one token assignment failed axe on every page that renders
 * a footer, at 1.97:1. It was caught by the a11y gate, which is late: the gate
 * needs a built site and a browser, it names one node rather than the class,
 * and on a fresh clone it is pointed at fixtures and would not have run on a
 * real page at all.
 *
 * The naming is what makes this a trap. `--color-secondary` asserts that the
 * token is text-capable, and a brand's "secondary colour" very often is not.
 *
 * So this is a unit test, and it fails in milliseconds with no browser. It
 * encodes the pairs the template's own markup composes; a site that changes the
 * palette runs it unchanged and learns immediately.
 */

const AA_NORMAL_TEXT = 4.5;

/** Tokens the template renders as text on a LIGHT ground. */
/** `error` joined 2026-09-18: Field's error and required-marker text, which
 *  used Tailwind's red-600 outside the theme and measured 4.15:1 here. */
const LIGHT_GROUND_TEXT = ["secondary", "primary", "dark", "black", "error"] as const;
/** The light grounds those land on. `light` (sand) joined on 2026-09-18: the
 *  property page's panel is the comp's sand card, and it carries secondary and
 *  garnet text — see the note below, which predicted exactly this. */
const LIGHT_GROUNDS = ["background", "white", "light"] as const;

/** Tokens the template renders as text on a DARK ground. `dust` is the comp's
 *  button-hover text on a garnet fill, and `light` (sand) the status badges on
 *  garnet — both are text ONLY on dark grounds, where they measure 5.11:1 and
 *  8.87:1 on garnet. Neither may appear as text on a light ground.
 *  `background` (the page's off-white) joined 2026-09-20: the listing's
 *  featured card is the comp's garnet card with off-white text and an
 *  off-white-outlined button — 10.5:1 on garnet. */
const DARK_GROUND_TEXT = ["white", "dust", "light", "background"] as const;
/** The dark grounds those land on. */
const DARK_GROUNDS = ["primary", "dark", "black"] as const;

/** Fills that carry exactly ONE text token, so they are measured as pairs and
 *  not as grounds. `dust` is a hover fill — the comp's `button light`, the
 *  navbar's CONTACT US over a dark band, fills dust and turns its label garnet
 *  (5.11:1). It is NOT a light ground: secondary on dust is 2.75:1, so adding
 *  it to LIGHT_GROUNDS would be a claim the palette cannot keep. */
const FILL_PAIRS = [{ text: "primary", ground: "dust" }] as const;

/**
 * `bg-light` was deliberately left OUT of LIGHT_GROUNDS until something put text
 * inside it, with this warning: "the pair is one nesting away from being real,
 * and it is already below AA in the shipped defaults. If you put secondary text
 * on `bg-light`, add "light" to LIGHT_GROUNDS and fix whichever value then
 * fails." PropertyDetail.svelte is that nesting (roalson-interests, 2026-09-18),
 * so it is in. Against this site's palette nothing failed: secondary on sand
 * measures 4.80:1, garnet 8.87:1. (The template's placeholder palette still
 * fails it at 3.90:1 — a clone that keeps those defaults and renders the
 * property page would learn so here.)
 */

type Rgb = [number, number, number];

/** CSS named colours the theme actually uses. Not a general parser — an
 *  unknown value throws below rather than being silently skipped. */
const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };

function parseThemeColors(css: string): Record<string, string> {
  const block = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error("app.css has no @theme block");
  const out: Record<string, string> = {};
  for (const m of block[1].matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

function toRgb(value: string, token: string): Rgb {
  const v = NAMED[value] ?? value;
  if (!v.startsWith("#")) {
    throw new Error(
      `--color-${token} is "${value}", which this guard cannot measure. ` +
        `Use a hex value, or add it to NAMED if it is a named colour.`,
    );
  }
  const h = v.slice(1).length === 3 ? v.slice(1).replace(/./g, (c) => c + c) : v.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** WCAG 2.x relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// cwd-relative, not `import.meta.url`: every suite here runs under jsdom (see
// vite.config.ts), where import.meta.url is not a file: URL and readFileSync
// throws "The URL must be of scheme file". Vitest's cwd is the repo root.
const REPO_ROOT = process.cwd();
const css = readFileSync(resolve(REPO_ROOT, "src/app.css"), "utf8");
const colors = parseThemeColors(css);

/** Every .svelte file under src/. A plain walk rather than fs.globSync, which
 *  needs Node 22 while package.json#engines allows 20. */
function svelteFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) svelteFiles(full, acc);
    else if (entry.name.endsWith(".svelte")) acc.push(full);
  }
  return acc;
}

function resolveToken(token: string): Rgb {
  const raw = colors[token] ?? NAMED[token];
  if (raw === undefined) throw new Error(`No --color-${token} in app.css @theme`);
  return toRgb(raw, token);
}

describe("theme contrast", () => {
  it.each(LIGHT_GROUND_TEXT.flatMap((text) => LIGHT_GROUNDS.map((ground) => ({ text, ground }))))(
    "text-$text on bg-$ground meets AA",
    ({ text, ground }) => {
      const ratio = contrast(resolveToken(text), resolveToken(ground));
      expect(
        ratio,
        `--color-${text} on --color-${ground} is ${ratio.toFixed(2)}:1, below AA ` +
          `(${AA_NORMAL_TEXT}:1). The template renders text-${text} on this ground, so ` +
          `this fails on every page that does. Either darken --color-${text}, or — if the ` +
          `brand colour must stay as it is — give it a fill-only token of its own and set ` +
          `--color-${text} to an AA-safe value. Do not silence this by changing the pair.`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(DARK_GROUND_TEXT.flatMap((text) => DARK_GROUNDS.map((ground) => ({ text, ground }))))(
    "text-$text on bg-$ground meets AA",
    ({ text, ground }) => {
      const ratio = contrast(resolveToken(text), resolveToken(ground));
      expect(
        ratio,
        `--color-${text} on --color-${ground} is ${ratio.toFixed(2)}:1, below AA.`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(FILL_PAIRS)("text-$text on the bg-$ground fill meets AA", ({ text, ground }) => {
    const ratio = contrast(resolveToken(text), resolveToken(ground));
    expect(
      ratio,
      `--color-${text} on --color-${ground} is ${ratio.toFixed(2)}:1, below AA.`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  /**
   * Completeness, so the lists above cannot quietly fall behind the markup.
   * A new `text-<token>` class is a new claim that the token is legible
   * somewhere; this fails until someone says which ground it lands on.
   */
  it("every text-<theme token> in src is classified by ground", () => {
    const files = svelteFiles(resolve(REPO_ROOT, "src"));
    const known = new Set<string>([...LIGHT_GROUND_TEXT, ...DARK_GROUND_TEXT]);
    const themeTokens = Object.keys(colors).filter((t) => !["transparent", "current"].includes(t));
    const found = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\btext-([a-z0-9-]+)\b/g)) {
        if (themeTokens.includes(m[1])) found.add(m[1]);
      }
    }
    const unclassified = [...found].filter((t) => !known.has(t));
    expect(
      unclassified,
      `These tokens are used as text but are not in LIGHT_GROUND_TEXT or ` +
        `DARK_GROUND_TEXT, so their contrast is unmeasured: ${unclassified.join(", ")}. ` +
        `Add each to the list matching the ground it renders on.`,
    ).toEqual([]);
    // Guard the guard: if this found nothing at all, the scan is broken.
    expect(found.size).toBeGreaterThan(0);
  });
});

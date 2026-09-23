import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";

import { PALETTE } from "../../scripts/map-style.mjs";

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

/** Tokens the template renders as text on a DARK ground. `dust` is HomeHero's
 *  specialty line and the open menu's type, and `light` (sand) the status
 *  badges on garnet AND — since the operator's 2026-09-22 call — every
 *  button's light tone, label and 1px outline both. Both are text ONLY on dark
 *  grounds, where they measure 5.11:1 and 8.87:1 on garnet. Neither may appear
 *  as text on a light ground.
 *  `background` (the page's off-white) joined 2026-09-20: the listing's
 *  featured card is the comp's garnet card with off-white text and an
 *  off-white-outlined button — 10.5:1 on garnet. */
const DARK_GROUND_TEXT = ["white", "dust", "light", "background"] as const;
/** The dark grounds those land on. */
const DARK_GROUNDS = ["primary", "dark", "black"] as const;

/** Fills that carry exactly ONE text token, so they are measured as pairs and
 *  not as grounds.
 *
 *  `dust` is here because it is NOT a light ground: secondary on dust is
 *  2.75:1, so adding it to LIGHT_GROUNDS would be a claim the palette cannot
 *  keep. Until 2026-09-22 it was the navbar's CONTACT US fill (the comp's
 *  `button light`); the operator moved every button's light colour to the tan
 *  that day, so no BUTTON fills dust now — HomeHero's half-pixel rule is the
 *  only `bg-dust` left in src/, and that carries no text at all. The pair is
 *  kept, not deleted: dust is still the one token the palette permits as a
 *  non-ground fill, and 5.11:1 is what has to hold the next time something
 *  fills it.
 *
 *  `light` (sand) is the button's hover fill since that call. It is also a
 *  real LIGHT_GROUND below, so this row is deliberately redundant — it is
 *  here so the file NAMES the button, rather than covering it by accident
 *  through a list that exists for another reason. */
const FILL_PAIRS = [
  { text: "primary", ground: "dust" },
  { text: "primary", ground: "light" },
] as const;

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

/**
 * THE PROPERTY MAP'S TINTED PALETTE (#13 follow-up).
 *
 * `scripts/map-style.mjs` repaints OpenFreeMap's liberty style into this
 * site's colours, and the labels it writes are TEXT — drawn into a WebGL
 * canvas, where axe cannot see them and the a11y gate will never say a word.
 * So the numbers live here, beside the rest of the palette's, measured with
 * the same WCAG 2.x implementation rather than a second copy of it.
 *
 * Every number below was computed here first and then written down; three of
 * the four figures in the brief that commissioned this work did not survive
 * that (see the notes on each).
 */
describe("the property map's tinted palette", () => {
  const rgb = (hex: string) => toRgb(hex, `map ${hex}`);
  const ratio = (fg: string, bg: string) => contrast(rgb(fg), rgb(bg));
  /** `alpha` of `fg` composited over opaque `bg`, as the GPU blends it. */
  const over = (fg: string, bg: string, alpha: number) =>
    ("#" +
      rgb(fg)
        .map((c, i) => Math.round(c * alpha + rgb(bg)[i] * (1 - alpha)).toString(16))
        .map((h) => h.padStart(2, "0"))
        .join("")) as string;

  it("puts water labels on water at 8.02:1", () => {
    expect(ratio(PALETTE.darkGarnet, PALETTE.water)).toBeCloseTo(8.0248, 3);
  });

  it("puts place labels on the ground at 14.85:1", () => {
    expect(ratio(PALETTE.darkGarnet, PALETTE.ground)).toBeCloseTo(14.8543, 3);
  });

  /**
   * The brief said 6.98:1 for garnet on park and that is wrong by any reading.
   * The park FILL is `#d3d7bd` — 7.82:1 — and it is never even painted neat:
   * the layer carries `fill-opacity: 0.7`, so what a label actually sits on is
   * that fill blended over the ground, `#dcdeca`, at 8.44:1. Both are recorded,
   * because the composite is what a visitor sees and the literal is what the
   * style file says.
   */
  it("puts country and state labels on parkland at 7.82:1 neat, 8.44:1 as painted", () => {
    expect(ratio(PALETTE.garnet, PALETTE.park)).toBeCloseTo(7.8243, 3);
    expect(ratio(PALETTE.garnet, over(PALETTE.park, PALETTE.ground, 0.7))).toBeCloseTo(8.4402, 3);
  });

  /**
   * ROAD LABELS ON ROAD FILLS. Every one of these cleared AA on 2026-09-22 when
   * the road table was retuned (review of #113) — the reason the fills moved was
   * the CASINGS (see the block below), and the label numbers came along with
   * them. The worst pair, `highway-name-major` over the motorway fill, went
   * 4.4511 -> 4.7025:1.
   *
   * WHAT THAT MEANS FOR THE HALO, said plainly because the previous version of
   * this test got it wrong the other way. `highway-name-major` and `-minor`
   * gained a `text-halo-color` they had no upstream (only a blur and a width,
   * over MapLibre's transparent default), and the 2026-09-22 entry called it
   * "the only mitigation for the one sub-AA pair". There is now no sub-AA pair
   * for it to mitigate: the halo is no longer load-bearing for AA. It stays
   * anyway, and for a reason that was always the better one — a glyph's edge is
   * read against the pixel immediately outside it, which on a 1px stroke is the
   * halo and not the fill, and the halo's own number (5.4472:1 on the ground)
   * is the highest of the lot. `scripts/map-style.test.ts` now asserts it is
   * really in the committed file WITH a non-zero width, which nothing did when
   * the claim was load-bearing.
   *
   * The brief that commissioned the first table said "secondary on sand road
   * 4.80:1". 4.80 is `--color-secondary` on the BRAND's sand `#e8e1d1` — the
   * number already in app.css's table — and no road on this map is or was that
   * colour. Kept here because it is the kind of number that gets re-derived.
   */
  it("keeps every road label above AA on its own fill, halo or no halo", () => {
    expect(ratio(PALETTE.secondary, PALETTE.motorway)).toBeCloseTo(4.7025, 3);
    expect(ratio(PALETTE.secondary, PALETTE.arterial)).toBeCloseTo(5.0553, 3);
    expect(ratio(PALETTE.secondary, PALETTE.secondaryRoad)).toBeCloseTo(5.4038, 3);
    expect(ratio(PALETTE.secondary, PALETTE.minorRoad)).toBeCloseTo(6.2514, 3);
    expect(ratio(PALETTE.secondary, PALETTE.serviceRoad)).toBeCloseTo(6.0932, 3);
    // The motorway fill is the floor, and it is the one that was below AA.
    for (const fill of [
      PALETTE.motorway,
      PALETTE.arterial,
      PALETTE.secondaryRoad,
      PALETTE.minorRoad,
      PALETTE.serviceRoad,
    ]) {
      expect(ratio(PALETTE.secondary, fill), `road label on ${fill}`).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    }
    // The halo, which is what the glyph's edge actually lands on.
    expect(ratio(PALETTE.secondary, PALETTE.ground)).toBeCloseTo(5.4472, 3);
    expect(ratio(PALETTE.secondary, PALETTE.ground)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  /**
   * THE ROAD CASINGS, AND THE CRITERION THEY STILL DO NOT MEET (#119).
   *
   * A road on this map is a fill with a casing either side, and at a section fit
   * zoom the casing is most of what says "this is a road". How little of it
   * there is, measured rather than assumed: screenshotting the land section at
   * z6.948 and counting EXACT colour matches finds the casing literals 0-3
   * times in a 203,832 px frame — every one of them is antialiased into
   * whatever it crosses. That makes it meaningful non-text content drawn at
   * sub-pixel width, and WCAG 2.1 SC 1.4.11 wants such content at 3:1 against
   * what it is adjacent to.
   *
   * The first table failed that badly: motorway casing `#c8b98f` measured
   * **1.6956:1** against the ground, i.e. sand on sand. The operator's report
   * was that I-10 through Boerne did not read as a road at all; what is
   * measured here is the ratio, and the render is in the PR. The retune roughly
   * doubles the motorway's distance from the ground — but it is honest about
   * where it lands:
   *
   *   motorway            #a3906a  2.7090  still under 3
   *   motorway_link/…     #b6a685  2.0836  still under 3
   *   secondary/tertiary  #c6b99d  1.6900
   *   minor / street      #d5cbb5  1.4034
   *   service / track     #e4ddcc  1.1795
   *
   * NOT ONE OF THEM MEETS 3:1. The operator's table was measured by eye against
   * a render, and by eye it is a large improvement; by the criterion it is a
   * large improvement that still fails. Darkening far enough to pass would put
   * a near-brown grid over a sand map and is a design call, not a fix to make
   * inside a review PR — so the numbers are asserted here (they cannot drift
   * unnoticed) and the gap is #119.
   *
   * This test is a RECORD, not a pass: it pins the measured values and asserts
   * the direction of travel from the shipped ones. It deliberately does not
   * assert >= 3, because that would be red on purpose.
   */
  it("records every road casing against the ground, including the ones under 3:1", () => {
    expect(ratio(PALETTE.motorwayCasing, PALETTE.ground)).toBeCloseTo(2.709, 3);
    expect(ratio(PALETTE.arterialCasing, PALETTE.ground)).toBeCloseTo(2.0836, 3);
    expect(ratio(PALETTE.secondaryRoadCasing, PALETTE.ground)).toBeCloseTo(1.69, 3);
    expect(ratio(PALETTE.minorRoadCasing, PALETTE.ground)).toBeCloseTo(1.4034, 3);
    expect(ratio(PALETTE.serviceRoadCasing, PALETTE.ground)).toBeCloseTo(1.1795, 3);
    // Every one is still under the 3:1 SC 1.4.11 asks for. Asserted as a fact
    // about today so that the day one of them passes, this line says so.
    for (const casing of [
      PALETTE.motorwayCasing,
      PALETTE.arterialCasing,
      PALETTE.secondaryRoadCasing,
      PALETTE.minorRoadCasing,
      PALETTE.serviceRoadCasing,
    ]) {
      expect(ratio(casing, PALETTE.ground), `casing ${casing} vs ground — see #119`).toBeLessThan(
        3,
      );
    }
    // And the retune really did move the motorway casing, which is the one the
    // operator measured. The shipped value is here so the comparison is real
    // rather than a remembered number.
    expect(ratio("#c8b98f", PALETTE.ground)).toBeCloseTo(1.6956, 3);
    expect(ratio(PALETTE.motorwayCasing, PALETTE.ground)).toBeGreaterThan(
      ratio("#c8b98f", PALETTE.ground),
    );
  });

  /**
   * NOT A PASS, and recorded as a number rather than left out. `highway-name-path`
   * is footpath and track names at minzoom 15.5 — well past every section's fit
   * (6.948 land, 9.644 improved) but reachable by pinching in — and at 3.27:1 on
   * its halo it is below AA for normal text. Tracked as an issue rather than
   * quietly darkened here, because the tone came from the operator's table.
   */
  it("records the one map label that is BELOW AA, so it cannot be forgotten", () => {
    expect(ratio(PALETTE.pathLabel, PALETTE.ground)).toBeCloseTo(3.2686, 3);
    expect(ratio(PALETTE.pathLabel, PALETTE.ground)).toBeLessThan(AA_NORMAL_TEXT);
  });

  /** The map's ground IS the page's ground, so a tile that has not arrived is
   *  invisible rather than a white flash. That is a palette claim, not a
   *  coincidence, so it is asserted against app.css. */
  it("paints the map's ground in the page's own --color-background", () => {
    expect(PALETTE.ground).toBe(colors.background);
    expect(PALETTE.garnet).toBe(colors.primary);
    expect(PALETTE.darkGarnet).toBe(colors.dark);
    expect(PALETTE.secondary).toBe(colors.secondary);
  });
});

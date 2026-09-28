// The brand palette as a browser COMPUTES it, for the specs in this directory.
//
// A spec reads a colour back off the page — `getComputedStyle`, a pixel out of
// a screenshot, the theme-color meta — and has to compare it with something.
// Until 2026-09-28 every spec spelled that something itself — the off-white
// and the sand between them in fourteen files under tests/interaction, as
// `rgb()` strings, as `[r, g, b]` arrays and as hex. When the designer moved
// both colours, each copy had to be found by grep, and a copy that was missed
// did not always fail. An equality goes red; a NEGATIVE one —
// `featured-properties.spec.ts`'s "the map is not sand over the dark band",
// `canvas-ground.spec.ts`'s "not the off-white the operator reported" — keeps
// passing on a colour the page no longer paints anywhere, and so stops
// testing anything at all.
//
// So the values live here once. `scripts/spec-palette.test.ts` holds each one
// to app.css's `@theme` block, and fails if any file under tests/ spells the
// off-white or the sand itself, or still spells the pair they replaced.
//
// A plain module, because a spec cannot import another spec, and cannot import
// from src/lib without dragging a `.svelte` entry into Playwright's loader.

/** Each value exactly as app.css's `@theme` spells `--color-<key>`. */
export const PALETTE_HEX = {
  background: "#f3f1ef",
  light: "#eae7e4",
  primary: "#652323",
  dark: "#3d0707",
} as const;

export type Rgb = [number, number, number];

const channels = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** How `getComputedStyle` reports an opaque colour. */
export const computed = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;

/** --color-background, the page ground (off-white). */
export const OFF_WHITE_HEX = PALETTE_HEX.background;
export const OFF_WHITE_RGB = channels(PALETTE_HEX.background);
export const OFF_WHITE = computed(OFF_WHITE_RGB);

/** --color-light, sand: card ground, and light type on garnet. */
export const SAND_HEX = PALETTE_HEX.light;
export const SAND_RGB = channels(PALETTE_HEX.light);
export const SAND = computed(SAND_RGB);

/** --color-primary, garnet. */
export const GARNET_RGB = channels(PALETTE_HEX.primary);
export const GARNET = computed(GARNET_RGB);

/** --color-dark, dark garnet. */
export const DARK_RGB = channels(PALETTE_HEX.dark);
export const DARK = computed(DARK_RGB);

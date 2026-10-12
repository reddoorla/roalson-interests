/**
 * MAP_HOME — the frame every property map OPENS on, and the frame the
 * committed raster placeholder is a picture of (#122).
 *
 * WHY THIS FILE EXISTS RATHER THAN A BLOCK IN `$lib/property-map`.
 * `scripts/map-home.mjs` renders the raster and it is a plain `.mjs` run by
 * hand, so it cannot resolve `$lib/*` — and `property-map.ts` imports
 * `$lib/prismicio` and `$lib/property` for values, which Node's type stripping
 * cannot erase. A generator that TYPED the camera again would be a second copy
 * of the truth, and the whole point of the design below is that there is
 * exactly one. So the constant lives in a module with NO imports at all, which
 * `node` can load directly, and `$lib/property-map` re-exports it: every
 * consumer still says `import { MAP_HOME } from "$lib/property-map"`.
 *
 * WHY A CHOSEN FRAME AND NOT `fitCamera(points)`. A placeholder rendered at
 * the auto-fit is derived from PUBLISHED PRISMIC CONTENT, so a committed image
 * goes silently wrong after a publish that never touches this repo, and
 * nothing offline could tell. A CHOSEN frame depends only on a constant in the
 * source, so the only thing the image can drift against is
 * `static/map-style.json` sitting beside it in the same commit — which is a
 * hash comparison, and that is what `scripts/map-home.test.ts` is.
 *
 * THE NUMBERS. Operator's call, 2026-09-22, from three framed options: centre
 * 29.62, -98.52 ("frame A"). The zooms were re-derived here from the 22 real
 * seeded coordinates (`scripts/seed/listings.json`) with this repo's own
 * `clusterPoints`:
 *
 *                       in frame   own pin   inside a cluster
 *   full    z8.6        18 / 22    9         13
 *   compact z8.0        17 / 22    9         13
 *   (today) auto-fit    22 / 22    5         17     z6.948088 at 397 x 595
 *
 * "in frame" is counted at the frame's `reference` box below — the SMALLEST
 * box that frame is ever drawn at — so a pin that only appears on the wide
 * homepage band is not counted as covered on the phone.
 *
 * COMPACT IS A SEPARATE ZOOM, and it is not a rounding of the full one.
 * Squeezing frame A's geographic extent into a 200px-tall box lands at z6.59,
 * which draws all of South Texas as a postage stamp; z8.0 keeps 17 of the 22
 * and the metro legible.
 *
 * WHY THE `raster` BOXES ARE BIGGER THAN ANY COMP BOX. The camera is fixed, so
 * a container of ANY size shows the central crop of one render at that camera
 * — `background-position: center` with `background-size` at the raster's own
 * pixel size, never `cover`, which would scale it and break alignment with the
 * tiles. The sizes therefore cover the widest box each frame is ever drawn in:
 *
 *   compact  the phone/tablet map is 200 tall and at most a full-bleed 1023
 *            wide (below `lg`); 1024 x 304 covers it with the 300px frame
 *            threshold to spare.
 *   full     the Properties panel is a fixed 397 x 595 at every width above
 *            `lg` (measured at 1440 AND 2560 — `max-w-[1440px]` caps it). The
 *            homepage band's slot is the one that grows, in BOTH axes, and
 *            that was got wrong once: this read "on the band's ~827 height",
 *            which is the COMP's number, and the band is as tall as its card's
 *            content. Measured with scripting off:
 *
 *              1440   513 x 843.4
 *              1920   753 x 983.6
 *              2560  1073 x 1170.5
 *
 *            1088 x 896 — sized from the comp — therefore left 43.8px of bare
 *            ground above and below the map at 1920, and 137px at 2560:
 *            visible as a flat beige band with no roads in it, in a screenshot
 *            taken to check exactly this. 1088 x 1184 covers every box up to a
 *            2560-wide viewport.
 *
 * Beyond those widths the uncovered margin paints `MAP_HOME_GROUND`, which is
 * the style's own `background` layer colour — the same pixel MapLibre paints
 * where it has no tile — so the degradation is a wider ground, never a seam.
 */
export interface HomeCamera {
  lng: number;
  lat: number;
  zoom: number;
}

export interface HomeBox {
  width: number;
  height: number;
}

export interface HomeFrame {
  /** What MapLibre is CONSTRUCTED with, and what the raster was rendered at. */
  camera: HomeCamera;
  /** The committed raster's own pixel size, and its `background-size`. */
  raster: HomeBox;
  /** Its file, under `static/`. */
  file: string;
  /** The smallest box this frame is drawn at — where coverage is decided. */
  reference: HomeBox;
}

export const MAP_HOME = {
  full: {
    camera: { lng: -98.52, lat: 29.62, zoom: 8.6 },
    raster: { width: 1088, height: 1184 },
    file: "map-home-full.webp",
    reference: { width: 397, height: 595 },
  },
  compact: {
    camera: { lng: -98.52, lat: 29.62, zoom: 8.0 },
    raster: { width: 1024, height: 304 },
    file: "map-home-compact.webp",
    reference: { width: 350, height: 200 },
  },
} as const satisfies Record<string, HomeFrame>;

/**
 * The style's own `background` layer colour, painted under and around the
 * raster. Not a taste choice and not transcribed on trust:
 * `scripts/map-home.test.ts` reads `static/map-style.json` and fails if the
 * two ever differ, because a placeholder whose margin is a different beige
 * from the map's is a visible seam at exactly the moment the tiles arrive.
 */
export const MAP_HOME_GROUND = "#f3f1ef";

/**
 * THE PICTURE'S OWN CREDIT: the attribution of the one source the raster is
 * drawn from, exactly as `static/map-style.json` carries it and exactly what
 * MapLibre's control inserts once the engine is up.
 *
 * The raster is a produced work of OpenStreetMap data (ODbL) on the
 * OpenMapTiles schema, and it was rendered with `attributionControl: false`,
 * so until 2026-09-29 the picture carried NO credit at all: for a visitor
 * with scripting off that was every map on the site, forever, and for
 * everyone else it was every map between first paint and MapLibre's `load`
 * (a map below the fold stays a picture until half of it is scrolled on
 * screen, #103). A picture has no interaction to collapse it on and no clock,
 * so the OSMF safe harbour asks for the whole line, and that is what is drawn.
 *
 * Typed here once, not read from the style at runtime — that would ship the
 * whole style JSON to draw one line — and `scripts/map-home.test.ts` fails the
 * day the two stop being the same string.
 */
export const MAP_HOME_CREDIT =
  '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/**
 * How long the canvas takes to come up over the picture, in ms.
 *
 * It is here rather than as a Tailwind `duration-300` because TWO things have
 * to agree on it: the canvas's own `transition-duration`, and the timer that
 * removes the picture underneath once the canvas is opaque. A class and a
 * `setTimeout` typing the same number is the coupling `CAMERA_FLIGHT_MS`
 * already records paying for — tune one and the other silently stops matching,
 * with a flash of the tone ground as the symptom.
 *
 * 300ms is the shortest cross-fade that does not read as a cut at this size;
 * it is a fifth of what the boot it hides costs. Never used under
 * `prefers-reduced-motion`: the canvas's transition is `none` there and the
 * hand-over is immediate, which is #122's own rule.
 */
export const MAP_HOME_FADE_MS = 300;

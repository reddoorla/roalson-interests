// Everything the per-section map knows that is NOT MapLibre (#13).
//
// This module is deliberately free of `maplibre-gl`, of the DOM and of
// `$env`: the map's 426 KB engine is dynamically imported by
// PropertyMap.svelte only once its box is on screen, and none of the
// arithmetic below may be trapped inside that chunk — it is the part a unit
// test can measure against the real portfolio's 22 coordinates.
//
// WHY THE CAMERA IS COMPUTED HERE RATHER THAN HANDED TO `fitBounds`.
// MapLibre's `fitBounds` would do it, in the browser, where nothing in
// `pnpm test:unit` can see the answer. The Mercator arithmetic is nine lines;
// having it here means the zoom a section lands on is a NUMBER a test asserts,
// and the same number the clustering is measured at. `map.jumpTo` takes the
// result. (It also sidesteps `fitBounds`' padding/`maxZoom` interaction, which
// is easy to get subtly wrong and impossible to notice.)
//
// THE NUMBERS BELOW CAME FROM THE REAL SEEDED PORTFOLIO, not from taste.
// 22 published listings, every one with a filled `location` GeoPoint, read
// from the Content API on 2026-09-22:
//
//   land      17 listings  lat 27.4901..29.9813  lng -98.9023..-97.8487
//                          277.0 km N-S, 101.7 km E-W
//   improved   5 listings  lat 29.4254..29.6774  lng -98.6383..-98.3668
//                          28.0 km N-S, 26.3 km E-W
//   sold       0           (groupListings drops an empty section)
//
// Land does not fit one legible frame. At the comp's 397 x 595 panel the fit
// zoom is 6.948, and at THAT zoom 32 of the 136 land pairs are closer than the
// pin's own 48px box — the tightest (Cascade Caverns / IH-10 at Scenic Loop,
// 0.193 km apart on the ground) is 0.35 px apart on the screen. Two pins
// drawn 0.35px apart are one pin that lies about how many listings there are.
// Separating that pair by a full pin box needs zoom 14.5, a street-level view
// no section overview can reach. So clustering is not a nicety here; it is the
// only way the pin count can be true. See `clusterPoints`.
import { asLink, isFilled } from "@prismicio/client";

import type { FeaturedSlide } from "$lib/featured-properties";
import { MAP_HOME as HOME, type HomeFrame } from "$lib/map-home";
import { linkResolver } from "$lib/prismicio";
import { mapsUrl } from "$lib/property";
import type { PropertyDocument } from "../prismicio-types";

/** OUR OWN STYLE, SERVED FROM OUR OWN ORIGIN, over OpenFreeMap's tiles.
 *
 *  `static/map-style.json` is OpenFreeMap's "liberty" style with 117 paint
 *  values repainted into this site's palette, five layers removed and the
 *  attribution trimmed to what the licence actually requires. It is generated
 *  by `node scripts/map-style.mjs` and COMMITTED — never fetched at build time,
 *  because a build that depends on a third party's uptime fails on PRs that
 *  touched nothing near the map.
 *
 *  Only the STYLE moved. The vector tiles, the sprite sheet and the glyph
 *  ranges are still OpenFreeMap's (MAP_TILE_HOST), still keyless, still
 *  account-free and still set no cookie on our page — which is why the CSP
 *  entry below did not change. Overridable so that swapping to a keyed provider
 *  later is one env var plus one CSP host. */
export const DEFAULT_MAP_STYLE_URL = "/map-style.json";

/** The style URL to load, given `PUBLIC_MAP_STYLE_URL` exactly as the
 *  environment holds it. Blank, whitespace or unset means the default: an
 *  empty variable on a host's dashboard must not render a blank map. */
export function mapStyleUrl(configured?: string | null): string {
  const trimmed = configured?.trim();
  return trimmed ? trimmed : DEFAULT_MAP_STYLE_URL;
}

/** Whichever CSP host the style above needs, for docs/security.md to quote.
 *  Still the only external host the map reaches: the style is ours, everything
 *  it POINTS at is OpenFreeMap's. `scripts/map-style.test.ts` asserts that of
 *  the committed file rather than taking this comment's word for it. */
export const MAP_TILE_HOST = "https://tiles.openfreemap.org";

/** One listing on the map. Everything a pin draws or links to, and nothing
 *  else — the component never sees a PropertyDocument. */
export interface MapPoint {
  /** The listing's document id; the marker's key. */
  id: string;
  title: string;
  lat: number;
  lng: number;
  /** `/properties/<uid>`, or null when the document carries no uid. */
  href: string | null;
  /** Google Maps centred on the pin. The no-JS list links here, and it needs
   *  no key, no script and no CSP host (a link navigation is not governed by
   *  one). */
  mapsUrl: string;
  /** Google Maps directions TO the pin — the operator's explicit ask. */
  directionsUrl: string;
}

function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** The listing pins for one Properties-page section. A listing with an empty
 *  `location` is simply not on the map — the GeoPoint is optional in Prismic,
 *  and a pin at (0, 0) in the Gulf of Guinea is worse than no pin. It keeps
 *  its card and its link either way. */
export function sectionPoints(properties: readonly PropertyDocument[]): MapPoint[] {
  const points: MapPoint[] = [];
  for (const property of properties) {
    const loc = property.data.location;
    if (!isFilled.geoPoint(loc)) continue;
    const search = mapsUrl(property);
    if (search === null) continue;
    points.push({
      id: property.id,
      title: property.data.title?.trim() || "Untitled listing",
      lat: loc.latitude,
      lng: loc.longitude,
      href: asLink(property, { linkResolver }) ?? null,
      mapsUrl: search,
      directionsUrl: directionsUrl(loc.latitude, loc.longitude),
    });
  }
  return points;
}

/** The same, for the homepage band — whose slides are a content relationship's
 *  embedded fields, never a whole document (see $lib/featured-properties). */
export function slidePoints(slides: readonly FeaturedSlide[]): MapPoint[] {
  const points: MapPoint[] = [];
  for (const slide of slides) {
    const loc = slide.location;
    if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") continue;
    points.push({
      id: slide.id,
      title: slide.title,
      lat: loc.latitude,
      lng: loc.longitude,
      href: slide.href,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`,
      directionsUrl: directionsUrl(loc.latitude, loc.longitude),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Web Mercator, in MapLibre's units: the world is 512 * 2^zoom pixels square.
// ---------------------------------------------------------------------------

/** MapLibre's tile size, and therefore the base of its zoom scale. */
export const WORLD_TILE_SIZE = 512;

/** Latitudes beyond this do not exist in Mercator. Clamped rather than thrown
 *  on: an editor can type anything into a GeoPoint. */
const MAX_LAT = 85.051129;

export function worldSize(zoom: number): number {
  return WORLD_TILE_SIZE * 2 ** zoom;
}

export function projectX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * worldSize(zoom);
}

export function projectY(lat: number, zoom: number): number {
  const clamped = Math.min(MAX_LAT, Math.max(-MAX_LAT, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(zoom);
}

export function unprojectLng(x: number, zoom: number): number {
  return (x / worldSize(zoom)) * 360 - 180;
}

export function unprojectLat(y: number, zoom: number): number {
  const n = Math.PI * (1 - (2 * y) / worldSize(zoom));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Screen distance between two points at a zoom, in CSS pixels. */
export function pixelDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  zoom: number,
): number {
  return Math.hypot(
    projectX(a.lng, zoom) - projectX(b.lng, zoom),
    projectY(a.lat, zoom) - projectY(b.lat, zoom),
  );
}

// ---------------------------------------------------------------------------
// The camera
// ---------------------------------------------------------------------------

export interface Box {
  width: number;
  height: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Camera {
  lng: number;
  lat: number;
  zoom: number;
}

/**
 * The two frames the comp draws, and the numbers each one needs.
 *
 * `compact` is the 390 comp's 350 x 200 (and the homepage band's 390 x 200);
 * `full` is the 1440 comp's 397 x 595 panel and its 512 x 827 band. They are
 * chosen by the container's MEASURED HEIGHT, not by a viewport media query,
 * because what makes a 22px pin right is a 200px-tall box — and that is also
 * true of the same box grown by the expand affordance.
 *
 * `pin` is the comp's box size S (`np_pin-map_4984332`, drawn at S=48 on every
 * 1440 map and S=22 on every 390 map).
 *
 * `padding` keeps the fitted bounds clear of the frame's edges. It is not
 * decoration: a marker is anchored at its TIP, so the glyph reaches 0.801019S
 * ABOVE the coordinate — 38.45px at S=48. A top pad smaller than that clips
 * the northernmost pin's head off the frame. The extra on `bottom` is the
 * attribution row (and, when compact, the expand affordance's 20.88px button
 * on its 10px inset).
 *
 * `maxZoom` only ever bites on a ONE-PIN section, where the bounds are a point
 * and the fit zoom is infinite. 12 puts 397px of frame across 6.6 km at this
 * latitude — a district with its road names and its town label, which is what
 * a single listing wants. Every real multi-pin section fits well below it
 * (land 6.948, improved 9.644 at 397 x 595), so it changes nothing there.
 *
 * `clusterRadius` is the pin's own box: two pins closer than one box overlap,
 * and overlapping pins are the defect clustering exists to remove. On the
 * compact frame it is lifted to 26 so the cluster disc — which must hold a
 * two-digit count — is never smaller than the gap it stands for.
 */
export const MAP_FRAMES = {
  full: {
    pin: 48,
    padding: { top: 52, right: 44, bottom: 44, left: 44 },
    maxZoom: 12,
    clusterRadius: 48,
  },
  compact: {
    pin: 22,
    padding: { top: 26, right: 26, bottom: 44, left: 26 },
    maxZoom: 12,
    clusterRadius: 26,
  },
} as const satisfies Record<
  string,
  { pin: number; padding: Padding; maxZoom: number; clusterRadius: number }
>;

export type MapFrame = keyof typeof MAP_FRAMES;

/** Which frame a measured container is. The threshold is the comp's own gap:
 *  the short maps are 200 tall and the tall ones 595 and 827. */
export const COMPACT_MAX_HEIGHT = 300;

export function frameFor(box: Box): MapFrame {
  return box.height < COMPACT_MAX_HEIGHT ? "compact" : "full";
}

// ---------------------------------------------------------------------------
// MAP_HOME — the frame the map OPENS on, and the frame the raster is of (#122)
// ---------------------------------------------------------------------------

/** The chosen opening frame per `MAP_FRAMES` key. Declared in `./map-home`
 *  with the argument for every number in it, and re-exported here so that
 *  `$lib/property-map` stays the one import for everything the map knows.
 *  `satisfies` rather than an annotation: it keeps the literal types AND
 *  fails the build if a frame key is added to `MAP_FRAMES` without one. */
export const MAP_HOME = HOME satisfies Record<MapFrame, HomeFrame>;
export { MAP_HOME_FADE_MS, MAP_HOME_GROUND } from "./map-home";
export type { HomeCamera, HomeFrame } from "./map-home";

/** One marker of the placeholder, positioned as an OFFSET FROM THE BOX'S
 *  CENTRE rather than from its top-left.
 *
 *  That is the whole reason the server can draw these at all. A pin's position
 *  on screen is `map.project(lngLat)`, which needs the container's size — and
 *  the server has no container. With the camera FIXED, the centre pixel of any
 *  container is MAP_HOME's coordinate whatever that container's size, so the
 *  offset is a constant and `left:50%; top:50%; translate(dx, dy)` lands the
 *  marker exactly where `reposition()` will put the live one. A marker outside
 *  the container is clipped by the box's own `overflow-hidden`. */
export interface HomeMarker {
  /** `MapCluster.id` — the member ids, sorted. */
  id: string;
  /** How many listings this marker stands for. */
  count: number;
  /** The listing, when this marker is one listing's own pin. */
  point: MapPoint | null;
  /** CSS pixels right of / below the box's centre. */
  dx: number;
  dy: number;
}

/**
 * The markers a frame's placeholder draws, from the SAME `clusterPoints` the
 * live map runs — at MAP_HOME's zoom and the frame's own cluster radius, so
 * the grouping the server draws is the grouping MapLibre will draw on its
 * first frame and there is nothing to re-flow.
 */
export function homeMarkers(points: readonly MapPoint[], frame: MapFrame): HomeMarker[] {
  const { camera } = MAP_HOME[frame];
  const { clusterRadius } = MAP_FRAMES[frame];
  const cx = projectX(camera.lng, camera.zoom);
  const cy = projectY(camera.lat, camera.zoom);
  return clusterPoints(points, camera.zoom, clusterRadius).map((cluster) => ({
    id: cluster.id,
    count: cluster.points.length,
    point: cluster.points.length === 1 ? cluster.points[0]! : null,
    dx: projectX(cluster.lng, camera.zoom) - cx,
    dy: projectY(cluster.lat, camera.zoom) - cy,
  }));
}

/**
 * THE ONE EXPRESSION THAT DECIDES BOTH HALVES, and it is deliberately one.
 *
 * It answers "does this section open on MAP_HOME" — and the component uses the
 * same answer to decide whether to RENDER the placeholder and what to CONSTRUCT
 * MapLibre with. A placeholder drawn from one rule and a camera built from
 * another could part company, and #122 is explicit that nothing else in the
 * system would notice if they did. They cannot part company if there is only
 * one rule, which is why this returns a camera-or-null rather than a boolean
 * the two sides interpret separately.
 *
 * `null` is THE EDGE #122 left to be decided: a section whose markers all fall
 * outside MAP_HOME. The answer is that such a section gets NO placeholder and
 * boots on `fitCamera` exactly as it does today, and the reasoning is that the
 * alternatives are both worse. Showing MAP_HOME anyway means a picture of San
 * Antonio standing in for listings that are not in San Antonio — a placeholder
 * that is wrong about the only thing it is for. RENDERING the raster at that
 * section's own fit would put published content back inside the image, which
 * is the exact dependence this design exists to remove.
 *
 * What it costs, stated plainly: this predicate IS content-dependent, so a
 * publish can flip it. But it can only ever turn the placeholder OFF (back to
 * the list-of-links that shipped in #13), never change what the picture SHOWS
 * — so the raster's only drift axis is still the style digest, and that is
 * still a hash check. Coverage is measured at the frame's `reference` box, the
 * smallest box that frame is drawn at, so the answer cannot be true on the
 * homepage band's 1073px slot and false on the phone.
 */
export function homeCamera(points: readonly MapPoint[], frame: MapFrame): Camera | null {
  const { camera, reference } = MAP_HOME[frame];
  const covered = homeMarkers(points, frame).some(
    (m) => Math.abs(m.dx) <= reference.width / 2 && Math.abs(m.dy) <= reference.height / 2,
  );
  return covered ? { ...camera } : null;
}

/**
 * The component's ONE question: does this section open on MAP_HOME, and if so
 * at which camera per frame. All frames or none.
 *
 * ALL-OR-NONE IS NOT TIDINESS, it closes a hole. Which frame is on screen is a
 * CSS container query — the box's own height, which the server cannot evaluate
 * — so the server renders BOTH frames' placeholders and the browser shows one.
 * The list of links goes visually hidden when a placeholder is shown, the way
 * it does when the canvas arrives. If one frame were covered and the other not,
 * a box landing on the uncovered frame would hide the list and draw nothing:
 * the blank box #13's definition of done forbids. So coverage is a property of
 * the SECTION, and a section covered at 397 x 595 but not at 350 x 200 keeps
 * the list at both — the conservative answer, and the only one whose failure
 * mode is "today's behaviour".
 */
export function homeFrames(points: readonly MapPoint[]): Record<MapFrame, Camera> | null {
  const frames = {} as Record<MapFrame, Camera>;
  for (const frame of Object.keys(MAP_FRAMES) as MapFrame[]) {
    const camera = homeCamera(points, frame);
    if (camera === null) return null;
    frames[frame] = camera;
  }
  return frames;
}

/**
 * The camera that shows every point inside `box` minus `padding`, never closer
 * than `maxZoom`. Zero points gives null — the caller draws no map at all.
 *
 * The centre is the Mercator centre of the bounds, not the mean of the
 * latitudes: on a 277 km north-south span those differ, and the wrong one
 * leaves the frame lopsided.
 */
export function fitCamera(
  points: readonly { lat: number; lng: number }[],
  box: Box,
  { padding, maxZoom }: { padding: Padding; maxZoom: number },
): Camera | null {
  if (points.length === 0) return null;

  // At zoom 0 first, then scale: the projection is linear in world size.
  const xs = points.map((p) => projectX(p.lng, 0));
  const ys = points.map((p) => projectY(p.lat, 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const availableW = Math.max(1, box.width - padding.left - padding.right);
  const availableH = Math.max(1, box.height - padding.top - padding.bottom);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const scaleX = spanX > 0 ? availableW / spanX : Infinity;
  const scaleY = spanY > 0 ? availableH / spanY : Infinity;
  const scale = Math.min(scaleX, scaleY);
  const zoom = Number.isFinite(scale) ? Math.min(maxZoom, Math.log2(scale)) : maxZoom;

  // The padding is not symmetric, so the centre of the BOUNDS is not the
  // centre of the box: shift by half the difference of the two pads, in the
  // world units of the zoom we just chose.
  const size = worldSize(zoom) / worldSize(0);
  const cx = ((minX + maxX) / 2) * size + (padding.right - padding.left) / 2;
  const cy = ((minY + maxY) / 2) * size + (padding.bottom - padding.top) / 2;

  return { lng: unprojectLng(cx, zoom), lat: unprojectLat(cy, zoom), zoom };
}

// ---------------------------------------------------------------------------
// The camera the PAGE drives
// ---------------------------------------------------------------------------

/**
 * How long a flight to the active listing lasts, in ms.
 *
 * It is the homepage band's own `DISSOLVE` (FeaturedProperties/index.svelte),
 * and that is the reason for the number rather than a coincidence: on that
 * band the photo cross-fades over 500ms while the map travels to the same
 * listing, so the picture and the place arrive together and the pair reads as
 * ONE change. 500 also sits well inside the band's 4000ms dwell, so the map is
 * stationary for 87.5% of every slide.
 *
 * THE BAND IMPORTS THIS CONSTANT, which it did not always do — the two modules
 * each typed a `500` and this paragraph asserted a coupling that nothing in
 * the code held, so tuning either number would have broken the pairing
 * silently and neither file would have looked wrong. The dependency runs that
 * way round (slice → lib, never lib → slice) because the flight is a property
 * of the camera and the band is one of its callers.
 *
 * The Properties page inherits it for a different reason — nothing there is
 * timing out — and this paragraph used to end "a scroll that crosses three
 * cards must not leave three flights queued behind it, and a new `flyTo`
 * replaces the one in flight", offered as reassurance. It was the DEFECT,
 * described approvingly: a replaced flight is an arc abandoned after a few
 * milliseconds, and eight of them in 71ms is a smear rather than a journey.
 * Nothing about the duration fixes that. `pageScrolling` below is what does —
 * one flight per settled scroll — and only then is 500ms a flight anyone sees.
 *
 * Never used under `prefers-reduced-motion`: `cameraMove` answers `jump`
 * there, and the map is additionally constructed with MapLibre's own
 * `reduceMotion`.
 */
export const CAMERA_FLIGHT_MS = 500;

/**
 * The point `active` names.
 *
 * Three answers, and they are three different situations rather than two:
 * `null` is "no listing is active, fit them all", the point itself is "centre
 * on this", and `undefined` is "this map has no pin for that id" — which is a
 * request to HOLD, not a request to fit. Exported because the boot camera and
 * `cameraMove` must resolve it identically or a map could start somewhere it
 * would immediately fly away from.
 */
export function activeTarget(
  active: string | null,
  points: readonly MapPoint[],
): MapPoint | null | undefined {
  if (active === null) return null;
  return points.find((p) => p.id === active);
}

/**
 * What the map should do about the listing the page says is active.
 *
 * A tagged union rather than a nullable camera, because the interesting half
 * of this function is the refusals: a unit test asserts WHICH rule declined a
 * move, and a rule that can only ever decline cannot invent one. There is
 * exactly one of these functions and PropertyMap.svelte has no second opinion
 * — `active` is the only input that says where the camera belongs.
 */
export type CameraMove =
  | {
      move: "none";
      why:
        | "not-ready"
        | "user-moved"
        | "unmeasured"
        | "no-points"
        | "unknown-active"
        | "arrived"
        | "page-scrolling";
    }
  | { move: "jump"; camera: Camera }
  | { move: "fly"; camera: Camera };

export interface CameraState {
  /** The id of the point to centre on, or null for "fit them all" — which is
   *  what this component did before anything drove it. */
  active: string | null;
  points: readonly MapPoint[];
  /** The container's MEASURED box. Zero means the ResizeObserver has not
   *  reported yet, and a camera fitted to a zero box is nonsense. */
  box: Box;
  frame: { padding: Padding; maxZoom: number };
  /** MapLibre's own `load` has fired. Never "the import resolved". */
  ready: boolean;
  /** A gesture has driven this map. */
  userMoved: boolean;
  reducedMotion: boolean;
  /**
   * WHERE "NOTHING IS ACTIVE" MEANS, since #122 — this section's MAP_HOME
   * camera, or null for a section that has none.
   *
   * IT IS HERE BECAUSE OF A DEFECT THIS FIELD'S ABSENCE CAUSED, found by
   * tests/interaction/map-home.spec.ts on a production build and not by
   * anything in jsdom. With `active` null — which is every Properties-page map
   * below `lg`, where `centreWatch` is gated `minWidth: 1024` and never runs —
   * this function answered `fitCamera(points)`, so a map CONSTRUCTED at
   * MAP_HOME was told to jump to the auto-fit on the very first frame after
   * `load`. Measured on /properties at 390 x 844: the committed picture drew
   * 8 own pins and clusters of 6 and 3, and the live map one frame later drew
   * 2 own pins and a cluster of 15 — the z6.948 fit, not the z8.0 frame. The
   * placeholder was a true picture of a camera that survived one frame.
   *
   * So the fixed frame is not merely where the map OPENS, it is what "no
   * listing is active" resolves to for the whole life of the map. That is the
   * operator's own words — "a specific frame to always show as the default
   * start" — and it is what makes the picture honest for as long as it is up.
   * A section with no MAP_HOME (null) keeps the auto-fit exactly as before.
   */
  home?: Camera | null;
  /**
   * THE DOCUMENT IS STILL MOVING — `$lib/scroll-activity`, which is a debounce
   * on the window's own `scroll` events and knows nothing about what started
   * one.
   *
   * It exists because a FLIGHT takes 500ms and a scroll crosses a card every
   * few milliseconds, so a camera that launched at each crossing launched
   * eight arcs and finished none of them. While this is true the answer to
   * "fly there" is "not yet": the caller holds, and asks again when the page
   * falls quiet, by which time `active` names wherever the scroll ended. One
   * flight per settled scroll, whatever caused the scroll — a pressed pin, the
   * End key, a fragment, find-in-page, an assistive technology's own
   * scroll-into-view.
   *
   * Deliberately NOT applied to a jump. A jump is instant, so it cannot be
   * interrupted and cannot smear; under `prefers-reduced-motion` every move is
   * a jump and `scroll-behavior` is `auto`, so there is no multi-frame scroll
   * to coalesce in the first place.
   */
  pageScrolling?: boolean;
  /**
   * The camera this map was last TOLD to be at — the one it was constructed
   * with, or the target of the last move. Not `map.getCenter()`: mid-flight
   * that reads a waypoint, and a waypoint never equals the target, so every
   * frame would re-issue the flight it is in the middle of.
   *
   * It exists because `ready` flipping true re-asks this question, and the
   * answer at that instant is the camera the map was BUILT with. Without it
   * every map opened by issuing a 500ms flight to where it already was —
   * measured, in PropertyMap.test.ts, as one `flyTo` on a map nobody had
   * touched. Harmless to look at and wrong to claim: "nothing moves at load"
   * has to be true, not nearly true.
   */
  commanded?: Camera | null;
}

/** Two cameras are the same camera. Exact, not approximate: both sides come
 *  out of `fitCamera`, which is deterministic, so anything but equality here
 *  would be a tolerance hiding a real difference. */
function sameCamera(a: Camera, b: Camera): boolean {
  return a.lng === b.lng && a.lat === b.lat && a.zoom === b.zoom;
}

/**
 * THE TARGET ZOOM IS NOT A NEW NUMBER, and that is the decision in this
 * function. The active camera is `fitCamera` of the ONE active point, which by
 * construction lands on the frame's own `maxZoom`: a one-point bounds has zero
 * span, the fit scale is infinite, and the clamp is what comes back.
 *
 * `MAP_FRAMES.*.maxZoom` is already this repo's answer to "how close is right
 * for a single listing", argued where that constant is declared — 12 puts
 * 397px of frame across 6.6 km at this latitude (16.596 m/px at 29.7°N,
 * 6588 m across the comp's panel), a district with its road names and its town
 * label. Naming a second number here would be a second answer to the same
 * question, and the two would drift the first time one of them was tuned.
 *
 * It is deliberately no closer. OpenMapTiles' `building` layer starts at z13;
 * z12 is the last zoom at which a rural tract reads as a PLACE rather than as
 * roofs, and "which of these listings am I looking at" is a question about
 * place.
 *
 * Routing through `fitCamera` rather than returning the raw coordinate also
 * keeps the asymmetric-padding correction: a pin is anchored at its TIP and
 * reaches 0.801019 S above its coordinate, so the frame's top pad is larger
 * than its bottom, and a centre that ignored that would sit the pin low.
 *
 * JUMP vs FLY. A FIT is a layout answer — the box changed shape — so it is
 * instant, which is exactly what this component did before there was an
 * `active` at all. An ACTIVE target is a navigation answer, and the travel is
 * the point of it ("as different properties highlight we scroll around to
 * them"); a jump would only be a different picture.
 *
 * `fly`, not `ease`, and this was checked against maplibre-gl 6.10.0's own
 * source rather than assumed. Land is 17 listings spanning 277.0 km; at z12
 * that is ~16 700px of pan between the two extremes, and `easeTo` interpolates
 * the centre LINEARLY — 33 000 px/s over 500ms, which is a smear. `flyTo`
 * flies the Van Wijk–Nuij path, whose zoom excursion grows with the distance,
 * so a long hop arcs out far enough to stay readable and a short one barely
 * leaves its zoom. (What is NOT true, and was believed here for an hour: that
 * `flyTo` short-circuits to `easeTo` for short moves. Its guard is
 * `Math.abs(u1) < 2e-6`, two MILLIONTHS of a pixel of path — a no-op, not a
 * short move. The graceful behaviour comes from the curve, not from a
 * fallback.)
 */
export function cameraMove(state: CameraState): CameraMove {
  const { active, points, box, frame, ready, userMoved, reducedMotion, commanded } = state;
  const pageScrolling = state.pageScrolling === true;

  // Refusals first. Every one of these can only ever DENY a move; none of them
  // can grant one, and nothing below can override one.
  if (!ready) return { move: "none", why: "not-ready" };
  // A visitor who has driven the map does not want it snatched back. Same flag
  // the re-fit has always respected, and it is set by a gesture, never by a
  // resize or by this function's own flights.
  if (userMoved) return { move: "none", why: "user-moved" };
  if (box.width <= 0 || box.height <= 0) return { move: "none", why: "unmeasured" };
  if (points.length === 0) return { move: "none", why: "no-points" };

  const target = activeTarget(active, points);
  // An id with no pin is NOT a reason to fall back to the fit: a listing whose
  // `location` GeoPoint is empty keeps its card (see `sectionPoints`), so
  // scrolling past one would otherwise yank the whole section back into view
  // and then in again. Holding the camera is the honest answer to a request
  // that cannot be served.
  if (target === undefined) return { move: "none", why: "unknown-active" };

  // "Fit them all" is only the answer where there is no chosen frame; see
  // `home` on CameraState for the defect that read.
  const camera = target
    ? fitCamera([target], box, frame)
    : (state.home ?? fitCamera(points, box, frame));
  if (camera === null) return { move: "none", why: "no-points" };
  if (commanded && sameCamera(commanded, camera)) return { move: "none", why: "arrived" };

  if (target === null || reducedMotion) return { move: "jump", camera };
  // THE LAST REFUSAL, and the only one that is not first. It has to sit below
  // `arrived`, because "the camera is already there" is the truer answer than
  // "the page is moving" and a caller that heard `page-scrolling` for a move
  // it did not need would re-ask for nothing at every settle. It is still a
  // refusal and still cannot grant anything: everything above it decides
  // WHETHER there is a flight and WHERE to, and this decides only that now is
  // not the moment. The caller re-asks when the page falls quiet.
  if (pageScrolling) return { move: "none", why: "page-scrolling" };
  return { move: "fly", camera };
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

export interface MapCluster {
  /** Stable across a re-cluster at the same zoom: the member ids, sorted. */
  id: string;
  lat: number;
  lng: number;
  points: MapPoint[];
}

/**
 * Screen-space clustering, done here rather than by the GeoJSON source's
 * `cluster: true`.
 *
 * WHY NOT MAPLIBRE'S OWN. Native clustering draws through style layers, which
 * means the pin must be rasterised into a map image and the count set in a
 * `symbol` layer's text, in one of the glyph stacks the tile provider happens
 * to serve. The operator's brief for this build was "more consistency and
 * control over styling is preferable to me", and an HTML marker holding an
 * inline SVG filled with `var(--color-primary)` is exactly that: the pin is
 * the comp's pin, in the theme's own tokens, at every zoom. It is also the
 * only version of this that a jsdom unit test can measure — `clusterPoints`
 * below is asserted against the real 22 coordinates at the real fit zooms,
 * where supercluster's answer would only exist inside a browser.
 *
 * The algorithm is greedy and deterministic: walk the groups in the order the
 * caller supplied (which is `listingOrder` — the editor's order), and let each
 * unclaimed group seed a cluster that absorbs every unclaimed group within
 * `radius` screen pixels of the SEED. A marker then sits at its members'
 * centroid, so a cluster of five does not pretend to be standing on one of
 * them.
 *
 * ONE PASS IS NOT ENOUGH, and that is a correction this file paid for rather
 * than reasoned out. Two SEEDS are always at least `radius` apart by
 * construction, so the one-pass version was written believing the markers were
 * too; the test that measures the real minimum separation at the real zooms
 * said otherwise, because moving a marker to its members' centroid moves it
 * off its seed. Measured on the 17 land listings: 44.62px against a 48px pin
 * at the 397 x 595 panel, 18.75 against a 22px pin at 350 x 200, and — worst —
 * 13.23px against 48px pins at the expanded 350 x 520, two pins overlapping by
 * three quarters of their width. So the pass REPEATS on the centroids until
 * one changes nothing, and a pass that changes nothing is exactly the
 * statement that every pair of markers is now at least `radius` apart: every
 * surviving group was a seed in it, and a seed compares against all the rest.
 */
export function clusterPoints(
  points: readonly MapPoint[],
  zoom: number,
  radius: number,
): MapCluster[] {
  type Group = { x: number; y: number; points: MapPoint[] };

  let groups: Group[] = points.map((p) => ({
    x: projectX(p.lng, zoom),
    y: projectY(p.lat, zoom),
    points: [p],
  }));

  // Each pass either merges (strictly fewer groups) or is the fixpoint, so
  // this cannot run more than once per point.
  for (let pass = 0; pass < points.length; pass += 1) {
    const taken = new Array<boolean>(groups.length).fill(false);
    const next: Group[] = [];
    for (let i = 0; i < groups.length; i += 1) {
      if (taken[i]) continue;
      taken[i] = true;
      const seed = groups[i]!;
      const members = [seed];
      for (let j = i + 1; j < groups.length; j += 1) {
        if (taken[j]) continue;
        const other = groups[j]!;
        if (Math.hypot(other.x - seed.x, other.y - seed.y) >= radius) continue;
        taken[j] = true;
        members.push(other);
      }
      // Weighted by how many listings each member stands for, so the centroid
      // is the centroid of the LISTINGS and not of the groups they are in.
      const all = members.flatMap((m) => m.points);
      const sumX = members.reduce((n, m) => n + m.x * m.points.length, 0);
      const sumY = members.reduce((n, m) => n + m.y * m.points.length, 0);
      next.push({ x: sumX / all.length, y: sumY / all.length, points: all });
    }
    const settled = next.length === groups.length;
    groups = next;
    if (settled) break;
  }

  return groups.map((group) => ({
    id: group.points
      .map((p) => p.id)
      .sort()
      .join("|"),
    lng: unprojectLng(group.x, zoom),
    lat: unprojectLat(group.y, zoom),
    points: group.points,
  }));
}

/**
 * The zoom a cluster has to be shown at before it stops being one marker —
 * what pressing a cluster travels to.
 *
 * Screen distance scales with 2^zoom, so the member FARTHEST from the seed is
 * the one that escapes the seed's `radius` first, at `log2(radius / d0)` where
 * `d0` is that distance at zoom 0. Half a level is added on top so the two
 * groups land visibly apart rather than exactly touching; a cluster whose
 * members share a coordinate to the last decimal can never split, and goes to
 * `maxZoom` rather than to infinity.
 */
export function expansionZoom(
  cluster: Pick<MapCluster, "points">,
  radius: number,
  maxZoom: number,
): number {
  const points = cluster.points;
  if (points.length < 2) return maxZoom;
  const seed = points[0]!;
  let farthest = 0;
  for (const point of points) farthest = Math.max(farthest, pixelDistance(seed, point, 0));
  if (farthest === 0) return maxZoom;
  return Math.min(maxZoom, Math.max(0, Math.log2(radius / farthest) + 0.5));
}

/** What the marker layer is at a zoom, as one string. The component rebuilds
 *  its markers only when this changes, so a continuous pinch-zoom recomputes
 *  arithmetic on 17 points per frame and touches the DOM on the handful of
 *  frames where the grouping actually moves. */
export function clusterSignature(clusters: readonly MapCluster[]): string {
  return clusters.map((c) => c.id).join("//");
}

// ---------------------------------------------------------------------------
// The pin, as the comp draws it
// ---------------------------------------------------------------------------

/**
 * `np_pin-map_4984332`, normalised to the comp's box size S and verified at
 * S = 48 / 35 / 22: glyph 0.620S wide x 0.801019S tall, inset (0.19S, 0.10S)
 * from the box's top-left, tip at (0.500S, 0.901019S), a round hole 0.33375S
 * across centred at (0.500S, 0.405S).
 *
 * Those five numbers are internally consistent — 0.10 + 0.801019 = 0.901019,
 * the tip — which is the check that they were read off one component and not
 * three. The silhouette is therefore exactly a circle of radius 0.310 centred
 * at (0.5, 0.410) with the two tangent lines from the tip; the tangent points
 * fall at (0.740407, 0.605715) and its mirror, and the arc between them over
 * the head sweeps 258.298 degrees, so `large-arc-flag` is 1 and `sweep-flag`
 * is 0 (up and over, counter-clockwise on screen).
 *
 * The viewBox stops at the TIP rather than at the box's foot, so the marker
 * element's own bottom edge is the coordinate: anchored bottom-centre, the pin
 * points at the place, with no offset to keep in step with the size.
 */
export const PIN_VIEWBOX = "0 0 1 0.901019";
export const PIN_PATH = "M0.5000 0.901019L0.7404 0.6057A0.310 0.310 0 1 0 0.2596 0.6057Z";
export const PIN_HOLE = { cx: 0.5, cy: 0.405, r: 0.166875 } as const;
/** Element height as a multiple of S, i.e. the tip's y. */
export const PIN_ASPECT = 0.901019;

/** The cluster marker's diameter for a count, at a frame's pin size.
 *
 *  A cluster is drawn as a DISC and not as the comp's teardrop, deliberately:
 *  the comp's pin carries no number (`np_pin-map` has no text layer at all),
 *  and a teardrop with a count punched into its 0.33375S hole would be 16.02px
 *  across at S=48 and 7.34px at S=22 — unreadable at one size and a lie at the
 *  other, because a pin that looks like a place but means five places is worse
 *  than a shape that has never claimed to be a pin. The disc is the pin's own
 *  head diameter (0.620S) with a floor of 26px so two digits fit, and one
 *  extra step per digit beyond two. */
export function clusterDiameter(count: number, pin: number): number {
  const digits = String(count).length;
  return Math.max(26, pin * 0.62) + Math.max(0, digits - 2) * 8;
}

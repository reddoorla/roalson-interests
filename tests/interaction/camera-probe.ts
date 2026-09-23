import type { Page } from "@playwright/test";

/**
 * COUNTING THE CAMERA COMMANDS A REAL MAPLIBRE MAP IS ISSUED, from outside the
 * app, with no production code added for the test to read.
 *
 * WHY THIS AND NOT A DATA ATTRIBUTE. The claims this exists to check are "the
 * press issued exactly ONE flight" and "the re-fit was declined" — both about
 * calls made to maplibre-gl, not about anything that ends up in the DOM. The
 * alternative was a `data-map-flights` counter on the component, which is a
 * test hook shipped to every visitor, and which would be written by the very
 * code under test: it could agree with a broken camera perfectly.
 *
 * HOW. `$lib/map-engine` is the one module that imports maplibre-gl, and it is
 * served as its own module over HTTP. Playwright rewrites that response to
 * append a patch over `Map.prototype`'s three camera methods. The patch runs
 * before any map is constructed, so every instance on the page is covered, and
 * `window.__camera` is the log.
 *
 * `addControl` is where the map INSTANCE is captured, because PropertyMap calls
 * it on a fresh map immediately after constructing it and the ESM namespace
 * object is read-only — swapping the exported `Map` class throws in strict
 * mode, which the first version of this did and spent a 30s timeout on a map
 * that never booted.
 *
 * SCOPE: the dev server, which is what the gate runs (`readGateServer` returns
 * "dev" for this repo, and `/dev/properties` only exists there anyway). Under a
 * production build the module is a hashed chunk and this route never matches —
 * so `installed()` below is asserted by every caller rather than assumed, and
 * a silent miss reads as a failure instead of an empty log that passes.
 */
export interface CameraCall {
  center?: [number, number];
  zoom?: number;
  t: number;
}

export interface CameraLog {
  fly: CameraCall[];
  ease: CameraCall[];
  jump: CameraCall[];
  /** `movestart`'s `originalEvent.type`, or "programmatic" when it carried
   *  none — the exact predicate PropertyMap uses to decide a gesture. */
  movestart: string[];
}

const PATCH = `
;(() => {
  const NS = maplibregl.default ?? maplibregl;
  const p = NS.Map.prototype;
  const t0 = performance.now();
  window.__camera = { fly: [], ease: [], jump: [], movestart: [], maps: [] };
  const rec = (bucket) => (o) => window.__camera[bucket].push({
    center: o && o.center, zoom: o && o.zoom, t: performance.now() - t0,
  });
  const of = p.flyTo, oe = p.easeTo, oj = p.jumpTo, oa = p.addControl;
  p.flyTo = function (o, ...r) { rec("fly")(o); return of.call(this, o, ...r); };
  p.easeTo = function (o, ...r) { rec("ease")(o); return oe.call(this, o, ...r); };
  p.jumpTo = function (o, ...r) { rec("jump")(o); return oj.call(this, o, ...r); };
  p.addControl = function (...a) {
    if (!window.__camera.maps.includes(this)) {
      window.__camera.maps.push(this);
      this.on("movestart", (e) =>
        window.__camera.movestart.push(e && e.originalEvent ? e.originalEvent.type : "programmatic"));
    }
    return oa.apply(this, a);
  };
})();
`;

/** Call BEFORE `page.goto`. */
export async function watchCamera(page: Page) {
  await page.route("**/map-engine.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + PATCH });
  });
}

/** Positive evidence the patch landed — never infer it from an empty log. */
export const cameraProbeInstalled = (page: Page) =>
  page.evaluate(() => typeof window.__camera === "object" && window.__camera !== null);

export const cameraLog = (page: Page) =>
  page.evaluate(() => {
    const c = window.__camera;
    return {
      fly: [...c.fly],
      ease: [...c.ease],
      jump: [...c.jump],
      movestart: [...c.movestart],
    } as CameraLog;
  });

/** Every camera command, whichever method issued it. A regression that reached
 *  for `easeTo` instead of `flyTo` must not read as "the camera held still". */
export async function cameraMoves(page: Page) {
  const log = await cameraLog(page);
  return log.fly.length + log.ease.length + log.jump.length;
}

export const resetCamera = (page: Page) =>
  page.evaluate(() => {
    const c = window.__camera;
    c.fly.length = 0;
    c.ease.length = 0;
    c.jump.length = 0;
    c.movestart.length = 0;
  });

/** The live zoom of the nth booted map — the visitor's own zoom, read off
 *  MapLibre rather than inferred from pin spacing. */
export const mapZoom = (page: Page, nth = 0) =>
  page.evaluate((n) => window.__camera.maps[n].getZoom(), nth);

/**
 * Drive the nth booted map to an explicit zoom, keeping its centre.
 *
 * WHY A TEST DRIVES THE CAMERA AT ALL. A claim about what a STYLE contains —
 * "our style has no `natural_earth` layer" — is proved by a control that shows
 * the stock style fetching that layer's tiles where ours does not, and that
 * control only exists at a zoom where the layer draws. Letting the section's
 * own fit decide the zoom makes the control a hostage to content: it was
 * `/properties` at z6.948 (worked, coupled to the published portfolio), then
 * the fixture at z7.8765 (past the layer's maxzoom 7, so the control went
 * vacuous and the guard correctly refused to pass). Neither frame is part of
 * the claim. Naming the zoom here removes the coupling entirely.
 *
 * `jumpTo` and not `setZoom`, because `setZoom` is `easeTo` underneath and
 * would leave an animation running into the measurement window.
 *
 * IT DOES NOT SET `userMoved`. PropertyMap tags a gesture off `movestart`'s
 * `originalEvent`, which a programmatic jump does not carry, so the map stays
 * in the same state it was in. What holds the driven frame is `cameraMove`'s
 * `commanded` check: the fit has already been issued and recorded, none of the
 * effect's reactive inputs change here, so nothing re-issues it. Callers
 * assert the zoom they asked for is the zoom the map is still at (`mapZoom`)
 * rather than trusting that reasoning.
 */
export const jumpToZoom = (page: Page, zoom: number, nth = 0) =>
  page.evaluate(({ zoom: z, nth: n }) => window.__camera.maps[n].jumpTo({ zoom: z }), {
    zoom,
    nth,
  });

/** The live centre of the nth booted map. */
export const mapCentre = (page: Page, nth = 0) =>
  page.evaluate((n) => {
    const c = window.__camera.maps[n].getCenter();
    return { lng: Number(c.lng.toFixed(5)), lat: Number(c.lat.toFixed(5)) };
  }, nth);

declare global {
  interface Window {
    __camera: {
      fly: CameraCall[];
      ease: CameraCall[];
      jump: CameraCall[];
      movestart: string[];
      maps: {
        getZoom(): number;
        getCenter(): { lng: number; lat: number };
        jumpTo(options: { zoom?: number; center?: [number, number] }): unknown;
      }[];
    };
  }
}

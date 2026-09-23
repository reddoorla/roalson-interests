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
 * IT REACHES A PRODUCTION BUILD TOO, and that is why the patch self-imports
 * rather than naming `maplibregl`. This used to say, correctly, that under a
 * production build "the module is a hashed chunk and this route never matches"
 * — and then every camera measurement anyone made was made on the dev server,
 * including the ones that reported three majors fixed when a production build
 * still had all three (#118). The chunk is found by CONTENT (maplibre's own
 * worker URL, which survives minification because it is a string) and patched
 * through `import(import.meta.url)`: the chunk's default export is the
 * maplibre namespace on both servers, because `$lib/map-engine` is what
 * declares it.
 *
 * The self-import resolves one microtask after the chunk finishes evaluating,
 * and the app's own `await Promise.all([import(…), import(…)])` needs several
 * more before it constructs a map — so the prototype is patched first. That is
 * an ordering ARGUMENT, not a measurement, which is exactly why `installed()`
 * below is asserted by every caller: a probe that arrived late reads as a
 * failure rather than as an empty log that passes.
 *
 * Run the gate against the production build with
 * `REDDOOR_GATE_SERVER=preview pnpm exec playwright test …`. Note that
 * /dev/* routes 404 there (issue #120), so only specs written against real
 * routes can run that way.
 */
export interface CameraCall {
  center?: [number, number];
  zoom?: number;
  t: number;
  /** Which booted map was commanded — its index in `maps`, or -1 if the call
   *  beat `addControl`. A page draws one map per section, and "the camera flew
   *  once" is a claim about ONE of them. */
  m: number;
}

export interface CameraLog {
  fly: CameraCall[];
  ease: CameraCall[];
  jump: CameraCall[];
  /** `movestart`'s `originalEvent.type`, or "programmatic" when it carried
   *  none — the exact predicate PropertyMap uses to decide a gesture. */
  movestart: string[];
}

const BODY = `
  if (!NS || !NS.Map || !NS.Map.prototype || NS.Map.prototype.__camera_probe) return;
  const p = NS.Map.prototype;
  p.__camera_probe = true;
  const t0 = performance.now();
  window.__camera = { fly: [], ease: [], jump: [], movestart: [], maps: [] };
  const see = (self) => {
    const maps = window.__camera.maps;
    // ONE PLACE A MAP IS ADOPTED, reached from addControl AND from the first
    // camera command, and guarded by a flag of its own rather than by
    // membership of \`maps\`. Two things forced that:
    //
    //  - maplibre-gl's Map CONSTRUCTOR issues a jumpTo to set the initial
    //    camera, so on the dev server the instance is already here by the time
    //    addControl runs. A version that tested membership attached no
    //    movestart listener to any map on the page.
    //  - On a PRODUCTION build the patch is asynchronous (see PROD_PATCH) and
    //    measurably loses the race with the app's own dynamic import: the boot
    //    jumpTo and addControl both happen first. Adopting on the first command
    //    that IS seen is what gets a movestart listener onto those maps.
    if (!self.__camera_seen) {
      self.__camera_seen = true;
      maps.push(self);
      self.on("movestart", (e) =>
        window.__camera.movestart.push(e && e.originalEvent ? e.originalEvent.type : "programmatic"));
    }
    return maps.indexOf(self);
  };
  const rec = (bucket) => (o, self) => window.__camera[bucket].push({
    center: o && o.center, zoom: o && o.zoom, t: performance.now() - t0, m: see(self),
  });
  const of = p.flyTo, oe = p.easeTo, oj = p.jumpTo, oa = p.addControl;
  p.flyTo = function (o, ...r) { rec("fly")(o, this); return of.call(this, o, ...r); };
  p.easeTo = function (o, ...r) { rec("ease")(o, this); return oe.call(this, o, ...r); };
  p.jumpTo = function (o, ...r) { rec("jump")(o, this); return oj.call(this, o, ...r); };
  p.addControl = function (...a) { see(this); return oa.apply(this, a); };
`;

/** The dev server serves `$lib/map-engine` as itself, so the namespace is in
 *  scope under its own name and the patch can be SYNCHRONOUS — which it has to
 *  be. An earlier version reached it with `import(import.meta.url)` here too;
 *  in dev that URL is a fresh network fetch rather than a registry hit, so the
 *  patch landed after the map was already built and every command came back
 *  attributed to no map. */
const DEV_PATCH = `
;(() => { const NS = maplibregl.default ?? maplibregl;${BODY}})();
`;

/** The production chunk is minified, so nothing in it can be named. Its own URL
 *  is already in the module registry by the time this line runs, so the import
 *  resolves one microtask later — ahead of the app's own
 *  `await Promise.all([import(…), import(…)])`. */
const PROD_PATCH = `
;import(import.meta.url).then((m) => { const NS = (m && m.default) || m;${BODY}}).catch(() => {});
`;

/** The one string in maplibre's bundle that names it and survives minification:
 *  the URL it builds for its own worker. `$lib/map-engine` is the only module
 *  that imports maplibre-gl, so exactly one served file carries it on either
 *  server. */
const ENGINE_MARKER = "maplibre-gl-worker";

/** Call BEFORE `page.goto`. */
export async function watchCamera(page: Page) {
  // Dev: `$lib/map-engine` is served as itself. Production: it is a hashed
  // chunk under /_app/immutable, so the chunks are matched by content instead
  // of by name. Both get the same patch.
  await page.route(/\/map-engine\.ts|\/_app\/immutable\/.*\.js/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    // By NAME on the dev server — where the module is served as itself and the
    // marker may be rewritten to a dep-optimised path — and by CONTENT for the
    // production chunk, whose name is a hash.
    const patch = route.request().url().includes("/map-engine.ts")
      ? DEV_PATCH
      : body.includes(ENGINE_MARKER)
        ? PROD_PATCH
        : "";
    await route.fulfill({ response, body: body + patch });
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

/** The accessible name PropertyMap gives each booted map's canvas — "Land
 *  listings, interactive map" — in `maps` order, so a test can say WHICH map it
 *  means instead of trusting the order two sections happen to boot in. */
export const mapLabels = (page: Page) =>
  page.evaluate(() =>
    window.__camera.maps.map((m) => m.getCanvas().getAttribute("aria-label") ?? ""),
  );

/** The index in `maps` of the map whose accessible name starts with `label`. */
export async function mapNamed(page: Page, label: string) {
  const labels = await mapLabels(page);
  return labels.findIndex((name) => name.startsWith(label));
}

/** Camera commands issued to ONE map. */
export async function cameraMovesFor(page: Page, nth: number) {
  const log = await cameraLog(page);
  return [...log.fly, ...log.ease, ...log.jump].filter((c) => c.m === nth).length;
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
        getCanvas(): HTMLCanvasElement;
        /** Only the EXPANDED map takes the wheel, and a test that asserts a
         *  zoom changed has to be able to say that is why. */
        scrollZoom: { isEnabled(): boolean };
      }[];
    };
  }
}

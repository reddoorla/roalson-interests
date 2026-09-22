// What `$lib/map-engine` resolves to under Vitest, and why there is an alias
// for it at all (vite.config.ts, `test.alias`).
//
// The real module statically imports maplibre-gl, its stylesheet, and its
// worker as `?worker&url` — which makes Vite BUILD the worker (a 507 KB
// bundle) at transform time, in every Vitest worker that touches
// PropertyMap.svelte. Measured on this machine, importing that component and
// asserting nothing: 95.4s with the worker import, 33.2s with it stubbed out,
// 2.3s for a file that does not reach the component at all. PropertyMap is
// imported by PropertyListing, by the FeaturedProperties slice and by the dev
// fixtures, so `pnpm test:unit` was paying minutes for a module no unit test
// can meaningfully run: maplibre-gl needs WebGL2, which jsdom does not have.
//
// So the unit suite gets this instead. It is deliberately a THROW and not a
// quiet fake: nothing in jsdom should ever reach the engine, and a test that
// does is a test that has misunderstood what it is measuring — PropertyMap
// only imports it from inside an IntersectionObserver callback, and the
// vitest-setup.ts stub observer never fires. PropertyMap.test.ts drives the
// boot path by installing its own intersecting observer AND `vi.mock`ing this
// specifier with a fake Map, which replaces this module entirely.
//
// The real module's own correctness — that the worker URL is emitted,
// same-origin, and that the map draws under the shipped CSP — is not something
// jsdom could have told us anyway. It is measured on a production build by
// tests/interaction/property-map.spec.ts and recorded in docs/workJournal.md.
const unavailable = () => {
  throw new Error(
    "maplibre-gl is not available under Vitest (no WebGL2 in jsdom). " +
      'A test that needs the engine must vi.mock("$lib/map-engine").',
  );
};

export type MapEngine = never;

export default new Proxy({}, { get: unavailable, apply: unavailable });

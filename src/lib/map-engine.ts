// The heavy half of the property map (#13), isolated so it can be a CHUNK.
//
// Nothing in the app may import this at module scope. PropertyMap.svelte
// reaches it with `await import("$lib/map-engine")` once its container has
// intersected the viewport, which is the whole reason the file exists:
// maplibre-gl 6.10.0 is 280.5 KB gzip of main chunk plus a 140.6 KB gzip
// worker — 426.4 KB transferred, measured on the built site, for a box below
// the fold on both pages that draw it. Put the import in a component's
// `<script>` and Vite folds all of it into the route's entry, where it is paid
// for by every visitor who never scrolls that far.
//
// Keeping the CSS import here rather than in app.css is the same decision: it
// rides the dynamic chunk and is injected when the chunk loads.
//
// THE WORKER URL IS NOT OPTIONAL. maplibre-gl derives it from
// `import.meta.url` (`./maplibre-gl-worker.mjs` next to itself), which after
// bundling points into the app's own chunk directory where no such file
// exists — the worker 404s and the map renders nothing at all. `?worker&url`
// makes Vite bundle the worker and hand back its emitted, SAME-ORIGIN URL,
// which is also what keeps the CSP honest: a same-origin module worker
// resolves through `child-src` to `script-src 'self'`, so the whole map needs
// exactly one new CSP entry (`connect-src https://tiles.openfreemap.org`) and
// no 'unsafe-eval'. See docs/security.md.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);

export type MapEngine = typeof maplibregl;

export default maplibregl;

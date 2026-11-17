import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Part of every map's stamp, so a change to this renderer re-renders every map (review round 2).
const RENDERER = createHash('sha1').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 12);
const STYLE_PATH = existsSync(join(HERE, 'map-style.json')) ? join(HERE, 'map-style.json') : join(HERE, '../../../static/map-style.json');
const BRAND = JSON.parse(readFileSync(STYLE_PATH, 'utf8'));
const MAPLIBRE_JS = join(HERE, 'node_modules/maplibre-gl/dist/maplibre-gl.js');
const MAPLIBRE_CSS = readFileSync(join(HERE, 'node_modules/maplibre-gl/dist/maplibre-gl.css'), 'utf8');
const FONTS_CSS = readFileSync(join(HERE, 'assets/fonts.css'), 'utf8');

const NAIP = 'https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPPlus/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&f=image';

// A logo's height when its job names none (option C, 2026-11-16). lib/logos.py writes logo_px on every
// logo business, from build/logo-sizes.json, so this is only a fallback for a hand-made job.
const LOGO_PX = 22;
// How far out a logo may sit along a horizontal leader line (2026-11-16, Erik's "lines go horizontal
// until they get to open space"), in CSS px from its dot, on a 672 px map.
const LINE_MAX = 200;
const GARNET = '#652323';
const DUST = '#E8E1D1';

function brandStyle({ hideBuildings3d = true, pois = false } = {}) {
  const s = structuredClone(BRAND);
  s.layers = s.layers.filter((l) => !(hideBuildings3d && l.id === 'building-3d'));
  if (pois) {
    const idx = s.layers.findIndex((l) => l.id === 'airport');
    s.layers.splice(idx, 0, {
      id: 'poi-anchor', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 13,
      filter: ['all', ['has', 'name'], ['in', ['get', 'class'], ['literal', ['grocery', 'shop', 'hospital', 'college', 'stadium', 'lodging', 'fast_food', 'restaurant', 'cafe', 'fuel', 'bank', 'cinema', 'school', 'attraction', 'town_hall', 'post', 'library']]], ['<=', ['get', 'rank'], 20]],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 10.5, 'text-max-width': 8, 'text-padding': 6, 'symbol-sort-key': ['get', 'rank'], 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.6 },
      paint: { 'text-color': '#652323', 'text-halo-color': 'rgba(255,255,255,0.95)', 'text-halo-width': 1.6 },
    });
    s.layers.splice(idx, 0, {
      id: 'poi-anchor-dot', type: 'circle', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 13,
      filter: ['all', ['has', 'name'], ['in', ['get', 'class'], ['literal', ['grocery', 'shop', 'hospital', 'college', 'stadium', 'lodging', 'fast_food', 'restaurant', 'cafe', 'fuel', 'bank', 'cinema', 'school', 'attraction', 'town_hall', 'post', 'library']]], ['<=', ['get', 'rank'], 20]],
      paint: { 'circle-radius': 2.6, 'circle-color': '#B2AC9F', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 },
    });
  }
  return s;
}

function aerialStyle({ labels = true, tile256 = false } = {}) {
  const b = structuredClone(BRAND);
  const keep = new Set(['highway-name-major', 'highway-name-minor', 'highway-shield-us-interstate', 'road_shield_us', 'water_name_line_label']);
  const labelLayers = labels
    ? b.layers.filter((l) => keep.has(l.id)).map((l) => {
        const L = structuredClone(l);
        if (L.type === 'symbol' && L.paint && (L.id.startsWith('highway-name') || L.id.startsWith('water'))) {
          L.paint['text-color'] = '#FFFFFF';
          L.paint['text-halo-color'] = 'rgba(30,10,10,0.85)';
          L.paint['text-halo-width'] = 1.6;
        }
        return L;
      })
    : [];
  return {
    version: 8,
    glyphs: b.glyphs,
    sprite: b.sprite,
    sources: {
      naip: { type: 'raster', tiles: [NAIP.replace('size=512,512', 'size=' + (tile256 ? '256,256' : '512,512'))], tileSize: tile256 ? 256 : 512, maxzoom: 20, attribution: 'USGS The National Map' },
      openmaptiles: b.sources.openmaptiles,
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#8a8577' } },
      { id: 'naip', type: 'raster', source: 'naip', paint: { 'raster-contrast': 0.12, 'raster-saturation': 0.08, 'raster-brightness-min': 0.0, 'raster-brightness-max': 0.97 } },
      ...labelLayers,
    ],
  };
}

function pageHtml(job) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS_CSS}${MAPLIBRE_CSS}
  html,body{margin:0;padding:0;background:#fff}
  #map{position:absolute;left:0;top:0;width:${job.width}px;height:${job.height}px}
  .maplibregl-ctrl-attrib,.maplibregl-ctrl-logo{display:none!important}
  .pin{display:flex;flex-direction:column;align-items:center;transform:translateY(-4px)}
  .pin .tag{background:${GARNET};color:#fff;font:700 11px/1 Archivo,Arial,sans-serif;letter-spacing:.9px;text-transform:uppercase;padding:7px 10px 6px;white-space:nowrap;box-shadow:0 1px 0 rgba(0,0,0,.15)}
  .pin .tag.lg{font-size:12.5px;padding:8px 12px 7px}
  .pin .stem{width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${GARNET}}
  .pin .dot{width:12px;height:12px;border-radius:50%;background:${GARNET};border:3px solid ${DUST};margin-top:2px;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
  .aadt{display:flex;flex-direction:column;align-items:center;background:#fff;border:1.5px solid ${GARNET};padding:4px 7px 3px;box-shadow:0 1px 2px rgba(0,0,0,.2)}
  .aadt b{font:700 12px/1.1 Archivo,Arial,sans-serif;color:${GARNET};letter-spacing:.3px}
  .aadt span{font:600 8px/1.2 Archivo,Arial,sans-serif;color:#6f6a60;letter-spacing:.6px;text-transform:uppercase;white-space:nowrap}
  .aadt-dot{width:9px;height:9px;border-radius:50%;background:${GARNET};border:2px solid #fff;box-shadow:0 0 0 1px ${GARNET}}
  .biz{font:700 11px/1 Archivo,Arial,sans-serif;letter-spacing:.3px;color:${GARNET};background:rgba(255,255,255,.92);padding:4px 6px 3px;white-space:nowrap}
  .biz.logo{padding:3px 4px;line-height:0;background:#fff;box-shadow:0 0 0 1px rgba(101,35,35,.28)}
  .biz.logo img{display:block;width:auto;height:auto}
  .ref{font:700 10px/1 Archivo,Arial,sans-serif;letter-spacing:.8px;text-transform:uppercase;color:${GARNET};background:rgba(255,255,255,.88);padding:5px 7px 4px;border:1px solid ${GARNET}}
  .legend{position:absolute;left:14px;bottom:14px;background:rgba(255,255,255,.94);padding:10px 12px;font:400 10.5px/1.45 'Atkinson Hyperlegible Next',Arial,sans-serif;color:#2D2D2D;display:flex;flex-direction:column;gap:5px;max-width:330px}
  .legend b{font:700 9.5px/1.2 Archivo,Arial,sans-serif;letter-spacing:.8px;text-transform:uppercase;color:${GARNET};margin-bottom:2px}
  .legend .row{display:flex;align-items:center;gap:8px}
  .legend .sw{width:22px;height:12px;flex-shrink:0}
  .credit{position:absolute;right:8px;bottom:6px;font:400 8px/1.2 Arial,sans-serif;color:rgba(255,255,255,.9);text-shadow:0 0 2px rgba(0,0,0,.8)}
  .credit.dark{color:#6f6a60;text-shadow:none}
  .north{position:absolute;right:14px;top:14px;width:30px;height:40px;display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,.9);padding:4px 0 2px}
  .north span{font:700 10px/1 Archivo,Arial,sans-serif;color:${GARNET}}
  .scale{position:absolute;left:14px;top:14px;background:rgba(255,255,255,.9);padding:5px 8px 4px;font:700 9px/1 Archivo,Arial,sans-serif;letter-spacing:.6px;color:${GARNET}}
  .scale .bar{height:4px;border:1.5px solid ${GARNET};border-top:none;margin-top:3px}
  </style></head><body><div id="map"></div></body></html>`;
}

async function render(page, job) {
  const logos = {};
  for (const b of job.businesses ?? []) {
    if (b.logo && !logos[b.logo]) logos[b.logo] = 'data:image/png;base64,' + readFileSync(resolve(HERE, '..', b.logo)).toString('base64');
  }
  await page.setViewportSize({ width: job.width, height: job.height });
  await page.setContent(pageHtml(job), { waitUntil: 'load' });
  await page.addScriptTag({ path: MAPLIBRE_JS });
  const style = job.kind === 'brand' ? brandStyle({ pois: !!job.pois }) : aerialStyle({ labels: job.labels !== false, tile256: !!job.tile256 });
  const ok = await page.evaluate(async (args) => {
    const { job, style, GARNET, DUST, logos, LOGO_PX, LINE_MAX } = args;
    await document.fonts.ready;
    const maplibregl = window.maplibregl;
    const map = new maplibregl.Map({
      container: 'map', style, interactive: false, attributionControl: false, fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      center: [job.center[1], job.center[0]], zoom: job.zoom ?? 12, pixelRatio: job.dpr,
    });
    window.__map = map;
    await new Promise((res) => map.once('load', res));
    if (job.bounds) {
      map.fitBounds([[job.bounds[1], job.bounds[0]], [job.bounds[3], job.bounds[2]]], { padding: job.padding ?? 60, animate: false, maxZoom: job.maxZoom ?? 18 });
    }
    if (job.flood) {
      map.addSource('flood', { type: 'geojson', data: job.flood });
      map.addLayer({ id: 'flood-02', type: 'fill', source: 'flood', filter: ['==', ['get', 'cls'], 'x500'], paint: { 'fill-color': '#E8A33D', 'fill-opacity': 0.42 } });
      map.addLayer({ id: 'flood-100', type: 'fill', source: 'flood', filter: ['==', ['get', 'cls'], 'a100'], paint: { 'fill-color': '#2F7FC1', 'fill-opacity': 0.5 } });
      map.addLayer({ id: 'flood-fw', type: 'fill', source: 'flood', filter: ['==', ['get', 'cls'], 'floodway'], paint: { 'fill-color': '#12457A', 'fill-opacity': 0.6 } });
      map.addLayer({ id: 'flood-line', type: 'line', source: 'flood', filter: ['in', ['get', 'cls'], ['literal', ['a100', 'floodway']]], paint: { 'line-color': '#0E3A66', 'line-width': 1 } });
    }
    if (job.polygon) {
      map.addSource('site', { type: 'geojson', data: job.polygon });
      map.addLayer({ id: 'site-fill', type: 'fill', source: 'site', paint: { 'fill-color': GARNET, 'fill-opacity': job.kind === 'brand' ? 0.28 : 0.16 } });
      map.addLayer({ id: 'site-halo', type: 'line', source: 'site', paint: { 'line-color': DUST, 'line-width': job.kind === 'brand' ? 0 : 6, 'line-opacity': 0.95 } });
      map.addLayer({ id: 'site-line', type: 'line', source: 'site', paint: { 'line-color': GARNET, 'line-width': job.kind === 'brand' ? 2.5 : 3 } });
    }
    if (job.businesses?.length) {
      map.addSource('biz', { type: 'geojson', data: { type: 'FeatureCollection', features: job.businesses.map((b, i) => ({ type: 'Feature', properties: { name: b.name, k: i, f: b.featured ? 1 : 0 }, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } })) } });
      map.addLayer({ id: 'biz-dot', type: 'circle', source: 'biz', paint: { 'circle-radius': 3.4, 'circle-color': GARNET, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.4 } });
    }
    for (const r of (job.refs ?? []).filter((r) => !r.place)) {
      const el = document.createElement('div'); el.className = 'ref'; el.textContent = r.label;
      new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
    }
    for (const pp of job.pins ?? []) {
      const el = document.createElement('div'); el.className = 'pin';
      el.innerHTML = `<div class="tag"></div><div class="stem"></div><div class="dot"></div>`;
      el.querySelector('.tag').textContent = pp.label;
      new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 8] }).setLngLat([pp.lon, pp.lat]).addTo(map);
    }
    if (job.pin) {
      const el = document.createElement('div'); el.className = 'pin';
      el.innerHTML = `<div class="tag ${job.pin.large ? 'lg' : ''}"></div><div class="stem"></div><div class="dot"></div>`;
      el.querySelector('.tag').textContent = job.pin.label;
      new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 8] }).setLngLat([job.pin.lon, job.pin.lat]).addTo(map);
    }
    // The north panel is drawn before any label is placed, so place() keeps clear of it like any other mark
    // (#380, 2026-11-17: it ran to y 60 while place() kept boxes only below y 50, and nothing recorded it).
    // It has no z-index, and every label, line and dot it could meet has one, so drawing it earlier changes
    // no pixel.
    if (job.north) {
      const n = document.createElement('div'); n.className = 'north';
      n.innerHTML = `<span>N</span><svg width="14" height="20" viewBox="0 0 14 20"><path d="M7 0 L14 20 L7 15 L0 20 Z" fill="${GARNET}"/></svg>`;
      document.body.appendChild(n);
    }
    // The pin's stem is taken too (#380, 2026-11-17): between the tag's slot and the dot's there was a band
    // about 5 px tall that a leader line could cross, and a test logo's line ran straight through the stem.
    const taken = [...document.querySelectorAll('.pin .tag, .pin .stem, .pin .dot, .ref, .north')].map((el) => el.getBoundingClientRect()).map((r) => ({ l: r.left - 3, t: r.top - 3, r: r.right + 3, b: r.bottom + 3 }));
    const hit = (a) => taken.some((o) => !(a.r < o.l || a.l > o.r || a.b < o.t || a.t > o.b));
    const W = job.width, H = job.height;
    const segs = [];
    // The point each placed label (count, intersection label, business) labels, recorded in `marks` as `pt`,
    // so a checker can tell which labels sit far enough out to need a leader line in `segs` (#380, X1).
    const anchor = new Map();
    const rectOf = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    // Whether a box touches any leader line, by clipping each segment to the box (edges included).
    // Review round 3, 2026-11-17: 21 samples along a line let a short clip across a box corner through.
    const boxHitsSeg = (b) => segs.some(([x1, y1, x2, y2]) => {
      let t0 = 0, t1 = 1;
      const dx = x2 - x1, dy = y2 - y1;
      for (const [p, q] of [[-dx, x1 - b.l], [dx, b.r - x1], [-dy, y1 - b.t], [dy, b.b - y1]]) {
        if (p === 0) { if (q < 0) return false; continue; }
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
        if (t0 > t1) return false;
      }
      return true;
    });
    // `skip` is a box the line may cross: a horizontal leader line (below) starts beside its dot,
    // where the business's own name sits, and the name is removed when its logo is placed.
    const segHitsTaken = (x1, y1, x2, y2, skip = null, own = null) => {
      const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
      for (let i = 0; i <= n; i++) {
        const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
        if (own && x >= own.l && x <= own.r && y >= own.t && y <= own.b) continue;
        if (taken.some((o) => o !== skip && x > o.l && x < o.r && y > o.t && y < o.b)) return true;
      }
      return false;
    };
    // Whether segment a crosses segment b, touching at an end excepted (two lines from one dot).
    const segsCross = ([ax, ay, bx, by], [cx, cy, dx, dy]) => {
      const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
      return o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0;
    };
    // `fromDot`: check a leader line from the edge of its dot's own 10 px box, not from 12 px out. Logos
    // use it (review round 1, 2026-11-16: a test logo's line crossed a count dot within those 12 px).
    // Inside its own box a line is on its dot, so what lies there is excused: El Merkadito's dot on 402
    // W. Nueva sits 1.4 px inside the SITE tag, and every line from it starts there, as its name's does.
    // Labels keep the old rule.
    const place = (el, pt, side = false, { first = [], more = null, free = () => true, ignore = null, fromDot = false } = {}) => {
      el.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;z-index:4';
      document.body.appendChild(el);
      // A logo's box is its exact drawn size (review round 3, 2026-11-17): offsetWidth rounds to whole px,
      // and a wide logo capped at 92/28 of 22 px draws 72.29 px wide, so a rounded box could cover a dot's
      // stroke by 0.3 px and record that it did not. Labels keep offsetWidth. (The exact clip in boxHitsSeg
      // reaches labels too; on all 26 maps no placement moved, measured 2026-11-17.)
      const rc = fromDot ? el.getBoundingClientRect() : null;
      const w = rc ? rc.width : el.offsetWidth, h = rc ? rc.height : el.offsetHeight;
      const sides = [[pt.x + 8, pt.y - h / 2], [pt.x - w - 8, pt.y - h / 2]];
      const extra = more ? more(w, h) : [];
      const cands = [...first.map((f) => f(w, h)), ...(side ? sides : []), [pt.x - w / 2, pt.y - h - 9], [pt.x - w / 2, pt.y + 9], [pt.x + 10, pt.y - h / 2], [pt.x - w - 10, pt.y - h / 2],
        [pt.x + 10, pt.y - h - 6], [pt.x - w - 10, pt.y - h - 6], [pt.x + 10, pt.y + 6], [pt.x - w - 10, pt.y + 6],
        [pt.x - w / 2, pt.y - h - 34], [pt.x - w / 2, pt.y + 34], [pt.x + 40, pt.y - h / 2], [pt.x - w - 40, pt.y - h / 2],
        [pt.x - w / 2, pt.y - h - 60], [pt.x - w / 2, pt.y + 60], [pt.x + 40, pt.y - h - 40], [pt.x - w - 40, pt.y - h - 40], [pt.x + 40, pt.y + 40], [pt.x - w - 40, pt.y + 40],
        ...extra];
      // Where each candidate came from, recorded with a logo so the tests can tell which mechanism
      // placed it: the name's own spot, the fixed spots, or the ring (2026-11-16).
      const nFirst = first.length, nFixed = cands.length - nFirst - extra.length;
      const near = side ? 9 : 12;
      for (const [i, [x, y, tag]] of cands.entries()) {
        const box = { l: x, t: y, r: x + w, b: y + h };
        if (box.l < 4 || box.t < 50 || box.r > W - 4 || box.b > H - 18) continue;
        if ((ignore ? taken.filter((o) => o !== ignore).some((o) => !(box.r < o.l || box.l > o.r || box.b < o.t || box.t > o.b)) : hit(box)) || boxHitsSeg(box) || !free(box)) continue;
        const cx = Math.max(box.l, Math.min(pt.x, box.r)), cy = Math.max(box.t, Math.min(pt.y, box.b));
        const d = Math.hypot(cx - pt.x, cy - pt.y);
        if (d > near) {
          const k = fromDot ? 0 : Math.min(1, 12 / d);
          const own = fromDot ? { l: pt.x - 5, t: pt.y - 5, r: pt.x + 5, b: pt.y + 5 } : null;
          if (segHitsTaken(pt.x + (cx - pt.x) * k, pt.y + (cy - pt.y) * k, cx, cy, tag === 'line' ? ignore : null, own) || !free({ l: Math.min(pt.x, cx), t: Math.min(pt.y, cy), r: Math.max(pt.x, cx), b: Math.max(pt.y, cy) }, true, tag === 'line')) continue;
          // No logo's line may cross another leader line (a count's, an intersection label's, another
          // logo's): review rounds 1 and 2, 2026-11-16. Labels keep the old rule, and a logo placed later
          // checks against every line already drawn, so no two logo lines cross however they are placed.
          if (fromDot && segs.some((sg) => segsCross([pt.x, pt.y, cx, cy], sg))) continue;
        }
        el.style.left = `${box.l}px`; el.style.top = `${box.t}px`; el.style.visibility = 'visible';
        const slot = { l: box.l - 3, t: box.t - 3, r: box.r + 3, b: box.b + 3 };
        taken.push(slot);
        anchor.set(el, [pt.x, pt.y]);
        const placed = { l: box.l, t: box.t, r: box.r, b: box.b, line: d > near ? [pt.x, pt.y, cx, cy] : null, slot, el, via: tag ?? (i < nFirst ? 'name' : i < nFirst + nFixed ? 'fixed' : 'ring') };
        if (d > near) {
          segs.push([pt.x, pt.y, cx, cy]);
          const ln = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          ln.setAttribute('style', `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:2;pointer-events:none`);
          ln.innerHTML = `<line x1="${pt.x}" y1="${pt.y}" x2="${cx}" y2="${cy}" stroke="${GARNET}" stroke-width="1.2"/>`;
          document.body.appendChild(ln);
          placed.ln = ln; placed.seg = segs[segs.length - 1];
        }
        return placed;
      }
      el.remove();
      return null;
    };
    const countDots = new Map();
    for (const t of job.traffic ?? []) {
      const pt = map.project([t.lon, t.lat]);
      const dot = document.createElement('div'); dot.className = 'aadt-dot';
      countDots.set(t, dot);
      dot.style.cssText = `position:absolute;left:${pt.x - 6.5}px;top:${pt.y - 6.5}px;z-index:3`;
      document.body.appendChild(dot);
      taken.push({ l: pt.x - 7, t: pt.y - 7, r: pt.x + 7, b: pt.y + 7 });
    }
    for (const b of job.businesses ?? []) {
      const pt = map.project([b.lon, b.lat]);
      taken.push({ l: pt.x - 5, t: pt.y - 5, r: pt.x + 5, b: pt.y + 5 });
    }
    const xrefs = (job.refs ?? []).filter((r) => r.place).map((r) => {
      const pt = map.project([r.lon, r.lat]);
      const ring = document.createElement('div'); ring.className = 'xring';
      ring.style.cssText = `position:absolute;left:${pt.x - 8}px;top:${pt.y - 8}px;width:12px;height:12px;border-radius:50%;border:2.5px solid ${GARNET};background:rgba(255,255,255,.6);z-index:3`;
      document.body.appendChild(ring);
      taken.push({ l: pt.x - 10, t: pt.y - 10, r: pt.x + 10, b: pt.y + 10 });
      return { r, pt };
    });
    const dropped = [];
    for (const { r, pt } of xrefs) {
      const el = document.createElement('div'); el.className = 'ref'; el.textContent = r.label;
      if (!place(el, pt)) dropped.push(`intersection ${r.label}`);
    }
    for (const t of job.traffic ?? []) {
      const el = document.createElement('div'); el.className = 'aadt';
      el.innerHTML = `<b></b><span></span>`;
      el.querySelector('b').textContent = t.qty;
      el.querySelector('span').textContent = t.road;
      if (!place(el, map.project([t.lon, t.lat]))) { dropped.push(`count ${t.qty}`); countDots.get(t).remove(); }
    }
    // The parts of rectangle a that lie outside rectangle o, as up to four rectangles.
    const outside = (a, o) => {
      if (a.r <= o.l || a.l >= o.r || a.b <= o.t || a.t >= o.b) return [a];
      const out = [];
      if (a.t < o.t) out.push({ l: a.l, t: a.t, r: a.r, b: o.t });
      if (a.b > o.b) out.push({ l: a.l, t: o.b, r: a.r, b: a.b });
      const t = Math.max(a.t, o.t), b = Math.min(a.b, o.b);
      if (a.l < o.l) out.push({ l: a.l, t, r: o.l, b });
      if (a.r > o.r) out.push({ l: o.r, t, r: a.r, b });
      return out.filter((r) => r.r > r.l && r.b > r.t);
    };
    const boxes = [];
    // The businesses left off, by object, not by name: two of one chain can share a map (review round
    // 1). `dropped` keeps the names for the log and boxes.json.
    const gone = new Set();
    for (const b of job.businesses ?? []) {
      const pt = map.project([b.lon, b.lat]);
      const el = document.createElement('div'); el.className = 'biz'; el.textContent = b.name;
      const got = place(el, pt, true);
      if (got) boxes.push({ ...got, biz: b, pt, kind: 'name' });
      else { dropped.push(`business ${b.name}`); gone.add(b); }
    }
    if (map.getSource('biz')) {
      const keep = (job.businesses ?? []).filter((b) => !gone.has(b));
      map.getSource('biz').setData({ type: 'FeatureCollection', features: keep.map((b) => ({ type: 'Feature', properties: { name: b.name }, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } })) });
    }
    const blockers = [];
    for (const el of document.querySelectorAll('.pin .tag, .ref, .aadt, .aadt-dot, .xring, .biz')) {
      const r = el.getBoundingClientRect();
      const lngLat = map.unproject([r.left + r.width / 2, r.top + r.height / 2]);
      blockers.push({ type: 'Feature', properties: { w: Math.ceil(r.width + 8), h: Math.ceil(r.height + 6) }, geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] } });
    }
    const sizes = [...new Set(blockers.map((b) => `${b.properties.w}x${b.properties.h}`))];
    for (const key of sizes) {
      const [w, h] = key.split('x').map(Number);
      const pr = job.dpr;
      map.addImage(`blk-${key}`, { width: Math.ceil(w * pr), height: Math.ceil(h * pr), data: new Uint8Array(Math.ceil(w * pr) * Math.ceil(h * pr) * 4) }, { pixelRatio: pr });
    }
    if (blockers.length) {
      map.addSource('blockers', { type: 'geojson', data: { type: 'FeatureCollection', features: blockers } });
      map.addLayer({ id: 'blockers', type: 'symbol', source: 'blockers', layout: { 'icon-image': ['concat', 'blk-', ['to-string', ['get', 'w']], 'x', ['to-string', ['get', 'h']]], 'icon-allow-overlap': true, 'icon-ignore-placement': false } });
    }
    // Logos (Erik, 2026-11-12; supersedes Operator decisions 119). Every label above was placed
    // as text, and the blockers that keep road labels clear of them are the text boxes, so the
    // basemap, road labels, counts and every other label land exactly where they always did.
    // Only then does a business with a logo swap its name for the logo: where its name sat if the
    // logo fits there, else another spot beside its dot. A spot may not touch any other label,
    // count, pin or dot (taken), a rendered road label or shield, or the site outline. With no
    // such spot the business keeps its name, and the run says so.
    // A business whose name found no room is left off, dot and all; its logo, often narrower than the
    // name, may still have room (the operator, 2026-11-16). It gets no allowance for roads: its name
    // covered nothing.
    const nameless = (job.businesses ?? []).filter((b) => b.logo && gone.has(b)).map((b) => ({ biz: b, pt: map.project([b.lon, b.lat]), kind: 'none', was: null }));
    if (boxes.some((x) => x.biz.logo) || nameless.length) {
      await new Promise((res) => { if (map.loaded() && map.areTilesLoaded()) res(); else map.once('idle', res); });
      const symbolLayers = map.getStyle().layers.filter((l) => l.type === 'symbol' && l.id !== 'blockers').map((l) => l.id);
      const siteLayers = ['site-fill', 'site-line'].filter((id) => map.getLayer(id));
      // Major roads only (motorway, trunk, primary, their links, and rail): a logo may sit over a
      // minor street, a service road, or a secondary or tertiary road, as every name label already
      // may, but never over a major road its name did not already cover. Measured 2026-11-12:
      // protecting minor and service roads too left no room for any of the 52 logo matches on the 25
      // maps. Secondary and tertiary roads joined the minor ones on 2026-11-16 (the operator, option B
      // of reddoor-workspace decisions/2026-11-16-1835-roalson-logo-placement-relax-which-protection.md):
      // with them protected, Walmart, Costco or Whataburger had a logo on 7 of the 15 maps that list
      // one; without, 12. The pattern also matches bridge_ and tunnel_secondary_tertiary and their
      // casings, on purpose: those are the same roads where they cross over or under something.
      // Links (ramps, road_link and *_motorway_link) stay protected, including secondary and tertiary
      // links, since a ramp reads as part of the highway it serves. One exception: the style's
      // bridge_link never draws (it filters on a class no tile carries), so a secondary or tertiary
      // ramp on a bridge draws as bridge_secondary_tertiary, and a logo may cover it (review round 1).
      const MINOR = /(minor|service_track|path_pedestrian|secondary_tertiary)/;
      const roadLayers = map.getStyle().layers.filter((l) => l.type === 'line' && l['source-layer'] === 'transportation' && !MINOR.test(l.id)).map((l) => l.id);
      const any = (bx, layers) => map.queryRenderedFeatures([[bx.l, bx.t], [bx.r, bx.b]], { layers }).length > 0;
      // More spots for a logo, tried after the fixed ones above, so a logo that fits at a fixed spot
      // still takes it first (though another logo may now be at a spot it used to get): every position along each side of the dot, 4 px apart, at the distances the fixed spots
      // already use (8 px, beside the dot with no leader line, out to 56 px, the fixed spots'
      // farthest corner), nearest first and, at each distance, nearest the name's spot first.
      // Measured 2026-11-16 on today's tiles: a 37x34 Whataburger logo at Kingsville lost all 20 fixed
      // spots, 19 to a neighbour it touched by 2 to 10 px, with open ground beside its dot.
      const ring = (pt, ref) => (w, h) => {
        const out = [];
        for (const d of [8, 20, 34, 56]) {
          const c = [];
          for (let y = pt.y - h; y <= pt.y; y += 4) c.push([pt.x + d, y], [pt.x - w - d, y]);
          for (let x = pt.x - w; x <= pt.x; x += 4) c.push([x, pt.y + d], [x, pt.y - h - d]);
          const far = ([x, y]) => Math.hypot(x + w / 2 - ref[0], y + h / 2 - ref[1]);
          out.push(...c.sort((p, q) => far(p) - far(q)));
        }
        // Then, last of all, along a horizontal leader line from the dot (Erik, #roalson-interests,
        // 2026-11-16 3:00pm PT: "make the lines go horizontal until they get to open space to include
        // the logo"): the logo centred on the dot's height, 60 px out and farther, 4 px apart, to
        // LINE_MAX, nearer first, right before left at each distance. The logo stays clear of
        // everything any spot must; its line, like every logo's line, may cross a road but no symbol,
        // label, count, pin, dot or other leader line, nor the site except on a listing with siteLine.
        // (Label lines keep the older, looser rule: they are not checked against symbols or the site.)
        for (let d = 60; d <= LINE_MAX; d += 4) out.push([pt.x + d, pt.y - h / 2, 'line'], [pt.x - w - d, pt.y - h / 2, 'line']);
        return out;
      };
      const els = new Map();
      const logoEl = async (x) => {
        if (!els.has(x)) {
          // Built and decoded once; a logo that cannot decode is null and is not tried again.
          const el = document.createElement('div'); el.className = 'biz logo';
          const img = document.createElement('img'); img.alt = x.biz.name; img.src = logos[x.biz.logo];
          // Its height from the job (build/logo-sizes.json via lib/logos.py: 22 px since option C,
          // 2026-11-16, and Erik's per-listing scales). A wide logo is capped at 92/28 of its height,
          // the cap that held when every logo was 28 px (92 px), so a scaled logo keeps its shape.
          const h = x.biz.logo_px ?? LOGO_PX;
          Object.assign(img.style, { maxHeight: `${h}px`, maxWidth: `${(h * 92) / 28}px` });
          el.appendChild(img);
          els.set(x, await img.decode().then(() => el, () => null));
        }
        return els.get(x);
      };
      const tryLogo = async (x) => {
        // Roads too: a logo box is opaque white. The name's own box already covered whatever streets
        // it sat on, on today's approved map, so a logo may cover those and no others (review round
        // 1, 2026-11-12: a spot away from the name covered a local street).
        // Exactly what the name's white box covered, as the page drew it. place() records offsetWidth and
        // offsetHeight, which round to whole px, so a box read that way could excuse up to 0.5 px the name
        // never covered (review round 1, 2026-11-16).
        const old = x.kind === 'name' ? rectOf(x.el) : null;
        const free = (bx, isLine = false, horizontal = false) => {
          const p = { l: bx.l - 2, t: bx.t - 2, r: bx.r + 2, b: bx.b + 2 };
          // A horizontal leader line (a 'line' candidate, below) may cross the site only where the listing
          // says so (job.siteLine, from geo/sites.json logo_line_across_site: IH 10 at 87, where Love's dot
          // is inside the site; the operator, 2026-11-16). No other leader line and no logo box ever may.
          if (any(p, [...symbolLayers, ...(isLine && horizontal && job.siteLine ? [] : siteLayers)])) return false;
          return isLine || (old ? outside(p, old) : [p]).every((r) => !any(r, roadLayers));
        };
        const el = await logoEl(x);
        if (!el) return false;
        const onRight = old && old.l >= x.pt.x;
        const first = old ? [(w, h) => [onRight ? old.l : old.r - w, (old.t + old.b) / 2 - h / 2]] : [];
        const more = ring(x.pt, old ? [(old.l + old.r) / 2, (old.t + old.b) / 2] : [x.pt.x, x.pt.y]);
        if (x.seg) segs.splice(segs.indexOf(x.seg), 1);
        const got = place(el, x.pt, true, { first, more, free, ignore: x.slot ?? null, fromDot: true });
        if (!got) {
          if (x.seg) segs.push(x.seg);
          return false;
        }
        if (old) {
          x.el.remove();
          x.ln?.remove();
          taken.splice(taken.indexOf(x.slot), 1);
          x.was = { ...old, line: x.line };
        } else {
          dropped.splice(dropped.indexOf(`business ${x.biz.name}`), 1);
          gone.delete(x.biz);
          boxes.push(x);
        }
        Object.assign(x, { ln: null, seg: null }, got, { kind: 'logo' });
        return true;
      };
      // Each pass tries every logo still waiting; one that moved can free room for another, so the
      // passes repeat while any logo is placed.
      // A logo with a forced spot (build/logo-overrides.json, via lib/logos.py) is not tried by the
      // rules: it is drawn last, below, where the override puts it.
      let pending = [...boxes.filter((x) => x.biz.logo), ...nameless].filter((x) => !x.biz.force);
      let pass = 0;
      for (;;) {
        const next = [];
        pass++;
        for (const x of pending) if (await tryLogo(x)) x.pass = pass; else next.push(x);
        if (next.length === pending.length) break;
        pending = next;
      }
      // Forced spots (build/logo-overrides.json, 2026-11-17: Erik's 11-17 asks, which the operator let break
      // the placement rules, "just try and make the best result possible and flag it"). Drawn after every
      // other logo has its place, so no other logo on the map moves: the logo's centre goes exactly at its
      // offset from the dot, with a leader line from the dot to the box's nearest point when the box is
      // more than 9 px away, as for any spot. Nothing is checked here. What it breaks is recorded as for
      // every logo (under, line_under, marks, segs), and logo_check.py requires that record to equal the
      // override's `breaks`, word for word.
      for (const x of [...boxes.filter((x) => x.biz.logo), ...nameless].filter((x) => x.biz.force)) {
        const el = await logoEl(x);
        if (!el) { pending.push(x); continue; }
        el.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;z-index:4';
        document.body.appendChild(el);
        const rc = el.getBoundingClientRect();
        const [dx, dy] = x.biz.force.at;
        const box = { l: x.pt.x + dx - rc.width / 2, t: x.pt.y + dy - rc.height / 2 };
        box.r = box.l + rc.width; box.b = box.t + rc.height;
        el.style.left = `${box.l}px`; el.style.top = `${box.t}px`; el.style.visibility = 'visible';
        const cx = Math.max(box.l, Math.min(x.pt.x, box.r)), cy = Math.max(box.t, Math.min(x.pt.y, box.b));
        const d = Math.hypot(cx - x.pt.x, cy - x.pt.y);
        const old = x.kind === 'name' ? rectOf(x.el) : null;
        if (x.seg) segs.splice(segs.indexOf(x.seg), 1);
        if (old) {
          x.el.remove();
          x.ln?.remove();
          taken.splice(taken.indexOf(x.slot), 1);
          x.was = { ...old, line: x.line };
        } else {
          dropped.splice(dropped.indexOf(`business ${x.biz.name}`), 1);
          gone.delete(x.biz);
          boxes.push(x);
        }
        const slot = { l: box.l - 3, t: box.t - 3, r: box.r + 3, b: box.b + 3 };
        taken.push(slot);
        let ln = null, seg = null;
        if (d > 9) {
          seg = [x.pt.x, x.pt.y, cx, cy];
          segs.push(seg);
          ln = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          ln.setAttribute('style', `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:2;pointer-events:none`);
          ln.innerHTML = `<line x1="${x.pt.x}" y1="${x.pt.y}" x2="${cx}" y2="${cy}" stroke="${GARNET}" stroke-width="1.2"/>`;
          document.body.appendChild(ln);
        }
        Object.assign(x, { ...box, line: seg ? [...seg] : null, slot, el, ln, seg, via: 'forced', pass: 0, kind: 'logo' });
      }
      for (const x of pending) {
        if (els.get(x) === null) dropped.push(`logo ${x.biz.name} (unreadable; ${x.kind === 'name' ? 'name kept' : 'left off'})`);
        else dropped.push(`logo ${x.biz.name} (no room; ${x.kind === 'name' ? 'name kept' : 'left off, as its name'})`);
      }
      if (nameless.some((x) => x.kind === 'logo')) {
        const keep = (job.businesses ?? []).filter((b) => !gone.has(b));
        map.getSource('biz').setData({ type: 'FeatureCollection', features: keep.map((b) => ({ type: 'Feature', properties: { name: b.name }, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } })) });
      }
      await new Promise((res) => { if (map.loaded() && map.areTilesLoaded()) res(); else map.once('idle', res); });
    }
    // What the map draws under each logo that its name did not already cover: every protected road
    // line (motorway, trunk, primary, their links, and rail; minor, service, path and, since option B
    // on 2026-11-16, secondary and tertiary roads may be covered), every symbol layer and the site
    // outline, queried apart from the placement rule above, over the logo box less the name's old box
    // (symbols and the site over the whole logo box). A record for the tests; it must be empty.
    const allLayers = map.getStyle().layers ?? [];
    const lineIds = allLayers.filter((l) => l.type === 'line' && l['source-layer'] === 'transportation' && !/(minor|service_track|path_pedestrian|secondary_tertiary)/.test(l.id)).map((l) => l.id);
    const markIds = allLayers.filter((l) => (l.type === 'symbol' || l.id.startsWith('site-')) && l.id !== 'blockers').map((l) => l.id);
    const ids = (r, layers) => map.queryRenderedFeatures([[r.l, r.t], [r.r, r.b]], { layers }).map((f) => f.layer.id);
    // Queried one 1x1 px cell at a time across the logo box and its 1 px shadow, so this record
    // shares no geometry code with the placement rule (review round 2) and a line thinner than a
    // pixel cannot fall between samples (review round 3). The name already covered its own exact box,
    // so each cell is cut at that box's edges and only the part outside it is queried: a cell wholly
    // inside is skipped, and one straddling the box's fractional edge is queried only beyond the edge
    // (2026-11-16: St. Mary's recorded a street lying 0.69 px inside the name's box, from a cell that
    // was whole on the far side of it).
    const beyond = (px, py, w) => {
      const out = [];
      const t = Math.max(py, w.t), b = Math.min(py + 1, w.b);
      if (py < w.t) out.push([[px, py], [px + 1, Math.min(py + 1, w.t)]]);
      if (py + 1 > w.b) out.push([[px, Math.max(py, w.b)], [px + 1, py + 1]]);
      if (b > t) {
        if (px < w.l) out.push([[px, t], [Math.min(px + 1, w.l), b]]);
        if (px + 1 > w.r) out.push([[Math.max(px, w.r), t], [px + 1, b]]);
      }
      return out;
    };
    const under = (x) => {
      const found = new Set(ids({ l: x.l - 1, t: x.t - 1, r: x.r + 1, b: x.b + 1 }, markIds));
      const w = x.was ?? { l: 0, t: 0, r: 0, b: 0 }; // a logo whose name had no room: nothing was covered before
      for (let py = Math.floor(x.t - 1); py < Math.ceil(x.b + 1); py++) {
        for (let px = Math.floor(x.l - 1); px < Math.ceil(x.r + 1); px++) {
          for (const q of beyond(px, py, w)) for (const f of map.queryRenderedFeatures(q, { layers: lineIds })) found.add(f.layer.id);
        }
      }
      return [...found];
    };
    // Every road line, protected or not, under the part of a logo box its name did not cover: a record
    // for the tests, so a check can prove a logo sits over a secondary or tertiary road (option B).
    const roadIds = allLayers.filter((l) => l.type === 'line' && l['source-layer'] === 'transportation').map((l) => l.id);
    // What the map draws along a logo's leader line, sampled 1 px apart, each sample a 1x1 px query:
    // symbols and the site (review round 1, 2026-11-16: nothing measured a line). The tests allow only
    // the site, and only for a horizontal line on a listing with siteLine.
    const alongLine = (x) => {
      if (!x.line) return [];
      const [x1, y1, x2, y2] = x.line;
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
      const found = new Set();
      for (let i = 0; i <= n; i++) {
        const px = x1 + (x2 - x1) * i / n, py = y1 + (y2 - y1) * i / n;
        for (const id of ids({ l: px - 0.5, t: py - 0.5, r: px + 0.5, b: py + 0.5 }, markIds)) found.add(id);
      }
      return [...found];
    };
    const roads = (x) => [...new Set((x.was ? outside(x, x.was) : [x]).flatMap((r) => ids(r, roadIds)))];
    // A name's box is recorded as the page drew it (#380, 2026-11-17): place() sizes a label by offsetWidth,
    // which rounds to whole px, and on the first map of a fresh page two names were 0.8 px off their drawn
    // box, so overlaps() reported them as not drawn. A logo's place() box is already its drawn box.
    const out = boxes.map((x) => ({ name: x.biz.name, logo: x.biz.logo ?? null, kind: x.kind, dot: [x.pt.x, x.pt.y], ...(x.kind === 'name' ? rectOf(x.el) : { l: x.l, t: x.t, r: x.r, b: x.b }), line: x.line, ...(x.was ? { was: x.was } : {}), ...(x.kind === 'logo' ? { under: under(x), line_under: alongLine(x), via: x.via, pass: x.pass, roads: roads(x) } : {}) }));
    // Every count, count dot, intersection label and ring, pin tag and dot, and business label as the
    // page finally draws it, read back from the DOM, and every business dot still on the map (3.4 px
    // plus its 1.4 px stroke). These are HTML or a circle layer, which under() cannot see, so the
    // tests check them against each logo from this record (2026-11-16).
    // Since #380 (2026-11-17) also the pin's stem, the north panel, and `pt`, the point a placed label labels.
    const marks = [...document.querySelectorAll('.aadt, .aadt-dot, .ref, .xring, .pin .tag, .pin .stem, .pin .dot, .biz, .north')].map((el) => {
      const r = el.getBoundingClientRect();
      const kind = el.matches('.biz') ? 'biz' : el.matches('.pin .tag') ? 'pin' : el.matches('.pin .stem') ? 'pin-stem' : el.matches('.pin .dot') ? 'pin-dot' : el.classList[0];
      return { kind, l: r.left, t: r.top, r: r.right, b: r.bottom, ...(anchor.has(el) ? { pt: anchor.get(el) } : {}) };
    });
    // Business dots as the circle layer draws them, read back from the map, not from `dropped`
    // (review round 1: a dot the map failed to redraw would otherwise still be recorded).
    if (map.getLayer('biz-dot')) {
      await new Promise((res) => { if (map.loaded() && map.areTilesLoaded()) res(); else map.once('idle', res); });
      const seen = new Set(); // a dot in two tiles' buffers comes back twice (review round 2)
      for (const f of map.queryRenderedFeatures({ layers: ['biz-dot'] })) {
        const pt = map.project(f.geometry.coordinates);
        const key = `${f.properties.name}@${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        marks.push({ kind: 'biz-dot', name: f.properties.name, l: pt.x - 4.8, t: pt.y - 4.8, r: pt.x + 4.8, b: pt.y + 4.8 });
      }
    }
    const root = document.body;
    if (job.scale) {
      const c = map.getCenter();
      const mpp = 78271.51696 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, map.getZoom());
      const ft = mpp * 3.28084;
      const target = 110 * ft;
      const nice = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 26400, 52800, 105600, 264000, 528000];
      let v = nice[0]; for (const x of nice) if (x <= target) v = x;
      const px = v / ft;
      const label = v >= 5280 ? `${+(v / 5280).toFixed(2)} MI` : `${v.toLocaleString()} FT`;
      const s = document.createElement('div'); s.className = 'scale';
      s.innerHTML = `<div>${label}</div><div class="bar" style="width:${px}px"></div>`;
      root.appendChild(s);
    }
    if (job.legend) {
      const l = document.createElement('div'); l.className = 'legend'; l.innerHTML = job.legend; root.appendChild(l);
    }
    if (job.credit) {
      const c = document.createElement('div'); c.className = 'credit' + (job.kind === 'brand' ? ' dark' : ''); c.textContent = job.credit; root.appendChild(c);
    }
    await new Promise((res) => { if (map.loaded() && map.areTilesLoaded()) res(); else map.once('idle', res); });
    await new Promise((res) => setTimeout(res, 400));
    await new Promise((res) => { if (map.areTilesLoaded()) res(); else map.once('idle', res); });
    return { zoom: map.getZoom(), center: map.getCenter(), dropped, boxes: out, marks, segs };
  }, { job, style, GARNET, DUST, logos, LOGO_PX, LINE_MAX });
  mkdirSync(dirname(job.out), { recursive: true });
  if (job.heightPx) {
    // A map-only site (geo/map-only.json) matches the pixel size of a map Erik made elsewhere, so
    // build/swap_area_map.py still replaces his image exactly: 1680x1724 where this renders 1680x1725
    // at dpr 2.5. The bottom rows are cut off, never rescaled. A fractional screenshot clip cannot do
    // this: Chromium returns 1723 rows for 689.6 to 689.99 px and resamples them (measured 2026-11-13).
    const full = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: job.width, height: job.height } });
    const w = Math.round(job.width * job.dpr);
    if (!Number.isInteger(job.heightPx) || job.heightPx < 1 || job.heightPx > Math.round(job.height * job.dpr)) throw new Error(`heightPx ${job.heightPx} must be a whole number of pixels, at most the map's ${Math.round(job.height * job.dpr)}`);
    const jpeg = !job.out.endsWith('.png');
    const b64 = await page.evaluate(async ({ src, w, h, jpeg }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.9).split(',')[1];
    }, { src: full.toString('base64'), w, h: job.heightPx, jpeg });
    writeFileSync(job.tmp, Buffer.from(b64, 'base64'));
    return ok;
  }
  await page.screenshot({ path: job.tmp, type: job.out.endsWith('.png') ? 'png' : 'jpeg', quality: job.out.endsWith('.png') ? undefined : 90, clip: { x: 0, y: 0, width: job.width, height: job.height } });
  return ok;
}

const TILECACHE = join(HERE, '..', 'tilecache', 'naip');
mkdirSync(TILECACHE, { recursive: true });
let currentJob = null;

const isJpeg = (b) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b.subarray(-128).includes(Buffer.from([0xff, 0xd9]));

async function cachedNaip(route) {
  const job = currentJob;
  const url = route.request().url();
  const file = join(TILECACHE, createHash('sha1').update(url).digest('hex') + '.jpg');
  if (process.env.NAIP_FAIL && new RegExp(process.env.NAIP_FAIL).test(url)) {
    if (job && job === currentJob) job.failures++;
    return route.abort().catch(() => {});
  }
  if (existsSync(file)) {
    const body = readFileSync(file);
    if (isJpeg(body)) return route.fulfill({ status: 200, contentType: 'image/jpeg', body });
  }
  for (let attempt = 1; attempt <= 6; attempt++) {
    if (attempt > 1) await new Promise((res) => setTimeout(res, [0, 0, 5000, 15000, 30000, 60000, 60000][attempt]));
    if (job !== currentJob) return route.abort().catch(() => {});
    try {
      const res = await route.fetch({ timeout: 150000 });
      const body = await res.body();
      if (res.status() === 200 && isJpeg(body)) {
        const tmp = `${file}.${process.pid}.tmp`;
        writeFileSync(tmp, body);
        renameSync(tmp, file);
        return route.fulfill({ status: 200, contentType: 'image/jpeg', body });
      }
      console.error('naip', res.status(), 'attempt', attempt);
    } catch (e) {
      console.error('naip', e.message.slice(0, 80), 'attempt', attempt);
    }
  }
  console.error('naip gave up', url.slice(0, 160));
  if (job && job === currentJob) job.failures++;
  return route.abort().catch(() => {});
}

const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const force = process.argv.includes('--force');
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy: { server: process.env.HTTPS_PROXY },
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const dprs = [...new Set(jobs.map((j) => j.dpr ?? 3))];
const pages = {};
const contexts = {};
async function freshPage(d) {
  const p = await contexts[d].newPage();
  p.on('pageerror', (e) => console.error('pageerror', e.message));
  return p;
}
for (const d of dprs) {
  contexts[d] = await browser.newContext({ deviceScaleFactor: d });
  await contexts[d].route(/imagery\.nationalmap\.gov\/.*exportImage/, cachedNaip);
  pages[d] = await freshPage(d);
}
for (const job of jobs) {
  job.dpr = job.dpr ?? 3;
  const stamp = `${job.out}.job.json`;
  const spec = JSON.stringify({ ...job, renderer: RENDERER });
  if (!force && existsSync(job.out) && existsSync(stamp) && readFileSync(stamp, 'utf8') === spec) { console.log('skip', job.out); continue; }
  const t = Date.now();
  rmSync(stamp, { force: true });
  const run = { failures: 0 };
  currentJob = run;
  job.tmp = `${job.out}.${process.pid}.tmp${job.out.endsWith('.png') ? '.png' : '.jpg'}`;
  try {
    const rendering = render(pages[job.dpr], job);
    rendering.catch(() => {});
    const r = await Promise.race([rendering, new Promise((_, rej) => { run.watch = setInterval(() => run.failures && rej(new Error(`${run.failures} imagery tiles failed; the previous image is kept and nothing is stamped, so the next run re-renders it`)), 1000); })]);
    if (r.dropped.length) console.error('dropped', job.out, r.dropped.join('; '));
    if (r.dropped.some((x) => x.startsWith('intersection '))) throw new Error(`no room for ${r.dropped.join('; ')}; nothing is stamped`);
    // A map-only site (geo/map-only.json) replaces a map whose counts Erik's facts row quotes, and lists
    // exactly the businesses it shows, so a count or business with no room stops it too.
    if (job.strict && r.dropped.some((x) => x.startsWith('count ') || x.startsWith('business '))) throw new Error(`map-only map has no room for ${r.dropped.join('; ')}; nothing is stamped`);
    if (run.failures) throw new Error(`${run.failures} imagery tiles failed; the previous image is kept and nothing is stamped, so the next run re-renders it`);
    // No default for segs (review round 4, 2026-11-17): a record written without it must fail the checks,
    // not pass them as a map with no leader lines. Checked before the rename, so the previous image is kept.
    if (job.businesses && !Array.isArray(r.segs)) throw new Error(`${job.out}: render() returned no segs; nothing is stamped`);
    renameSync(job.tmp, job.out);
    if (job.businesses) writeFileSync(`${job.out}.boxes.json`, JSON.stringify({ width: job.width, height: job.height, ...(job.heightPx ? { heightPx: job.heightPx } : {}), dpr: job.dpr, businesses: r.boxes, dropped: r.dropped, marks: r.marks, segs: r.segs, siteLine: !!job.siteLine }, null, 1));
    writeFileSync(stamp, spec);
    console.log('ok', job.out, `z=${r.zoom.toFixed(2)}`, `${Date.now() - t}ms`);
  } catch (e) {
    console.error('FAIL', job.out, e.message);
    process.exitCode = 1;
    await pages[job.dpr].close().catch(() => {});
    pages[job.dpr] = await freshPage(job.dpr);
  } finally {
    clearInterval(run.watch);
    rmSync(job.tmp, { force: true });
    currentJob = null;
  }
}
await browser.close();

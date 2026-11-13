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
  .biz.logo img{display:block;width:auto;height:auto;max-height:28px;max-width:92px}
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
    const { job, style, GARNET, DUST, logos } = args;
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
    const taken = [...document.querySelectorAll('.pin .tag, .pin .dot, .ref')].map((el) => el.getBoundingClientRect()).map((r) => ({ l: r.left - 3, t: r.top - 3, r: r.right + 3, b: r.bottom + 3 }));
    const hit = (a) => taken.some((o) => !(a.r < o.l || a.l > o.r || a.b < o.t || a.t > o.b));
    const W = job.width, H = job.height;
    const segs = [];
    const boxHitsSeg = (b) => segs.some(([x1, y1, x2, y2]) => {
      for (let i = 0; i <= 20; i++) {
        const x = x1 + (x2 - x1) * i / 20, y = y1 + (y2 - y1) * i / 20;
        if (x >= b.l && x <= b.r && y >= b.t && y <= b.b) return true;
      }
      return false;
    });
    const segHitsTaken = (x1, y1, x2, y2) => {
      const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3));
      for (let i = 0; i <= n; i++) {
        const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
        if (taken.some((o) => x > o.l && x < o.r && y > o.t && y < o.b)) return true;
      }
      return false;
    };
    const place = (el, pt, side = false, { first = [], free = () => true, ignore = null } = {}) => {
      el.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;z-index:4';
      document.body.appendChild(el);
      const w = el.offsetWidth, h = el.offsetHeight;
      const sides = [[pt.x + 8, pt.y - h / 2], [pt.x - w - 8, pt.y - h / 2]];
      const cands = [...first.map((f) => f(w, h)), ...(side ? sides : []), [pt.x - w / 2, pt.y - h - 9], [pt.x - w / 2, pt.y + 9], [pt.x + 10, pt.y - h / 2], [pt.x - w - 10, pt.y - h / 2],
        [pt.x + 10, pt.y - h - 6], [pt.x - w - 10, pt.y - h - 6], [pt.x + 10, pt.y + 6], [pt.x - w - 10, pt.y + 6],
        [pt.x - w / 2, pt.y - h - 34], [pt.x - w / 2, pt.y + 34], [pt.x + 40, pt.y - h / 2], [pt.x - w - 40, pt.y - h / 2],
        [pt.x - w / 2, pt.y - h - 60], [pt.x - w / 2, pt.y + 60], [pt.x + 40, pt.y - h - 40], [pt.x - w - 40, pt.y - h - 40], [pt.x + 40, pt.y + 40], [pt.x - w - 40, pt.y + 40]];
      const near = side ? 9 : 12;
      for (const [x, y] of cands) {
        const box = { l: x, t: y, r: x + w, b: y + h };
        if (box.l < 4 || box.t < 50 || box.r > W - 4 || box.b > H - 18) continue;
        if ((ignore ? taken.filter((o) => o !== ignore).some((o) => !(box.r < o.l || box.l > o.r || box.b < o.t || box.t > o.b)) : hit(box)) || boxHitsSeg(box) || !free(box)) continue;
        const cx = Math.max(box.l, Math.min(pt.x, box.r)), cy = Math.max(box.t, Math.min(pt.y, box.b));
        const d = Math.hypot(cx - pt.x, cy - pt.y);
        if (d > near) {
          const k = Math.min(1, 12 / d);
          if (segHitsTaken(pt.x + (cx - pt.x) * k, pt.y + (cy - pt.y) * k, cx, cy) || !free({ l: Math.min(pt.x, cx), t: Math.min(pt.y, cy), r: Math.max(pt.x, cx), b: Math.max(pt.y, cy) }, true)) continue;
        }
        el.style.left = `${box.l}px`; el.style.top = `${box.t}px`; el.style.visibility = 'visible';
        const slot = { l: box.l - 3, t: box.t - 3, r: box.r + 3, b: box.b + 3 };
        taken.push(slot);
        const placed = { l: box.l, t: box.t, r: box.r, b: box.b, line: d > near ? [pt.x, pt.y, cx, cy] : null, slot, el };
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
    for (const b of job.businesses ?? []) {
      const pt = map.project([b.lon, b.lat]);
      const el = document.createElement('div'); el.className = 'biz'; el.textContent = b.name;
      const got = place(el, pt, true);
      if (got) boxes.push({ ...got, biz: b, pt, kind: 'name' });
      else dropped.push(`business ${b.name}`);
    }
    if (map.getSource('biz')) {
      const keep = (job.businesses ?? []).filter((b) => !dropped.includes(`business ${b.name}`));
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
    if (boxes.some((x) => x.biz.logo)) {
      await new Promise((res) => { if (map.loaded() && map.areTilesLoaded()) res(); else map.once('idle', res); });
      const symbolLayers = map.getStyle().layers.filter((l) => l.type === 'symbol' && l.id !== 'blockers').map((l) => l.id);
      const siteLayers = ['site-fill', 'site-line'].filter((id) => map.getLayer(id));
      // Major roads only (motorway, trunk, primary, secondary, tertiary, their links, and rail): a logo
      // may sit over a minor street or a service road, as every name label already does, but never
      // over a major road its name did not already cover. Measured 2026-11-12: protecting minor and
      // service roads too left no room for any of the 52 logo matches on the 25 maps.
      const MINOR = /(minor|service_track|path_pedestrian)/;
      const roadLayers = map.getStyle().layers.filter((l) => l.type === 'line' && l['source-layer'] === 'transportation' && !MINOR.test(l.id)).map((l) => l.id);
      const any = (bx, layers) => map.queryRenderedFeatures([[bx.l, bx.t], [bx.r, bx.b]], { layers }).length > 0;
      for (const x of boxes.filter((x) => x.biz.logo)) {
        // Roads too: a logo box is opaque white. The name's own box already covered whatever streets
        // it sat on, on today's approved map, so a logo may cover those and no others (review round
        // 1, 2026-11-12: a spot away from the name covered a local street).
        const old = { l: x.l, t: x.t, r: x.r, b: x.b }; // exactly what the name's white box covered
        const free = (bx, isLine = false) => {
          const p = { l: bx.l - 2, t: bx.t - 2, r: bx.r + 2, b: bx.b + 2 };
          if (any(p, [...symbolLayers, ...siteLayers])) return false;
          return isLine || outside(p, old).every((r) => !any(r, roadLayers));
        };
        const el = document.createElement('div'); el.className = 'biz logo';
        const img = document.createElement('img'); img.alt = x.biz.name; img.src = logos[x.biz.logo];
        el.appendChild(img);
        try {
          await img.decode();
        } catch {
          dropped.push(`logo ${x.biz.name} (unreadable; name kept)`);
          continue;
        }
        const onRight = x.l >= x.pt.x;
        const first = [(w, h) => [onRight ? x.l : x.r - w, (x.t + x.b) / 2 - h / 2]];
        if (x.seg) segs.splice(segs.indexOf(x.seg), 1);
        const got = place(el, x.pt, true, { first, free, ignore: x.slot });
        if (got) {
          x.el.remove();
          x.ln?.remove();
          taken.splice(taken.indexOf(x.slot), 1);
          x.was = { l: x.l, t: x.t, r: x.r, b: x.b, line: x.line };
          Object.assign(x, { ln: null, seg: null }, got, { kind: 'logo' });
        } else {
          if (x.seg) segs.push(x.seg);
          dropped.push(`logo ${x.biz.name} (no room; name kept)`);
        }
      }
      await new Promise((res) => { if (map.loaded() && map.areTilesLoaded()) res(); else map.once('idle', res); });
    }
    // What the map draws under each logo that its name did not already cover: every line and
    // symbol layer and the site outline, queried apart from the placement rule above, over the
    // logo box less the name's old box (symbols and the site over the whole logo box). A record
    // for the tests; it must be empty.
    const allLayers = map.getStyle().layers ?? [];
    const lineIds = allLayers.filter((l) => l.type === 'line' && l['source-layer'] === 'transportation' && !/(minor|service_track|path_pedestrian)/.test(l.id)).map((l) => l.id);
    const markIds = allLayers.filter((l) => (l.type === 'symbol' || l.id.startsWith('site-')) && l.id !== 'blockers').map((l) => l.id);
    const ids = (r, layers) => map.queryRenderedFeatures([[r.l, r.t], [r.r, r.b]], { layers }).map((f) => f.layer.id);
    // Queried one 1x1 px cell at a time across the logo box and its 1 px shadow, so this record
    // shares no geometry code with the placement rule (review round 2) and a line thinner than a
    // pixel cannot fall between samples (review round 3). Cells wholly inside the name's exact box
    // are skipped: the name already covered them.
    const under = (x) => {
      const found = new Set(ids({ l: x.l - 1, t: x.t - 1, r: x.r + 1, b: x.b + 1 }, markIds));
      const w = x.was;
      for (let py = Math.floor(x.t - 1); py < Math.ceil(x.b + 1); py++) {
        for (let px = Math.floor(x.l - 1); px < Math.ceil(x.r + 1); px++) {
          if (px >= w.l && px + 1 <= w.r && py >= w.t && py + 1 <= w.b) continue;
          for (const f of map.queryRenderedFeatures([[px, py], [px + 1, py + 1]], { layers: lineIds })) found.add(f.layer.id);
        }
      }
      return [...found];
    };
    const out = boxes.map((x) => ({ name: x.biz.name, logo: x.biz.logo ?? null, kind: x.kind, dot: [x.pt.x, x.pt.y], l: x.l, t: x.t, r: x.r, b: x.b, line: x.line, ...(x.was ? { was: x.was } : {}), ...(x.kind === 'logo' ? { under: under(x) } : {}) }));
    const root = document.body;
    if (job.north) {
      const n = document.createElement('div'); n.className = 'north';
      n.innerHTML = `<span>N</span><svg width="14" height="20" viewBox="0 0 14 20"><path d="M7 0 L14 20 L7 15 L0 20 Z" fill="${GARNET}"/></svg>`;
      root.appendChild(n);
    }
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
    return { zoom: map.getZoom(), center: map.getCenter(), dropped, boxes: out };
  }, { job, style, GARNET, DUST, logos });
  mkdirSync(dirname(job.out), { recursive: true });
  if (job.heightPx) {
    // A map-only site (geo/map-only.json) matches the pixel size of a map Erik made elsewhere, so
    // build/swap_area_map.py still replaces his image exactly: 1680x1724 where this renders 1680x1725
    // at dpr 2.5. The bottom rows are cut off, never rescaled. A fractional screenshot clip cannot do
    // this: Chromium returns 1723 rows for 689.6 to 689.99 px and resamples them (measured 2026-11-13).
    const full = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: job.width, height: job.height } });
    const w = Math.round(job.width * job.dpr);
    if (job.heightPx > Math.round(job.height * job.dpr)) throw new Error(`heightPx ${job.heightPx} is taller than the map`);
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
    if (run.failures) throw new Error(`${run.failures} imagery tiles failed; the previous image is kept and nothing is stamped, so the next run re-renders it`);
    renameSync(job.tmp, job.out);
    if (job.businesses) writeFileSync(`${job.out}.boxes.json`, JSON.stringify({ width: job.width, height: job.height, dpr: job.dpr, businesses: r.boxes }, null, 1));
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

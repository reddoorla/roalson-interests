import { chromium } from 'playwright-core';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
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
  await page.setViewportSize({ width: job.width, height: job.height });
  await page.setContent(pageHtml(job), { waitUntil: 'load' });
  await page.addScriptTag({ path: MAPLIBRE_JS });
  const style = job.kind === 'brand' ? brandStyle({ pois: !!job.pois }) : aerialStyle({ labels: job.labels !== false, tile256: !!job.tile256 });
  const ok = await page.evaluate(async (args) => {
    const { job, style, GARNET, DUST } = args;
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
    for (const r of job.refs ?? []) {
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
    for (const t of job.traffic ?? []) {
      const pt = map.project([t.lon, t.lat]);
      const dot = document.createElement('div'); dot.className = 'aadt-dot';
      dot.style.cssText = `position:absolute;left:${pt.x - 6.5}px;top:${pt.y - 6.5}px;z-index:3`;
      document.body.appendChild(dot);
      taken.push({ l: pt.x - 7, t: pt.y - 7, r: pt.x + 7, b: pt.y + 7 });
      const el = document.createElement('div'); el.className = 'aadt';
      el.innerHTML = `<b></b><span></span>`;
      el.querySelector('b').textContent = t.qty;
      el.querySelector('span').textContent = t.road;
      el.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;z-index:4';
      document.body.appendChild(el);
      const w = el.offsetWidth, h = el.offsetHeight;
      const cands = [[pt.x - w / 2, pt.y - h - 9], [pt.x - w / 2, pt.y + 9], [pt.x + 10, pt.y - h / 2], [pt.x - w - 10, pt.y - h / 2],
        [pt.x + 10, pt.y - h - 6], [pt.x - w - 10, pt.y - h - 6], [pt.x + 10, pt.y + 6], [pt.x - w - 10, pt.y + 6],
        [pt.x - w / 2, pt.y - h - 34], [pt.x - w / 2, pt.y + 34], [pt.x + 40, pt.y - h / 2], [pt.x - w - 40, pt.y - h / 2]];
      let chosen = null;
      for (const [x, y] of cands) {
        const box = { l: x, t: y, r: x + w, b: y + h };
        if (box.l < 4 || box.t < 50 || box.r > W - 4 || box.b > H - 18) continue;
        if (!hit(box)) { chosen = box; break; }
      }
      if (!chosen) { el.remove(); continue; }
      el.style.left = `${chosen.l}px`; el.style.top = `${chosen.t}px`; el.style.visibility = 'visible';
      taken.push({ l: chosen.l - 3, t: chosen.t - 3, r: chosen.r + 3, b: chosen.b + 3 });
      const cx = Math.max(chosen.l, Math.min(pt.x, chosen.r)), cy = Math.max(chosen.t, Math.min(pt.y, chosen.b));
      if (Math.hypot(cx - pt.x, cy - pt.y) > 12) {
        const ln = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ln.setAttribute('style', `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:2;pointer-events:none`);
        ln.innerHTML = `<line x1="${pt.x}" y1="${pt.y}" x2="${cx}" y2="${cy}" stroke="${GARNET}" stroke-width="1.2"/>`;
        document.body.appendChild(ln);
      }
    }
    const blockers = [];
    for (const el of document.querySelectorAll('.pin .tag, .ref, .aadt')) {
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
    return { zoom: map.getZoom(), center: map.getCenter() };
  }, { job, style, GARNET, DUST });
  mkdirSync(dirname(job.out), { recursive: true });
  await page.screenshot({ path: job.out, type: job.out.endsWith('.png') ? 'png' : 'jpeg', quality: job.out.endsWith('.png') ? undefined : 90, clip: { x: 0, y: 0, width: job.width, height: job.height } });
  return ok;
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
for (const d of dprs) {
  const ctx = await browser.newContext({ deviceScaleFactor: d });
  pages[d] = await ctx.newPage();
  pages[d].on('pageerror', (e) => console.error('pageerror', e.message));
}
for (const job of jobs) {
  job.dpr = job.dpr ?? 3;
  if (!force && existsSync(job.out)) { console.log('skip', job.out); continue; }
  const t = Date.now();
  try {
    const r = await render(pages[job.dpr], job);
    console.log('ok', job.out, `z=${r.zoom.toFixed(2)}`, `${Date.now() - t}ms`);
  } catch (e) {
    console.error('FAIL', job.out, e.message);
  }
}
await browser.close();

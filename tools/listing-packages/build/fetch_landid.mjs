import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const HEROES = JSON.parse(readFileSync(join(HERE, 'heroes.json'), 'utf8'));
const PLANS = JSON.parse(readFileSync(join(HERE, 'plans.json'), 'utf8'));
const OUT = join(ROOT, 'geo/landid');
const TMP = join(ROOT, 'qa/landid');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const want = process.argv.slice(2);
const uids = want.length ? want : Object.keys(HEROES);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function loadShare(url, slug) {
  const page = await browser.newPage();
  try {
    const got = page.waitForResponse((r) => r.url().endsWith(`/api/maps/${slug}/share.json`), { timeout: 90000 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const r = await got;
    if (r.status() !== 200) throw new Error(`share.json HTTP ${r.status()}`);
    return await r.json();
  } finally {
    await page.close();
  }
}

async function renderShot(slug, out) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.route(`**/api/maps/${slug}/share.json`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.shared_enabled_layers = [];
    body.custom_layers = [];
    await route.fulfill({ response: res, json: body });
  });
  try {
    await page.goto(`https://id.land/map-screenshot/${slug}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(8000);
    await page.screenshot({ path: out });
  } finally {
    await page.close();
  }
}

let failed = 0;
for (const uid of uids) {
  const entry = HEROES[uid];
  if (!entry) { console.error(`${uid}: not in heroes.json`); failed++; continue; }
  const slug = entry.landid_url.match(/maps\/([0-9a-f]+)\/share/)[1];
  let share;
  try {
    share = await loadShare(entry.landid_url, slug);
  } catch (e) {
    console.error(`${uid}: ${e.message}`);
    failed++;
    continue;
  }
  writeFileSync(join(OUT, `${uid}.json`), JSON.stringify({
    uid,
    landid_url: entry.landid_url,
    fetched: new Date().toISOString(),
    name: share.name,
    updated_at: share.updated_at,
    acres: share.acres,
    enabled_layers: share.shared_enabled_layers || [],
    features: share.geoJSON,
  }, null, 1) + '\n');
  let note = '';
  if (entry.image && !PLANS[uid]?.cover) {
    const png = join(TMP, `${uid}.png`);
    try {
      await renderShot(slug, png);
    } catch (e) {
      console.error(`${uid}: screenshot ${e.message}`);
      failed++;
      continue;
    }
    let ref = '';
    if (share.preview) {
      const res = await fetch(share.preview);
      if (res.ok) {
        ref = join(TMP, `${uid}.landid-preview.png`);
        writeFileSync(ref, Buffer.from(await res.arrayBuffer()));
      }
    }
    note = execFileSync('python3', [join(HERE, 'hero_jpg.py'), png, join(ROOT, entry.image), ref], { encoding: 'utf8' }).trim();
  }
  const kinds = share.geoJSON.map((f) => f.geometry.type).join(',');
  const layers = (share.shared_enabled_layers || []).length ? ` | layers on in the share, off in the hero: ${share.shared_enabled_layers.join(',')}` : '';
  console.log(`${uid}: ${share.name} | ${share.geoJSON.length} features (${kinds}) | updated ${share.updated_at}${note ? ' | ' + note : ''}${layers}`);
}
await browser.close();
process.exit(failed ? 1 : 0);

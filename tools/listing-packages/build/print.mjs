import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
const [, , ...uids] = process.argv;
const ROOT = new URL('..', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 816, height: 1056 } });
for (const uid of uids) {
  const p = await ctx.newPage();
  await p.goto(`file://${ROOT}out/html/${uid}.html`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => window.__ready === true);
  const info = await p.evaluate(() => ({ overlays: window.__overlays, overflow: window.__overflow, pages: window.__pages }));
  await p.pdf({ path: `${ROOT}out/html/${uid}.body.pdf`, width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true, tagged: true, outline: false });
  writeFileSync(`${ROOT}out/html/${uid}.layout.json`, JSON.stringify(info));
  console.log(uid, 'pages', info.pages, 'overflow', info.overflow, 'overlays', info.overlays.length);
  await p.close();
}
await b.close();

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
const [, , url, who, ...files] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', proxy: { server: process.env.HTTPS_PROXY } });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await p.click('button:has-text("Decline")', { timeout: 5000 }).catch(() => null);
const payload = files.map((f) => ({ name: basename(f), b64: readFileSync(f).toString('base64') }));
const dt = await p.evaluateHandle((payload) => {
  const dt = new DataTransfer();
  for (const f of payload) {
    const bin = atob(f.b64); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    dt.items.add(new File([u8], f.name, { type: f.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' }));
  }
  return dt;
}, payload);
const zone = await p.$('#browse-target');
const target = await zone.evaluateHandle((el) => el.closest('div[class]')?.parentElement || el);
for (const ev of ['dragenter', 'dragover', 'drop']) await target.dispatchEvent(ev, { dataTransfer: dt });
await p.waitForTimeout(3000);
const vis = [];
for (const i of await p.$$('input[type=text], input[type=email], input:not([type])')) if (await i.isVisible()) vis.push(i);
if (vis.length >= 2) { await vis[0].fill(who); await vis[1].fill('tucker@reddoorla.com'); }
console.log('CLICK upload', new Date().toISOString());
await p.click('button:has-text("Upload")');
const t0 = Date.now();
const mb = payload.reduce((n, f) => n + f.b64.length * 0.75, 0) / 1e6;
const waitMs = Math.max(45000, mb * 5000);
await new Promise((r) => setTimeout(r, waitMs));
console.log('WAITED', Math.round((Date.now() - t0) / 1000), 's for', mb.toFixed(1), 'MB', files.length, 'files');
await b.close();

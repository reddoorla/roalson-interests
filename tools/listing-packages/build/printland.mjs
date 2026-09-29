import { chromium } from 'playwright-core';
const [, , src, out] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1056, height: 816 } });
await p.goto('file://' + src, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: out, width: '11in', height: '8.5in', printBackground: true, preferCSSPageSize: true, tagged: true });
await b.close();

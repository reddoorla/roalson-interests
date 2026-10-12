import { chromium } from 'playwright-core';
const [, , src, out] = process.argv;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.goto('file://' + src, { waitUntil: 'load' });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font-size:7px;color:#B2AC9F;padding:0 0.8in;display:flex;justify-content:space-between;font-family:Arial"><span>Roalson Interests — Listing package review, September 2026</span><span><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>', margin: { top: '0.75in', bottom: '0.8in', left: '0.8in', right: '0.8in' }, tagged: true });
await b.close();

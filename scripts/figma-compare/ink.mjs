// Where does the text ink sit inside a pill? Screenshots the element at 4x,
// finds the rows that carry the text colour, and reports the ink box against
// the element box — the number behind "the label looks low".
//   BASE=... node scripts/figma-compare/ink.mjs <url path> <selector> <ink colour hex>
import { chromium } from "@playwright/test";

const [route, selector, inkHex] = process.argv.slice(2);
const base = process.env.BASE ?? "http://localhost:4173";
const ink = [1, 3, 5].map((i) => parseInt(inkHex.slice(i, i + 2), 16));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 4,
});
await page.goto(base + route, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
// app.css asks for smooth scrolling; the screenshot must not land mid-glide.
await page.evaluate(() =>
  document.documentElement.style.setProperty("scroll-behavior", "auto", "important"),
);
const el = page.locator(selector).first();
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const buf = await el.screenshot();
const box = await el.boundingBox();
const res = await page.evaluate(
  async ({ b64, ink }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let top = -1,
      bottom = -1,
      left = -1,
      right = -1;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const near =
          Math.abs(d[i] - ink[0]) < 40 &&
          Math.abs(d[i + 1] - ink[1]) < 40 &&
          Math.abs(d[i + 2] - ink[2]) < 40;
        if (!near) continue;
        if (top < 0) top = y;
        bottom = y;
        if (left < 0 || x < left) left = x;
        if (x > right) right = x;
      }
    return { w: c.width, h: c.height, top, bottom, left, right };
  },
  { b64: buf.toString("base64"), ink },
);
const s = 4;
const inkTop = res.top / s,
  inkBottom = (res.bottom + 1) / s;
const inkMid = (inkTop + inkBottom) / 2;
console.log(
  `${selector}: box ${box.width.toFixed(1)}x${box.height.toFixed(1)}; ink rows ${inkTop.toFixed(2)}–${inkBottom.toFixed(2)} (height ${(inkBottom - inkTop).toFixed(2)}); ink centre ${inkMid.toFixed(2)} vs box centre ${(box.height / 2).toFixed(2)} → offset ${(inkMid - box.height / 2).toFixed(2)}px (positive = low); ink x ${(res.left / s).toFixed(1)}–${((res.right + 1) / s).toFixed(1)}`,
);
await browser.close();

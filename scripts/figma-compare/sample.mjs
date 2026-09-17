// Read pixels off a PNG — a comp render or a site capture — so grounds,
// panels and line positions are compared by what paints, not by token.
//   node scripts/figma-compare/sample.mjs <png> x,y ...            colour at points (+9x9 mean)
//   node scripts/figma-compare/sample.mjs <png> rows x0,y0,x1,y1 #hex   rows in the region carrying that ink → line clusters
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [file, ...rest] = process.argv.slice(2);
const mode = rest[0] === "rows" ? "rows" : "points";
const browser = await chromium.launch();
const page = await browser.newPage();
// A data: URL keeps the canvas untainted; file:// images are cross-origin.
const b64 = fs.readFileSync(file).toString("base64");
await page.setContent(`<img id="i"><canvas id="c"></canvas>`);
const out = await page.evaluate(
  async ({ b64, mode, rest }) => {
    const img = document.getElementById("i");
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.getElementById("c");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
    if (mode === "points") {
      return rest.map((p) => {
        const [x, y] = p.split(",").map(Number);
        const d = ctx.getImageData(x, y, 1, 1).data;
        const a = ctx.getImageData(x - 4, y - 4, 9, 9).data;
        let r = 0,
          g = 0,
          b = 0;
        for (let i = 0; i < a.length; i += 4) {
          r += a[i];
          g += a[i + 1];
          b += a[i + 2];
        }
        const n = a.length / 4;
        return `${p}: #${hex(d[0])}${hex(d[1])}${hex(d[2])}  mean #${hex(r / n)}${hex(g / n)}${hex(b / n)}`;
      });
    }
    const [x0, y0, x1, y1] = rest[1].split(",").map(Number);
    const ink = [1, 3, 5].map((i) => parseInt(rest[2].slice(i, i + 2), 16));
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const w = x1 - x0,
      h = y1 - y0;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let count = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (
          Math.abs(d[i] - ink[0]) < 28 &&
          Math.abs(d[i + 1] - ink[1]) < 28 &&
          Math.abs(d[i + 2] - ink[2]) < 28
        )
          count++;
      }
      rows.push(count);
    }
    // Cluster consecutive inked rows into lines (gaps of ≥3 empty rows split).
    const lines = [];
    let start = -1,
      gap = 0;
    for (let y = 0; y < h; y++) {
      if (rows[y] > 0) {
        if (start < 0) start = y;
        gap = 0;
      } else if (start >= 0 && ++gap >= 3) {
        lines.push([y0 + start, y0 + y - gap]);
        start = -1;
      }
    }
    if (start >= 0) lines.push([y0 + start, y0 + h]);
    return lines.map(([a, b]) => `${a}–${b} (${b - a} tall)`);
  },
  { b64, mode, rest },
);
console.log(path.basename(file), mode === "rows" ? `${rest[1]} ${rest[2]}` : "");
for (const l of out) console.log("  " + l);
await browser.close();

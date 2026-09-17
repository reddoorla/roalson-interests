// Composite a comp crop beside a site crop at the same scale, so a section
// can be judged by eye with both renders in one image.
//   node scripts/figma-compare/sidebyside.mjs <dir> <pairs.json>
// pairs.json: [{ name, left: {file, y, h}, right: {file, y, h}, scale? }]
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const [dir, pairsFile] = process.argv.slice(2);
const pairs = JSON.parse(fs.readFileSync(pairsFile, "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 900 },
  deviceScaleFactor: 1,
});
for (const p of pairs) {
  const scale = p.scale ?? 0.5;
  const W = p.right.file.includes("w1920") ? 1920 : 1440;
  const h = Math.max(p.left.h, p.right.h);
  const html = `<style>body{margin:0;background:#888}.row{display:flex;gap:${Math.round(20 * scale)}px;padding:${Math.round(10 * scale)}px}
    .pane{width:${W * scale}px;height:${h * scale}px;overflow:hidden;position:relative;background:#fff}
    .pane img{position:absolute;left:0;width:${W * scale}px}
    .lab{position:absolute;top:0;left:0;background:#000c;color:#fff;font:12px monospace;padding:2px 6px}</style>
    <div class="row">
      <div class="pane"><img src="file://${path.resolve(dir, p.left.file)}" style="top:${-p.left.y * scale}px"><span class="lab">FIGMA ${p.name} y=${p.left.y} h=${p.left.h}</span></div>
      <div class="pane"><img src="file://${path.resolve(dir, p.right.file)}" style="top:${-p.right.y * scale}px"><span class="lab">SITE y=${p.right.y} h=${p.right.h}</span></div>
    </div>`;
  // Written to disk and opened as a file: URL, so the local images are
  // same-origin — about:blank cannot load file:// images.
  const tmp = path.join(dir, `.pair-${p.name}.html`);
  fs.writeFileSync(tmp, html);
  await page.goto("file://" + path.resolve(tmp));
  await page.waitForTimeout(150);
  const row = page.locator(".row");
  await row.screenshot({ path: path.join(dir, `pair-${p.name}.png`) });
  fs.unlinkSync(tmp);
  console.log(
    "wrote",
    `pair-${p.name}.png`,
    `${Math.round(2 * W * scale + 40 * scale)}x${Math.round(h * scale + 20 * scale)}`,
  );
}
await browser.close();

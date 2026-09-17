// Measure the rendered site the way Figma measures a comp: every section,
// every text run and every image with its box, plus the computed type for
// text. Output is JSON per route for scripts/figma-compare/compare.mjs, which
// matches text runs to Figma text nodes by content.
//
//   BASE=http://localhost:4173 OUT=/tmp/out WIDTH=1440 node scripts/figma-compare/extract-dom.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = process.env.BASE ?? "http://localhost:4173";
const out = process.env.OUT ?? "figma-compare-out";
const routes = (process.env.ROUTES ?? "/,/about,/donate").split(",");
const width = Number(process.env.WIDTH ?? 1440);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
for (const route of routes) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Walk the page so lazy images and scroll-driven states have run once.
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);

  const data = await page.evaluate(() => {
    const box = (r) => ({
      x: +r.x.toFixed(1),
      y: +(r.y + scrollY).toFixed(1),
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
    });
    const sectionOf = (el) => {
      const s = el.closest("section[data-slice-type]");
      if (s) return `${s.dataset.sliceType}/${s.dataset.sliceVariation}`;
      const c = el.closest("nav,footer,dialog");
      return c ? c.tagName.toLowerCase() : "page";
    };
    const sections = [...document.querySelectorAll("section[data-slice-type], nav, footer")].map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.dataset.sliceType,
        variation: el.dataset.sliceVariation,
        ...box(el.getBoundingClientRect()),
        bg: getComputedStyle(el).backgroundColor,
      }),
    );
    const texts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const text = n.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const el = n.parentElement;
      if (!el || el.closest("script,style,noscript,dialog:not([open])")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      texts.push({
        text,
        tag: el.tagName.toLowerCase(),
        section: sectionOf(el),
        ...box(r),
        font: cs.fontFamily.split(",")[0].replace(/"/g, "").trim(),
        size: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
        lh: cs.lineHeight,
        ls: cs.letterSpacing,
        color: cs.color,
        transform: cs.textTransform,
      });
    }
    const images = [...document.querySelectorAll("img, [style*='background-image']")].map((el) => ({
      src: el.currentSrc || el.src || getComputedStyle(el).backgroundImage,
      alt: el.alt ?? "",
      section: sectionOf(el),
      ...box(el.getBoundingClientRect()),
    }));
    return { height: document.documentElement.scrollHeight, sections, texts, images };
  });

  const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
  fs.writeFileSync(`${out}/${slug}.dom.json`, JSON.stringify(data, null, 1));
  await page.screenshot({ path: `${out}/${slug}.site.png`, fullPage: true });
  console.log(
    `${route}: height ${data.height}, ${data.sections.length} sections, ${data.texts.length} text runs, ${data.images.length} images` +
      (errors.length ? `, console errors: ${errors.join(" | ")}` : ""),
  );
  await page.close();
}
await browser.close();

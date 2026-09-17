// Pull the comp's geometry and renders from Figma's REST API so compare.mjs
// has something to compare against: per frame, every visible node with its
// box (relative to the frame), fills, layout, scroll behaviour and — for text
// — the characters and the resolved style; plus a 1x PNG render.
//
//   FIGMA_PAT=… FIGMA_FILE=<file key> node scripts/figma-compare/pull-figma.mjs <dir> home=5249:1130 about=5312:1214 …
//
// The token and file key stay in the environment: this repo is public.
import fs from "node:fs";

const [dir, ...pairs] = process.argv.slice(2);
const pat = process.env.FIGMA_PAT;
const file = process.env.FIGMA_FILE;
if (!pat || !file || !dir || !pairs.length) {
  console.error("usage: FIGMA_PAT=… FIGMA_FILE=… pull-figma.mjs <dir> <slug>=<nodeId> …");
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
const frames = Object.fromEntries(pairs.map((p) => p.split("=")));
const headers = { "X-Figma-Token": pat };
const api = (path) => fetch(`https://api.figma.com/v1/files/${file}${path}`, { headers });

const hex = (c) =>
  "#" +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const fillsOf = (n) =>
  (n.fills || [])
    .filter((f) => f.visible !== false)
    .map((f) =>
      f.type === "SOLID"
        ? hex(f.color) + (f.opacity != null && f.opacity < 1 ? `@${f.opacity.toFixed(2)}` : "")
        : f.type === "IMAGE"
          ? `image:${f.imageRef}`
          : f.type,
    );

const ids = Object.values(frames).join(",");
const res = await api(`/nodes?ids=${encodeURIComponent(ids)}`);
if (!res.ok) throw new Error(`nodes ${res.status}`);
const json = await res.json();
const out = {};
for (const [slug, id] of Object.entries(frames)) {
  const doc = json.nodes[id]?.document;
  if (!doc) {
    console.log(slug, "missing");
    continue;
  }
  const ox = doc.absoluteBoundingBox.x;
  const oy = doc.absoluteBoundingBox.y;
  const nodes = [];
  const walk = (n, depth, path) => {
    if (n.visible === false) return;
    const b = n.absoluteBoundingBox;
    const rec = {
      id: n.id,
      name: n.name,
      type: n.type,
      depth,
      path,
      x: b ? +(b.x - ox).toFixed(1) : null,
      y: b ? +(b.y - oy).toFixed(1) : null,
      w: b ? +b.width.toFixed(1) : null,
      h: b ? +b.height.toFixed(1) : null,
    };
    if (n.scrollBehavior && n.scrollBehavior !== "SCROLLS") rec.scroll = n.scrollBehavior;
    if (n.opacity != null && n.opacity < 1) rec.opacity = n.opacity;
    const fills = fillsOf(n);
    if (fills.length) rec.fills = fills;
    if (n.cornerRadius) rec.radius = n.cornerRadius;
    if (n.rectangleCornerRadii) rec.radii = n.rectangleCornerRadii;
    if (n.layoutMode) {
      rec.layout = n.layoutMode;
      rec.gap = n.itemSpacing;
      rec.pad = [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft];
      rec.align = [n.primaryAxisAlignItems, n.counterAxisAlignItems];
    }
    if (n.type === "TEXT") {
      const s = n.style || {};
      rec.text = n.characters;
      rec.style = {
        family: s.fontFamily,
        ps: s.fontPostScriptName,
        weight: s.fontWeight,
        size: s.fontSize,
        lh: s.lineHeightPx,
        ls: s.letterSpacing,
        case: s.textCase,
        align: s.textAlignHorizontal,
        // "CAP_HEIGHT" when Figma trims the box to cap height and baseline;
        // absent otherwise. The box height above is then ~0.70em, not the
        // line-height, and every gap the comp specifies from this node is
        // cap-to-baseline. Without this field the harness records the
        // trimmed box and cannot say why. Measured and written up:
        // https://github.com/reddoorla/vida-legacy-foundation/blob/main/docs/figma-cap-height-trim.md
        trim: s.leadingTrim ?? null,
      };
    }
    nodes.push(rec);
    for (const c of n.children || []) walk(c, depth + 1, `${path}/${n.name}`);
  };
  walk(doc, 0, "");
  out[slug] = {
    id,
    name: doc.name,
    w: doc.absoluteBoundingBox.width,
    h: doc.absoluteBoundingBox.height,
    nodes,
  };
  const texts = nodes.filter((n) => n.type === "TEXT").length;
  const sticky = nodes.filter((n) => n.scroll).map((n) => `${n.name}=${n.scroll}`);
  console.log(
    `${slug}: ${nodes.length} nodes, ${texts} text; sticky: ${sticky.join(", ") || "none"}`,
  );
}
fs.writeFileSync(`${dir}/figma-nodes.json`, JSON.stringify(out, null, 1));

// 1x renders, one per frame (the images endpoint is /v1/images/:file).
const imgRes = await fetch(
  `https://api.figma.com/v1/images/${file}?ids=${encodeURIComponent(ids)}&format=png&scale=1`,
  { headers },
);
const urls = (await imgRes.json()).images || {};
for (const [slug, id] of Object.entries(frames)) {
  const url = urls[id];
  if (!url) continue;
  const png = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(`${dir}/${slug}.figma.png`, png);
  console.log(`${slug}.figma.png ${png.length} bytes`);
}

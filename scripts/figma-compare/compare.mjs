// Match the site's text runs (extract-dom.mjs) to the comp's text nodes
// (figma-nodes.json, from the Figma REST API) by content, and report the
// deltas: position, box, and type. Also lists the comp's sections vs the
// site's, and text in one that is not in the other.
//
//   node scripts/figma-compare/compare.mjs <dir> <slug>   e.g. compare/ home
import fs from "node:fs";

const [dir, slug] = process.argv.slice(2);
const figma = JSON.parse(fs.readFileSync(`${dir}/figma-nodes.json`, "utf8"))[slug];
const dom = JSON.parse(fs.readFileSync(`${dir}/${slug}.dom.json`, "utf8"));

const norm = (s) =>
  s
    .replace(/\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const figTexts = figma.nodes.filter((n) => n.type === "TEXT" && n.text?.trim());
const pct = (a, b) => (b ? `${(((a - b) / b) * 100).toFixed(0)}%` : "-");
const f1 = (v) => (v == null ? "-" : Number(v).toFixed(1));

// Figma line-height is px; the DOM reports px too (or "normal").
const lhPx = (t) => (t.lh === "normal" ? null : parseFloat(t.lh));
const lsPx = (t) => (t.ls === "normal" ? 0 : parseFloat(t.ls));

const usedDom = new Set();
const rows = [];
for (const ft of figTexts) {
  const key = norm(ft.text);
  // A DOM run can be a fragment of a Figma paragraph (rich text splits on
  // marks) — match exact first, then a run contained in the Figma text.
  let match = dom.texts.find((t, i) => !usedDom.has(i) && norm(t.text) === key);
  let partial = false;
  if (!match) {
    // The fragments must come from one place — the same section — and add
    // up to most of the paragraph, or a short run that merely occurs inside
    // a longer comp text ("compassionate support" inside the lead paragraph)
    // would be swallowed here and reported missing where it really lives.
    const cands = dom.texts
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t, i }) => !usedDom.has(i) && norm(t.text).length > 12 && key.includes(norm(t.text)),
      );
    const section = cands[0]?.t.section;
    const same = cands.filter(({ t }) => t.section === section);
    const covered = same.reduce((n, { t }) => n + norm(t.text).length, 0);
    if (same.length && covered >= key.length * 0.8) {
      // Take the first fragment: its top-left is the paragraph's.
      match = same[0].t;
      partial = true;
      same.forEach(({ i }) => usedDom.add(i));
    }
  } else usedDom.add(dom.texts.indexOf(match));
  if (!match) {
    rows.push({ status: "MISSING ON SITE", figma: ft });
    continue;
  }
  const s = ft.style;
  const notes = [];
  if (Math.abs(match.size - s.size) > 0.5) notes.push(`size ${match.size} vs ${s.size}`);
  if (String(match.weight) !== String(s.weight))
    notes.push(`weight ${match.weight} vs ${s.weight}`);
  const dl = lhPx(match);
  if (dl != null && s.lh && Math.abs(dl - s.lh) > 1)
    notes.push(`line-height ${f1(dl)} vs ${f1(s.lh)}`);
  if (Math.abs(lsPx(match) - (s.ls ?? 0)) > 0.15)
    notes.push(`tracking ${f1(lsPx(match))} vs ${f1(s.ls)}`);
  const fam = (s.family || "").toLowerCase().replace(/\s+/g, "-");
  if (!match.font.toLowerCase().includes(fam.split("-")[0]))
    notes.push(`family "${match.font}" vs "${s.family}"`);
  if (
    s.case === "UPPER" &&
    match.transform !== "uppercase" &&
    match.text !== match.text.toUpperCase()
  )
    notes.push("not uppercase");
  const dx = match.x - ft.x,
    dy = match.y - ft.y;
  const dw = match.w - ft.w;
  if (Math.abs(dx) > 8) notes.push(`x ${f1(match.x)} vs ${f1(ft.x)} (${f1(dx)})`);
  if (!partial && Math.abs(dw) > Math.max(8, ft.w * 0.05))
    notes.push(`width ${f1(match.w)} vs ${f1(ft.w)} (${pct(match.w, ft.w)})`);
  rows.push({ status: notes.length ? "DIFF" : "ok", figma: ft, dom: match, dy, notes, partial });
}
const extra = dom.texts.filter((t, i) => !usedDom.has(i));

console.log(`# ${slug}: comp ${figma.w}x${figma.h}, site height ${dom.height}\n`);
console.log("## Sections (site)");
for (const s of dom.sections)
  console.log(
    `  ${s.tag}${s.type ? ` ${s.type}/${s.variation}` : ""} y=${s.y} h=${s.h} bg=${s.bg}`,
  );
console.log("\n## Comp top-level frames");
for (const n of figma.nodes.filter((n) => n.depth === 1))
  console.log(
    `  ${n.name} (${n.id}) y=${n.y} h=${n.h}${n.scroll ? ` [${n.scroll}]` : ""} fills=${(n.fills || []).join(",")}`,
  );
console.log(
  "\n## Text, in comp order  (dy = site y − comp y; sections drift, so compare dy to its neighbours)",
);
for (const r of rows) {
  const t = r.figma.text.replace(/\s+/g, " ").slice(0, 60);
  if (r.status === "MISSING ON SITE") {
    console.log(
      `  ✗ MISSING  "${t}"  [${r.figma.style.family} ${r.figma.style.weight} ${r.figma.style.size}/${f1(r.figma.style.lh)}]`,
    );
    continue;
  }
  const mark = r.status === "ok" ? "✓" : "△";
  console.log(
    `  ${mark} ${r.partial ? "(part) " : ""}"${t}"  <${r.dom.tag}> in ${r.dom.section}  dy=${f1(r.dy)}${r.notes.length ? "\n      " + r.notes.join("; ") : ""}`,
  );
}
console.log("\n## Site text not in the comp");
for (const t of extra)
  console.log(`  + "${t.text.slice(0, 60)}" <${t.tag}> in ${t.section} ${t.size}px/${t.weight}`);

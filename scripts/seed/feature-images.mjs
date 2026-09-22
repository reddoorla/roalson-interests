#!/usr/bin/env node
// Lift each listing's feature photograph out of that listing's OWN marketing
// PDF, and upload it to Prismic's media library.
//
//   node scripts/seed/feature-images.mjs            extract + verify; writes no
//                                                   network, only .feature-images/
//   node scripts/seed/feature-images.mjs --upload   ...and upload to Prismic,
//                                                   recording each asset in
//                                                   scripts/seed/listings.state.json
//   node scripts/seed/feature-images.mjs --only <uid>
//
// THIS IS A ONE-OFF PROVISIONING STEP. It is NOT part of `pnpm verify` and
// nothing in CI runs it: it needs the network, a Prismic write token, and
// poppler's `pdfimages` on PATH (`brew install poppler`; the script also looks
// in /opt/homebrew/bin, or set PDFIMAGES). Only the pure functions below are
// unit-tested — see feature-images.test.ts — because the rest is I/O.
//
// WHY THE PDFs. The comp's listing photography is unlicensed stock. Every one
// of the 22 listings, though, has a marketing package on the client's own site
// (`assets.package_pdf.url`), and those images are the client's: licensed, and
// bound to the right property by the document they came out of rather than by
// anyone's judgement.
//
// WHICH IMAGE, AND WHY IT IS RECORDED RATHER THAN GUESSED. The rule that finds
// a cover photograph is `chooseFeatureImage`: on a given page, discard every
// image whose PDF object id ALSO appears on another page — that is the
// letterhead, the wordmark and the rule bars, which repeat — then take the
// largest of what is left. It works, but it only answers "is there a photo on
// this page". Measured across all 22 packages on 2026-09-21, page 1 carries a
// photograph in FIVE of them; the other seventeen open on a typed spec sheet,
// and their only photographic content is the aerial exhibit four or five pages
// in, between the street maps and the survey. No positional rule separates
// "aerial of this site" from "Location Map", "Survey" or "Floor Plan", so the
// page and object of every image are recorded in listings.json, where they were
// put by a human who LOOKED at the extracted file. `locate` then refuses to
// extract anything else: if the client republishes a package and the object
// moves or changes size, this stops instead of silently shipping whatever now
// sits in that slot on a property listing.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  ROOT,
  THROTTLE_MS,
  existingAssets,
  headersFor,
  readState,
  readToken,
  repositoryName,
  sleep,
  uploadAsset,
  writeState,
} from "./lib.mjs";

export const DATA_PATH = join(ROOT, "scripts/seed/listings.json");
export const STATE_PATH = join(ROOT, "scripts/seed/listings.state.json");
/** Gitignored: these are the client's files and this repository is public. */
export const WORK_DIR = join(ROOT, ".feature-images");
/** The card box is 423.5 × 267.5 and the detail page reuses it, so nothing
 *  reads more than ~1900 device pixels across. */
export const MAX_EDGE = 2000;

/** The rows of `pdfimages -list`: one per image placement, so the same object
 *  id appears once per page it is drawn on. Anything that is not a data row —
 *  the header, the rule, a warning on stderr — parses to nothing. */
export function parseImageList(stdout) {
  const rows = [];
  for (const line of String(stdout).split("\n")) {
    const m =
      /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)/.exec(
        line,
      );
    if (!m) continue;
    rows.push({
      page: Number(m[1]),
      num: Number(m[2]),
      type: m[3],
      width: Number(m[4]),
      height: Number(m[5]),
      enc: m[9],
      object: Number(m[11]),
    });
  }
  return rows;
}

/** The candidate photograph on one page: every image on it whose object id is
 *  NOT drawn on any other page (that is the template — letterhead, wordmark,
 *  rule), largest first by pixel area. `smask` rows are the alpha channel of
 *  another image, never an image of their own. */
export function pageCandidates(rows, page) {
  const elsewhere = new Set(rows.filter((r) => r.page !== page).map((r) => r.object));
  return rows
    .filter((r) => r.page === page && r.type === "image" && !elsewhere.has(r.object))
    .sort((a, b) => b.width * b.height - a.width * a.height);
}

/** The heuristic, whole: the largest non-template image on the page, or null
 *  when the page holds nothing but the template. */
export function chooseFeatureImage(rows, page = 1) {
  return pageCandidates(rows, page)[0] ?? null;
}

/** The one row a recorded `source` names — by page, object id AND size, so a
 *  republished package that reuses an object number cannot pass. Throws rather
 *  than returning null: a missed match must stop the run, not skip a listing
 *  quietly. */
export function locate(rows, source) {
  const hit = rows.find(
    (r) =>
      r.page === source.page &&
      r.object === source.object &&
      r.width === source.width &&
      r.height === source.height,
  );
  if (hit) return hit;
  const onPage = rows
    .filter((r) => r.page === source.page)
    .map((r) => `obj${r.object} ${r.width}x${r.height}`)
    .join(", ");
  throw new Error(
    `page ${source.page} no longer holds object ${source.object} at ${source.width}x${source.height} ` +
      `— it now holds: ${onPage || "no images"}. The package changed: look at it again before shipping a photo.`,
  );
}

const PDFIMAGES =
  process.env.PDFIMAGES ??
  (existsSync("/opt/homebrew/bin/pdfimages") ? "/opt/homebrew/bin/pdfimages" : "pdfimages");

function listImages(pdfPath) {
  return parseImageList(execFileSync(PDFIMAGES, ["-list", pdfPath], { maxBuffer: 1 << 28 }));
}

/** Extract exactly the named image, and prove it is the one: poppler writes a
 *  file per image on the page, and only the file whose real pixel size matches
 *  the recorded one is kept. */
async function extract(pdfPath, source, outDir) {
  const stage = join(outDir, "stage");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  execFileSync(PDFIMAGES, [
    "-all",
    "-f",
    String(source.page),
    "-l",
    String(source.page),
    "-p",
    pdfPath,
    join(stage, "img"),
  ]);
  for (const file of readdirSync(stage)) {
    const path = join(stage, file);
    const meta = await sharp(path).metadata();
    if (meta.width === source.width && meta.height === source.height) return path;
  }
  throw new Error(
    `nothing on page ${source.page} of ${pdfPath} came out at ${source.width}x${source.height}`,
  );
}

/** The file that ships: upright, no larger than the page it is read on, JPEG.
 *  `rotate` is the quarter-turn needed to stand the EXHIBIT up — several of the
 *  aerials are stored on their side, because the page they sit on is portrait
 *  and the map is not. */
async function encode(srcPath, destPath, { rotate = 0 } = {}) {
  const buf = await sharp(srcPath)
    .rotate(rotate)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  writeFileSync(destPath, buf);
  const meta = await sharp(buf).metadata();
  return { bytes: buf.length, width: meta.width, height: meta.height };
}

async function main(argv) {
  const upload = argv.includes("--upload");
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

  const all = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  // A `feature_image` with a `url` came from somewhere else and is the seeder's
  // business, not this script's — `25331-ih-10-west` is one, off the client's
  // own Google My Map.
  const entries = all.filter((e) => e.assets.feature_image?.source && (!only || e.uid === only));
  console.log(
    `${entries.length} listing(s) with a photograph recorded out of a package PDF` +
      `${upload ? " — uploading" : " — extract only, pass --upload to write to Prismic"}`,
  );
  mkdirSync(WORK_DIR, { recursive: true });

  let headers;
  let state;
  let library = {};
  if (upload) {
    const repo = repositoryName();
    headers = headersFor(repo, readToken(repo));
    state = readState(STATE_PATH);
    library = await existingAssets(headers);
    console.log(`repository: ${repo} — ${Object.keys(library).length} asset(s) already uploaded`);
    await sleep(THROTTLE_MS);
  }

  for (const e of entries) {
    const image = e.assets.feature_image;
    const pdfUrl = e.assets.package_pdf.url;
    const pdfPath = join(WORK_DIR, `${e.uid}.pdf`);
    if (!existsSync(pdfPath)) {
      const res = await fetch(pdfUrl);
      if (!res.ok) {
        console.log(`  ! ${e.uid}: package answered ${res.status} — skipped`);
        continue;
      }
      writeFileSync(pdfPath, Buffer.from(await res.arrayBuffer()));
    }

    const rows = listImages(pdfPath);
    locate(rows, image.source);
    const raw = await extract(pdfPath, image.source, WORK_DIR);
    const destPath = join(WORK_DIR, image.filename);
    const { bytes, width, height } = await encode(raw, destPath, image.source);
    console.log(
      `  ${e.uid}: p${image.source.page}/obj${image.source.object} -> ${image.filename} ` +
        `${width}x${height}, ${(bytes / 1024).toFixed(0)} KB`,
    );

    if (!upload) continue;
    const known = state.assets[image.filename] ?? library[image.filename];
    if (known) {
      state.assets[image.filename] = known;
      writeState(STATE_PATH, state);
      console.log(`    already in the media library -> ${known.id}`);
      continue;
    }
    const uploaded = await uploadAsset({
      bytes: readFileSync(destPath),
      filename: image.filename,
      contentType: "image/jpeg",
      alt: image.alt,
      headers,
    });
    state.assets[image.filename] = uploaded;
    writeState(STATE_PATH, state);
    console.log(`    uploaded -> ${uploaded.id}`);
    await sleep(THROTTLE_MS);
  }

  console.log(
    upload
      ? "done — the documents themselves are staged by scripts/seed/listings.mjs"
      : `done — files are in ${WORK_DIR}; LOOK AT EVERY ONE before passing --upload`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

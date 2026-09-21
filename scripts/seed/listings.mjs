#!/usr/bin/env node
// Stage the client's listings in Prismic as `property` drafts.
//
//   node scripts/seed/listings.mjs                     what it WOULD stage; no write of any kind
//   node scripts/seed/listings.mjs --apply             stage the documents (drafts, migration release)
//   node scripts/seed/listings.mjs --apply --with-assets   …uploading package PDFs and photos first
//   node scripts/seed/listings.mjs --apply --only <uid>
//
// DATA: scripts/seed/listings.json — 22 rows, each with a `source` map saying
// where every field came from. Two public sources, joined 22/22 on the package
// PDF's `props/<dir>/` segment: the client's Google My Maps KML (coordinates)
// and the client's own "Available Properties" table at roalson.com/prop.htm
// (category headings, sizes, prices, zoning, the bullet copy). Copy is the
// client's, verbatim, typos included.
//
// This script stages. It does not make anything live: a staged document is a
// draft in the migration release until someone releases it. Assets are the
// exception — an upload is in the media library at once — which is why
// `--with-assets` is its own flag.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  THROTTLE_MS,
  existingAssets,
  headersFor,
  publishedByUid,
  readState,
  readToken,
  masterRef,
  repositoryName,
  sleep,
  contentSignature,
  stageDocument,
  stripEmpty,
  typeExists,
  uploadAsset,
  writeState,
  fetchWithRetry,
} from "./lib.mjs";

const TYPE = "property";
export const DATA_PATH = join(ROOT, "scripts/seed/listings.json");
export const STATE_PATH = join(ROOT, "scripts/seed/listings.state.json");

/** The filename an asset is stored — and deduplicated — under. */
export function assetFilename(uid, kind, asset) {
  if (asset.filename) return asset.filename;
  const ext =
    /\.([a-z0-9]{2,5})(?:\?|$)/i.exec(new URL(asset.url).pathname)?.[1]?.toLowerCase() ?? "bin";
  return `${uid}-${kind === "package_pdf" ? "package" : kind}.${ext}`;
}

/** The whole document payload, every time: PUT replaces, it never merges. */
export function toPayload(entry, assetIds = {}) {
  const data = { ...entry.data };
  const pdf = assetIds[`${entry.uid}:package_pdf`];
  const photo = assetIds[`${entry.uid}:feature_image`];
  if (pdf) data.package_pdf = { link_type: "Media", id: pdf };
  if (photo) data.feature_image = { id: photo };
  return { type: TYPE, uid: entry.uid, title: entry.data.title, data: stripEmpty(data) };
}

const CONTENT_TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

async function main(argv) {
  const apply = argv.includes("--apply");
  const withAssets = argv.includes("--with-assets");
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

  const all = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const entries = only ? all.filter((e) => e.uid === only) : all;
  if (entries.length === 0) throw new Error(`no listing with uid ${JSON.stringify(only)}`);

  const repo = repositoryName();
  console.log(
    `repository: ${repo} — ${entries.length} listing(s) — ${apply ? "APPLY" : "dry run, nothing is written"}`,
  );

  if (!apply) {
    for (const e of entries) {
      const a = Object.keys(e.assets).join("+") || "no assets";
      console.log(
        `  ${e.uid.padEnd(44)} ${String(e.data.category ?? "(no category)").padEnd(32)} ${a}`,
      );
    }
    console.log("dry run complete. Re-run with --apply to stage these as drafts.");
    return;
  }

  const headers = headersFor(repo, readToken(repo));
  const state = readState(STATE_PATH);

  // Preflights. Each REQUIRES a positive answer before any write.
  if (!(await typeExists(TYPE, headers))) {
    throw new Error(
      `preflight: repository ${repo} has no "${TYPE}" custom type yet. ` +
        "The models are delivered by the prismic-models workflow on merge to main — wait for its run.",
    );
  }
  await sleep(THROTTLE_MS);
  const assetProbe = await fetchWithRetry("https://asset-api.prismic.io/assets?limit=1", {
    headers: headers.auth,
  });
  if (assetProbe.status !== 200) {
    throw new Error(
      `preflight: the asset API answered ${assetProbe.status} — this token cannot write content`,
    );
  }
  const published = await publishedByUid(repo, TYPE, await masterRef(repo));
  console.log(
    `preflight ok: type present, asset API 200, ${Object.keys(published).length} listing(s) already live`,
  );

  const assetIds = {};
  if (withAssets) {
    const library = await existingAssets(headers);
    await sleep(THROTTLE_MS);
    for (const e of entries) {
      for (const [kind, asset] of Object.entries(e.assets)) {
        const filename = assetFilename(e.uid, kind, asset);
        const known = state.assets[filename] ?? library[filename];
        if (known) {
          assetIds[`${e.uid}:${kind}`] = known.id;
          state.assets[filename] = known;
          continue;
        }
        const res = await fetch(asset.url);
        if (!res.ok) {
          console.log(`  ! ${filename}: source answered ${res.status} — left empty`);
          continue;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const ext = filename.split(".").pop();
        try {
          const uploaded = await uploadAsset({
            bytes,
            filename,
            contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
            alt: asset.alt,
            headers,
          });
          assetIds[`${e.uid}:${kind}`] = uploaded.id;
          state.assets[filename] = uploaded;
          writeState(STATE_PATH, state);
          console.log(
            `  asset ${filename} (${(bytes.length / 1e6).toFixed(1)} MB) -> ${uploaded.id}`,
          );
        } catch (err) {
          console.log(`  ! ${filename}: ${err.message} — left empty`);
        }
        await sleep(THROTTLE_MS);
      }
    }
  } else {
    // Keep what an earlier --with-assets run attached: PUT replaces.
    for (const e of entries) {
      for (const [kind, asset] of Object.entries(e.assets)) {
        const known = state.assets[assetFilename(e.uid, kind, asset)];
        if (known) assetIds[`${e.uid}:${kind}`] = known.id;
      }
    }
  }

  let created = 0;
  let updated = 0;
  for (const e of entries) {
    const id = state.documents[e.uid]?.id ?? published[e.uid];
    const payload = toPayload(e, assetIds);
    const result = await stageDocument({ id, headers, ...payload });
    // The signature of what was SENT — publish-release.mjs holds the live
    // document to it, because a uid being listed says nothing about which
    // version is listed.
    state.documents[e.uid] = {
      id: result.id,
      at: new Date().toISOString(),
      signature: contentSignature(payload.data),
    };
    writeState(STATE_PATH, state);
    if (result.created) created++;
    else updated++;
    console.log(`  ${result.created ? "201 created" : "updated    "} ${e.uid} ${result.id}`);
    await sleep(THROTTLE_MS);
  }
  console.log(
    `staged ${created} new, ${updated} updated. They are drafts in the migration release.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

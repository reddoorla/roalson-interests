#!/usr/bin/env node
// Stage the client's listings in Prismic as `property` drafts.
//
//   node scripts/seed/listings.mjs                     what it WOULD stage; no write of any kind
//   node scripts/seed/listings.mjs --apply             stage the documents (drafts, migration release)
//   node scripts/seed/listings.mjs --apply --with-assets   …uploading package PDFs and photos first
//   node scripts/seed/listings.mjs --apply --only <uid>
//   node scripts/seed/listings.mjs --apply --over-live  …over listings that are already live
//
// DATA: scripts/seed/listings.json — 22 rows, each with a `source` map saying
// where every field came from. Two public sources, joined 22/22 on the package
// PDF's `props/<dir>/` segment: the client's Google My Maps KML (coordinates)
// and the client's own "Available Properties" table at roalson.com/prop.htm
// (category headings, sizes, prices, zoning, the bullet copy). Copy is the
// client's, verbatim but for the typos and typography the operator ruled on
// (#75, #74) — the `source` notes still say "verbatim" for those rows.
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
  readState,
  readToken,
  masterRef,
  publishedDocs,
  repositoryName,
  sleep,
  contentSignature,
  customTypeOutOfSync,
  stageDocument,
  stripEmpty,
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

/** Fields the seed data never sets and an editor does. PUT replaces, so a
 *  re-run carries the live value over rather than wiping the editor's call. */
export const EDITOR_FIELDS = ["listing_state"];

/** The uids a PUT would stage over a LIVE listing. Any of them may hold an
 *  editor's unpublished draft — a "Past project" mark, say — that this token
 *  cannot see: the content API serves the master ref only (no release refs,
 *  measured 2026-09-28) and the migration release answers 403. EDITOR_FIELDS
 *  come from the PUBLISHED version, so a draft-only value is lost and the two
 *  versions conflict (#177). Nothing here can tell a listing with a draft from
 *  one without, so `--over-live` is the operator saying they looked. */
export function overLive(entries, live) {
  return entries.map((e) => e.uid).filter((uid) => live[uid]);
}

/** The whole document payload, every time: PUT replaces, it never merges.
 *  `live` is the published document's `data`, for EDITOR_FIELDS. */
export function toPayload(entry, assetIds = {}, live = {}) {
  const data = { ...entry.data };
  for (const field of EDITOR_FIELDS) {
    if (data[field] == null && live?.[field] != null) data[field] = live[field];
  }
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
  const model = JSON.parse(readFileSync(join(ROOT, `customtypes/${TYPE}/index.json`), "utf8"));
  const stale = await customTypeOutOfSync(TYPE, model, headers);
  if (stale) {
    throw new Error(
      `preflight: ${stale}. ` +
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
  const live = await publishedDocs(repo, TYPE, await masterRef(repo));
  const risky = overLive(entries, live);
  if (risky.length && !argv.includes("--over-live")) {
    throw new Error(
      `preflight: ${risky.length} listing(s) are live, and an editor's unpublished draft of any ` +
        "of them is invisible from here; this PUT would stage over it. Check their versions in " +
        `Prismic, then re-run with --over-live. Live: ${risky.join(", ")}`,
    );
  }
  console.log(
    `preflight ok: model matches Prismic, asset API 200, ${Object.keys(live).length} listing(s) already live`,
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
        // An asset with no `url` is not fetchable from here: the feature
        // photographs come out of the package PDFs, which is
        // `scripts/seed/feature-images.mjs`'s job, and it records what it
        // uploaded in the state file above. Say so rather than calling
        // `fetch(undefined)` and dying two frames down.
        if (!asset.url) {
          console.log(
            `  ! ${filename}: no source url — run scripts/seed/feature-images.mjs --upload first. Left empty.`,
          );
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
    const id = state.documents[e.uid]?.id ?? live[e.uid]?.id;
    const payload = toPayload(e, assetIds, live[e.uid]?.data);
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

#!/usr/bin/env node
// Stage this site's `page` documents — today that is `home` — into the Prismic
// repository as DRAFTS in the migration release. Dry by default.
//
//   node scripts/seed/pages.mjs                 list what would be staged
//   node scripts/seed/pages.mjs --apply         stage them
//   node scripts/seed/pages.mjs --apply --only home
//
// Nothing here publishes: scripts/seed/publish-release.mjs does, behind its own
// flag. What this script is built around, each learned the expensive way on
// another fleet site:
//
//   - The Migration API DROPS a field the repository's model does not declare,
//     and a slice its zone does not list — 200, no warning. So before any write
//     every slice this seed uses is compared, model for model, with Prismic's
//     copy, and the `page` type's zone is read for each slice id.
//   - A content relationship is an id, and an id only means something once the
//     document it names is LIVE. `{ "$property": "<uid>" }` in pages.json is
//     resolved through listings.state.json and then held against the public
//     API: the uid must be published, under that same id.
//   - PUT replaces, never merges, so the whole document is sent every time, and
//     the id from a 201 goes into pages.state.json at once (see lib.mjs).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  ROOT,
  THROTTLE_MS,
  headersFor,
  masterRef,
  publishedByUid,
  readState,
  readToken,
  remoteSliceChoices,
  repositoryName,
  sleep,
  sliceOutOfSync,
  contentSignature,
  stageDocument,
  stripEmpty,
  typeExists,
  writeState,
} from "./lib.mjs";

const TYPE = "page";
const ZONE = "slices";
export const DATA_PATH = join(ROOT, "scripts/seed/pages.json");
export const STATE_PATH = join(ROOT, "scripts/seed/pages.state.json");
export const LISTINGS_STATE_PATH = join(ROOT, "scripts/seed/listings.state.json");

/** Every `{ "$property": uid }` in a value, in document order. */
export function propertyRefs(value, found = []) {
  if (Array.isArray(value)) for (const v of value) propertyRefs(v, found);
  else if (value && typeof value === "object") {
    if (typeof value.$property === "string") found.push(value.$property);
    else for (const v of Object.values(value)) propertyRefs(v, found);
  }
  return found;
}

/** Replace each `{ "$property": uid }` with the link the Migration API takes.
 *  A uid with no id THROWS: an empty relationship would stage happily and the
 *  band would render one slide short with nothing to say why. */
export function resolveRefs(value, ids) {
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, ids));
  if (value && typeof value === "object") {
    if (typeof value.$property === "string") {
      const id = ids[value.$property];
      if (!id) throw new Error(`no staged id for property ${JSON.stringify(value.$property)}`);
      return { link_type: "Document", id };
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, ids)]));
  }
  return value;
}

/** The slice ids one entry writes, each once. */
export const sliceIds = (entry) => [...new Set((entry.data.slices ?? []).map((s) => s.slice_type))];

/** The local model.json for a slice id, found by id and not by folder name. */
export function localSliceModels(root = ROOT) {
  const index = JSON.parse(readFileSync(join(root, "slicemachine.config.json"), "utf8"));
  const models = {};
  for (const library of index.libraries ?? []) {
    const dir = join(root, library);
    for (const name of listDirs(dir)) {
      try {
        const model = JSON.parse(readFileSync(join(dir, name, "model.json"), "utf8"));
        models[model.id] = model;
      } catch {
        // not a slice folder
      }
    }
  }
  return models;
}

const listDirs = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

/** The whole document payload. Every slice keeps its `primary` and `items`
 *  even when both are empty — a band with no image yet IS an empty primary, and
 *  `stripEmpty` on the whole document would delete the key and leave a slice
 *  the API has nothing to validate against. */
export function toPayload(entry, propertyIds = {}) {
  const { slices, ...rest } = resolveRefs(entry.data, propertyIds);
  const data = stripEmpty(rest);
  if (Array.isArray(slices)) {
    data.slices = slices.map((s) => ({
      ...s,
      // `?? {}` because stripEmpty collapses an all-empty object to undefined,
      // and a slice with no `primary` at all is not what an empty band is.
      primary: stripEmpty(s.primary ?? {}) ?? {},
      items: s.items ?? [],
    }));
  }
  return { type: TYPE, uid: entry.uid, title: entry.title, data };
}

async function main(argv) {
  const apply = argv.includes("--apply");
  const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

  const all = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const entries = only ? all.filter((e) => e.uid === only) : all;
  if (entries.length === 0) throw new Error(`no page with uid ${JSON.stringify(only)}`);

  const repo = repositoryName();
  console.log(
    `repository: ${repo} — ${entries.length} page(s) — ${apply ? "APPLY" : "dry run, nothing is written"}`,
  );

  const listingIds = Object.fromEntries(
    Object.entries(readState(LISTINGS_STATE_PATH).documents).map(([uid, d]) => [uid, d.id]),
  );

  if (!apply) {
    for (const e of entries) {
      const refs = propertyRefs(e.data);
      console.log(`  ${e.uid.padEnd(12)} slices: ${sliceIds(e).join(", ") || "(none)"}`);
      if (refs.length) console.log(`  ${"".padEnd(12)} listings: ${refs.join(", ")}`);
      toPayload(e, listingIds); // throws here, in the dry run, on an unknown uid
    }
    console.log("dry run complete. Re-run with --apply to stage these as drafts.");
    return;
  }

  const headers = headersFor(repo, readToken(repo));
  const state = readState(STATE_PATH);

  // Preflights. Each REQUIRES a positive answer before any write.
  if (!(await typeExists(TYPE, headers))) {
    throw new Error(`preflight: repository ${repo} has no "${TYPE}" custom type yet.`);
  }
  await sleep(THROTTLE_MS);

  const local = localSliceModels();
  const wanted = [...new Set(entries.flatMap(sliceIds))];
  const stale = [];
  for (const id of wanted) {
    if (!local[id]) stale.push(`${id}: no local model.json`);
    else {
      const reason = await sliceOutOfSync(id, local[id], headers);
      if (reason) stale.push(reason);
      await sleep(THROTTLE_MS);
    }
  }
  const offered = await remoteSliceChoices(TYPE, ZONE, headers);
  for (const id of wanted) {
    if (!offered.includes(id)) stale.push(`${id}: the "${TYPE}" type in Prismic does not offer it`);
  }
  if (stale.length) {
    throw new Error(
      "preflight: the Migration API would silently DROP what these models do not declare:\n  " +
        stale.join("\n  ") +
        "\nModels are delivered by the prismic-models workflow on merge to main — wait for its run.",
    );
  }

  const ref = await masterRef(repo);
  const liveListings = await publishedByUid(repo, "property", ref);
  const dead = [...new Set(entries.flatMap((e) => propertyRefs(e.data)))].filter(
    (uid) => !liveListings[uid] || liveListings[uid] !== listingIds[uid],
  );
  if (dead.length) {
    throw new Error(
      `preflight: these listings are not live under the id this repo holds for them: ${dead.join(", ")}`,
    );
  }
  const published = await publishedByUid(repo, TYPE, ref);
  console.log(
    `preflight ok: ${wanted.length} slice model(s) match Prismic and are offered by "${TYPE}"; ` +
      `${Object.keys(published).length} page(s) already live`,
  );

  let created = 0;
  let updated = 0;
  for (const e of entries) {
    const id = state.documents[e.uid]?.id ?? published[e.uid];
    const payload = toPayload(e, listingIds);
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

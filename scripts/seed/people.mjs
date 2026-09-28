#!/usr/bin/env node
// Stage this site's `person` documents — the partners' profile pages,
// /team/<uid> — into the Prismic repository as DRAFTS in the migration
// release. Dry by default.
//
//   node scripts/seed/people.mjs                 list what would be staged
//   node scripts/seed/people.mjs --apply         stage them
//
// pages.mjs's skeleton without the slice preflight (a person has no slices):
// the type must exist in Prismic before any write, `$image` filenames resolve
// against the media library (read, never written), and each id goes into
// people.state.json at once. Run it, and publish, BEFORE pages.mjs stages the
// home page's `$person` links — that script refuses a person that is not live.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ROOT,
  THROTTLE_MS,
  contentSignature,
  existingAssets,
  headersFor,
  masterRef,
  publishedByUid,
  readState,
  readToken,
  repositoryName,
  sleep,
  stageDocument,
  stripEmpty,
  typeExists,
  writeState,
} from "./lib.mjs";
import { imageRefs, resolveRefs } from "./pages.mjs";

const TYPE = "person";
export const DATA_PATH = join(ROOT, "scripts/seed/people.json");
export const STATE_PATH = join(ROOT, "scripts/seed/people.state.json");

/** The whole document payload. */
export function toPayload(entry, assets = {}) {
  const data = stripEmpty(resolveRefs(entry.data, {}, assets)) ?? {};
  return { type: TYPE, uid: entry.uid, title: entry.data.name, data };
}

async function main(argv) {
  const apply = argv.includes("--apply");
  const entries = JSON.parse(readFileSync(DATA_PATH, "utf8"));

  const repo = repositoryName();
  console.log(
    `repository: ${repo} — ${entries.length} person(s) — ${apply ? "APPLY" : "dry run, nothing is written"}`,
  );

  const wantsAssets = entries.some((e) => imageRefs(e.data).length > 0);
  const headers = apply || wantsAssets ? headersFor(repo, readToken(repo)) : null;
  const assets = wantsAssets ? await existingAssets(headers) : {};

  if (!apply) {
    for (const e of entries) {
      console.log(`  ${e.uid.padEnd(12)} ${e.data.name}`);
      for (const filename of imageRefs(e.data)) {
        console.log(
          `  ${"".padEnd(12)} image: ${filename} -> ${assets[filename]?.id ?? "MISSING"}`,
        );
      }
      toPayload(e, assets); // throws here, in the dry run, on an unknown filename
    }
    console.log("dry run complete. Re-run with --apply to stage these as drafts.");
    return;
  }

  const state = readState(STATE_PATH);
  if (!(await typeExists(TYPE, headers))) {
    throw new Error(
      `preflight: repository ${repo} has no "${TYPE}" custom type yet — ` +
        "models are delivered by the prismic-models workflow on merge to main.",
    );
  }
  await sleep(THROTTLE_MS);
  const published = await publishedByUid(repo, TYPE, await masterRef(repo));

  let created = 0;
  let updated = 0;
  for (const e of entries) {
    const id = state.documents[e.uid]?.id ?? published[e.uid];
    const payload = toPayload(e, assets);
    const result = await stageDocument({ id, headers, ...payload });
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

#!/usr/bin/env node
// Make what the seed scripts staged LIVE: releases the repository's migration
// release. Operator call 13 (docs/stage-a-inventory.md) authorises exactly
// this for the home page and the seeded listings.
//
//   node scripts/seed/publish-release.mjs          says what would go live; writes nothing
//   node scripts/seed/publish-release.mjs --yes    releases, then WAITS for the public API to show it
//
// There is one migration release per repository and the write token cannot
// read it back, so "what would go live" is this repo's own state files — the
// documents these scripts staged. Anything a person staged into the migration
// release by hand goes too; nothing here can see that.
//
// The pass is not the 202. It is the public API listing every staged uid.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  headersFor,
  masterRef,
  publishMigrationRelease,
  publishedByUid,
  readState,
  readToken,
  repositoryName,
  sleep,
} from "./lib.mjs";

/** `<name>.state.json` beside this script → the custom type it staged. */
const STATE_TYPES = { "listings.state.json": "property", "pages.state.json": "page" };

export function stagedByType(dir = join(ROOT, "scripts/seed")) {
  const out = {};
  for (const file of existsSync(dir) ? readdirSync(dir) : []) {
    const type = STATE_TYPES[file];
    if (!type) continue;
    out[type] = Object.keys(readState(join(dir, file)).documents);
  }
  return out;
}

/** Which staged uids the public API does not list yet. */
export async function notYetLive(repo, staged, fetchImpl = fetch) {
  const ref = await masterRef(repo, fetchImpl);
  const missing = [];
  for (const [type, uids] of Object.entries(staged)) {
    const live = await publishedByUid(repo, type, ref, fetchImpl);
    for (const uid of uids) if (!live[uid]) missing.push(`${type}/${uid}`);
  }
  return missing;
}

async function main(argv) {
  const repo = repositoryName();
  const staged = stagedByType();
  const count = Object.values(staged).reduce((n, uids) => n + uids.length, 0);
  console.log(`repository: ${repo}`);
  for (const [type, uids] of Object.entries(staged))
    console.log(`  ${type}: ${uids.length} staged — ${uids.join(", ")}`);
  if (count === 0)
    throw new Error("nothing is recorded as staged — run a seed script with --apply first");

  const before = await notYetLive(repo, staged);
  console.log(`${count - before.length} of ${count} already live`);
  if (before.length === 0) return console.log("everything staged is already live. Nothing to do.");

  if (!argv.includes("--yes")) {
    console.log(
      `would release the migration release, making ${before.length} document(s) live. Re-run with --yes.`,
    );
    return;
  }

  const { totalItems } = await publishMigrationRelease(headersFor(repo, readToken(repo)));
  console.log(`202 accepted: ${totalItems} item(s) releasing…`);
  for (let attempt = 1; attempt <= 30; attempt++) {
    await sleep(4000);
    const missing = await notYetLive(repo, staged);
    console.log(`  ${count - missing.length}/${count} live`);
    if (missing.length === 0) return console.log("every staged document is live.");
  }
  throw new Error(
    "released, but the public API still does not list every staged document after 2 minutes",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

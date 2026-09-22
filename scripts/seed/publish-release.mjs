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
// The pass is not the 202, and it is not the public API listing every staged
// uid either — that was the first version of this script, and it was wrong in
// the one direction that matters. A re-staged document keeps its uid, so on
// 2026-09-21 the three-band `home` was staged, this script printed "everything
// staged is already live. Nothing to do.", and the single-band version stayed
// on the site with its new version sitting in the release. The pass is now the
// live document's CONTENT SIGNATURE matching the one the seed script recorded
// when it staged it (see lib.mjs `contentSignature` for what that proves).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  contentSignature,
  headersFor,
  masterRef,
  publishMigrationRelease,
  publishedDocs,
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
    out[type] = readState(join(dir, file)).documents;
  }
  return out;
}

/** Every staged document whose live version is not the one that was staged:
 *  absent from the public API, or present with a different content signature.
 *
 *  A document staged before signatures were recorded has none stored. It is
 *  counted as NOT verified, and says so by name: an unanswerable question must
 *  never read as a yes. Re-staging it answers the question. */
export async function notYetLive(repo, staged, fetchImpl = fetch) {
  const ref = await masterRef(repo, fetchImpl);
  const stale = [];
  for (const [type, docs] of Object.entries(staged)) {
    const live = await publishedDocs(repo, type, ref, fetchImpl);
    for (const [uid, record] of Object.entries(docs)) {
      const doc = live[uid];
      if (!doc) stale.push({ type, uid, why: "not published" });
      else if (!record.signature) stale.push({ type, uid, why: "no signature recorded" });
      else if (contentSignature(doc.data) !== record.signature)
        stale.push({ type, uid, why: "live content differs from what was staged" });
    }
  }
  return stale;
}

async function main(argv) {
  const repo = repositoryName();
  const staged = stagedByType();
  const count = Object.values(staged).reduce((n, docs) => n + Object.keys(docs).length, 0);
  console.log(`repository: ${repo}`);
  for (const [type, docs] of Object.entries(staged))
    console.log(`  ${type}: ${Object.keys(docs).length} staged — ${Object.keys(docs).join(", ")}`);
  if (count === 0)
    throw new Error("nothing is recorded as staged — run a seed script with --apply first");

  const before = await notYetLive(repo, staged);
  console.log(`${count - before.length} of ${count} live with the content that was staged`);
  for (const s of before) console.log(`  ! ${s.type}/${s.uid}: ${s.why}`);
  if (before.length === 0)
    return console.log("everything staged is live, with the content that was staged.");

  if (!argv.includes("--yes")) {
    console.log(
      `would release the migration release, settling ${before.length} document(s). Re-run with --yes.`,
    );
    return;
  }

  const { totalItems } = await publishMigrationRelease(headersFor(repo, readToken(repo)));
  console.log(`202 accepted: ${totalItems} item(s) releasing…`);
  for (let attempt = 1; attempt <= 30; attempt++) {
    await sleep(4000);
    const stale = await notYetLive(repo, staged);
    console.log(`  ${count - stale.length}/${count} live with the content that was staged`);
    if (stale.length === 0)
      return console.log("every staged document is live, with the content that was staged.");
    if (attempt === 30) for (const s of stale) console.log(`  ! ${s.type}/${s.uid}: ${s.why}`);
  }
  throw new Error(
    "released, but after 2 minutes the public API still does not serve what was staged",
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

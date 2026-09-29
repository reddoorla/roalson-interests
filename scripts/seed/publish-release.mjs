#!/usr/bin/env node
// Make what the seed scripts staged LIVE: releases the repository's migration
// release. Operator call 13 (docs/stage-a-inventory.md) authorises exactly
// this for the home page and the seeded listings.
//
//   node scripts/seed/publish-release.mjs          says what would go live; writes nothing
//   node scripts/seed/publish-release.mjs --yes    releases, then WAITS for the public API to show it
//
// The pass is not the 202, and it is not the public API listing every staged
// uid either — that was the first version of this script, and it was wrong in
// the one direction that matters. A re-staged document keeps its uid, so on
// 2026-09-21 the three-band `home` was staged, this script printed "everything
// staged is already live. Nothing to do.", and the single-band version stayed
// on the site with its new version sitting in the release. The pass is now the
// live document's CONTENT SIGNATURE matching the one the seed script recorded
// when it staged it (see lib.mjs `contentSignature` for what that proves).
//
// THE WORKLIST IS THE RELEASE, not the state files (#94). A `page_media`
// document staged by hand on 2026-09-22 had no state file, so this script's
// worklist — the state files — did not hold it, the dry run printed
// "everything staged is live", and `--yes` returned on that line before it
// ever released. The write token cannot read the migration release (403 at
// the gateway; the connector cannot list it either), so the release is read at
// the one moment it can be: `--yes` always releases, the 202's `totalItems` is
// how many documents it held, and those are the documents the public API newly
// publishes. Every one of them must be a document a state file recorded and
// whose live content matches it; any other is named, and the run fails.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  contentSignature,
  failure,
  headersFor,
  isLegacySignature,
  masterRef,
  publishMigrationRelease,
  publishedDocs,
  readState,
  readToken,
  repositoryName,
  sleep,
} from "./lib.mjs";

/** `<name>.state.json` beside this script → the custom type it staged. */
const STATE_TYPES = {
  "listings.state.json": "property",
  "pages.state.json": "page",
  "people.state.json": "person",
};

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
 *  A document staged before signatures were recorded has none stored, and one
 *  staged before #79 has one that could not see inside a Group. Both are
 *  counted as NOT verified, and say so by name: an unanswerable question must
 *  never read as a yes. Re-staging answers it. */
export async function notYetLive(repo, staged, fetchImpl = fetch) {
  const ref = await masterRef(repo, fetchImpl);
  const stale = [];
  for (const [type, docs] of Object.entries(staged)) {
    const live = await publishedDocs(repo, type, ref, fetchImpl);
    for (const [uid, record] of Object.entries(docs)) {
      const doc = live[uid];
      if (!doc) stale.push({ type, uid, why: "not published" });
      else if (!record.signature) stale.push({ type, uid, why: "no signature recorded" });
      else if (isLegacySignature(record.signature))
        stale.push({ type, uid, why: "signature recorded before #79, blind inside Groups" });
      else if (contentSignature(doc.data) !== record.signature)
        stale.push({ type, uid, why: "live content differs from what was staged" });
    }
  }
  return stale;
}

/** Every document, of ANY type, the master ref says was published after
 *  `since` — what a just-released migration release held. Measured on the
 *  public API 2026-09-29: `date.after` from 2026-09-28 returns exactly the
 *  three documents the connector's release published that evening. */
export async function publishedSince(repo, since, fetchImpl = fetch) {
  const ref = await masterRef(repo, fetchImpl);
  const q = encodeURIComponent(`[[date.after(document.last_publication_date, ${since})]]`);
  const out = [];
  for (let page = 1, total = 1; page <= total; page++) {
    const res = await fetchImpl(
      `https://${repo}.prismic.io/api/v2/documents/search?ref=${ref}&pageSize=100&page=${page}&q=${q}`,
    );
    if (!res.ok) throw await failure(res, "search documents published since the release");
    const body = await res.json();
    for (const doc of body.results) out.push({ type: doc.type, uid: doc.uid ?? null, id: doc.id });
    total = body.total_pages;
  }
  return out;
}

const named = (d) => `${d.type} ${d.uid ?? "(no uid)"} ${d.id}`;

/** The run, with everything it touches passed in. Resolves on a pass; throws
 *  — a non-zero exit — on anything it cannot prove. */
export async function publishRelease({
  argv,
  repo,
  staged,
  headers,
  fetchImpl = fetch,
  wait = sleep,
  log = console.log,
  now = Date.now,
}) {
  const count = Object.values(staged).reduce((n, docs) => n + Object.keys(docs).length, 0);
  log(`repository: ${repo}`);
  for (const [type, docs] of Object.entries(staged))
    log(`  ${type}: ${Object.keys(docs).length} staged — ${Object.keys(docs).join(", ")}`);

  const before = await notYetLive(repo, staged, fetchImpl);
  log(
    `${count - before.length} of ${count} recorded document(s) live with the content that was staged`,
  );
  for (const s of before) log(`  ! ${s.type}/${s.uid}: ${s.why}`);

  if (!argv.includes("--yes")) {
    log(
      "The migration release itself cannot be read until it is released, so a document staged " +
        "any other way — a type with no state file, or by hand — is not in that count. " +
        "Re-run with --yes to release it and check every document it held.",
    );
    return;
  }

  // Minus a minute: `date.after` is strict, and a publication date is to the
  // second on Prismic's clock, not this one's. Anything else published in that
  // minute is named below, which fails loud rather than quiet.
  const since = now() - 60_000;
  const { totalItems } = await publishMigrationRelease(headers(), fetchImpl);
  log(`202 accepted: ${totalItems} item(s) releasing…`);
  if (totalItems === 0 && before.length === 0)
    return log("the migration release was empty, and every recorded document is live.");
  if (totalItems === 0) {
    throw new Error(
      `the migration release was empty, but ${before.length} recorded document(s) are not ` +
        `verified live: ${before.map((s) => `${s.type}/${s.uid}`).join(", ")}`,
    );
  }

  const recorded = new Set(
    Object.values(staged).flatMap((docs) => Object.values(docs).map((d) => d.id)),
  );
  let stale = before;
  let released = [];
  for (let attempt = 1; attempt <= 30; attempt++) {
    await wait(4000);
    stale = await notYetLive(repo, staged, fetchImpl);
    released = await publishedSince(repo, since, fetchImpl);
    log(
      `  ${count - stale.length}/${count} recorded live; ${released.length}/${totalItems} released visible`,
    );
    if (stale.length === 0 && released.length >= totalItems) break;
  }
  const unrecorded = released.filter((d) => !recorded.has(d.id));
  const problems = [
    ...stale.map((s) => `${s.type}/${s.uid}: ${s.why}`),
    ...(released.length < totalItems
      ? [`the release held ${totalItems}, and only ${released.length} are visible as published`]
      : []),
    ...unrecorded.map(
      (d) =>
        `${named(d)}: released, and no state file records it — nothing here staged it, so ` +
        "nothing here can say its content is what was meant. Read it back.",
    ),
  ];
  if (problems.length) {
    // The #94 contradiction, said as one: a release with something in it and
    // a worklist that expected nothing.
    const lead =
      before.length === 0
        ? `the migration release held ${totalItems} document(s) while every recorded one was already live`
        : "released, but not every document it held is verified";
    throw new Error(`${lead}:\n  ${problems.join("\n  ")}`);
  }
  log("every document the release held is live, with the content that was staged.");
}

async function main(argv) {
  const repo = repositoryName();
  await publishRelease({
    argv,
    repo,
    staged: stagedByType(),
    headers: () => headersFor(repo, readToken(repo)),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

// Zero-dependency helpers for staging documents through Prismic's Migration
// and Asset APIs. Lifted from the fleet's raw-fetch pattern (beachfront-
// dentistry `scripts/lib/prismic-migration.mjs`, reddoor-maintenance
// `runMigration`) rather than from `scripts/import/migrate.example.ts`: the
// `@prismicio/migrate` route creates documents hollow and PATCHes them,
// swallows validation `details[]`, re-uploads every asset on a retry and
// cannot update — the fleet left it after the 2026-07-06 Pointe run.
//
// WHAT A STAGED DOCUMENT IS: a draft inside the repository's MIGRATION
// RELEASE. It is not on the master ref, the release is not exposed as a ref,
// and the write token cannot read the release back (403 at the gateway). So
// the `id` in every 201 is the only handle a later run has on its own draft —
// hence the state file, written after EVERY success, not at the end.
//
// ASSETS ARE NOT DRAFTS. An upload lands in the media library immediately.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SENTINEL = "your-prismic-repo-name";
/** One request per second per repository is Prismic's limit; the fleet's
 *  constant leaves headroom. */
export const THROTTLE_MS = 1200;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The repository the models CLI targets: `slicemachine.config.json`, then
 *  `prismic.config.json`, skipping the placeholder sentinel — the same order
 *  and the same skip as `reddoor-maint`'s `readPrismicConfig`, so the seed and
 *  the model delivery can never aim at different repositories. Refuses when
 *  only the sentinel is found: "no repository" must not become a default.
 *
 *  `prismic.config.json` is no longer in this repo — it was the side door that
 *  let models reach Prismic while the build stayed on the sentinel, and the
 *  connect PR deleted it. The second read stays because the reader it mirrors
 *  has it, and because a fresh clone in that state should still work. */
export function repositoryName(root = ROOT) {
  const seen = [];
  for (const file of ["slicemachine.config.json", "prismic.config.json"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const name = JSON.parse(readFileSync(path, "utf8")).repositoryName;
    seen.push(`${file}: ${JSON.stringify(name)}`);
    if (typeof name === "string" && name !== "" && name !== SENTINEL) return name;
  }
  throw new Error(
    `no real Prismic repository is configured (${seen.join("; ") || "no config file"})`,
  );
}

/** `PRISMIC_TOKEN_<REPOSITORY, upper-snaked>` — the fleet's derivation. */
export const tokenEnvName = (repo) =>
  `PRISMIC_TOKEN_${repo.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

/** The write token: `PRISMIC_WRITE_TOKEN`, else the per-repository name, else
 *  that ONE key parsed out of the operator's credentials file. Never logged,
 *  never in argv, never written anywhere — this repository is public. */
export function readToken(
  repo,
  env = process.env,
  credentialsPath = join(homedir(), ".config/reddoor-maint/credentials.env"),
) {
  const key = tokenEnvName(repo);
  if (env.PRISMIC_WRITE_TOKEN) return env.PRISMIC_WRITE_TOKEN;
  if (env[key]) return env[key];
  if (existsSync(credentialsPath)) {
    for (const line of readFileSync(credentialsPath, "utf8").split("\n")) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`no write token: set PRISMIC_WRITE_TOKEN or ${key}`);
}

export function headersFor(repo, token) {
  const auth = { repository: repo, Authorization: `Bearer ${token}` };
  return { auth, json: { ...auth, "Content-Type": "application/json" } };
}

export async function fetchWithRetry(
  url,
  opts,
  { tries = 4, fetchImpl = fetch, wait = sleep } = {},
) {
  for (let attempt = 1; attempt < tries; attempt++) {
    const res = await fetchImpl(url, opts);
    if (res.status !== 429) return res;
    await wait(1500 * attempt);
  }
  return fetchImpl(url, opts);
}

/** Status + the first 300 characters of the body. Never headers. */
export async function failure(res, label) {
  return new Error(`${label}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

/** Drop what Prismic rejects: `{}` for an unfilled Link or Image, `null`,
 *  `undefined` and `""`. Arrays keep their order; `false` and `0` are values. */
export function stripEmpty(value) {
  if (Array.isArray(value)) return value.map(stripEmpty).filter((v) => v !== undefined);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = stripEmpty(v);
      if (c === undefined) continue;
      out[k] = c;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  }
  return value === null || value === "" ? undefined : value;
}

export function readState(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { documents: {}, assets: {} };
}

/** Pretty, sorted, newline-terminated — so the committed file diffs cleanly
 *  and passes `prettier --check`. */
export function writeState(path, state) {
  const sort = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  const ordered = { documents: sort(state.documents), assets: sort(state.assets) };
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
}

/** The master ref, from the public API. NOT its `types` map: measured on this
 *  repository the day the models landed, the Custom Types API answered "12
 *  model(s) match" while `/api/v2` still said `types: {}` and its query parser
 *  still rejected `my.property.uid` — the content API learns a type when a
 *  document of it is first published, not when the model is pushed. A
 *  preflight that read `types` here refused to stage into a repository that
 *  was ready. Ask `typeExists` instead. */
export async function masterRef(repo, fetchImpl = fetch) {
  const res = await fetchImpl(`https://${repo}.prismic.io/api/v2`);
  if (!res.ok) throw await failure(res, `read https://${repo}.prismic.io/api/v2`);
  return (await res.json()).refs.find((r) => r.isMasterRef).ref;
}

/** Does the repository have this custom type? Asked of the Custom Types API,
 *  the one place a pushed model is visible before anything is published. 200
 *  is yes and 404 is no; anything else is "could not tell" and throws, because
 *  an unreadable answer must never read as either. */
export async function typeExists(type, headers, fetchImpl = fetch) {
  const res = await fetchWithRetry(
    `https://customtypes.prismic.io/customtypes/${type}`,
    { headers: headers.auth },
    { fetchImpl },
  );
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw await failure(res, `read custom type ${type}`);
}

/** JSON with every object's keys sorted, so two models compare by content and
 *  not by the order a tool happened to write them in. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  }
  return value;
}

/** Is the repository's copy of this slice model the same as the local one?
 *
 *  The Migration API DROPS a field the remote model does not declare — 200, no
 *  warning — and the page then renders the component's defaults and looks
 *  fine. That is how a fleet site shipped five fields missing. So a page seed
 *  proves, per slice it writes, that Prismic holds the model this branch holds.
 *  Returns null when they match, and otherwise the reason as a sentence. */
export async function sliceOutOfSync(id, localModel, headers, fetchImpl = fetch) {
  const res = await fetchWithRetry(
    `https://customtypes.prismic.io/slices/${id}`,
    { headers: headers.auth },
    { fetchImpl },
  );
  if (res.status === 404) return `${id}: not registered in Prismic`;
  if (res.status !== 200) throw await failure(res, `read slice model ${id}`);
  const remote = await res.json();
  return JSON.stringify(canonical(remote)) === JSON.stringify(canonical(localModel))
    ? null
    : `${id}: the model in Prismic differs from the local model.json`;
}

/** The slice ids the repository's copy of a custom type offers in a slice
 *  zone. A slice the zone does not list is dropped the same silent way. */
export async function remoteSliceChoices(type, zone, headers, fetchImpl = fetch) {
  const res = await fetchWithRetry(
    `https://customtypes.prismic.io/customtypes/${type}`,
    { headers: headers.auth },
    { fetchImpl },
  );
  if (res.status !== 200) throw await failure(res, `read custom type ${type}`);
  const model = await res.json();
  for (const tab of Object.values(model.json ?? {})) {
    const field = tab[zone];
    if (field?.type === "Slices") return Object.keys(field.config?.choices ?? {});
  }
  throw new Error(`custom type ${type} has no slice zone named ${JSON.stringify(zone)}`);
}

/** A fingerprint of a document's CONTENT, computable from both sides: the
 *  payload a seed script sends, and the document the public API delivers.
 *
 *  It exists because "the uid is listed" is not "what I staged is live". A
 *  re-staged document keeps its uid, so a publisher that checks uids reports
 *  success while the new version sits unpublished in the migration release —
 *  which is exactly what happened to the `home` page on 2026-09-21, twice: the
 *  three-band version was staged, the publisher said "everything staged is
 *  already live", and the single-band version stayed on the site.
 *
 *  WHAT IT PROVES, exactly: the document's filled top-level fields, the value
 *  of every top-level SCALAR one (Text, Number, Select, Boolean), and the
 *  ordered list of its slices by type and variation. WHAT IT DOES NOT: the
 *  contents of rich text, groups, links or images — those count as present or
 *  absent only. A change confined to a paragraph's words will not show here. */
export function contentSignature(data) {
  const filled = stripEmpty(data ?? {}) ?? {};
  const slices = Array.isArray(filled.slices)
    ? filled.slices.map((s) => `${s.slice_type}/${s.variation ?? "default"}`)
    : [];
  // An empty array is UNFILLED here, though `stripEmpty` keeps one (where it is
  // used, on a payload, `[]` is a valid unfilled rich text and the distinction
  // matters). The two sides disagree about it otherwise: the public API returns
  // every Group the model declares, unfilled ones as `[]`, and a payload simply
  // omits them. Measured before this line existed: 2 of 22 live listings
  // fingerprinted the same as what staged them; the other 20 differed by the
  // one key `tracts`, which only Scenic Loop and one other actually fill.
  const keys = Object.keys(filled)
    .filter((k) => k !== "slices" && !(Array.isArray(filled[k]) && filled[k].length === 0))
    .sort();
  const scalar = (v) => ["string", "number", "boolean"].includes(typeof v);
  return JSON.stringify({
    slices,
    keys,
    scalars: keys.filter((k) => scalar(filled[k])).map((k) => `${k}=${filled[k]}`),
  });
}

/** Published documents of one type, as `{ uid: document }`. */
export async function publishedDocs(repo, type, ref, fetchImpl = fetch) {
  const out = {};
  for (let page = 1, total = 1; page <= total; page++) {
    const q = encodeURIComponent(`[[at(document.type,"${type}")]]`);
    const res = await fetchImpl(
      `https://${repo}.prismic.io/api/v2/documents/search?ref=${ref}&pageSize=100&page=${page}&q=${q}`,
    );
    if (!res.ok) throw await failure(res, `search published ${type}`);
    const body = await res.json();
    for (const doc of body.results) if (doc.uid) out[doc.uid] = doc;
    total = body.total_pages;
  }
  return out;
}

/** Published documents of one type, as `{ uid: id }`. A published document's
 *  id is the one thing the master ref CAN tell a re-run. */
export async function publishedByUid(repo, type, ref, fetchImpl = fetch) {
  const docs = await publishedDocs(repo, type, ref, fetchImpl);
  return Object.fromEntries(Object.entries(docs).map(([uid, doc]) => [uid, doc.id]));
}

/** Every asset already in the media library, as `{ filename: { id, url } }`,
 *  so a re-run uploads nothing twice. */
export async function existingAssets(headers, fetchImpl = fetch) {
  const out = {};
  let cursor;
  do {
    const url = new URL("https://asset-api.prismic.io/assets");
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetchWithRetry(url, { headers: headers.auth }, { fetchImpl });
    if (!res.ok) throw await failure(res, "list assets");
    const body = await res.json();
    for (const item of body.items ?? []) out[item.filename] = { id: item.id, url: item.url };
    cursor = body.cursor;
  } while (cursor);
  return out;
}

export async function uploadAsset({
  bytes,
  filename,
  contentType,
  alt,
  headers,
  fetchImpl = fetch,
}) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: contentType }), filename);
  if (alt) form.set("alt", alt.slice(0, 500));
  const res = await fetchWithRetry(
    "https://asset-api.prismic.io/assets",
    { method: "POST", headers: headers.auth, body: form },
    { fetchImpl },
  );
  if (!res.ok) throw await failure(res, `upload ${filename}`);
  const body = await res.json();
  return { id: body.id, url: body.url };
}

/** Create, or — when this run or a published document already knows the id —
 *  replace. PUT REPLACES, it never merges, so the caller always sends the
 *  whole payload. "already exists" with no known id STOPS: the draft is in the
 *  migration release where nothing can read its id back, and guessing would
 *  mean a duplicate. */
export async function stageDocument({ id, type, uid, title, data, headers, fetchImpl = fetch }) {
  const body = JSON.stringify({ title, type, uid, lang: "en-us", data });
  if (id) {
    const res = await fetchWithRetry(
      `https://migration.prismic.io/documents/${id}`,
      { method: "PUT", headers: headers.json, body },
      { fetchImpl },
    );
    if (!res.ok) throw await failure(res, `update ${uid}`);
    return { id, created: false };
  }
  const res = await fetchWithRetry(
    "https://migration.prismic.io/documents",
    { method: "POST", headers: headers.json, body },
    { fetchImpl },
  );
  if (res.status === 201) {
    const created = await res.json();
    if (!created.id) throw new Error(`create ${uid}: 201 with no id`);
    return { id: created.id, created: true };
  }
  const text = await res.text();
  if (/already exists/i.test(text)) {
    throw new Error(
      `create ${uid}: a document with this uid already exists and no id is stored for it. ` +
        "It is a draft in the migration release, which cannot be read back — find its id in " +
        "the Prismic editor's URL and add it to the state file, then re-run.",
    );
  }
  throw new Error(`create ${uid}: ${res.status} ${text.slice(0, 300)}`);
}

/** Release the repository's MIGRATION RELEASE: every document staged in it goes
 *  live. There is one migration release per repository and the write token
 *  cannot list it, so this publishes whatever is in it — the caller says what
 *  it expects to be there, and verifies afterwards against the public API.
 *  202 + `totalItems` is the only success. */
export async function publishMigrationRelease(headers, fetchImpl = fetch) {
  const res = await fetchWithRetry(
    "https://migration.prismic.io/migration-release/publish",
    { method: "POST", headers: headers.json, body: "{}" },
    { fetchImpl },
  );
  if (res.status !== 202) throw await failure(res, "publish the migration release");
  const body = await res.json();
  return { totalItems: body.totalItems };
}

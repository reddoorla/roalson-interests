import { describe, expect, it, vi } from "vitest";

import { contentSignature } from "./lib.mjs";
import { publishRelease, publishedSince } from "./publish-release.mjs";

// A repository as the public API and the Migration API answer for it. `live`
// is what the master ref serves after the release; `release` is what the
// migration release holds, which nothing can read until it is released.
function repository({
  live,
  release,
  published = release,
}: {
  live: { type: string; uid: string | null; id: string; data: object }[];
  release: number;
  published?: number;
}) {
  const calls: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = decodeURIComponent(String(input));
    calls.push(init?.method === "POST" ? `POST ${url}` : url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.endsWith("/migration-release/publish")) return json({ totalItems: release }, 202);
    if (url.endsWith("/api/v2")) return json({ refs: [{ isMasterRef: true, ref: "m" }] });
    const type = /at\(document\.type,"([^"]+)"\)/.exec(url)?.[1];
    if (type) return json({ results: live.filter((d) => d.type === type), total_pages: 1 });
    if (url.includes("date.after(document.last_publication_date"))
      return json({ results: live.slice(live.length - published), total_pages: 1 });
    return json({ message: `unexpected ${url}` }, 500);
  });
  return { fetchImpl, calls };
}

const listing = { title: "25331 IH 10 West", highlights: [{ text: "Great visibility" }] };
const staged = {
  property: { "25331-ih-10-west": { id: "L1", signature: contentSignature(listing) } },
};
const liveListing = { type: "property", uid: "25331-ih-10-west", id: "L1", data: listing };
// #94, as it happened: the Properties masthead, a `page_media` singleton that
// no seed script and no state file knows, staged by hand into the release.
const masthead = {
  type: "page_media",
  uid: null,
  id: "arIv9RIAACkAL1ZP",
  data: { properties_masthead: { id: "4q-v3iaMZUDzdLhU" } },
};

const run = async (argv: string[], repo: ReturnType<typeof repository>) => {
  const lines: string[] = [];
  const result = publishRelease({
    argv,
    repo: "r",
    staged,
    headers: () => ({ auth: {}, json: {} }),
    fetchImpl: repo.fetchImpl,
    wait: async () => {},
    log: (line: string) => void lines.push(line),
    now: () => Date.parse("2026-09-29T12:00:00Z"),
  });
  return { result, lines };
};

describe("publish-release — the worklist is the release, not the state files (#94)", () => {
  it("fails, naming the document, when the release held one no state file records", async () => {
    const repo = repository({ live: [liveListing, masthead], release: 1 });
    const { result, lines } = await run(["--yes"], repo);
    await expect(result).rejects.toThrow(
      /the migration release held 1 document\(s\) while every recorded one was already live:\n {2}page_media \(no uid\) arIv9RIAACkAL1ZP: released, and no state file records it/,
    );
    // It released — the only way to learn what the release held — and it
    // asked for EVERY type published since, not the state files' types.
    expect(repo.calls).toContain("POST https://migration.prismic.io/migration-release/publish");
    expect(
      repo.calls.some((c) =>
        c.includes("date.after(document.last_publication_date, 1790683140000)"),
      ),
    ).toBe(true);
    expect(lines.join("\n")).not.toMatch(/every document the release held is live/);
  });

  it("never calls a dry run a pass: it cannot see the release, and says so", async () => {
    const repo = repository({ live: [liveListing, masthead], release: 1 });
    const { result, lines } = await run([], repo);
    await expect(result).resolves.toBeUndefined();
    expect(lines).toContain("1 of 1 recorded document(s) live with the content that was staged");
    expect(lines.join("\n")).toMatch(/cannot be read until it is released/);
    expect(lines.join("\n")).not.toMatch(/everything staged is live/);
    expect(repo.calls.some((c) => c.startsWith("POST"))).toBe(false);
  });

  it("passes when every document the release held is recorded and live as staged", async () => {
    const repo = repository({ live: [liveListing], release: 1 });
    const { result, lines } = await run(["--yes"], repo);
    await expect(result).resolves.toBeUndefined();
    expect(lines.at(-1)).toBe(
      "every document the release held is live, with the content that was staged.",
    );
  });

  it("fails a recorded document whose live content is not what was staged", async () => {
    const other = {
      ...liveListing,
      data: { ...listing, highlights: [{ text: "Great visibility!" }] },
    };
    const { result } = await run(["--yes"], repository({ live: [other], release: 1 }));
    await expect(result).rejects.toThrow(
      /released, but not every document it held is verified:\n {2}property\/25331-ih-10-west: live content differs/,
    );
  });

  it("says an empty release is empty, and fails one that should have held something", async () => {
    const empty = repository({ live: [liveListing], release: 0 });
    const { result, lines } = await run(["--yes"], empty);
    await expect(result).resolves.toBeUndefined();
    expect(lines.at(-1)).toBe(
      "the migration release was empty, and every recorded document is live.",
    );

    const missing = repository({ live: [], release: 0 });
    await expect((await run(["--yes"], missing)).result).rejects.toThrow(
      /the migration release was empty, but 1 recorded document\(s\) are not verified live: property\/25331-ih-10-west/,
    );
  });

  it("does not pass while fewer documents are visible than the release said it held", async () => {
    const repo = repository({ live: [liveListing, masthead], release: 3, published: 1 });
    await expect((await run(["--yes"], repo)).result).rejects.toThrow(
      /the release held 3, and only 1 are visible as published/,
    );
  });

  it("calls a pre-#79 signature unverified, never live", async () => {
    const legacy = { property: { "25331-ih-10-west": { id: "L1", signature: '{"slices":[]}' } } };
    const lines: string[] = [];
    await publishRelease({
      argv: [],
      repo: "r",
      staged: legacy,
      headers: () => ({ auth: {}, json: {} }),
      fetchImpl: repository({ live: [liveListing], release: 0 }).fetchImpl,
      log: (line: string) => void lines.push(line),
    });
    expect(lines).toContain(
      "  ! property/25331-ih-10-west: signature recorded before #79, blind inside Groups",
    );
  });

  it("reads documents published since a time, of every type, singletons included", async () => {
    const repo = repository({ live: [liveListing, masthead], release: 2 });
    await expect(publishedSince("r", 5, repo.fetchImpl)).resolves.toEqual([
      { type: "property", uid: "25331-ih-10-west", id: "L1" },
      { type: "page_media", uid: null, id: "arIv9RIAACkAL1ZP" },
    ]);
  });
});

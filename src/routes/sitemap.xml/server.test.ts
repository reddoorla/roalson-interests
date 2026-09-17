import { describe, it, expect, vi } from "vitest";

// The placeholder starter: no Prismic documents at all. What must still appear
// is the hand-built /contact route — see STATIC_ROUTES in +server.ts.
// `getAllByType` is a spy so the netlify.app cases can assert the CMS is never
// asked for documents the response would not list.
const prismic = vi.hoisted(() => ({
  isPlaceholderRepo: true,
  getAllByType: vi.fn(async () => [] as unknown[]),
}));
vi.mock("$lib/prismicio", () => ({
  get isPlaceholderRepo() {
    return prismic.isPlaceholderRepo;
  },
  createClient: () => ({ getAllByType: prismic.getAllByType }),
}));

const { GET, prerender } = await import("./+server");

const body = async (origin = "https://example.com") => {
  // `RequestHandler` returns MaybePromise<Response>, so await it rather than
  // reaching for .then — the union has no such method.
  const response = await GET({
    url: new URL(`${origin}/sitemap.xml`),
    fetch: globalThis.fetch,
  } as unknown as Parameters<typeof GET>[0]);
  return response.text();
};

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

describe("GET /sitemap.xml", () => {
  // Every other entry is discovered by querying the CMS, which structurally
  // cannot see a route that exists only in the filesystem. /contact is linked
  // from the template's own chrome and returns 200, and it is `prerender =
  // false` (a form action cannot live on a prerendered route), so no
  // build-output census would have caught its absence either.
  it("lists the filesystem-only /contact route", async () => {
    expect(await body()).toContain("<loc>https://example.com/contact</loc>");
  });

  it("still emits a well-formed urlset with no Prismic documents", async () => {
    const xml = await body();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
  });
});

// #140: rendered per request so the netlify.app mirror can answer differently
// from the production domain — a prerendered sitemap lists the build origin's
// URLs on every host the build is served from.
describe("GET /sitemap.xml on a netlify.app host", () => {
  const wired = () => {
    prismic.isPlaceholderRepo = false;
    prismic.getAllByType.mockClear();
    prismic.getAllByType.mockResolvedValue([
      { uid: "home", last_publication_date: "2026-09-01T00:00:00Z" },
      { uid: "about", last_publication_date: "2026-09-01T00:00:00Z" },
    ]);
  };

  it("is rendered per request, not baked at build time", () => {
    expect(prerender).toBe(false);
  });

  it("offers no URLs on the mirror", async () => {
    wired();
    const xml = await body("https://reddoor-wireframer.netlify.app");
    expect(locs(xml)).toEqual([]);
    expect(xml).toContain("<urlset");
  });

  it("does not ask Prismic for documents it would not list", async () => {
    wired();
    await body("https://reddoor-wireframer.netlify.app");
    expect(prismic.getAllByType).not.toHaveBeenCalled();
  });

  it("gives a per-request static route no lastmod, which would change on every fetch", async () => {
    wired();
    const xml = await body("https://www.example.com");
    expect(xml).toMatch(/<loc>https:\/\/www\.example\.com\/contact<\/loc>\s*<\/url>/);
    expect(xml).toContain("<lastmod>2026-09-01T00:00:00.000Z</lastmod>");
  });

  it("lists every page on the production domain, on that domain's origin", async () => {
    wired();
    expect(locs(await body("https://www.example.com"))).toEqual([
      "https://www.example.com/",
      "https://www.example.com/about",
      "https://www.example.com/contact",
    ]);
  });
});

import { describe, it, expect } from "vitest";
import { NOINDEX_ENFORCED, NOINDEX_PREFIXES } from "$lib/seo";
import { GET, prerender } from "./+server";

function get(origin: string) {
  return GET({
    url: new URL(`${origin}/robots.txt`),
  } as Parameters<typeof GET>[0]);
}

describe("GET /robots.txt", () => {
  it("targets all agents", async () => {
    const body = await (await get("https://example.com")).text();
    expect(body).toContain("User-agent: *");
  });

  // Asserted against the IMPORTED list, never a second copy of it. robots.txt
  // and the layout's `noindex` meta answer different questions about the same
  // routes, and a hard-coded expectation here would let one of the two drift
  // the moment a prefix is added.
  it("fences off exactly the routes $lib/seo marks noindex", async () => {
    const body = await (await get("https://example.com")).text();
    const disallowed = [...body.matchAll(/Disallow: (\S+)/g)].map((m) => m[1]);
    expect(disallowed).toEqual(NOINDEX_PREFIXES);
    expect(NOINDEX_ENFORCED).toBe(true);
  });

  it("points at the sitemap with an absolute URL on the request origin", async () => {
    const body = await (await get("https://example.com")).text();
    expect(body).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("serves text/plain", async () => {
    const response = await get("https://example.com");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
  });
});

// #140. A prerendered robots.txt bakes ONE origin into ONE file at build time,
// and Netlify serves those bytes on every host the build answers on — so the
// netlify.app mirror advertised the production sitemap and could not be told
// apart. Rendered per request, `url.origin` is the host that actually asked.
describe("GET /robots.txt on a netlify.app host", () => {
  it("is rendered per request, not baked at build time", () => {
    expect(prerender).toBe(false);
  });

  it("does not advertise a sitemap, which would invite the crawl of a duplicate", async () => {
    const body = await (await get("https://reddoor-wireframer.netlify.app")).text();
    expect(body).not.toContain("Sitemap:");
  });

  // Deliberately NOT `Disallow: /`. The mirror's pages carry `X-Robots-Tag:
  // noindex` from the edge function, and a crawler that is refused the fetch
  // never sees it — a disallowed URL can still be listed URL-only.
  it("still lets crawlers fetch pages, so they can read the noindex header", async () => {
    const body = await (await get("https://reddoor-wireframer.netlify.app")).text();
    const disallowed = [...body.matchAll(/Disallow: (\S+)/g)].map((m) => m[1]);
    expect(disallowed).toEqual(NOINDEX_PREFIXES);
  });

  it("keeps the production domain's sitemap line", async () => {
    const body = await (await get("https://www.example.com")).text();
    expect(body).toContain("Sitemap: https://www.example.com/sitemap.xml");
  });
});

import { describe, expect, it, vi } from "vitest";
import { GET } from "./+server";

// The real client and the real linkResolver: only Prismic's HTTP answers are
// faked, so this fails if the endpoint stops handing the resolver over.
type Event = Parameters<typeof GET>[0];

function preview(doc: { type: string; uid: string | null } | null) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("/documents/search")) {
      expect(url.searchParams.get("ref")).toBe("PREVIEW-TOKEN");
      const results = doc ? [{ id: "D1", tags: [], lang: "en-us", data: {}, ...doc }] : [];
      return json({ results, results_size: results.length, total_pages: 1, page: 1 });
    }
    return json({ refs: [{ id: "master", ref: "M", isMasterRef: true }], languages: [] });
  });
  const cookies = { set: vi.fn() };
  const request = new Request(
    "https://roalson.example/api/preview?token=PREVIEW-TOKEN&documentId=D1",
  );
  const response = GET({ fetch, request, cookies } as unknown as Event) as Promise<Response>;
  return { response, cookies };
}

describe("GET /api/preview", () => {
  it.each([
    [{ type: "property", uid: "25331-ih-10-west" }, "/preview/properties/25331-ih-10-west"],
    [{ type: "person", uid: "matt-howard" }, "/preview/team/matt-howard"],
    [{ type: "page", uid: "about" }, "/preview/about"],
    [{ type: "page", uid: "home" }, "/preview"],
  ])("sends a %o preview to its own route: %s", async (doc, location) => {
    const { response } = await preview(doc);
    const res = await response;
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(location);
  });

  it("falls back to the homepage for a document with no route", async () => {
    const res = await preview({ type: "page_media", uid: null }).response;
    expect(res.headers.get("location")).toBe("/preview");
  });

  it("sets the preview cookie the way @prismicio/svelte reads it", async () => {
    const { response, cookies } = preview({ type: "property", uid: "x" });
    await response;
    expect(cookies.set).toHaveBeenCalledWith("io.prismic.preview", "PREVIEW-TOKEN", {
      path: "/",
      httpOnly: false,
    });
  });
});

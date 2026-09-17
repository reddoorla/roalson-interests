import { describe, expect, it } from "vitest";
// Lives in src/, not beside the function: Netlify bundles EVERY file in
// netlify/edge-functions/ as an edge function, and a test file there fails the
// deploy trying to load vitest on Deno ("Bundling of edge function failed").
import mirrorNoindex, { config } from "../../netlify/edge-functions/mirror-noindex";

// The edge function is the only layer that runs in front of PRERENDERED pages:
// Netlify serves those straight from the CDN without invoking the SvelteKit
// function, so hooks.server.ts never sees them and their bytes are identical on
// every host. See the header comment in mirror-noindex.ts (#140).

function run(url: string, upstream = new Response("<h1>ok</h1>", { status: 200 })) {
  let nextCalls = 0;
  const context = {
    next: async () => {
      nextCalls++;
      return upstream;
    },
  };
  return {
    result: mirrorNoindex(new Request(url), context),
    nextCalls: () => nextCalls,
  };
}

describe("mirror-noindex edge function", () => {
  it("tells crawlers not to index the site's netlify.app host", async () => {
    const response = await run("https://reddoor-wireframer.netlify.app/").result;
    expect(response?.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("covers a prerendered page and a static asset alike", async () => {
    for (const path of ["/about", "/favicon.png", "/og-default.jpg"]) {
      const response = await run(`https://reddoor-wireframer.netlify.app${path}`).result;
      expect(response?.headers.get("X-Robots-Tag"), path).toBe("noindex, nofollow");
    }
  });

  it("leaves the production domain untouched and does not even wait on it", async () => {
    const { result, nextCalls } = run("https://www.example.com/");
    // `undefined` continues the request chain without buffering the response,
    // so the client's real domain pays nothing for this function.
    expect(await result).toBeUndefined();
    expect(nextCalls()).toBe(0);
  });

  it("passes the upstream status and body through unchanged", async () => {
    const response = await run(
      "https://reddoor-wireframer.netlify.app/missing",
      new Response("gone", { status: 404, headers: { "Content-Type": "text/html" } }),
    ).result;
    expect(response?.status).toBe(404);
    expect(response?.headers.get("Content-Type")).toBe("text/html");
    expect(await response?.text()).toBe("gone");
  });

  it("runs on every path, and fails open rather than taking the site down", () => {
    expect(config.path).toBe("/*");
    expect(config.onError).toBe("bypass");
  });
});

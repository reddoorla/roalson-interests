import { expect, test } from "@playwright/test";

import legacy from "./legacy-urls.json" with { type: "json" };
import { isPlaceholderRepo } from "./routes";

// The old www.roalson.com's URLs at cutover (src/lib/legacy-redirects.ts):
// every one it answered for, as its own links spell them, must answer a 301
// on the built site, and where it points must answer 200. `vite preview`
// runs the same hook Netlify's function does; Netlify's own redirect rules
// are not in play for these paths (see that file).
test("every old www.roalson.com URL is a 301 to a page that answers 200", async ({ request }) => {
  test.skip(isPlaceholderRepo, "listing pages 404 before Prismic is wired");
  const targets = new Map<string, string>();
  for (const path of legacy.paths) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(301);
    const location = response.headers()["location"] ?? "";
    expect(location, path).toMatch(/^\/(?!\/)/);
    if (!targets.has(location)) targets.set(location, path);
  }
  expect(targets.size, "distinct destinations").toBeGreaterThan(20);
  for (const [location, from] of targets) {
    const response = await request.get(location, { maxRedirects: 0 });
    expect(response.status(), `${location}, from ${from}`).toBe(200);
  }
});

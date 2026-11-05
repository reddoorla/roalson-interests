import { test, expect } from "@playwright/test";

const PRISMIC_FRAMER = "https://*.prismic.io";

for (const path of ["/slice-simulator", "/slice%2Dsimulator", "/slice%2dsimulator"]) {
  test(`${path} lets Prismic frame it`, { tag: "@smoke" }, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["x-frame-options"]).toBeUndefined();
    const policy = response.headers()["content-security-policy"] ?? "";
    expect(policy.match(/frame-ancestors[^;]*/)?.[0]).toContain(PRISMIC_FRAMER);
  });
}

test(
  "an ordinary page stays SAMEORIGIN and does not let Prismic frame it",
  { tag: "@smoke" },
  async ({ request }) => {
    const response = await request.get("/privacy");
    expect(response.status()).toBe(200);
    expect(response.headers()["x-frame-options"]).toBe("SAMEORIGIN");
    const policy = response.headers()["content-security-policy"] ?? "";
    expect(policy.match(/frame-ancestors[^;]*/)?.[0] ?? "").not.toContain(PRISMIC_FRAMER);
  },
);

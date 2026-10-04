// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectBuildServices } from "./privacy-services.ts";

let root: string;
const put = (rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
};

const config = (directives: Record<string, string[]> | null) =>
  `export default { kit: { adapter: { name: "@sveltejs/adapter-netlify" }${
    directives ? `, csp: { directives: ${JSON.stringify(directives)} }` : ""
  } } };`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "privacy-"));
  put("svelte.config.js", config({ "frame-src": ["self"] }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("collectBuildServices", () => {
  it("reads the client hook for GA4", async () => {
    put("src/hooks.client.ts", `initAnalytics({ measurementId: "G-ABCDEFGHIJ" });`);
    expect((await collectBuildServices(root)).ga4).toBe(true);
  });

  it("does not count tests, type declarations, dev fixtures or the privacy code itself", async () => {
    const all = `initAnalytics({}); createIngestAction({ formType: "newsletter" });`;
    put("src/hooks.client.test.ts", all);
    put("src/lib/a.spec.ts", all);
    put("src/global.d.ts", all);
    put("src/routes/dev/x/+page.svelte", all);
    put("src/routes/privacy/+page.svelte", all);
    put("src/lib/privacy/services.ts", all);
    expect(await collectBuildServices(root)).toMatchObject({
      ga4: false,
      forms: false,
      newsletter: false,
    });
  });

  it("reads the CSP the config resolves to, not the text it is written in", async () => {
    put(
      "svelte.config.js",
      `const base = { "frame-src": ["https://*.vimeo.com"] };
export default { kit: { csp: { directives: { ...base } } } };`,
    );
    expect((await collectBuildServices(root)).vimeo).toBe(true);
  });

  it("finishes on a source tree with symlink cycles", async () => {
    put("src/a/x.ts", "export {};");
    put("src/b/y.ts", "export {};");
    symlinkSync(join(root, "src"), join(root, "src/a/up"));
    symlinkSync(join(root, "src"), join(root, "src/b/up2"));
    expect((await collectBuildServices(root)).forms).toBe(false);
  });

  it("keeps a CSP with no directives from counting as a CSP", async () => {
    put("svelte.config.js", `export default { kit: { csp: { directives: {} } } };`);
    put("src/lib/V.svelte", `<iframe src="https://player.vimeo.com/video/1"></iframe>`);
    expect((await collectBuildServices(root)).vimeo).toBe(true);
  });

  it("falls back to the source when the config sets no CSP", async () => {
    put("svelte.config.js", config(null));
    put("src/lib/V.svelte", `<iframe src="https://player.vimeo.com/video/1"></iframe>`);
    expect((await collectBuildServices(root)).vimeo).toBe(true);
  });
});

describe("this site itself", () => {
  it("lists its forms, Netlify, the Vimeo its CSP admits and the Google Fonts it loads", async () => {
    const site = join(dirname(fileURLToPath(import.meta.url)), "..");
    expect(await collectBuildServices(site)).toMatchObject({
      forms: true,
      newsletter: false,
      netlify: true,
      vimeo: true,
      youtube: false,
      googleFonts: true,
      adobeFonts: false,
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const env: Record<string, string | undefined> = {};
vi.mock("$env/dynamic/public", () => ({ env }));
vi.mock("virtual:privacy-services", () => ({
  default: {
    forms: true,
    ga4: false,
    netlify: true,
    vimeo: false,
    youtube: false,
    googleFonts: false,
    adobeFonts: false,
    newsletter: false,
  },
}));

const { load } = await import("./+page.server");
const run = () =>
  (load as () => Record<string, never>)() as unknown as {
    title: string;
    privacy: { draft: boolean; services: { turnstile: boolean; forms: boolean } };
  };

beforeEach(() => {
  delete env.PUBLIC_TURNSTILE_SITE_KEY;
});

describe("the privacy page's load", () => {
  it("is rendered per request, so the runtime sitekey is the one the widget sees", async () => {
    const mod = await import("./+page.server");
    expect(mod.prerender).toBe(false);
  });

  it("turns Turnstile on from the same env var the widget reads", () => {
    expect(run().privacy.services.turnstile).toBe(false);
    env.PUBLIC_TURNSTILE_SITE_KEY = "0x4AAAAAAA";
    expect(run().privacy.services.turnstile).toBe(true);
  });

  it("carries the build-time switches and stays DRAFT", () => {
    const out = run();
    expect(out.title).toBe("Privacy Policy");
    expect(out.privacy.services.forms).toBe(true);
    expect(out.privacy.draft).toBe(true);
    expect((out as unknown as { noindex: boolean }).noindex).toBe(true);
  });
});

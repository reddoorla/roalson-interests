import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

// While prerendering, kit 3 gives page.url "http://sveltekit-prerender" and
// $lib/seo's siteOrigin puts the build's production origin in its place
// (sveltekit.config.js says why it is not paths.origin). In vitest the build
// has no URL, so the build origin is fixed here through the mock.
vi.mock("$lib/seo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("$lib/seo")>();
  return {
    ...actual,
    siteOrigin: (url: Pick<URL, "origin"> | string) =>
      actual.siteOrigin(url, "https://www.example.com"),
    canonicalUrl: (url: Pick<URL, "origin" | "pathname"> | string) =>
      actual.canonicalUrl(url, "https://www.example.com"),
  };
});

const { default: Seo } = await import("./Seo.svelte");

afterEach(() => cleanup());

const attr = (sel: string, name = "content") =>
  document.head.querySelector(sel)?.getAttribute(name) ?? null;

describe("Seo while prerendering", () => {
  it("gives canonical, og:url and a relative og:image the build's origin, not the placeholder", () => {
    render(Seo, {
      title: "About",
      url: new URL("http://sveltekit-prerender/about"),
      image: "/og-default.png",
    });
    expect(attr('link[rel="canonical"]', "href")).toBe("https://www.example.com/about");
    expect(attr('meta[property="og:url"]')).toBe("https://www.example.com/about");
    expect(attr('meta[property="og:image"]')).toBe("https://www.example.com/og-default.png");
  });
});

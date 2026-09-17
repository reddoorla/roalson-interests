import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import type { ImageField } from "@prismicio/client";
import HeroBackgroundImage from "./HeroBackgroundImage.svelte";

afterEach(() => {
  cleanup();
  // svelte:head content is not removed by cleanup(); clear it between tests.
  document.head.querySelectorAll("link[rel='preload']").forEach((el) => el.remove());
});

const prismicImage = (overrides: Record<string, unknown> = {}) =>
  ({
    url: "https://images.prismic.io/repo/abc_hero.jpg?auto=compress",
    alt: "A hero image",
    dimensions: { width: 4000, height: 2250 },
    ...overrides,
  }) as unknown as ImageField;

describe("HeroBackgroundImage", () => {
  it("renders a width-capped src and a srcset ladder for Prismic images", () => {
    const { container } = render(HeroBackgroundImage, {
      image: prismicImage(),
    });
    const img = container.querySelector("img")!;
    expect(img.src).toContain("w=1920");
    expect(img.src).toContain("auto=format%2Ccompress");
    expect(img.srcset).toContain("480w");
    expect(img.srcset).toContain("2560w");
    expect(img.sizes).toBe("100vw");
    expect(img.width).toBe(4000);
    expect(img.height).toBe(2250);
    expect(img.alt).toBe("A hero image");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("emits a preload link so the browser discovers the LCP image pre-hydration", () => {
    render(HeroBackgroundImage, { image: prismicImage() });
    const link = document.head.querySelector<HTMLLinkElement>("link[rel='preload'][as='image']")!;
    expect(link).toBeTruthy();
    expect(link.href).toContain("w=1920");
    expect(link.getAttribute("imagesrcset")).toContain("480w");
    expect(link.getAttribute("fetchpriority")).toBe("high");
  });

  it("skips the preload link (but still renders the image) with preload={false}", () => {
    // Two hero-ish slices on one page must not both claim fetchpriority=high
    // preloads — every instance after the real LCP hero opts out.
    const { container } = render(HeroBackgroundImage, {
      image: prismicImage(),
      preload: false,
    });
    expect(document.head.querySelector("link[rel='preload']")).toBeNull();
    const img = container.querySelector("img")!;
    expect(img.src).toContain("w=1920");
  });

  // This assertion used to read `.toBe("high")` under preload={false} — the
  // test PINNED the bug. Dropping the <link> while leaving the <img> at
  // fetchpriority=high does not stop a secondary hero competing with the LCP;
  // it only stops it being preloaded. An instance that opted out of being the
  // LCP must also stop claiming the bandwidth of one.
  it("de-prioritises an instance that is not the LCP", () => {
    const { container } = render(HeroBackgroundImage, {
      image: prismicImage(),
      preload: false,
    });
    const img = container.querySelector("img")!;
    expect(img.getAttribute("fetchpriority")).toBe("auto");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("keeps the LCP hero eager and high-priority", () => {
    const { container } = render(HeroBackgroundImage, { image: prismicImage() });
    const img = container.querySelector("img")!;
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.getAttribute("loading")).toBe("eager");
  });

  it("passes non-Prismic URLs through untouched, with no srcset", () => {
    const { container } = render(HeroBackgroundImage, {
      image: prismicImage({ url: "https://example.com/hero.jpg" }),
    });
    const img = container.querySelector("img")!;
    expect(img.src).toBe("https://example.com/hero.jpg");
    expect(img.getAttribute("srcset")).toBeNull();
  });

  it("uses altFallback when the Prismic field has no alt", () => {
    const { container } = render(HeroBackgroundImage, {
      image: prismicImage({ alt: null }),
      altFallback: "Fallback alt",
    });
    expect(container.querySelector("img")!.alt).toBe("Fallback alt");
  });

  it("renders nothing (and no preload) for an empty image field", () => {
    const { container } = render(HeroBackgroundImage, {
      image: {} as unknown as ImageField,
    });
    expect(container.querySelector("img")).toBeNull();
    expect(document.head.querySelector("link[rel='preload']")).toBeNull();
  });
});

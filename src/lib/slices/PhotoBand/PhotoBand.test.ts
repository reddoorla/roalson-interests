import { cleanup, render } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { HOME_PHOTO_FIXTURE, homeFixture, photoBandFixture } from "$lib/home-fixture";
import { components } from "$lib/slices";
import PhotoBand from "./index.svelte";

afterEach(cleanup);

// jsdom resolves no stylesheets, so NOTHING here says the band pins: that is
// tests/interaction/photo-band.spec.ts, in a browser, with the footer moving.
// What is checked here is what the markup says — the two elements the pin is
// built from, the empty (launch) state, and how the photo is loaded.

const band = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slice-type="photo_band"]')!;

describe("PhotoBand slice", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.photo_band).toBe(PhotoBand);
  });

  it("is the LAST slice of the homepage fixture — the only place it pins", () => {
    const slices = homeFixture();
    expect(slices[slices.length - 1].slice_type).toBe("photo_band");
  });

  it("with no image ships no <img> and no preload", () => {
    const { container } = render(PhotoBand, { props: { slice: photoBandFixture() } });
    const root = band(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    expect(root.querySelector("img")).toBeNull();
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });

  it("renders the spacer as the band's next SIBLING — inside the band it would give it no travel", () => {
    const { container } = render(PhotoBand, { props: { slice: photoBandFixture() } });
    const root = band(container);
    const spacer = root.nextElementSibling as HTMLElement | null;
    expect(spacer, "nothing follows the band").not.toBeNull();
    expect(spacer!.classList.contains("pinned-band-spacer")).toBe(true);
    expect(spacer!.getAttribute("aria-hidden")).toBe("true");
    expect(spacer!.childNodes.length).toBe(0);
    expect(root.contains(spacer)).toBe(false);
    expect(root.hasAttribute("data-pinned-band")).toBe(true);
  });

  it("renders the photo below the fold's way: lazy, never the LCP, imgix-sized", () => {
    const slice = photoBandFixture({
      image: {
        url: "https://images.prismic.io/roalson-interests/skyline.jpg?auto=format,compress",
        alt: "Downtown San Antonio at dusk",
        dimensions: { width: 3600, height: 2400 },
      },
    } as never);
    const { container } = render(PhotoBand, { props: { slice } });
    const img = band(container).querySelector<HTMLImageElement>("img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("alt")).toBe("Downtown San Antonio at dusk");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("fetchpriority")).toBe("auto");
    expect(img.getAttribute("srcset")).toContain("w=2560");
    expect(img.getAttribute("sizes")).toBe("100vw");
    expect(img.getAttribute("width")).toBe("3600");
    expect(img.getAttribute("height")).toBe("2400");
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    // The spacer is still the band's sibling, not the image's.
    expect(band(container).nextElementSibling?.classList.contains("pinned-band-spacer")).toBe(true);
  });

  it("treats an image with no alt as decoration", () => {
    const slice = photoBandFixture({ image: { ...HOME_PHOTO_FIXTURE, alt: null } } as never);
    const { container } = render(PhotoBand, { props: { slice } });
    const img = band(container).querySelector("img")!;
    expect(img.hasAttribute("alt")).toBe(true);
    expect(img.getAttribute("alt")).toBe("");
  });

  it("ships no photograph: the mock is the empty launch state and the fixture is a drawing", () => {
    // The comp's photo is unlicensed Unsplash stock (#3). Neither file may ever
    // point at a host.
    const mocks = readFileSync(
      resolve(process.cwd(), "src/lib/slices/PhotoBand/mocks.json"),
      "utf-8",
    );
    expect(JSON.parse(mocks)[0].primary).toEqual({});
    expect(mocks).not.toMatch(/https?:/);
    expect(mocks.toLowerCase()).not.toContain("lorem");
    expect(HOME_PHOTO_FIXTURE.url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(decodeURIComponent(HOME_PHOTO_FIXTURE.url)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});

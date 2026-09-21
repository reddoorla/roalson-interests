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
// built from, the empty (launch) state, and how the photo is loaded — plus the
// one thing about app.css that can be read as text: that the rules name the
// hooks this markup actually carries.

const band = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slice-type="photo_band"]')!;

// Comments stripped: what is asserted below is about RULES, and the prose above
// them is free to name the same hooks.
const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf-8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

describe("PhotoBand slice", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.photo_band).toBe(PhotoBand);
  });

  it("is the LAST slice of the homepage fixture — the only place it pins", () => {
    const slices = homeFixture();
    expect(slices[slices.length - 1].slice_type).toBe("photo_band");
  });

  it("with no image is the garnet gradient at the comp's heights — and ships no <img>", () => {
    const { container } = render(PhotoBand, { props: { slice: photoBandFixture() } });
    const root = band(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    const classes = root.className.split(/\s+/);
    // 240 on a phone, 800 from `lg` (6994:881, 6825:530) — as ONE variable, which
    // the pin's `top` in app.css reads too.
    expect(classes).toEqual(
      expect.arrayContaining(["h-(--band-h)", "[--band-h:240px]", "lg:[--band-h:800px]"]),
    );
    // PageMasthead's two tokens: one treatment for "licensed photo pending".
    expect(classes).toEqual(
      expect.arrayContaining(["bg-gradient-to-b", "from-primary", "to-dark"]),
    );
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent?.trim()).toBe("");
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });

  it("renders the spacer as the band's next SIBLING — inside the band it would give it no travel", () => {
    const { container } = render(PhotoBand, { props: { slice: photoBandFixture() } });
    const root = band(container);
    const spacer = root.nextElementSibling as HTMLElement | null;
    expect(spacer, "nothing follows the band").not.toBeNull();
    expect(spacer!.className).toBe("pinned-band-spacer");
    expect(spacer!.getAttribute("aria-hidden")).toBe("true");
    expect(spacer!.childNodes.length).toBe(0);
    expect(root.contains(spacer)).toBe(false);
    expect(root.hasAttribute("data-pinned-band")).toBe(true);
    // The band clips its own photo, and must not become a scroll container.
    expect(root.className).toContain("overflow-clip");
    expect(root.className).not.toMatch(/overflow-(hidden|auto|scroll)/);
  });

  it("app.css pins by the hooks this markup carries, and only behind both of its gates", () => {
    // A rename on either side leaves the other matching nothing, silently. The
    // browser spec goes red for that too; this says which file to look in.
    const { container } = render(PhotoBand, { props: { slice: photoBandFixture() } });
    const spacerClass = (band(container).nextElementSibling as HTMLElement).className;
    const at = css.indexOf("@supports selector(:has(*))");
    expect(at, "no :has() gate in app.css").toBeGreaterThan(-1);
    // The gated block: from the @supports to the first line that closes it.
    const block = css.slice(at, css.indexOf("\n}\n", at));
    expect(block).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(block).toContain(`main > [data-pinned-band]:has(+ .${spacerClass}:last-child)`);
    expect(block).toContain(`main > .${spacerClass}:last-child`);
    expect(block).toContain(`main:has(> .${spacerClass}:last-child) + footer`);
    expect(block).toMatch(/position:\s*sticky/);
    // Every rule that reads the footer's height falls back to 0, because
    // without script nothing ever writes it.
    expect(block.match(/var\(--footer-h, 0px\)/g)?.length).toBe(2);
    // …and NONE of the three may exist outside the gates: the spacer's height
    // alone, ungated, is a footer-tall hole above the footer.
    const outside = css.slice(0, at) + css.slice(at + block.length);
    expect(outside).not.toContain("pinned-band");
  });

  it("renders the photo below the fold's way: lazy, never the LCP, imgix-sized, bottom-anchored", () => {
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
    // `cover` anchored to the bottom IS the comp's crop (1440×960.1 at −160.1,
    // 390×260 at −20): the top is what goes.
    expect(img.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["h-full", "w-full", "object-cover", "object-bottom"]),
    );
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
    // The spacer is still the band's sibling, not the image's.
    expect(band(container).nextElementSibling?.className).toBe("pinned-band-spacer");
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

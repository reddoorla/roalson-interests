import { cleanup, render } from "@testing-library/svelte";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Content } from "@prismicio/client";

import { homeHeroFixture } from "$lib/home-fixture";
import { components } from "$lib/slices";
import HomeHero from "./index.svelte";

afterEach(cleanup);

// jsdom resolves no stylesheets: the pin, the cutout's seat on the band and the
// band's one-column geometry are tests/interaction/home-hero.spec.ts's. What is checked
// here is what the markup says — content, empty branches, and the hooks the
// browser spec and the wordmark gate (#18) hang on.

const section = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slice-type="home_hero"]')!;

describe("HomeHero slice", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.home_hero).toBe(HomeHero);
  });

  it("renders the headline as the page's h1, honouring the editor's soft break", () => {
    const { getByRole } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const h1 = getByRole("heading", { level: 1 });
    // One <br> where the editor pressed Shift+Enter — the revised comp's
    // U+2028 after "Commercial" (7091:651) — and the words on either side of it
    // intact. The final period stays (operator call D1: the comp keeps it).
    expect(h1.querySelectorAll("br").length).toBe(1);
    expect(h1.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "San Antonio's Commercial Real Estate Experts Since 1983.",
    );
    // Svelte's hydration anchors are comments; only the words are compared.
    const [before, after] = h1.innerHTML.replace(/<!--.*?-->/g, "").split(/<br[^>]*>/);
    expect(before.trim()).toBe("San Antonio's Commercial");
    expect(after.trim()).toBe("Real Estate Experts Since 1983.");
    // The break applies from a 1040 viewport, where both 66px lines fit with a
    // margin; below it the text flows — see the component.
    const br = h1.querySelector("br")!;
    expect(br.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["hidden", "min-[1040px]:inline"]),
    );
    expect(h1.className).toContain("t-h2");
    expect(h1.className).toContain("lg:t-h1");
  });

  it("breaks on the comp's own separator too — pasted from Figma, the text carries U+2028", () => {
    // Built from its code point: a literal line separator in this file would
    // be invisible in review, and inside a regex literal it is a syntax error.
    const LINE_SEPARATOR = String.fromCharCode(0x2028);
    const slice = homeHeroFixture({
      heading: [
        {
          type: "heading1",
          text: `San Antonio's Commercial ${LINE_SEPARATOR}Real Estate Experts Since 1983.`,
          spans: [],
        },
      ],
    });
    const { getByRole } = render(HomeHero, { props: { slice } });
    const h1 = getByRole("heading", { level: 1 });
    expect(h1.querySelectorAll("br").length).toBe(1);
    expect(h1.textContent).not.toContain(LINE_SEPARATOR);
  });

  it("renders no <br> for a headline without a soft break", () => {
    const slice = homeHeroFixture({
      heading: [{ type: "heading1", text: "Commercial real estate", spans: [] }],
    });
    const { getByRole } = render(HomeHero, { props: { slice } });
    expect(getByRole("heading", { level: 1 }).querySelector("br")).toBeNull();
  });

  it("points its buttons at the filesystem routes, whatever shape the CMS stored", () => {
    const slice = homeHeroFixture({
      buttons: [
        {
          label: "Properties",
          link: { link_type: "Web", url: "https://www.roalson.com/properties" },
        },
        { label: "Contact us", link: { link_type: "Web", url: "https:///contact" } },
      ],
    } as never);
    const { getByRole } = render(HomeHero, { props: { slice } });
    expect(getByRole("link", { name: "Properties" }).getAttribute("href")).toBe("/properties");
    expect(getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
  });

  it("draws PROPERTIES first and CONTACT US second — the client's order, from the content", () => {
    // The component draws the CMS order; the order itself is the fixture's
    // and the seed's (scripts/seed/pages.test.ts holds the seed's).
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const links = [...section(container).querySelectorAll("a")];
    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute("href")])).toEqual([
      ["Properties", "/properties"],
      ["Contact us", "/contact"],
    ]);
  });

  it("wears the cream tone — off-white outline and label on the garnet band", () => {
    const { getByRole } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    for (const name of ["Properties", "Contact us"]) {
      const button = getByRole("link", { name });
      expect(button.className, name).toContain("border-background");
      expect(button.className, name).toContain("text-background");
    }
  });

  it("shows the first two complete buttons and no anchor for an incomplete one", () => {
    const slice = homeHeroFixture({
      buttons: [
        { label: "No link", link: { link_type: "Any" } },
        { label: "", link: { link_type: "Web", url: "/nowhere" } },
        { label: "One", link: { link_type: "Web", url: "/one" } },
        { label: "Two", link: { link_type: "Web", url: "/two" } },
        { label: "Three", link: { link_type: "Web", url: "/three" } },
      ],
    } as never);
    const { container } = render(HomeHero, { props: { slice } });
    const links = [...section(container).querySelectorAll("a")];
    expect(links.map((a) => a.textContent?.trim())).toEqual(["One", "Two"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/one", "/two"]);
  });

  it("opens an external button in a new tab only when the editor asked, and safely", () => {
    const slice = homeHeroFixture({
      buttons: [
        {
          label: "LoopNet",
          link: { link_type: "Web", url: "https://www.loopnet.com/", target: "_blank" },
        },
        { label: "Contact us", link: { link_type: "Web", url: "/contact" } },
      ],
    } as never);
    const { getByRole } = render(HomeHero, { props: { slice } });
    const external = getByRole("link", { name: "LoopNet" });
    expect(external.getAttribute("target")).toBe("_blank");
    expect(external.getAttribute("rel")).toBe("noopener noreferrer");
    const internal = getByRole("link", { name: "Contact us" });
    expect(internal.hasAttribute("target")).toBe(false);
    expect(internal.hasAttribute("rel")).toBe(false);
  });

  it("renders the subheading as Body 1, between the headline and the buttons", () => {
    const { getByRole, getByText } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const h1 = getByRole("heading", { level: 1 });
    const sub = getByText("A placeholder for a sentence to come.");
    expect(sub.tagName).toBe("P");
    // 7091:903 is Body 1 (400 16/24) in the headline's own off-white.
    expect(sub.className.split(/\s+/)).toEqual(expect.arrayContaining(["t-body-1", "text-light"]));
    const first = getByRole("link", { name: "Properties" });
    expect(h1.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sub.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no <p> at all for a null, empty or blank subheading", () => {
    for (const subheading of [null, "", "   "]) {
      const { container, unmount } = render(HomeHero, {
        props: { slice: homeHeroFixture({ subheading } as never) },
      });
      const band = section(container).querySelector("[data-nav-gate]")!;
      // The headline and the buttons are still there: only the sentence went.
      expect(band.querySelector("h1"), String(subheading)).not.toBeNull();
      expect(band.querySelectorAll("a").length, String(subheading)).toBe(2);
      expect(band.querySelector("p"), String(subheading)).toBeNull();
      unmount();
    }
  });

  it("renders no list and no h2 for a stale document still carrying the specialty fields", () => {
    // The live `home` document was published with `specialty_label` and three
    // `specialties`, and keeps them until it is re-staged: dropping a field
    // from the model does not strip it from content already written. The
    // band must ignore them — the revised comp has no list.
    const stale = homeHeroFixture({
      specialty_label: "Our specialty",
      specialties: [
        { text: "Consulting and brokerage" },
        { text: "Acquisition and disposition properties" },
        { text: "Buyer and tenant representation" },
      ],
    } as never);
    const { container, queryByRole, getByRole } = render(HomeHero, { props: { slice: stale } });
    expect(getByRole("heading", { level: 1 })).toBeTruthy();
    expect(queryByRole("list")).toBeNull();
    expect(queryByRole("heading", { level: 2 })).toBeNull();
    expect(section(container).textContent).not.toMatch(/specialty|Consulting and brokerage/i);
  });

  it("is one column: nothing in the band sits on the site's two-column grid", () => {
    // The browser spec measures the x=80; what the markup can say is that the
    // grid and its right-column placement are gone.
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const band = section(container).querySelector("[data-nav-gate]")!;
    expect(band.innerHTML).not.toMatch(/grid-cols|col-start/);
  });

  it("stamps the slice attributes, the pin and the nav gate", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const root = section(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    const pin = root.querySelector("[data-home-hero-pin]")!;
    // The pin is motion-safe ONLY (#38): under `prefers-reduced-motion: reduce`
    // the hero is `relative` and leaves with the page, like the photo band.
    const classes = pin.className.split(/\s+/);
    expect(classes).toContain("motion-safe:sticky");
    expect(classes).toContain("motion-safe:top-0");
    expect(classes).toContain("relative");
    expect(classes, "no unconditional pin").not.toContain("sticky");
    expect(pin.className).toContain("h-[528px]");
    expect(pin.className).toContain("bg-dark");
    // #18 measures "band rect vs bar rect" against this attribute.
    const gate = root.querySelector("[data-nav-gate]")!;
    expect(gate.className).toContain("from-primary");
    expect(gate.className).toContain("from-50%");
    expect(gate.className).toContain("to-dark");
  });

  it("never clips the section — overflow-hidden on the wrapper silently kills the pin", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    expect(section(container).className).not.toMatch(/overflow-(hidden|auto|scroll)/);
  });

  it("seats the cutout in the BAND, not in the pinned hero, as a decorative vector", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const cutout = container.querySelector<SVGElement>("[data-home-hero-cutout]")!;
    expect(cutout.closest("[data-nav-gate]")).not.toBeNull();
    expect(cutout.closest("[data-home-hero-pin]")).toBeNull();
    expect(cutout.getAttribute("aria-hidden")).toBe("true");
    expect(cutout.getAttribute("viewBox")).toBe("0 0 451 451");
  });

  it("ships the Figma export's path bytes, not a redraw", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const paths = container.querySelectorAll("[data-home-hero-cutout] path");
    expect(paths.length).toBe(1);
    const d = paths[0].getAttribute("d")!;
    // sha256 of the `d` attribute exported from 6802:1423 (Frame 194) — and,
    // byte for byte, from its instance 6802:1424. 517 characters, 4 subpaths.
    expect(d.length).toBe(517);
    expect(createHash("sha256").update(d).digest("hex")).toBe(
      "e0645afc1fe358763311dd5d4bdb45e694e09fe992a0b7443ed8f5213d3e947a",
    );
  });

  it("renders no <img> and no preload without a poster — the flat dark ground", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    expect(section(container).querySelector("img")).toBeNull();
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });

  it("renders the poster inside the pin, preloaded as the page's LCP image", () => {
    const slice = homeHeroFixture({
      poster: {
        url: "https://images.prismic.io/roalson-interests/hero.jpg?auto=format,compress",
        alt: "",
        dimensions: { width: 3200, height: 1800 },
      },
    } as never);
    const { container } = render(HomeHero, { props: { slice } });
    const img = section(container).querySelector<HTMLImageElement>("[data-home-hero-pin] img")!;
    expect(img).not.toBeNull();
    expect(img.getAttribute("srcset")).toContain("w=");
    expect(img.getAttribute("fetchpriority")).toBe("high");
    expect(img.className).toContain("object-cover");
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).not.toBeNull();
  });

  // #29. The field was modelled in the hero batch and rendered nothing; it
  // renders a layer now. What this file can hold is the WIRING — that the
  // layer is inside the pin, that it is a layer and not a replacement, and
  // that a junk id is the same as no id. The mount, the reveal and the pause
  // control are HeroBackgroundVideo.test.ts's; the pin and the tab order are
  // tests/interaction/home-hero-video.spec.ts's.
  it("renders the video layer inside the pin when the field carries an id", () => {
    const slice = homeHeroFixture({ vimeo_id: "1229048743" } as never);
    const { container } = render(HomeHero, { props: { slice } });
    const layer = section(container).querySelector("[data-home-hero-pin] [data-hero-video]");
    expect(layer).not.toBeNull();
    // A LAYER, never a replacement: nothing has played, so no iframe exists and
    // the pin is the same dark ground it is without the field.
    expect(container.querySelector("iframe")).toBeNull();
    expect(section(container).querySelector("[data-home-hero-pin]")!.className).toContain(
      "bg-dark",
    );
  });

  it("renders no layer at all for an empty or unusable id", () => {
    for (const vimeo_id of [null, "", "   ", "ask marketing for it"]) {
      const { container, unmount } = render(HomeHero, {
        props: { slice: homeHeroFixture({ vimeo_id } as never) },
      });
      expect(container.querySelector("[data-hero-video]"), String(vimeo_id)).toBeNull();
      expect(container.innerHTML).not.toContain("vimeo");
      unmount();
    }
  });

  it("layers the video OVER the poster, not instead of it", () => {
    const slice = homeHeroFixture({
      poster: {
        url: "https://images.prismic.io/roalson-interests/hero.jpg?auto=format,compress",
        alt: "",
        dimensions: { width: 3200, height: 1800 },
      },
      vimeo_id: "1229048743",
    } as never);
    const { container } = render(HomeHero, { props: { slice } });
    const pin = section(container).querySelector("[data-home-hero-pin]")!;
    expect(pin.querySelector("img")).not.toBeNull();
    // DOM order is the paint order here — the poster first, the layer over it.
    const kids = [...pin.children];
    expect(kids.findIndex((el) => el.tagName === "IMG")).toBeLessThan(
      kids.findIndex((el) => el.hasAttribute("data-hero-video")),
    );
  });

  it("with NO slice, still paints the dark 528 ground the route's navOver claim depends on", () => {
    const { container, queryByRole } = render(HomeHero, { props: { slice: undefined } });
    const root = section(container);
    expect(root).not.toBeNull();
    expect(root.className).toContain("bg-dark");
    const pin = root.querySelector("[data-home-hero-pin]")!;
    expect(pin.className).toContain("h-[528px]");
    expect(pin.className).toContain("bg-dark");
    // No band, so nothing for the gate to wait on and no empty garnet strip.
    expect(root.querySelector("[data-nav-gate]")).toBeNull();
    expect(queryByRole("heading")).toBeNull();
  });

  it("tolerates a slice whose fields are all empty", () => {
    const empty = {
      slice_type: "home_hero",
      variation: "default",
      primary: {
        poster: {},
        vimeo_id: null,
        heading: [],
        subheading: null,
        buttons: [],
      },
      items: [],
    } as unknown as Content.HomeHeroSlice;
    const { container, queryByRole } = render(HomeHero, { props: { slice: empty } });
    expect(section(container).querySelector("[data-nav-gate]")).not.toBeNull();
    expect(queryByRole("heading")).toBeNull();
    expect(queryByRole("link")).toBeNull();
    expect(section(container).querySelector("[data-nav-gate] p")).toBeNull();
  });
});

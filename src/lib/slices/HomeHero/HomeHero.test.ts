import { cleanup, render, within } from "@testing-library/svelte";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Content } from "@prismicio/client";

import { homeHeroFixture } from "$lib/home-fixture";
import { components } from "$lib/slices";
import HomeHero from "./index.svelte";

afterEach(cleanup);

// jsdom resolves no stylesheets: the pin, the cutout's seat on the band and the
// 390 order swap are tests/interaction/home-hero.spec.ts's. What is checked
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
    // One <br> where the editor pressed Shift+Enter — the comp's U+2028 after
    // "Experts." (6802:1428) — and the words on either side of it intact.
    expect(h1.querySelectorAll("br").length).toBe(1);
    expect(h1.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "San Antonio's Commercial Real Estate Experts. Since 1983.",
    );
    const [before, after] = h1.innerHTML.split(/<br\s*\/?>/);
    expect(before).toContain("Experts.");
    expect(after).toContain("Since 1983.");
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
          text: `Real Estate Experts. ${LINE_SEPARATOR}Since 1983.`,
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
        { label: "Contact us", link: { link_type: "Web", url: "https:///contact" } },
        {
          label: "Our portfolio",
          link: { link_type: "Web", url: "https://www.roalson.com/properties" },
        },
      ],
    } as never);
    const { getByRole } = render(HomeHero, { props: { slice } });
    expect(getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
    expect(getByRole("link", { name: "Our portfolio" }).getAttribute("href")).toBe("/properties");
  });

  it("wears the cream tone — off-white outline and label on the garnet band", () => {
    const { getByRole } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const button = getByRole("link", { name: "Contact us" });
    expect(button.className).toContain("border-background");
    expect(button.className).toContain("text-background");
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

  it("names the specialty list with an h2 and lists every specialty", () => {
    const { getByRole } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const label = getByRole("heading", { level: 2, name: "Our specialty" });
    expect(label.className).toContain("t-h5");
    const list = getByRole("list", { name: "Our specialty" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent?.trim()),
    ).toEqual([
      "Consulting and brokerage",
      "Acquisition and disposition properties",
      "Buyer and tenant representation",
    ]);
  });

  it("renders the text block before the list — the 390 comp's order, and the reading order", () => {
    const { getByRole } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const h1 = getByRole("heading", { level: 1 });
    const list = getByRole("list");
    expect(h1.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("drops blank specialties, and the whole list column when nothing is in it", () => {
    const some = homeHeroFixture({
      specialties: [{ text: "Brokerage" }, { text: "  " }, { text: null }],
    } as never);
    const first = render(HomeHero, { props: { slice: some } });
    expect(first.getAllByRole("listitem").length).toBe(1);
    cleanup();

    const none = homeHeroFixture({ specialty_label: "", specialties: [] } as never);
    const second = render(HomeHero, { props: { slice: none } });
    expect(second.queryByRole("list")).toBeNull();
    expect(second.queryByRole("heading", { level: 2 })).toBeNull();
    expect(second.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("stamps the slice attributes, the pin and the nav gate", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const root = section(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    const pin = root.querySelector("[data-home-hero-pin]")!;
    expect(pin.className).toContain("sticky");
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

  it("never renders the Vimeo layer in this build — the field is modelled, the player is not", () => {
    const slice = homeHeroFixture({ vimeo_id: "123456789" } as never);
    const { container } = render(HomeHero, { props: { slice } });
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.innerHTML).not.toContain("vimeo");
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
        buttons: [],
        specialty_label: null,
        specialties: [],
      },
      items: [],
    } as unknown as Content.HomeHeroSlice;
    const { container, queryByRole } = render(HomeHero, { props: { slice: empty } });
    expect(section(container).querySelector("[data-nav-gate]")).not.toBeNull();
    expect(queryByRole("heading")).toBeNull();
    expect(queryByRole("link")).toBeNull();
    expect(queryByRole("list")).toBeNull();
  });
});

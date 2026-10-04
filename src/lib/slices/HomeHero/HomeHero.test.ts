import { cleanup, render } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/** The theme's colours, read from app.css (cwd-relative: under jsdom
 *  `import.meta.url` is not a file: URL — see theme-contrast.test.ts). */
const THEME: Record<string, string> = (() => {
  const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
  const body = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6}|white|black)\s*;/gi)) {
    out[m[1]] = m[2] === "white" ? "#ffffff" : m[2] === "black" ? "#000000" : m[2];
  }
  return out;
})();

/** WCAG 2.x contrast between two #rrggbb values. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The theme tokens of an element's own resting `<prefix>-<token>` classes. */
const own = (el: Element, prefixes: string[]) =>
  (el.getAttribute("class") ?? "")
    .split(/\s+/)
    .map((c) => /^([a-z]+)-([a-z0-9-]+)$/.exec(c))
    .filter((m): m is RegExpExecArray => m !== null && prefixes.includes(m[1]) && m[2] in THEME)
    .map((m) => m[2]);

/** The nearest such tokens on the element or an ancestor: what it is painted in. */
const painted = (el: Element | null, prefixes: string[]): string[] =>
  el ? (own(el, prefixes).length ? own(el, prefixes) : painted(el.parentElement, prefixes)) : [];

/** Every stop of a ground: a flat `bg-`, or a gradient's `from-`/`via-`/`to-`. */
const GROUND = ["bg", "from", "via", "to"];

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
    const { getByRole } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const properties = getByRole("link", { name: "Properties" });
    const contact = getByRole("link", { name: "Contact us" });
    expect(properties.getAttribute("href")).toBe("/properties");
    expect(contact.getAttribute("href")).toBe("/contact");
    expect(
      properties.compareDocumentPosition(contact) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the headline, the sentence and both buttons legible on every stop of the band", () => {
    // Which tone the buttons wear is the component's call; that it is one for
    // a dark ground is this. A button's outline is WCAG 1.4.11's 3:1; with no
    // colour of its own a border is drawn in the label's.
    const { getByRole, getByText } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const pairs: [string, string | undefined, Element, number][] = [];
    for (const [what, el] of [
      ["headline", getByRole("heading", { level: 1 })],
      ["subheading", getByText("A placeholder for a sentence to come.")],
    ] as const)
      pairs.push([what, painted(el, ["text"])[0], el, 4.5]);
    for (const name of ["Properties", "Contact us"]) {
      const button = getByRole("link", { name });
      const label = painted(button, ["text"])[0];
      pairs.push([`${name} label`, label, button, 4.5]);
      pairs.push([
        `${name} outline`,
        own(button, ["border"])[0] ?? label,
        button.parentElement!,
        3,
      ]);
    }
    for (const [what, fg, on, floor] of pairs) {
      const stops = painted(on, GROUND);
      expect(fg, `${what} is painted in no theme colour`).toBeDefined();
      expect(stops.length, `${what} sits on no theme ground`).toBeGreaterThan(0);
      for (const bg of stops)
        expect(contrast(THEME[fg!], THEME[bg]), `${what}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(
          floor,
        );
    }
  });

  it("draws no anchor for a button missing its label or its link", () => {
    const slice = homeHeroFixture({
      buttons: [
        { label: "No link", link: { link_type: "Any" } },
        { label: "", link: { link_type: "Web", url: "/nowhere" } },
        { label: "One", link: { link_type: "Web", url: "/one" } },
        { label: "Two", link: { link_type: "Web", url: "/two" } },
        { label: "Three", link: { link_type: "Web", url: "/three" } },
      ],
    } as never);
    const { container, getByRole } = render(HomeHero, { props: { slice } });
    expect(getByRole("link", { name: "One" }).getAttribute("href")).toBe("/one");
    expect(getByRole("link", { name: "Two" }).getAttribute("href")).toBe("/two");
    expect(section(container).textContent).not.toContain("No link");
    expect(section(container).querySelector('a[href="/nowhere"]')).toBeNull();
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

  it("renders the subheading between the headline and the buttons", () => {
    const { getByRole, getByText } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const h1 = getByRole("heading", { level: 1 });
    const sub = getByText("A placeholder for a sentence to come.");
    expect(sub.tagName).toBe("P");
    const first = getByRole("link", { name: "Properties" });
    expect(h1.compareDocumentPosition(sub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sub.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no empty <p> for a null, empty or blank subheading", () => {
    for (const subheading of [null, "", "   "]) {
      const { container, getByRole, unmount } = render(HomeHero, {
        props: { slice: homeHeroFixture({ subheading } as never) },
      });
      const band = section(container).querySelector("[data-nav-gate]")!;
      // The headline and the buttons are still there: only the sentence went.
      expect(band.querySelector("h1"), String(subheading)).not.toBeNull();
      expect(getByRole("link", { name: "Properties" }), String(subheading)).toBeTruthy();
      expect(getByRole("link", { name: "Contact us" }), String(subheading)).toBeTruthy();
      for (const p of band.querySelectorAll("p"))
        expect(p.textContent?.trim(), String(subheading)).not.toBe("");
      unmount();
    }
  });

  it("renders nothing of the specialty fields a stale document still carries", () => {
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
    const { container, getByRole } = render(HomeHero, { props: { slice: stale } });
    expect(getByRole("heading", { level: 1 })).toBeTruthy();
    expect(section(container).textContent).not.toMatch(/specialty|Consulting and brokerage/i);
  });

  it("stamps the slice attributes, the pin and the nav gate", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const root = section(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    const pin = root.querySelector("[data-home-hero-pin]")!;
    // The pin is motion-safe ONLY (#38): under `prefers-reduced-motion: reduce`
    // the hero is `relative` and leaves with the page, like the photo band.
    expect(pin.className.split(/\s+/), "no unconditional pin").not.toContain("sticky");
    // #18 measures "band rect vs bar rect" against this attribute.
    expect(root.querySelector("[data-nav-gate]")).not.toBeNull();
  });

  it("draws the cutout as a decorative vector", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    const cutout = container.querySelector<SVGElement>("[data-home-hero-cutout]")!;
    expect(cutout.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders no <img> and no preload without a poster", () => {
    const { container } = render(HomeHero, { props: { slice: homeHeroFixture() } });
    expect(section(container).querySelector("[data-home-hero-pin] img")).toBeNull();
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
    // A LAYER, never a replacement: nothing has played, so no iframe exists.
    expect(container.querySelector("iframe")).toBeNull();
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

  it("with NO slice, still paints the ground the route's navOver claim depends on", () => {
    // nav-over.test.ts reads that ground off a render WITH a slice; this holds
    // the render without one to the same hero.
    const hero = (root: HTMLElement) => [
      root.className,
      root.querySelector("[data-home-hero-pin]")?.className,
    ];
    const withSlice = hero(
      section(render(HomeHero, { props: { slice: homeHeroFixture() } }).container),
    );
    cleanup();
    const { container, queryByRole } = render(HomeHero, { props: { slice: undefined } });
    const root = section(container);
    expect(root).not.toBeNull();
    expect(root.querySelector("[data-home-hero-pin]")).not.toBeNull();
    expect(hero(root)).toEqual(withSlice);
    // No band, so nothing for the gate to wait on and no empty garnet strip.
    expect(root.querySelector("[data-nav-gate]")).toBeNull();
    expect(queryByRole("heading", { name: "" })).toBeNull();
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
    expect(queryByRole("heading", { name: "" })).toBeNull();
    expect(queryByRole("link", { name: "" })).toBeNull();
    for (const p of section(container).querySelectorAll("[data-nav-gate] p"))
      expect(p.textContent?.trim()).not.toBe("");
  });
});

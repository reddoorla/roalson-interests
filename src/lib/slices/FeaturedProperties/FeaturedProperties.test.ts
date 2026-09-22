import { cleanup, render, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  featuredLaunchFixture,
  featuredPickFixture,
  featuredPropertiesFixture,
  stageFeatured,
} from "$lib/home-fixture";
import { components } from "$lib/slices";
import FeaturedProperties from "./index.svelte";

// jsdom resolves no stylesheet and has no `inert`, no layout and no animation
// frames worth trusting: where the chrome SITS, that the slide turns, and that
// Pause holds it are tests/interaction/featured-properties.spec.ts's. What is
// checked here is what the markup says — the three states, what each slide
// carries, and the one structural promise the carousel's contract asks of its
// consumer: no control inside a slide.

/** Motion allowed unless a test says otherwise — the pause control only exists
 *  where rotation is possible. */
const motion = (reduce: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

beforeEach(() => motion(false));
afterEach(cleanup);

const band = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slice-type="featured_properties"]')!;
const card = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-featured-card]")!;
const slidesOf = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>("[data-featured-slide]"),
];

describe("FeaturedProperties slice", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.featured_properties).toBe(FeaturedProperties);
  });

  describe("with the comp's three listings", () => {
    it("is a carousel named by its own visible heading — an h2 drawn as the H4 eyebrow", () => {
      const { container, getByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const heading = getByRole("heading", { level: 2 });
      expect(heading.textContent).toBe("Featured Properties");
      expect(heading.className).toContain("t-h4");

      const region = card(container);
      expect(region.getAttribute("role")).toBe("region");
      expect(region.getAttribute("aria-roledescription")).toBe("carousel");
      expect(region.getAttribute("aria-labelledby")).toBe(heading.id);
      // ONE landmark carries the name: the <section> stands down for the region.
      expect(band(container).hasAttribute("aria-labelledby")).toBe(false);
      expect(band(container).dataset.featuredShown).toBe("3");
    });

    it("draws each listing as one slide: photo, size line, h3 title, bullets, LEARN MORE", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const slides = slidesOf(container);
      expect(slides.map((s) => s.getAttribute("aria-label"))).toEqual([
        "1 of 3",
        "2 of 3",
        "3 of 3",
      ]);
      for (const s of slides) {
        expect(s.getAttribute("role")).toBe("group");
        expect(s.getAttribute("aria-roledescription")).toBe("slide");
      }

      const second = within(slides[1]);
      expect(second.getByRole("heading", { level: 3, hidden: true }).textContent).toBe(
        "101 W. Commerce Street",
      );
      expect(second.getByText("7,863 SF").className).toContain("t-h4");
      expect(second.getAllByRole("listitem", { hidden: true })).toHaveLength(2);
      const link = second.getByRole("link", { hidden: true });
      expect(link.getAttribute("href")).toBe("/properties/101-w-commerce-street");
      // "Learn more" three times over is three identical link names; the
      // suffix is what tells them apart to a screen reader's links list.
      expect(link.textContent?.replace(/\s+/g, " ").trim()).toBe(
        "Learn more about 101 W. Commerce Street",
      );
      expect(link.querySelector(".sr-only")?.textContent).toBe("about 101 W. Commerce Street");
    });

    it("holds every photo in the comp's 928 : 542 box, lazy, with the editor's alt text", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const images = [...container.querySelectorAll("img")];
      expect(images).toHaveLength(3);
      for (const img of images) {
        expect(img.getAttribute("loading")).toBe("lazy");
        expect(img.getAttribute("sizes")).toBe("(min-width: 1024px) 65vw, 100vw");
        expect(img.className).toContain("object-cover");
        expect(img.parentElement!.className).toContain("aspect-[928/542]");
        // Intrinsic size on the element: the box is reserved before the bytes land.
        expect(img.getAttribute("width")).toBe("1856");
        expect(img.getAttribute("height")).toBe("1084");
      }
      expect(images[0].getAttribute("alt")).toBe(
        "Drawing standing in for the photo of 25331 IH 10 West",
      );
    });

    it("puts only slide 1 on stage; the rest are out of the tab order and out of the stack", () => {
      // NOT "in the server's markup" — this renders in jsdom, where effects
      // run and `hydrated` is already true. What the SERVER sends is asserted
      // in the browser, with scripting off, in
      // tests/interaction/featured-properties.spec.ts.
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const [first, ...rest] = slidesOf(container);
      expect(first.hasAttribute("aria-hidden")).toBe(false);
      expect(first.hasAttribute("inert")).toBe(false);
      expect(first.className).toContain("visible");
      for (const s of rest) {
        expect(s.getAttribute("aria-hidden")).toBe("true");
        // jsdom has no `inert` PROPERTY, so the spread writes the attribute.
        expect(s.hasAttribute("inert") || (s as unknown as { inert: boolean }).inert).toBe(true);
        expect(s.className).toContain("pointer-events-none");
        // …and out of the paint: an off-stage slide left at opacity 0 still
        // covers the card, which is what made axe answer `bgOverlap` instead
        // of a contrast ratio for six of the card's seven text nodes.
        expect(s.className).toContain("invisible");
      }
    });

    it("keeps every control OUTSIDE the slides, and Pause first among them (#34)", () => {
      // The carousel's contract: a slide that turns away goes inert, and a
      // button inside it would turn its own slide from under the focus it
      // holds — the browser drops that focus on <body>. The comp DRAWS the
      // arrows inside the card's panel; they get there by grid placement.
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const buttons = [...card(container).querySelectorAll("button")];
      expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
        "Pause slides",
        "Previous slide",
        "Next slide",
      ]);
      for (const b of buttons) expect(b.closest("[data-featured-slide]")).toBeNull();
      expect(container.querySelector("[data-featured-slide] button")).toBeNull();
      expect(container.querySelector("[data-featured-slide] [data-carousel-progress]")).toBeNull();

      // …and BEFORE the slides in the DOM, so Pause is the first stop on the
      // way in (APG) and LEARN MORE comes after the controls.
      const firstSlide = slidesOf(container)[0];
      for (const b of buttons)
        expect(
          b.compareDocumentPosition(firstSlide) & Node.DOCUMENT_POSITION_FOLLOWING,
          b.getAttribute("aria-label")!,
        ).toBeTruthy();
    });

    it("has a timed bar and a live region that stays quiet while the clock is driving", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const bar = container.querySelector<HTMLElement>("[data-carousel-progress]")!;
      expect(bar.dataset.carouselProgress).toBe("timed");
      expect(bar.getAttribute("aria-hidden")).toBe("true");
      const live = card(container).querySelector("[aria-live]")!;
      expect(live.textContent).toBe("Slide 1 of 3");
      expect(live.className).toContain("sr-only");
    });

    it("under reduced motion there is no Pause to press, and the bar shows position", () => {
      motion(true);
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      expect(
        [...card(container).querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
      ).toEqual(["Previous slide", "Next slide"]);
      expect(
        container.querySelector<HTMLElement>("[data-carousel-progress]")!.dataset.carouselProgress,
      ).toBe("position");
    });
  });

  describe("with ONE showable listing — launch day", () => {
    it("is a plain card: no carousel roles, no arrows, no bar, no live region", () => {
      const { container, getByRole } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      const region = card(container);
      expect(region.hasAttribute("role")).toBe(false);
      expect(region.hasAttribute("aria-roledescription")).toBe(false);
      expect(container.querySelectorAll("button")).toHaveLength(0);
      expect(container.querySelector("[data-carousel-progress]")).toBeNull();
      expect(container.querySelector("[aria-live]")).toBeNull();

      const [only, ...others] = slidesOf(container);
      expect(others).toHaveLength(0);
      // Not "1 of 1", not a group, and never hidden.
      for (const attr of ["role", "aria-label", "aria-roledescription", "aria-hidden", "inert"])
        expect(only.hasAttribute(attr), attr).toBe(false);

      // The name moves to the <section>, so the band is still a named landmark.
      const heading = getByRole("heading", { level: 2 });
      expect(band(container).getAttribute("aria-labelledby")).toBe(heading.id);
      expect(band(container).dataset.featuredPicked).toBe("3");
      expect(band(container).dataset.featuredShown).toBe("1");
    });

    it("grows for the live listing's five bullets rather than clipping them", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      expect(container.querySelectorAll("li")).toHaveLength(5);
      // No fixed height anywhere on the slide's text: the comp's 285 is a MINIMUM
      // held by the chrome column, and a fifth bullet line would overflow it.
      const text = container.querySelector("h3")!.parentElement!.parentElement!;
      expect(text.className).not.toMatch(/(^|\s)(lg:)?h-\[/);
      expect(text.className).not.toContain("overflow-hidden");
    });
  });

  describe("with nothing showable", () => {
    it("draws NO band — and says why on a hidden marker", () => {
      const slices = stageFeatured([featuredPropertiesFixture()], "none");
      const { container, queryByRole } = render(FeaturedProperties, {
        props: { slice: slices[0] },
      });
      const marker = band(container);
      expect(marker.hidden).toBe(true);
      expect(marker.children).toHaveLength(0);
      expect(queryByRole("heading")).toBeNull();
      expect(container.querySelector("a")).toBeNull();
      // Two picks, both photo-less: an EDITORIAL empty, not an API one.
      expect(marker.dataset.featuredPicked).toBe("2");
      expect(marker.dataset.featuredShown).toBe("0");
      expect(marker.dataset.featuredUnembedded).toBe("0");
    });

    it("tells an API that embedded nothing apart from an editor who picked badly", () => {
      const bare = (uid: string) => featuredPickFixture(uid, `id-${uid}`, {}, { data: undefined });
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ properties: [bare("a"), bare("b")] }) },
      });
      const marker = band(container);
      expect(marker.hidden).toBe(true);
      expect(marker.dataset.featuredPicked).toBe("2");
      expect(marker.dataset.featuredUnembedded).toBe("2");
    });

    it("is the same for a slice with no rows at all", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ properties: [] }) },
      });
      expect(band(container).hidden).toBe(true);
      expect(band(container).dataset.featuredPicked).toBe("0");
    });
  });

  it("falls back to the comp's words when the heading is left empty — the region needs a name", () => {
    for (const heading of ["", "   ", null]) {
      const { getByRole, unmount } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ heading } as never) },
      });
      expect(getByRole("heading", { level: 2 }).textContent).toBe("Featured Properties");
      unmount();
    }
  });

  it("reserves the map's column from lg with nothing in it — no fill, no pins, not in the a11y tree", () => {
    const { container } = render(FeaturedProperties, {
      props: { slice: featuredPropertiesFixture() },
    });
    const slot = container.querySelector<HTMLElement>("[data-map-slot]")!;
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    expect(slot.children).toHaveLength(0);
    const classes = slot.className.split(/\s+/);
    expect(classes).toContain("hidden");
    expect(classes).toContain("lg:block");
    // The band's own ground is what shows: a bg-* here is a placeholder drawn.
    expect(classes.filter((c) => /(^|:)(bg|border|from|to)-/.test(c))).toEqual([]);
    expect(band(container).className).toContain("bg-dark");
  });

  describe("the portfolio link", () => {
    // Removed in review on 2026-09-21 and restored by the operator's call the
    // same day, on ONE condition: it goes in the card's own column and never
    // again as a band-wide overlay. Every assertion below is that condition or
    // the reasons the removal gave.
    it("goes to /properties — a path an editor can only TYPE, resolved by cmsHref", () => {
      const { getByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const link = getByRole("link", { name: "Our portfolio" });
      expect(link.getAttribute("href")).toBe("/properties");
    });

    it("is INSIDE the card and outside every slide, and is the band's last link", () => {
      // The condition on the restoration. Inside the card is inside the card's
      // COLUMN — the removal's second reason was that the old one parked a
      // control in the column reserved for the map (#13). Outside every slide
      // is the carousel's contract: a slide that turns away goes `inert`, so a
      // control inside one goes with it (#34).
      for (const slice of [featuredPropertiesFixture(), featuredLaunchFixture()]) {
        const { container, getByRole, unmount } = render(FeaturedProperties, { props: { slice } });
        const link = getByRole("link", { name: "Our portfolio" });
        expect(link.closest("[data-featured-card]")).not.toBeNull();
        expect(link.closest("[data-featured-slide]")).toBeNull();
        expect(link.closest("[data-map-slot]")).toBeNull();
        // "all of them" follows "these three": after the last slide in the DOM.
        const lastSlide = slidesOf(container).at(-1)!;
        expect(
          lastSlide.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        unmount();
      }
    });

    it("is NEVER an overlay — no absolutely positioned ancestor inside the band", () => {
      // THE defect the removal measured: as `lg:absolute lg:inset-0` across the
      // whole band it painted over the card, and axe answered `color-contrast`
      // with `bgOverlap` for the card's words — 1 node measured and 9
      // incomplete at 1440 on the one-listing state, 9 and 0 with it gone.
      // jsdom has no layout, so what is held here is the CLASS that did it; the
      // contrast numbers themselves are the browser spec's.
      const { getByRole } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      const link = getByRole("link", { name: "Our portfolio" });
      for (
        let el: HTMLElement | null = link;
        el && el.dataset.sliceType !== "featured_properties";
        el = el.parentElement
      ) {
        expect(el.className.split(/\s+/).filter((c) => /(^|:)(absolute|fixed)$/.test(c))).toEqual(
          [],
        );
        expect(el.className).not.toContain("inset-0");
      }
    });

    it("is drawn on the CARD's ground, so it wears the tone for a light one", () => {
      // The old one was `cream` because it sat on the band's dark ground. It is
      // on the sand card now (8.87:1, theme-contrast.test.ts) — garnet, which
      // is BrandButton's default and what the slide's LEARN MORE beside it
      // wears.
      const { getByRole } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      const link = getByRole("link", { name: "Our portfolio" });
      expect(link.className).toContain("border-primary");
      expect(link.className).toContain("text-primary");
      expect(link.className).not.toContain("border-background");
    });

    it("is not drawn without BOTH a label and somewhere to go", () => {
      for (const primary of [
        { portfolio_label: "" },
        { portfolio_label: null },
        { portfolio_link: { link_type: "Any" } },
        { portfolio_link: { link_type: "Web", url: "" } },
      ]) {
        const { queryByRole, unmount } = render(FeaturedProperties, {
          props: { slice: featuredPropertiesFixture(primary as never) },
        });
        expect(queryByRole("link", { name: /portfolio/i }), JSON.stringify(primary)).toBeNull();
        unmount();
      }
    });

    it("stays with the band in the one-slide state, and goes with it in the empty one", () => {
      const one = render(FeaturedProperties, { props: { slice: featuredLaunchFixture() } });
      expect(one.getByRole("link", { name: "Our portfolio" })).toBeTruthy();
      one.unmount();
      const none = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ properties: [] }) },
      });
      expect(none.queryByRole("link", { name: "Our portfolio" })).toBeNull();
    });

    it("leaves every OTHER link in the band a slide's own LEARN MORE", () => {
      // What the removal's replacement test promised, kept: the band draws one
      // link of its own and no more, and everything else points at the listing
      // it sits on.
      for (const slice of [featuredPropertiesFixture(), featuredLaunchFixture()]) {
        const { container, unmount } = render(FeaturedProperties, { props: { slice } });
        const links = [...band(container).querySelectorAll("a")];
        expect(links.filter((l) => l.getAttribute("href") === "/properties")).toHaveLength(1);
        for (const link of links.filter((l) => l.getAttribute("href") !== "/properties")) {
          expect(link.closest("[data-featured-slide]"), link.textContent ?? "").not.toBeNull();
          expect(link.getAttribute("href")).toMatch(/^\/properties\/.+/);
        }
        unmount();
      }
    });
  });
});

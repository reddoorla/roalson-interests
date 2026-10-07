import { cleanup, render, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";

import { ARROW_TONES } from "./CarouselArrows.svelte";
import PropertyCard from "./PropertyCard.svelte";
import PropertyListing from "./PropertyListing.svelte";
import { propertyFixture, propertyListingFixture } from "$lib/property-fixture";
import { groupListings } from "$lib/property-listing";
import { sectionPoints } from "$lib/property-map";

afterEach(cleanup);

// Eight cards of accessible-name computation under jsdom: the first test in
// this file carried the cold-start cost past the 5s default and failed on
// time, not on an assertion.
vi.setConfig({ testTimeout: 20_000 });

const sections = () => groupListings(propertyListingFixture());

const CENTRE_ID = "data-centre-id";

const listingSections = () => [
  ...document.querySelectorAll<HTMLElement>("section[aria-labelledby^='listing-']"),
];

/** What only a featured card carries, read off PropertyCard itself rather than
 *  typed: the highlight is whatever the card draws it as, in whatever colour. */
const FEATURED_MARKS = (() => {
  const classesOf = (variant: "featured" | "sand" | "cream") => {
    const target = document.createElement("div");
    const card = mount(PropertyCard, { target, props: { property: propertyFixture(), variant } });
    const classes = target.querySelector("article")!.className.split(/\s+/);
    unmount(card);
    return classes;
  };
  const flat = new Set([...classesOf("sand"), ...classesOf("cream")]);
  return classesOf("featured").filter((c) => c !== "" && !flat.has(c));
})();
const isFeatured = (article: Element) => {
  const classes = article.className.split(/\s+/);
  return FEATURED_MARKS.every((c) => classes.includes(c));
};
/** The listings whose card is featured, in document order. */
const featuredIds = (region: HTMLElement) =>
  [...region.querySelectorAll<HTMLElement>(`[${CENTRE_ID}]`)]
    .filter((li) => isFeatured(li.querySelector("article")!))
    .map((li) => li.dataset.centreId);

describe("PropertyListing", () => {
  it("renders one labelled region per section, headed by an h2 the region is named after", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const regions = listingSections();
    expect(regions.map((r) => r.getAttribute("aria-labelledby"))).toEqual([
      "listing-land",
      "listing-improved",
      "listing-past",
    ]);
    const h2s = getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(["Land", "Improved Properties", "Past Projects"]);
    h2s.forEach((h, i) => expect(h.id).toBe(regions[i].getAttribute("aria-labelledby")));
  });

  it("features only Land's first card once hydrated, and none in Past Projects", () => {
    const groups = sections();
    render(PropertyListing, { props: { sections: groups } });
    const [land, improved, past] = listingSections();
    expect(featuredIds(land!)).toEqual([groups[0]!.properties[0]!.id]);
    expect(featuredIds(improved!)).toEqual([]);
    expect([...past!.querySelectorAll("article")].some(isFeatured)).toBe(false);
  });

  it("links every active listing and none of the past ones", () => {
    const groups = sections();
    render(PropertyListing, { props: { sections: groups } });
    const [land, improved, past] = listingSections();
    const hrefs = (el: HTMLElement) =>
      [...el.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
    for (const [section, group] of [
      [land!, groups[0]!],
      [improved!, groups[1]!],
    ] as const)
      for (const { uid } of group.properties)
        expect(hrefs(section)).toContain(`/properties/${uid}`);
    for (const { uid } of groups[2]!.properties)
      expect(hrefs(past!)).not.toContain(`/properties/${uid}`);
    // The map's picture carries the OpenMapTiles and OpenStreetMap licence
    // links its data requires (`MAP_HOME_CREDIT`, since 2026-09-29).
    for (const section of [land!, improved!])
      expect(
        [...section.querySelectorAll("[data-map-home-credit] a")].map((a) =>
          a.getAttribute("href"),
        ),
      ).toEqual(
        expect.arrayContaining([
          "https://www.openmaptiles.org/",
          "https://www.openstreetmap.org/copyright",
        ]),
      );
  });

  it("puts a map in every active section, one link per pin, and none in Past Projects (#13)", () => {
    render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, past] = listingSections();
    for (const [name, section, pins] of [
      ["land", land!, 4],
      ["improved", improved!, 2],
    ] as const) {
      const map = section.querySelector<HTMLElement>("[data-property-map]");
      expect(map, `${name} has a map`).not.toBeNull();
      expect(map!.querySelectorAll("[data-map-link]"), `${name}: one link per pin`).toHaveLength(
        pins,
      );
    }
    expect(past!.querySelector("[data-property-map]"), "Past Projects gets no map").toBeNull();
  });

  // THE PRE-MEASUREMENT VALUE IS A CSS EXPRESSION, NOT A NUMBER, and which
  // expression depends on whether that section's divider pins. jsdom has no
  // ResizeObserver and no layout, so this is exactly what a server render and
  // a no-JS browser get — the state that used to ship a flat `100px` and put
  // a pinned section's map 45.41px behind its own opaque divider.
  it("serves a sticky offset that is already correct with no script at all", () => {
    render(PropertyListing, { props: { sections: sections() } });
    const [land, improved] = listingSections();
    const gridOf = (section: HTMLElement) =>
      section.querySelector<HTMLElement>("[data-property-map]")!.parentElement!;

    // Section 0 pins no divider: its map lands on the scrollport's own
    // declared usable top.
    expect(gridOf(land!).style.getPropertyValue("--sticky-top")).toBe("var(--usable-top)");
    // Every later section does: its map lands on the DIVIDER, whose height
    // app.css derives from the divider's own declared parts.
    // (`--listing-pinned-top` first: app.css's override for a section dressed
    // as section 0, unset everywhere else.)
    expect(gridOf(improved!).style.getPropertyValue("--sticky-top")).toBe(
      "var(--listing-pinned-top, var(--listing-divider-top))",
    );
    // Never missing, whichever it is — a missing variable makes `top` resolve
    // to `auto` and the map never pins at all.
    for (const section of [land!, improved!])
      expect(gridOf(section).style.getPropertyValue("--sticky-top")).not.toBe("");
  });

  // …AND `measure()` REALLY DOES OVERRIDE IT. The assertion above is about the
  // fallback, and a fallback assertion survives deleting the measurement
  // entirely — which is what the version of this test it replaces did: it read
  // `"100px"`, the `?? UNMEASURED_TOP` branch, and stayed green with
  // `measure()`, the ResizeObserver effect and `stickyTops` all removed.
  //
  // So this one gives jsdom the two things it lacks — a ResizeObserver that
  // fires, and dividers with a real height — and asserts the variable becomes
  // that height. Delete `measure()` and it reads `var(--listing-divider-top)`
  // instead of `145.4px`.
  it("replaces the fallback with the divider's real height once it can measure one", async () => {
    const DIVIDER_HEIGHT = 145.4;
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(public cb: ResizeObserverCallback) {
          observers.push(cb);
        }
        observe() {
          this.cb([], this as never);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    // Only the divider is given a box: `measure()` reads section i's FIRST
    // child, and reporting a height for everything would not tell us it read
    // the right element.
    const realRect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const isDivider =
        this.parentElement?.matches("section[aria-labelledby^='listing-']") === true &&
        this.parentElement.firstElementChild === this;
      if (isDivider) return { ...realRect.call(this), height: DIVIDER_HEIGHT } as DOMRect;
      return realRect.call(this);
    });
    // …and pinned, as `lg:sticky` makes it in a browser: jsdom applies no
    // Tailwind, and `measure()` only reads a divider that pins.
    const realStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
      const style = realStyle(el, pseudo);
      const isDivider =
        el.parentElement?.matches("section[aria-labelledby^='listing-']") === true &&
        el.parentElement.firstElementChild === el;
      return isDivider
        ? (new Proxy(style, {
            get: (t, k) => (k === "position" ? "sticky" : Reflect.get(t, k)),
          }) as CSSStyleDeclaration)
        : style;
    });

    try {
      render(PropertyListing, { props: { sections: sections() } });
      await tick();
      for (const cb of observers) cb([], null as never);
      await tick();

      const [land, improved] = listingSections();
      const gridOf = (section: HTMLElement) =>
        section.querySelector<HTMLElement>("[data-property-map]")!.parentElement!;

      // The pinned section's offset is now the MEASURED height.
      expect(gridOf(improved!).style.getPropertyValue("--sticky-top")).toBe(`${DIVIDER_HEIGHT}px`);
      // And section 0's is not, because its divider deliberately does not pin —
      // so this also proves `measure()` read the divider and not just any box.
      expect(gridOf(land!).style.getPropertyValue("--sticky-top")).not.toBe(`${DIVIDER_HEIGHT}px`);
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("does not take a measured divider's height when the divider does not pin (Improved under its own view)", async () => {
    const DIVIDER_HEIGHT = 145.4;
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(public cb: ResizeObserverCallback) {
          observers.push(cb);
        }
        observe() {
          this.cb([], this as never);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    // Only the divider is given a box: `measure()` reads section i's FIRST
    // child, and reporting a height for everything would not tell us it read
    // the right element.
    const realRect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const isDivider =
        this.parentElement?.matches("section[aria-labelledby^='listing-']") === true &&
        this.parentElement.firstElementChild === this;
      if (isDivider) return { ...realRect.call(this), height: DIVIDER_HEIGHT } as DOMRect;
      return realRect.call(this);
    });
    // …and NOT pinned, as app.css makes Improved's under its own view.
    const realStyle = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
      const style = realStyle(el, pseudo);
      const isDivider =
        el.parentElement?.matches("section[aria-labelledby^='listing-']") === true &&
        el.parentElement.firstElementChild === el;
      return isDivider
        ? (new Proxy(style, {
            get: (t, k) => (k === "position" ? "static" : Reflect.get(t, k)),
          }) as CSSStyleDeclaration)
        : style;
    });

    try {
      render(PropertyListing, { props: { sections: sections() } });
      await tick();
      for (const cb of observers) cb([], null as never);
      await tick();

      const [, improved] = listingSections();
      const gridOf = (section: HTMLElement) =>
        section.querySelector<HTMLElement>("[data-property-map]")!.parentElement!;

      // Dressed as section 0's (app.css, MarkUp 2026-10-01), so what the
      // divider measures is not what is pinned over its map.
      expect(gridOf(improved!).style.getPropertyValue("--sticky-top")).not.toBe(
        `${DIVIDER_HEIGHT}px`,
      );
      // Where exactly is the browser's to say: jsdom declares no usable top.
      // tests/interaction/listing-view-first.spec.ts measures it equal to
      // Land's.
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it("keys every card by its listing id, as the pins are", () => {
    const groups = sections();
    render(PropertyListing, { props: { sections: groups } });
    const [land, improved, past] = listingSections();
    for (const [name, section, group] of [
      ["land", land!, groups[0]!],
      ["improved", improved!, groups[1]!],
    ] as const) {
      // Read through the ACTION's own constant, so the attribute the markup
      // writes and the attribute the observer looks for cannot drift apart.
      const marked = [...section.querySelectorAll<HTMLElement>(`[${CENTRE_ID}]`)];
      expect(marked.every((li) => li.tagName === "LI")).toBe(true);
      // The id is the LISTING's — the same key `sectionPoints` gives its pins,
      // which is the whole reason the map can match an active id to a marker.
      expect(
        marked.map((li) => li.dataset.centreId),
        `${name}: one per card, keyed as the pins are`,
      ).toEqual(group.properties.map((p) => p.id));
      expect(
        sectionPoints(group.properties).every((pin) =>
          marked.some((li) => li.dataset.centreId === pin.id),
        ),
      ).toBe(true);
    }
    // Past Projects has no map, so nothing drives anything there.
    expect(past!.querySelectorAll(`[${CENTRE_ID}]`)).toHaveLength(0);
  });

  it("marks the pin of a section's only listing active once hydrated", async () => {
    const one = sections()
      .filter((s) => !s.past)
      .map((s) => ({ ...s, properties: s.properties.slice(0, 1) }));
    render(PropertyListing, { props: { sections: one } });
    await tick();
    const [land] = listingSections();
    const id = one[0]!.properties[0]!.id;
    expect(
      land!.querySelector(`[data-map-home-pin="${id}"]`),
      "premise: its pin is drawn",
    ).not.toBeNull();
    expect(land!.querySelector(`[data-map-home-pin="${id}"][data-map-active]`)).not.toBeNull();
  });

  it("says so, rather than rendering nothing, when there are no listings", () => {
    const { getByText, queryAllByRole } = render(PropertyListing, { props: { sections: [] } });
    expect(getByText(/No properties are listed/)).not.toBeNull();
    expect(queryAllByRole("region")).toEqual([]);
  });
});

describe("PropertyListing below lg: each section a carousel (#14)", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A window below `lg`, and the switch to rotate it past the breakpoint. The
   *  component asks for `(width < 64rem)` by name; anything else is false —
   *  notably `prefers-reduced-motion`. */
  function phone() {
    const QUERY = "(width < 64rem)";
    let below = true;
    const listeners = new Set<(e: { matches: boolean }) => void>();
    vi.stubGlobal("matchMedia", (media: string) => ({
      get matches() {
        return media === QUERY ? below : false;
      },
      media,
      onchange: null,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        if (media === QUERY) listeners.add(cb);
      },
      removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) =>
        listeners.delete(cb),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    return {
      async set(value: boolean) {
        below = value;
        for (const cb of [...listeners]) cb({ matches: value });
        await tick();
      },
    };
  }

  const carousels = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>('[aria-roledescription="carousel"]'),
  ];
  /** The one slide in the accessibility tree, as its listing id. Throws on
   *  none or two, so "slide 2 is on stage" cannot pass on a carousel exposing
   *  both. */
  const onStage = (carousel: HTMLElement) => {
    const shown = [...carousel.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')]
      .filter((s) => s.getAttribute("aria-hidden") === null)
      .map((s) => s.dataset.centreId ?? s.querySelector("h3")!.textContent!.trim());
    if (shown.length !== 1) throw new Error(`${shown.length} slides exposed, expected 1`);
    return shown[0];
  };

  it("is a named carousel per section once hydrated, one card exposed, the rest inert", async () => {
    phone();
    const groups = sections();
    const { container } = render(PropertyListing, { props: { sections: groups } });
    await tick();

    const all = carousels(container);
    expect(all.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Land listings",
      "Improved Properties listings",
      "Past Projects listings",
    ]);
    all.forEach((carousel, i) => {
      const slides = [...carousel.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')];
      expect(slides, `section ${i}: one slide per listing`).toHaveLength(
        groups[i]!.properties.length,
      );
      expect(slides.map((s) => s.tagName)).toEqual(slides.map(() => "LI"));
      expect(slides[0]!.getAttribute("aria-label")).toBe(`1 of ${slides.length}`);
      expect(slides.slice(1).every((s) => s.hasAttribute("inert"))).toBe(true);
      expect(/\binvisible\b/.test(slides[0]!.className)).toBe(false);
      // The list stops being one: its items are slides and controls now.
      expect(carousel.querySelector("ul")!.getAttribute("role")).toBe("none");
      expect(
        [...carousel.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
      ).toEqual(expect.arrayContaining(["Previous slide", "Next slide"]));
      expect(carousel.querySelector("[data-carousel-progress]")).not.toBeNull();
      expect(carousel.querySelector("[aria-live]")!.textContent).toBe(
        `Slide 1 of ${slides.length}`,
      );
    });
  });

  it("keeps the controls OUT of the slides", async () => {
    phone();
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    await tick();
    for (const carousel of carousels(container)) {
      const controls = [
        within(carousel).getByRole("button", { name: "Previous slide" }),
        within(carousel).getByRole("button", { name: "Next slide" }),
        carousel.querySelector("[data-carousel-progress]")!,
      ];
      for (const control of controls) {
        expect(control.closest('[aria-roledescription="slide"]')).toBeNull();
      }
    }
  });

  it("turns with its arrows, counts in the bar and the live region, and wraps", async () => {
    phone();
    const groups = sections();
    const { container } = render(PropertyListing, { props: { sections: groups } });
    await tick();
    const [land] = carousels(container);
    const ids = groups[0]!.properties.map((p) => p.id);
    const next = within(land!).getByRole("button", { name: "Next slide" });
    const bar = () =>
      land!.querySelector<HTMLElement>("[data-carousel-fill]")!.getAttribute("style");

    expect(onStage(land!)).toBe(ids[0]);
    expect(bar()).toContain("scaleX(0.25)");
    next.click();
    await tick();
    expect(onStage(land!)).toBe(ids[1]);
    expect(bar()).toContain("scaleX(0.5)");
    expect(land!.querySelector("[aria-live]")!.textContent).toBe("Slide 2 of 4");

    within(land!).getByRole("button", { name: "Previous slide" }).click();
    within(land!).getByRole("button", { name: "Previous slide" }).click();
    await tick();
    expect(onStage(land!), "back past the first is the last").toBe(ids[3]);
  });

  it("puts the arrows in the tone of the card on stage, with a ring that shows on it", async () => {
    phone();
    const groups = sections();
    const { container } = render(PropertyListing, { props: { sections: groups } });
    await tick();
    for (const [k, carousel] of carousels(container).entries()) {
      const next = within(carousel).getByRole("button", { name: "Next slide" });
      const row = next.closest("li")!;
      const seen = new Set<Element>();
      for (const [j] of groups[k]!.properties.entries()) {
        const card = carousel.querySelector(
          '[aria-roledescription="slide"]:not([aria-hidden]) article',
        )!;
        seen.add(card);
        const featured = isFeatured(card);
        const where = `section ${k}, slide ${j + 1}`;
        expect(
          next.className,
          `${where}: ${featured ? "cream on the featured card" : "garnet"}`,
        ).toContain(featured ? ARROW_TONES.cream : ARROW_TONES.garnet);
        expect(
          row.className.includes("--focus-ring"),
          `${where}: ring override only on the featured card`,
        ).toBe(featured);
        next.click();
        await tick();
      }
      expect(seen.size, `section ${k}: every card came on stage`).toBe(
        groups[k]!.properties.length,
      );
    }
  });

  it("keeps the active sections carousels from lg, beside their maps, and lays Past Projects out as a grid", async () => {
    const media = phone();
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    await tick();
    expect(carousels(container)).toHaveLength(3);

    await media.set(false);
    const lists = [...container.querySelectorAll<HTMLElement>("[data-listing-carousel]")];
    expect(lists).toHaveLength(3);
    expect(carousels(container).map((c) => c.getAttribute("aria-label"))).toEqual([
      "Land listings",
      "Improved Properties listings",
    ]);
    for (const list of lists.slice(2)) {
      expect(
        list.querySelector("[inert], [aria-roledescription], ul[role], .invisible"),
      ).toBeNull();
      expect(within(list).queryAllByRole("button", { name: /slide/i })).toEqual([]);
    }

    await media.set(true);
    expect(carousels(container)).toHaveLength(3);
  });

  it("lands a restore for a panel that only becomes a carousel later, within the window", async () => {
    const media = phone();
    await media.set(false);
    const groups = sections();
    const view = render(PropertyListing, { props: { sections: groups } });
    await tick();
    const pastId = groups[2]!.properties[1]!.id;
    view.component.restore({ past: pastId });
    await media.set(true);
    const past = carousels(view.container)[2]!;
    const second = past
      .querySelectorAll('[aria-roledescription="slide"]')[1]!
      .querySelector("h3")!
      .textContent!.trim();
    expect(onStage(past)).toBe(second);
  });

  it("drops a restore that could not land within a second", async () => {
    const media = phone();
    await media.set(false);
    const groups = sections();
    const view = render(PropertyListing, { props: { sections: groups } });
    await tick();
    const clock = vi.spyOn(performance, "now");
    clock.mockReturnValue(0);
    view.component.restore({ past: groups[2]!.properties[1]!.id });
    clock.mockReturnValue(1500);
    await media.set(true);
    clock.mockRestore();
    const past = carousels(view.container)[2]!;
    expect(past.querySelector('[aria-roledescription="slide"]:not([aria-hidden])')).toBe(
      past.querySelectorAll('[aria-roledescription="slide"]')[0],
    );
  });

  it("is never a carousel for one listing", async () => {
    phone();
    const one = sections().map((s) => ({ ...s, properties: s.properties.slice(0, 1) }));
    const { container } = render(PropertyListing, { props: { sections: one } });
    await tick();
    expect(carousels(container)).toHaveLength(0);
    for (const list of container.querySelectorAll<HTMLElement>("[data-listing-carousel]"))
      expect(within(list).queryAllByRole("button", { name: /slide/i })).toEqual([]);
  });
});

describe("PropertyListing snapshot", () => {
  const onStage = (section: HTMLElement) =>
    section.querySelector<HTMLElement>('[aria-roledescription="slide"]:not([aria-hidden])')!.dataset
      .centreId;

  it("captures each panel's listing and restores it into a fresh page", async () => {
    const groups = sections();
    const first = render(PropertyListing, { props: { sections: groups } });
    await tick();
    const [land] = listingSections();
    within(land!).getByRole("button", { name: "Next slide" }).click();
    within(land!).getByRole("button", { name: "Next slide" }).click();
    await tick();
    const saved = first.component.capture();
    expect(saved.land).toBe(groups[0]!.properties[2]!.id);
    first.unmount();

    const second = render(PropertyListing, { props: { sections: groups } });
    await tick();
    second.component.restore(saved);
    await tick();
    expect(onStage(listingSections()[0]!)).toBe(groups[0]!.properties[2]!.id);
  });

  it("finds the listing it saved even when the list has changed under it", async () => {
    const groups = sections();
    const saved = { land: groups[0]!.properties[1]!.id };
    const reordered = groups.map((g, i) =>
      i === 0 ? { ...g, properties: [...g.properties].reverse() } : g,
    );
    const view = render(PropertyListing, { props: { sections: reordered } });
    await tick();
    view.component.restore(saved);
    await tick();
    expect(onStage(listingSections()[0]!)).toBe(saved.land);
  });
});

describe("PropertyListing view tabs", () => {
  afterEach(() => history.replaceState(null, "", location.pathname));

  const tabs = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLAnchorElement>("[data-view-tab]"),
  ];
  const currentTab = (container: HTMLElement) =>
    tabs(container)
      .filter((a) => a.getAttribute("aria-current") === "true")
      .map((a) => a.dataset.viewTab);

  it("links Land, Improved Properties, All and List to their fragments, in that order, in a named group", () => {
    const { container, getByRole } = render(PropertyListing, { props: { sections: sections() } });
    expect(getByRole("group", { name: "Show listings" })).not.toBeNull();
    expect(tabs(container).map((a) => a.getAttribute("href"))).toEqual([
      "#land",
      "#improved",
      "#all",
      "#list",
    ]);
    expect(tabs(container).map((a) => a.textContent?.trim())).toEqual([
      "Land",
      "Improved Properties",
      "All",
      "List",
    ]);
  });

  it("keeps every section in the DOM, each active one marked with its view", () => {
    render(PropertyListing, { props: { sections: sections() } });
    const regions = listingSections();
    expect(regions.map((r) => r.dataset.viewSection ?? null)).toEqual(["land", "improved", null]);
    expect(regions[2].hasAttribute("data-past")).toBe(true);
  });

  // A visible target would be scrolled to by every tab press.
  it("puts the fragment targets, hidden, between the tab row and the first section", () => {
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    const targets = [...container.querySelectorAll<HTMLElement>("[data-view-target]")];
    expect(targets.map((t) => t.id)).toEqual(["land", "improved", "all", "list"]);
    expect(targets.every((t) => t.hidden)).toBe(true);
    const group = container.querySelector('[role="group"]')!;
    const firstSection = container.querySelector("section")!;
    for (const t of targets) {
      expect(group.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        t.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("starts on All, follows the fragment, and ignores a fragment that names no view", async () => {
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    const root = container.querySelector<HTMLElement>("[data-listing]")!;
    await tick();
    expect(currentTab(container)).toEqual(["all"]);
    expect(root.dataset.view).toBe("all");

    location.hash = "#improved";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await tick();
    expect(currentTab(container)).toEqual(["improved"]);
    expect(root.dataset.view).toBe("improved");

    // The skip link.
    location.hash = "#main-content";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await tick();
    expect(root.dataset.view).toBe("improved");
  });

  it("makes the shown section's first card garnet under its own view, as Land's is", async () => {
    const groups = sections();
    location.hash = "#improved";
    render(PropertyListing, { props: { sections: groups } });
    await tick();
    const [land, improved] = listingSections();
    expect(featuredIds(improved!)).toEqual([groups[1]!.properties[0]!.id]);
    expect(featuredIds(land!)).toEqual([groups[0]!.properties[0]!.id]);
    const next = within(improved!).getByRole("button", { name: "Next slide" });
    expect(next.className, "the arrows take the garnet card's cream").toContain(ARROW_TONES.cream);

    location.hash = "#all";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await tick();
    expect(featuredIds(improved!), "under All only Land leads").toEqual([]);
  });

  it("draws only All and List with one active section", () => {
    const improvedOnly = sections().filter((s) => s.id !== "land");
    const { container } = render(PropertyListing, { props: { sections: improvedOnly } });
    expect(tabs(container).map((a) => a.dataset.viewTab)).toEqual(["all", "list"]);
  });

  it("draws no tab row with one active section of one listing", () => {
    const improved = sections().find((s) => s.id === "improved")!;
    const one = [{ ...improved, properties: improved.properties.slice(0, 1) }];
    const { container, queryByRole } = render(PropertyListing, { props: { sections: one } });
    expect(queryByRole("group", { name: "Show listings" })).toBeNull();
    expect(container.querySelectorAll("[data-view-target]")).toHaveLength(0);
  });

  it("under List shows every listing of every active section as a list, not a carousel", async () => {
    const groups = sections();
    location.hash = "#list";
    const { container } = render(PropertyListing, { props: { sections: groups } });
    await tick();
    expect(currentTab(container)).toEqual(["list"]);
    const [land, improved] = listingSections();
    for (const [region, group] of [
      [land!, groups[0]!],
      [improved!, groups[1]!],
    ] as const) {
      expect(within(region).queryByRole("button", { name: "Next slide" })).toBeNull();
      const items = [...region.querySelectorAll<HTMLElement>(`[${CENTRE_ID}]`)];
      expect(items.map((li) => li.getAttribute(CENTRE_ID))).toEqual(
        group.properties.map((p) => p.id),
      );
      for (const li of items) {
        expect(li.tagName).toBe("LI");
        expect(li.parentElement!.getAttribute("role")).toBeNull();
        expect(li.hasAttribute("inert") || li.hidden || li.hasAttribute("aria-hidden")).toBe(false);
      }
      expect(featuredIds(region)).toEqual([group.properties[0]!.id]);
    }
  });

  it("turns the carousels back on when List is left", async () => {
    location.hash = "#list";
    render(PropertyListing, { props: { sections: sections() } });
    await tick();
    const [land] = listingSections();
    expect(within(land!).queryByRole("button", { name: "Next slide" })).toBeNull();
    location.hash = "#all";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await tick();
    expect(within(land!).getByRole("button", { name: "Next slide" })).not.toBeNull();
  });
});

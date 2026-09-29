import { cleanup, render, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "svelte";

import PropertyListing from "./PropertyListing.svelte";
import { CENTRE_BAND, CENTRE_ID } from "$lib/actions/centreWatch";
import { propertyListingFixture } from "$lib/property-fixture";
import { groupListings } from "$lib/property-listing";
import { sectionPoints } from "$lib/property-map";

afterEach(cleanup);

// Eight cards of accessible-name computation under jsdom: the first test in
// this file carried the cold-start cost past the 5s default and failed on
// time, not on an assertion.
vi.setConfig({ testTimeout: 20_000 });

const sections = () => groupListings(propertyListingFixture());

describe("PropertyListing", () => {
  it("renders one labelled region per section, headed by an h2 the region is named after", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const regions = getAllByRole("region");
    expect(regions.map((r) => r.getAttribute("aria-labelledby"))).toEqual([
      "listing-land",
      "listing-improved",
      "listing-past",
    ]);
    const h2s = getAllByRole("heading", { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(["Land", "Improved Projects", "Past Projects"]);
    h2s.forEach((h, i) => expect(h.id).toBe(regions[i].getAttribute("aria-labelledby")));
  });

  it("features only the first card of each active section, and none in Past Projects", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    for (const region of getAllByRole("region")) {
      const cards = [...region.querySelectorAll("article")];
      const garnet = cards.map((c) => /\bbg-primary\b/.test(c.className));
      const past = region.getAttribute("aria-labelledby") === "listing-past";
      expect(garnet).toEqual(cards.map((_, i) => i === 0 && !past));
    }
  });

  it("gives the flat cards the light token their section's ground does not use", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, past] = getAllByRole("region");
    const flat = (region: HTMLElement) =>
      [...region.querySelectorAll("article")].filter((c) => !/\bbg-primary\b/.test(c.className));
    expect(flat(land).every((c) => /\bbg-light\b/.test(c.className))).toBe(true);
    expect(flat(improved).every((c) => /\bbg-background\b/.test(c.className))).toBe(true);
    expect(flat(past).every((c) => /\bbg-background\b/.test(c.className))).toBe(true);
    expect(flat(land).length + flat(improved).length + flat(past).length).toBe(7);
  });

  it("links every active listing and none of the past ones", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, past] = getAllByRole("region");
    // The map's own list is in the section too, one Google Maps link per pin
    // (#13) — the no-JS state PropertyMap server-renders. Excluded here so
    // this stays a statement about the CARDS: it used to read 4 and 2 by
    // counting everything, and would now read 8 and 4 for a reason that has
    // nothing to do with which listing got a link.
    const cards = (el: HTMLElement) =>
      within(el)
        .getAllByRole("link")
        .filter((a) => !a.hasAttribute("data-map-link"));
    expect(cards(land!)).toHaveLength(4);
    expect(cards(improved!)).toHaveLength(2);
    // Past Projects has no map either, so this stays an unqualified none.
    expect(within(past!).queryAllByRole("link")).toEqual([]);
  });

  it("pins every divider but the first, on large screens only, and never the first", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const dividers = getAllByRole("heading", { level: 2 }).map(
      (h) => h.closest("section")!.firstElementChild as HTMLElement,
    );
    expect(dividers.map((d) => /\blg:sticky\b/.test(d.className))).toEqual([false, true, true]);
    expect(dividers.every((d) => !/(^|\s)sticky\b/.test(d.className))).toBe(true);
  });

  it("warms the ground once, at the second section: the first stays on the page ground", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const regions = getAllByRole("region");
    expect(regions.map((r) => /\bbg-light\b/.test(r.className))).toEqual([false, true, true]);
    const strips = regions.map((r) => r.firstElementChild!.firstElementChild as HTMLElement);
    expect(strips.map((s) => /from-background to-light/.test(s.className))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("lays the Past Projects section out as a grid and the active ones as a column beside the map", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, , past] = getAllByRole("region");
    expect(past!.querySelector("ul")!.className).toMatch(/\blg:grid-cols-3\b/);
    // `:not([data-map-list])`: the map is FIRST in the grid, so its own list
    // of Google Maps links is the first <ul> in the section now. Reading
    // `querySelector("ul")` measured that one and said the cards had lost
    // their column.
    const cards = land!.querySelector<HTMLElement>("ul:not([data-map-list])")!;
    // The grid item is the list's carousel wrapper (#14), a plain <div> here:
    // with no script and from `lg` there is no carousel, only the column.
    const column = cards.parentElement!;
    expect(column.hasAttribute("data-listing-carousel")).toBe(true);
    expect(column.className).toMatch(/\blg:col-start-2\b/);
    expect(column.parentElement!.className).toMatch(/lg:grid-cols-\[397fr_847fr\]/);
  });

  it("puts a map in column 1 of every active section and none in Past Projects (#13)", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved, past] = getAllByRole("region");
    for (const [name, section, pins] of [
      ["land", land!, 4],
      ["improved", improved!, 2],
    ] as const) {
      const map = section.querySelector<HTMLElement>("[data-property-map]");
      expect(map, `${name} has a map`).not.toBeNull();
      // Token list, not a `/h-50.*lg:h-\[595px\]/` regex. That regex was here
      // and went red the moment the class string grew past prettier's width
      // and got wrapped: `.` does not cross a newline, and the order of two
      // class names was never the claim anyway.
      const classes = map!.className.split(/\s+/);
      expect(classes, `${name}: the comp's 200 / 595, never stretched`).toContain("h-50");
      // The 595 is declared ONCE, as `--map-height`, because the centring
      // offset needs half of it too (see the next describe's sticky case).
      expect(classes, `${name}: the comp's 200 / 595, never stretched`).toContain(
        "lg:[--map-height:595px]",
      );
      expect(classes, `${name}: the height IS that variable`).toContain("lg:h-(--map-height)");
      expect(map!.className, `${name}: column 1, row 1`).toMatch(/lg:col-start-1/);
      expect(map!.querySelectorAll("[data-map-link]"), `${name}: one link per pin`).toHaveLength(
        pins,
      );
      // It is FIRST, so the comp's 390 order (map, then cards) needs no CSS.
      expect(
        map!.compareDocumentPosition(section.querySelector("article")!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        `${name}: the map precedes the first card`,
      ).toBeTruthy();
    }
    expect(past!.querySelector("[data-property-map]"), "Past Projects gets no map").toBeNull();
  });

  // ── the map pins, and its camera follows the cards ────────────────────────

  it("makes the map sticky from lg only, under the divider rather than over it", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved] = getAllByRole("region");
    for (const [name, section, dividerPins] of [
      // The comp's first divider does not pin, so the first map's offset comes
      // from `scroll-padding-top` and there is no divider z-index to be under.
      ["land", land!, false],
      ["improved", improved!, true],
    ] as const) {
      const map = section.querySelector<HTMLElement>("[data-property-map]")!;
      const classes = map.className.split(/\s+/);
      // Every one of these carries the `lg:` prefix. At 390 the map is a 200px
      // box above the cards and pinning it would spend a quarter of the
      // viewport permanently.
      expect(classes, `${name}: pinned`).toContain("lg:sticky");
      // Centred in the window, never above the measured variable (operator,
      // 2026-09-23: "stick the map in the center of the screen"). Half the
      // map comes from the one `--map-height`, not a second literal 297.5.
      // This is the class string; WHERE it lands is measured in a browser by
      // tests/interaction/property-map-centred.spec.ts.
      expect(classes, `${name}: centred, and floored at the measured variable`).toContain(
        "lg:top-[max(var(--sticky-top),calc(50vh-var(--map-height)/2))]",
      );
      expect(
        classes.filter((c) => /^lg:top-/.test(c)),
        `${name}: one top, not a second one fighting it`,
      ).toHaveLength(1);
      // NO z-index of its own. The divider's `lg:z-10` is what keeps the map
      // under it — a positive z-index paints above every `auto` positioned
      // sibling regardless of tree order — and PropertyMap's root `isolate`
      // keeps the map's internal `z-[1]`..`z-[3]` out of that argument. A
      // `lg:z-0` here shipped first and a browser mutation proved it inert.
      expect(
        classes.some((c) => c.startsWith("lg:z-")),
        `${name}: no z of its own`,
      ).toBe(false);
      // …and the divider that pins really does carry one.
      const divider = section.firstElementChild as HTMLElement;
      expect(divider.className.split(/\s+/).includes("lg:z-10"), `${name}: divider z`).toBe(
        dividerPins,
      );
      // Nothing unprefixed: at 390 none of this applies.
      expect(classes.filter((c) => c === "sticky" || c === "z-0")).toEqual([]);
    }
  });

  // THE PRE-MEASUREMENT VALUE IS A CSS EXPRESSION, NOT A NUMBER, and which
  // expression depends on whether that section's divider pins. jsdom has no
  // ResizeObserver and no layout, so this is exactly what a server render and
  // a no-JS browser get — the state that used to ship a flat `100px` and put
  // a pinned section's map 45.41px behind its own opaque divider.
  it("serves a sticky offset that is already correct with no script at all", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const [land, improved] = getAllByRole("region");
    const gridOf = (section: HTMLElement) =>
      section.querySelector<HTMLElement>("[data-property-map]")!.parentElement!;

    // Section 0 pins no divider: its map lands on the scrollport's own
    // declared usable top.
    expect(gridOf(land!).style.getPropertyValue("--sticky-top")).toBe("var(--usable-top)");
    // Every later section does: its map lands on the DIVIDER, whose height
    // app.css derives from the divider's own declared parts.
    expect(gridOf(improved!).style.getPropertyValue("--sticky-top")).toBe(
      "var(--listing-divider-top)",
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

    try {
      const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
      await tick();
      for (const cb of observers) cb([], null as never);
      await tick();

      const [land, improved] = getAllByRole("region");
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

  it("marks every card with the id the centre rule reports", () => {
    const groups = sections();
    const { getAllByRole } = render(PropertyListing, { props: { sections: groups } });
    const [land, improved, past] = getAllByRole("region");
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

  // ── the garnet card travels with the centre rule ──────────────────────

  /**
   * The centre rule, driven by hand. jsdom has no layout, so what these cases
   * assert is the DECISION this component makes when the rule speaks — whether
   * the browser speaks about the card a reader is actually looking at is a
   * geometry question, measured against an independent box test in
   * tests/interaction/active-card-highlight.spec.ts.
   *
   * THE `rootMargin` FILTER IS LOAD-BEARING, not tidiness. PropertyMap builds
   * an IntersectionObserver of its own to boot MapLibre lazily, so "the
   * observer" is not "the only observer" — an unfiltered `made[0]` picks up
   * whichever component mounted first.
   */
  function centreRule() {
    interface Watcher {
      cb: IntersectionObserverCallback;
      margin?: string;
      seen: Element[];
    }
    const made: Watcher[] = [];
    vi.stubGlobal("matchMedia", (media: string) => ({
      // True for the action's own `(min-width: 1024px)` and false for
      // everything else — notably `prefers-reduced-motion`, which other
      // modules read at import time.
      matches: media.includes("min-width"),
      media,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        rec: Watcher;
        constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          this.rec = { cb, margin: options?.rootMargin, seen: [] };
          made.push(this.rec);
        }
        observe(el: Element) {
          this.rec.seen.push(el);
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
    return {
      /** Report `id` as the card on the line, through the observer that is
       *  really watching that card — which is also the assertion that the
       *  component asked for one. */
      async report(id: string) {
        const target = document.querySelector(`[${CENTRE_ID}="${id}"]`);
        expect(target, `${id} is a watched card`).not.toBeNull();
        const watcher = made.find((o) => o.margin === CENTRE_BAND && o.seen.includes(target!));
        expect(watcher, `a centre observer is watching ${id}`).toBeDefined();
        watcher!.cb(
          [{ target: target!, isIntersecting: true, time: 1 } as IntersectionObserverEntry],
          null as never,
        );
        await tick();
      },
    };
  }

  /** The listings whose card is garnet, in document order. */
  const garnetIds = (region: HTMLElement) =>
    [...region.querySelectorAll<HTMLElement>(`[${CENTRE_ID}]`)]
      .filter((li) => /\bbg-primary\b/.test(li.querySelector("article")!.className))
      .map((li) => li.dataset.centreId);

  it("moves the garnet card to the listing the centre rule reports, and only that one", async () => {
    const rule = centreRule();
    try {
      const groups = sections();
      const { getAllByRole } = render(PropertyListing, { props: { sections: groups } });
      await tick();
      const [land] = getAllByRole("region");

      // Before anything is on the line this is the comp's state, which is also
      // the server's and the phone's.
      expect(garnetIds(land!), "card 0 until the rule speaks").toEqual([
        groups[0]!.properties[0]!.id,
      ]);

      const third = groups[0]!.properties[2]!.id;
      await rule.report(third);
      expect(garnetIds(land!), "exactly one, and it is the reported listing").toEqual([third]);

      // …and it can come back. A highlight that only ever moved forward would
      // pass a test that walked one way.
      const second = groups[0]!.properties[1]!.id;
      await rule.report(second);
      expect(garnetIds(land!)).toEqual([second]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps each section's highlight to itself — `activeIds` is keyed per section", async () => {
    const rule = centreRule();
    try {
      const groups = sections();
      const { getAllByRole } = render(PropertyListing, { props: { sections: groups } });
      await tick();
      const [land, improved, past] = getAllByRole("region");

      await rule.report(groups[0]!.properties[3]!.id);
      // The improved section was not asked about and did not move: a single
      // shared "active" would have dragged its highlight along, or dropped it.
      expect(garnetIds(improved!)).toEqual([groups[1]!.properties[0]!.id]);

      await rule.report(groups[1]!.properties[1]!.id);
      expect(garnetIds(improved!)).toEqual([groups[1]!.properties[1]!.id]);
      expect(garnetIds(land!), "land keeps its own answer").toEqual([groups[0]!.properties[3]!.id]);

      // Past Projects has no map, so `centreWatch` is disabled there and nothing is
      // featured at all — before or after any of this.
      expect(past!.querySelectorAll(`[${CENTRE_ID}]`)).toHaveLength(0);
      expect(
        [...past!.querySelectorAll("article")].some((c) => /\bbg-primary\b/.test(c.className)),
      ).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("re-tones the whole card and not just its ground — the button's tone follows", async () => {
    const rule = centreRule();
    try {
      const groups = sections();
      const { getAllByRole } = render(PropertyListing, { props: { sections: groups } });
      await tick();
      const [land] = getAllByRole("region");
      const linkIn = (id: string) =>
        land!.querySelector<HTMLElement>(`[${CENTRE_ID}="${id}"] article a`)!;

      const [first, third] = [groups[0]!.properties[0]!.id, groups[0]!.properties[2]!.id];
      expect(linkIn(first).className).toMatch(/\bborder-background\b/);

      await rule.report(third);
      // The `tone` prop is not a colour — it is the one part of the card that
      // could silently stay behind while the ground moved.
      expect(linkIn(third).className, "the new card's button went cream").toMatch(
        /\bborder-background\b/,
      );
      expect(linkIn(first).className, "the old one went back to garnet").toMatch(
        /\bborder-primary\b/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
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
   *  notably `prefers-reduced-motion` and centreWatch's `min-width`. */
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

  it("is a named carousel per section once hydrated, one card exposed, the rest inert and invisible", async () => {
    phone();
    const groups = sections();
    const { container } = render(PropertyListing, { props: { sections: groups } });
    await tick();

    const all = carousels(container);
    expect(all.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Land listings",
      "Improved Projects listings",
      "Past Projects listings",
    ]);
    all.forEach((carousel, i) => {
      const slides = [...carousel.querySelectorAll<HTMLElement>('[aria-roledescription="slide"]')];
      expect(slides, `section ${i}: one slide per listing`).toHaveLength(
        groups[i]!.properties.length,
      );
      expect(slides.map((s) => s.tagName)).toEqual(slides.map(() => "LI"));
      expect(slides[0]!.getAttribute("aria-label")).toBe(`1 of ${slides.length}`);
      const off = slides.slice(1);
      expect(off.every((s) => s.hasAttribute("inert") && /\binvisible\b/.test(s.className))).toBe(
        true,
      );
      expect(/\binvisible\b/.test(slides[0]!.className)).toBe(false);
      // The list stops being one: its items are slides and controls now.
      expect(carousel.querySelector("ul")!.getAttribute("role")).toBe("none");
      expect(
        [...carousel.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
      ).toEqual(["Previous slide", "Next slide"]);
      expect(carousel.querySelector("[data-carousel-progress]")).not.toBeNull();
      expect(carousel.querySelector("[aria-live]")!.textContent).toBe(
        `Slide 1 of ${slides.length}`,
      );
    });
  });

  it("keeps the controls OUT of the slides, between the photo and the text", async () => {
    phone();
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    await tick();
    for (const carousel of carousels(container)) {
      for (const control of carousel.querySelectorAll("button, [data-carousel-progress]")) {
        expect(control.closest('[aria-roledescription="slide"]')).toBeNull();
      }
      // Grid rows, by class: the photo is row 1, bar 2, arrows 3, text 4.
      const [bar, arrows] = [...carousel.querySelectorAll("ul > li[role='none']")];
      expect(bar!.className).toMatch(/\brow-start-2\b/);
      expect(arrows!.className).toMatch(/\brow-start-3\b/);
      const card = carousel.querySelector("article")!;
      expect(card.className).toMatch(/\bgrid-rows-subgrid\b/);
      expect(card.firstElementChild!.className).toMatch(/\brow-start-1\b/);
      expect(card.lastElementChild!.className).toMatch(/\brow-start-4\b/);
    }
  });

  it("draws the comp's tones: the first section's first card garnet, and no other", async () => {
    phone();
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    await tick();
    const garnet = carousels(container).map((c) =>
      [...c.querySelectorAll("article")].map((a) => /\bbg-primary\b/.test(a.className)),
    );
    expect(garnet[0]).toEqual([true, false, false, false]);
    expect(garnet[1]!.some(Boolean), "Improved is `regular scroll`: no garnet card").toBe(false);
    expect(garnet[2]!.some(Boolean)).toBe(false);
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

  it("puts the arrows in the card on stage's tone, with a ring that shows on it", async () => {
    phone();
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    await tick();
    const [land] = carousels(container);
    const next = within(land!).getByRole("button", { name: "Next slide" });
    const row = next.closest("li")!;

    expect(next.className, "cream on the garnet card").toMatch(/\bborder-background\b/);
    expect(row.className).toMatch(/\[--focus-ring:var\(--color-background\)\]/);
    next.click();
    await tick();
    expect(next.className, "garnet on the sand card").toMatch(/\bborder-primary\b/);
    expect(row.className).not.toMatch(/--focus-ring/);
  });

  it("is the stacked list again from lg, and a carousel again below it", async () => {
    const media = phone();
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    await tick();
    expect(carousels(container)).toHaveLength(3);

    await media.set(false);
    const lists = [...container.querySelectorAll<HTMLElement>("[data-listing-carousel]")];
    expect(lists).toHaveLength(3);
    expect(carousels(container)).toHaveLength(0);
    for (const list of lists) {
      expect(
        list.querySelector("[inert], [aria-roledescription], ul[role], .invisible"),
      ).toBeNull();
      expect(list.querySelectorAll("button")).toHaveLength(0);
      expect(
        [...list.querySelectorAll("article")].every((a) => /^flex flex-col\b/.test(a.className)),
      ).toBe(true);
    }

    await media.set(true);
    expect(carousels(container)).toHaveLength(3);
  });

  it("is never a carousel for one listing", async () => {
    phone();
    const one = sections().map((s) => ({ ...s, properties: s.properties.slice(0, 1) }));
    const { container } = render(PropertyListing, { props: { sections: one } });
    await tick();
    expect(carousels(container)).toHaveLength(0);
    expect(container.querySelectorAll("[data-listing-carousel] button")).toHaveLength(0);
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

  it("links Land, Improved Projects and All to their fragments, in that order, in a named group", () => {
    const { container, getByRole } = render(PropertyListing, { props: { sections: sections() } });
    expect(getByRole("group", { name: "Show listings" })).not.toBeNull();
    expect(tabs(container).map((a) => a.getAttribute("href"))).toEqual([
      "#land",
      "#improved",
      "#all",
    ]);
    expect(tabs(container).map((a) => a.textContent?.trim())).toEqual([
      "Land",
      "Improved Projects",
      "All",
    ]);
  });

  it("keeps every section in the DOM, each active one marked with its view", () => {
    const { getAllByRole } = render(PropertyListing, { props: { sections: sections() } });
    const regions = getAllByRole("region");
    expect(regions.map((r) => r.dataset.viewSection ?? null)).toEqual(["land", "improved", null]);
    expect(regions[2].hasAttribute("data-past")).toBe(true);
  });

  // A visible target would be scrolled to by every tab press.
  it("puts the fragment targets, hidden, between the tab row and the first section", () => {
    const { container } = render(PropertyListing, { props: { sections: sections() } });
    const targets = [...container.querySelectorAll<HTMLElement>("[data-view-target]")];
    expect(targets.map((t) => t.id)).toEqual(["land", "improved", "all"]);
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

  it("draws no tab row with only one active section", () => {
    const improvedOnly = sections().filter((s) => s.id !== "land");
    const { container, queryByRole } = render(PropertyListing, {
      props: { sections: improvedOnly },
    });
    expect(queryByRole("group", { name: "Show listings" })).toBeNull();
    expect(container.querySelectorAll("[data-view-target]")).toHaveLength(0);
  });
});

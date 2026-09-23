import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  featuredLaunchFixture,
  featuredPickFixture,
  featuredPropertiesFixture,
  stageFeatured,
} from "$lib/home-fixture";
import { CAMERA_FLIGHT_MS } from "$lib/property-map";
import { components } from "$lib/slices";
import FeaturedProperties, { DWELL, KEN_BURNS } from "./index.svelte";

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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

    // ── the four animations, at the level of what the markup says ──────────
    //
    // What they LOOK like is tests/interaction/featured-properties.spec.ts's:
    // jsdom resolves no stylesheet, runs no transition and lays nothing out.
    // What is worth pinning here is the part that is a string — and the part
    // that is a string is exactly the part that silently stops working, because
    // Tailwind's source scan cannot see a class built at runtime.

    it("staggers the four text lines with LITERAL delays, 60ms apart, ending on the settle", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const [onStage] = slidesOf(container);
      const lines = [...onStage.querySelectorAll<HTMLElement>("[data-featured-line]")];
      expect(lines.map((l) => l.dataset.featuredLine)).toEqual(["0", "1", "2", "3"]);
      expect(lines.map((l) => l.tagName)).toEqual(["P", "H3", "UL", "DIV"]);

      // The delays are read off the rendered classes, not off a constant in
      // the component. NOTE WHAT THIS CANNOT SEE: a `delay-[${n}ms]` built at
      // runtime renders exactly the same class attribute and ships no CSS at
      // all, and that mutation left this case green. The assertion that
      // catches it reads the COMPUTED delay in a browser
      // (tests/interaction/featured-properties.spec.ts, "four lines 60ms
      // apart"), where the same markup measures 0s on all four.
      const delays = lines.map((l) => /(?:^|\s)delay-\[(\d+)ms\]/.exec(l.className)?.[1]);
      expect(delays).toEqual(["150", "210", "270", "330"]);
      for (const line of lines) {
        expect(line.className).toContain("duration-[170ms]");
        expect(line.className.split(/\s+/)).toContain("translate-y-0");
        expect(line.className.split(/\s+/)).toContain("opacity-100");
      }
      // The last line lands on the settle, which is what lets the bar start
      // filling on a slide that has finished arriving — and the settle is the
      // CAMERA'S FLIGHT, read from `$lib/property-map` rather than typed, so
      // this fails if the two are ever separated again. Both modules used to
      // carry their own `500`, and the comments on each claimed the other was
      // the reason for it while nothing in the code connected them.
      expect(Number(delays[3]) + 170).toBe(CAMERA_FLIGHT_MS);

      // The wrapper owns NO opacity: two nested fades multiply.
      const wrapper = lines[0].parentElement!.parentElement!;
      expect(wrapper.className).not.toMatch(/(^|\s)opacity-/);
      expect(wrapper.className).not.toContain("transition");
    });

    it("parks an off-stage slide's lines at +8px, ready to rise, with no stagger", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const [, ...offStage] = slidesOf(container);
      for (const slide of offStage) {
        const lines = [...slide.querySelectorAll<HTMLElement>("[data-featured-line]")];
        expect(lines).toHaveLength(4);
        for (const line of lines) {
          expect(line.className.split(/\s+/)).toContain("translate-y-2");
          expect(line.className.split(/\s+/)).toContain("opacity-0");
          expect(line.className).toContain("duration-[150ms]");
          // The exit is one movement, not four: nothing waits on the way out.
          expect(line.className).not.toMatch(/(^|\s)delay-\[/);
        }
      }
    });

    it("zooms only the photo, and holds one that has never been on stage at the end", () => {
      // Titled "…only from the clock…" until 2026-09-23, when a visitor's turn
      // gained a run of the drift of its own (see the cases below).
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      expect(photos).toHaveLength(3);
      // Slide 1 is on stage with progress 0 — the dwell has not started.
      expect(photos[0].getAttribute("style")).toBe("transform: scale(1.00000);");
      // …and the others are held at the END scale, so a clock turn does not
      // shrink a fully opaque outgoing photo by 3% under the incoming one.
      expect(photos[1].getAttribute("style")).toBe("transform: scale(1.03000);");
      expect(photos[2].getAttribute("style")).toBe("transform: scale(1.03000);");
      // Never on the wrapper: its transition-duration is the comp's 0.5s
      // dissolve, and a second transitioned property there makes the computed
      // value a two-item list (two assertions in the interaction spec).
      for (const photo of photos) {
        expect(photo.parentElement!.getAttribute("style")).toBeNull();
        expect(photo.className).not.toContain("transition");
      }
    });

    it("holds the photo that just LEFT where it was, not at the end scale", async () => {
      // The end-scale hold above is the state before any turn. Once a turn has
      // happened the slide that left is held at the drift it HAD, because the
      // user's turns now dissolve (2026-09-23) and that photo is fully opaque
      // for the whole 500ms — a jump to 1.03 under an incoming photo at
      // opacity 0 is a 27.8px change of width in one frame, in full view.
      //
      // jsdom runs no animation frames worth the name, so `progress` here has
      // never left 0: the outgoing slide must therefore be held at scale(1),
      // which is exactly where it was, and NOT at the 1.03 the old code gave
      // every off-stage slide unconditionally. That difference is the whole
      // assertion — reverting `drift` to the old `: 1` makes this read
      // 1.03000 and go red.
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = () => [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      expect(photos()[0].getAttribute("style")).toBe("transform: scale(1.00000);");

      await fireEvent.click(getByLabelText("Next slide"));

      const after = photos().map((el) => el.getAttribute("style"));
      expect(after[0], "the slide that just left, held where it was").toBe(
        "transform: scale(1.00000);",
      );
      expect(after[1], "on stage, at the top of a dwell that has not started").toBe(
        "transform: scale(1.00000);",
      );
      // Never off-stage, never the outgoing one: still the end scale, and
      // unobservable either way behind `invisible`.
      expect(after[2]).toBe("transform: scale(1.03000);");
    });

    // ── a visitor's turn drifts on a run of its own (2026-09-23) ──────────
    //
    // Fake timers fake requestAnimationFrame at 16ms a frame and
    // `performance.now()` with it (carousel.svelte.test.ts's clock), so the
    // drift can be read to the frame. jsdom's `click` focuses nothing: these
    // cases say with the Pause button which pause is on, and when.

    /** The scale a photo's inline style declares, as a number. */
    const scaleOf = (el: HTMLElement) =>
      Number(/scale\(([^)]+)\)/.exec(el.getAttribute("style") ?? "")?.[1]);
    const advance = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      await tick();
    };
    /** The hand-over, which the dwell doubling did NOT change. */
    const DISSOLVE = CAMERA_FLIGHT_MS;
    /** Where the drift stands `fraction` of the way through a dwell. */
    const at = (fraction: number) => 1 + KEN_BURNS * fraction;

    it("a VISITOR's turn drifts the photo it brought on — with the clock stopped", async () => {
      // THE HALF THE OLD GATE COULD NOT REACH. The drift was `progress` and
      // nothing else, and every way a visitor turns this band is a pause (the
      // arrow's focus, the pointer on the card), so a manual turn got no drift
      // at all: measured on main at 1440, scale(1) for 5000ms after a real
      // press. Here the clock is stopped BEFORE the turn — Pause, standing in
      // for the arrow's own focus — so any movement is the visitor's run.
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = () => [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      await fireEvent.click(getByLabelText("Pause slides"));
      await fireEvent.click(getByLabelText("Next slide"));
      expect(getByLabelText("Play slides"), "the clock stays stopped").toBeTruthy();

      // Still through the dissolve, exactly as a clock turn holds it through
      // the settle: the drift starts on a photo that has finished arriving.
      await advance(DISSOLVE - 20);
      expect(scaleOf(photos()[1]), `${DISSOLVE - 20}ms: still inside the dissolve`).toBe(1);
      // Then the dwell's own rate, KEN_BURNS over DWELL (0.03 over 8000ms
      // since 2026-09-23; it was 4000): halfway at DISSOLVE + DWELL / 2.
      await advance(20 + DWELL / 2);
      expect(scaleOf(photos()[1]), `${DISSOLVE + DWELL / 2}ms: half a dwell in`).toBeCloseTo(
        at(0.5),
        3,
      );
      // Not yet at the end a quarter of a dwell before it — the run is one
      // DWELL long, whatever DWELL is, and not the 4000 it used to be.
      await advance(DWELL / 4);
      expect(scaleOf(photos()[1]), "three quarters in").toBeCloseTo(at(0.75), 3);
      await advance(DWELL / 4);
      expect(scaleOf(photos()[1]), `${DISSOLVE + DWELL}ms: the end of the dwell`).toBeCloseTo(
        at(1),
        4,
      );
      // …and it ENDS: no loop, no second lap, nothing turned.
      await advance(DWELL + 2000);
      expect(scaleOf(photos()[1]), "held at the end").toBe(at(1));
      expect(getByLabelText("Play slides")).toBeTruthy();
      expect(slidesOf(container).map((sl) => sl.hasAttribute("inert"))).toEqual([
        true,
        false,
        true,
      ]);
      // The bar is the ROTATION's clock and says so: stopped, at 0.
      const fill = container.querySelector<HTMLElement>("[data-carousel-progress] > div")!;
      expect(fill.getAttribute("style")).toContain("scaleX(0)");
    });

    it("a Pause pressed AFTER the turn freezes the visitor's drift where it stands", async () => {
      // THE ONE-CLOCK RULE, KEPT. A drift that ran on after Pause would be
      // "Pause stops the bar and not the photo" — the defect the rule exists
      // for. The clock is RUNNING through this turn (jsdom's click focuses
      // nothing — a swipe's case), so both runs are drawing the photo, and the
      // Pause has to stop both of them.
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = () => [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      await fireEvent.click(getByLabelText("Next slide"));
      await advance(DISSOLVE + DWELL / 2);
      const moving = scaleOf(photos()[1]);
      expect(moving, "drifting when Pause is pressed").toBeCloseTo(at(0.5), 3);

      await fireEvent.click(getByLabelText("Pause slides"));
      const frozen = scaleOf(photos()[1]);
      // Longer than the rest of the run: an unfrozen one would have ended.
      await advance(DWELL);
      expect(scaleOf(photos()[1]), `frozen at ${frozen}`).toBe(frozen);
    });

    /** The bar's declared value: `progress` itself, unrounded. */
    const barOf = (container: HTMLElement) =>
      Number(
        /scaleX\(([^)]+)\)/.exec(
          container
            .querySelector<HTMLElement>("[data-carousel-progress] > div")!
            .getAttribute("style") ?? "",
        )?.[1],
      );
    /** How far through KEN_BURNS a declared scale is. */
    const driftOf = (scale: number) => (scale - 1) / KEN_BURNS;

    it("Play after a visitor's turn hands the drift to the clock: from where it stands, landing on the turn", async () => {
      // THE HAND-OVER THE OLD `max` ONLY CLAIMED. The photo drew max(clock,
      // visitor's run), and the run is AHEAD of a restarted clock by however
      // long the visitor waited before Play — so the max was the run until it
      // ended, and then the photo sat at 1.03 while the bar filled on to the
      // turn (measured by the combined-tree verifier on a production build:
      // Play 3.2s after the turn, the photo still from 8.5s to the turn at
      // 11.7s). Here Play comes a quarter of the way through the run, and from
      // then on the photo is the run's quarter plus the bar's share of the
      // three quarters left.
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = () => [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      await fireEvent.click(getByLabelText("Pause slides"));
      await fireEvent.click(getByLabelText("Next slide"));
      await advance(DISSOLVE + DWELL / 4);
      const from = driftOf(scaleOf(photos()[1]));
      expect(from, "premise: the visitor's run is a quarter through").toBeCloseTo(0.25, 2);
      /** The photo as the hand-over draws it: `from`, then the bar's share. */
      const handed = () => at(from + (1 - from) * barOf(container));

      await fireEvent.click(getByLabelText("Play slides"));
      expect(driftOf(scaleOf(photos()[1])), "nothing moves on the press").toBeCloseTo(from, 3);

      // The settle: the bar holds at 0 for DISSOLVE, and the photo with it.
      await advance(DISSOLVE - 20);
      expect(barOf(container), "the bar, still in the settle").toBe(0);
      expect(driftOf(scaleOf(photos()[1])), "the photo waits with it").toBeCloseTo(from, 3);

      // Halfway through the resumed dwell. The old max() read the RUN here —
      // a quarter plus (DISSOLVE + DWELL / 2) / DWELL, ~0.81 of the travel.
      await advance(20 + DWELL / 2);
      expect(barOf(container), "premise: the clock is counting").toBeCloseTo(0.5, 2);
      expect(scaleOf(photos()[1]), "halfway, with the bar").toBeCloseTo(handed(), 4);

      // A frame before the turn: still travelling, still short of the end.
      await advance(DWELL / 2 - 16);
      expect(
        slidesOf(container).map((sl) => sl.hasAttribute("inert")),
        "premise: not turned yet",
      ).toEqual([true, false, true]);
      expect(barOf(container), "premise: the bar nearly full").toBeGreaterThan(0.99);
      expect(scaleOf(photos()[1]), "still with the bar, a frame out").toBeCloseTo(handed(), 4);
      expect(scaleOf(photos()[1]), "and not parked at the end early").toBeLessThan(at(1));

      // …and it lands WITH the bar: the clock turns (within a frame — 8500 is
      // not a whole number of 16ms frames), and the photo that left is held
      // where it ended — at the end scale, to within a frame of drift.
      await advance(32);
      expect(slidesOf(container).map((sl) => sl.hasAttribute("inert"))).toEqual([
        true,
        true,
        false,
      ]);
      expect(scaleOf(photos()[1]), "left at the end, with the bar full").toBeCloseTo(at(1), 3);
    });

    it("Play after the visitor's run has ENDED holds the end scale — a photo is never sent back", async () => {
      // THE ONE THING A HAND-OVER CANNOT DO (#156). The run is over and the
      // photo is at 1.03; the resumed dwell has no travel left to draw, and
      // every way to draw some moves the photo backwards in full view. So it
      // holds — and this pins "never backwards", because the quick "fix" is
      // to restart the drift at 1.00: a 27.8px jump in one frame.
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = () => [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      await fireEvent.click(getByLabelText("Pause slides"));
      await fireEvent.click(getByLabelText("Next slide"));
      await advance(DISSOLVE + DWELL + 1000);
      expect(scaleOf(photos()[1]), "premise: the run has ended").toBe(at(1));

      await fireEvent.click(getByLabelText("Play slides"));
      let bar = 0;
      for (let step = 0; step < 8; step++) {
        await advance((DISSOLVE + DWELL) / 8 - 16);
        expect(barOf(container), "premise: the clock is counting").toBeGreaterThanOrEqual(bar);
        bar = barOf(container);
        expect(scaleOf(photos()[1]), `with the bar at ${bar.toFixed(3)}`).toBe(at(1));
      }
      expect(bar, "premise: watched to the end of the dwell").toBeGreaterThan(0.95);
    });

    it("two presses inside one dissolve leave BOTH outgoing photos where they were", async () => {
      // Two presses 200ms apart leave two photos showing: the first one's
      // `opacity-0` still waits out its 500ms. Holding only "the one that just
      // left" would snap the OLDER one to the end scale under the newer — the
      // jump the hold exists to prevent, one press later.
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const photos = () => [...container.querySelectorAll<HTMLElement>("[data-featured-photo]")];
      await advance(DWELL / 2);
      const first = scaleOf(photos()[0]);
      expect(first, "slide 1 mid-dwell on the clock").toBeCloseTo(at(0.5), 3);

      await fireEvent.click(getByLabelText("Next slide"));
      await advance(200);
      await fireEvent.click(getByLabelText("Next slide"));
      expect(scaleOf(photos()[0]), "the OLDER outgoing photo, still held").toBe(first);
      expect(scaleOf(photos()[1]), "the newer one, held inside its own dissolve").toBe(1);
      expect(scaleOf(photos()[2]), "on stage, from the top").toBe(1);
    });

    it("under reduced motion a turn adds no transform, however long it is watched", async () => {
      // app.css zeroes CSS durations under reduce; it cannot touch a value
      // script writes every frame. So the visitor's run is gated twice — it
      // never starts without `eligible`, and `zoom` writes nothing without it
      // — and this is the case that watches a turn for longer than the run.
      motion(true);
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      await fireEvent.click(getByLabelText("Next slide"));
      // Past the END of a visitor's run (DISSOLVE + DWELL), whatever DWELL
      // is: these steps summed to 8350ms when the run was 4500, and would have
      // stopped watching 150ms short of it at 8000.
      let watched = 0;
      for (const ms of [0, 250, 600, DWELL / 2, DWELL / 2, 2000]) {
        await advance(ms);
        watched += ms;
        for (const photo of container.querySelectorAll("[data-featured-photo]"))
          expect(photo.getAttribute("style"), `${watched}ms after the turn`).toBeNull();
      }
      expect(watched, "watched for longer than the run").toBeGreaterThan(DISSOLVE + DWELL);
    });

    // ── the clock: the operator's 8000, and no hover pause (2026-09-23) ────
    //
    // Two calls on one afternoon: "remove the pause on hover, they have a
    // pause button for that. also double the length on time on each property,
    // it feels like we're rushing." What they look like in a browser is
    // featured-properties.spec.ts's; what is pinned here is the wiring.

    /** 1-based number of the slide the live region names. */
    const announced = (container: HTMLElement) =>
      Number(
        /Slide (\d+) of/.exec(card(container).querySelector("[aria-live]")!.textContent!)?.[1],
      );

    it("dwells the operator's 8000ms on each listing — twice the comp's 4000 — and turns on it", async () => {
      // The number, pinned once: every other case here and in the browser
      // spec reads DWELL rather than repeating it, so this is the line that
      // says the call was carried out.
      expect(DWELL).toBe(8000);
      // …and it is the number the carousel was BUILT with, not only the one
      // exported: the first slide has no settle to wait for, so the clock
      // turns on exactly DWELL, and the next after DISSOLVE + DWELL more —
      // within a frame, since 8500 is not a whole number of 16ms frames.
      vi.useFakeTimers();
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      await advance(DWELL - 16);
      expect(announced(container)).toBe(1);
      await advance(16);
      expect(announced(container)).toBe(2);
      await advance(DISSOLVE + DWELL - 16);
      expect(announced(container)).toBe(2);
      await advance(32);
      expect(announced(container)).toBe(3);
    });

    it("a pointer resting on the card does not stop the clock; Pause and focus still do", async () => {
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const region = card(container);
      await advance(DWELL / 4);
      await fireEvent(region, new Event("pointerenter"));
      // The pointer never leaves. The turn comes on the dot: a clock the
      // hover had stopped for even one frame would be one frame late.
      await advance((DWELL * 3) / 4 - 16);
      expect(announced(container)).toBe(1);
      await advance(16);
      expect(announced(container), "turned under a resting pointer").toBe(2);
      expect(region.querySelector("[aria-live]")!.getAttribute("aria-live")).toBe("off");
      expect(getByLabelText("Pause slides"), "and nobody paused it").toBeTruthy();

      // Pause still stops it, with the pointer still there…
      await fireEvent.click(getByLabelText("Pause slides"));
      await advance(3 * (DISSOLVE + DWELL));
      expect(announced(container)).toBe(2);
      // …and so does focus entering, which a keyboard user needs (APG).
      await fireEvent.click(getByLabelText("Play slides"));
      await fireEvent.focusIn(getByLabelText("Next slide"));
      expect(getByLabelText("Play slides"), "focus entering is a pause").toBeTruthy();
      await advance(3 * (DISSOLVE + DWELL));
      expect(announced(container)).toBe(2);
    });

    it("reveals the card at 24px over 600ms — and never ships `data-reveal`", () => {
      // jsdom's IntersectionObserver is the no-op from vitest-setup.ts, so the
      // card stays in animateIn's HIDDEN state here: that state is what this
      // reads. The marker must not be in the markup — app.css hides
      // `[data-reveal]` at a hard-coded translateY(50%), which is not the 24px
      // this reveals from (src/reveal-hidden-state.test.ts holds those two
      // against each other).
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const region = card(container);
      expect(region.style.opacity).toBe("0");
      expect(region.style.transform).toBe("translateY(24px)");
      expect(region.style.transition).toContain("600ms");
      expect(region.style.transition).toContain("opacity");
      expect(region.style.transition).toContain("transform");
      // The action writes the marker itself while it holds an element hidden,
      // and drops it the moment the element is on its way to visible — so it
      // being here is positive evidence the action ran, not a defect.
      expect(region.getAttribute("data-reveal")).toBe("");
      // delayMax: 0 — and THIS ASSERTION CANNOT FAIL HERE, which is worth
      // saying rather than leaving to be discovered. The delay is
      // `delayMax × (getBoundingClientRect().left / innerWidth)` and jsdom has
      // no layout, so `left` is 0 and the product is 0 whatever `delayMax`
      // says: dropping the option entirely left this green. It is kept as the
      // statement of intent; the assertion that bites is in
      // tests/interaction/featured-properties.spec.ts, where the card's real
      // 513px left edge turns the default into 141ms.
      expect(region.style.transitionDelay).toBe("0ms");
    });

    it("ships no `data-reveal` from the SERVER, because its travel is not the CSS's", () => {
      // The half of the decision jsdom cannot see. app.css hides
      // `[data-reveal]` at a hard-coded translateY(50%) and
      // src/reveal-hidden-state.test.ts holds that number against animateIn's
      // default; this card reveals from 24px, so markup carrying the attribute
      // would be hidden at one distance and revealed from another. The only
      // way the attribute could reach the server's output is a literal in the
      // template, which is what this reads — the same way
      // reveal-hidden-state.test.ts reads app.css and app.html.
      // WHY THIS READS SOURCE AND NOT A RENDER, WHICH IS NOT THE OBVIOUS
      // ANSWER. The review of #102 called this out as the source-scraping
      // technique CLAUDE.md names for making two separately-green branches red
      // on merge (#86/#89), and proposed rendering instead. That was tried and
      // it CANNOT work here: `animateIn` writes `data-reveal` ITSELF while the
      // element is hidden (animateIn.ts:77) and removes it on reveal
      // (animateIn.ts:88), so a client render shows the attribute present —
      // measured, `hasAttribute("data-reveal") === true` — whether or not the
      // template ever contained it. A render cannot tell the server's markup
      // from the action's own bookkeeping, so it answers a different question.
      //
      // The claim being made is about what the SERVER emits, and the only
      // things that can see that are this read and a no-JS page fetch. The
      // blindness is real and stated: a spread, a computed attribute name or
      // the card moving into its own component would all pass this. That is
      // what tests/interaction/featured-properties.spec.ts's no-JS case is
      // for; this one fails fast, in milliseconds, for the ordinary edit.
      const source = readFileSync(
        resolve(process.cwd(), "src/lib/slices/FeaturedProperties/index.svelte"),
        "utf8",
      );
      const markup = source.slice(source.indexOf("</script>"));
      expect(markup).not.toMatch(/\sdata-reveal[\s=>]/);
      // …and the travel it does pass is not the one app.css hides at.
      expect(source).toContain('translateY: "24px"');
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

    it("under reduced motion NONE of the four animations exists — one case, all four", () => {
      // Enumerated together on purpose: each of the four is switched off by a
      // different mechanism (`eligible` for the stagger, the zoom and the
      // bar's mode, the action's own teardown for the reveal), and four
      // separate cases would let one of them be quietly rewired onto a
      // mechanism that does not hold.
      //
      // The stagger's gate used to be `rotating` and is `eligible` since
      // 2026-09-23, when the operator asked for the user's turns to animate
      // too. `rotating` implies `eligible`, so this case did not change — and
      // that is precisely why it is worth saying which one it now reads: it
      // would have gone on passing over a gate that no longer existed.
      motion(true);
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });

      // A — no stagger and no transition on any line, on stage or off.
      const lines = [...container.querySelectorAll<HTMLElement>("[data-featured-line]")];
      expect(lines.length).toBe(12);
      for (const line of lines) {
        expect(line.className).not.toContain("transition");
        expect(line.className).not.toMatch(/(^|\s)delay-\[/);
        expect(line.className).not.toMatch(/(^|\s)duration-\[/);
      }

      // B — no transform at all, not `scale(1)`: nothing for app.css's zeroed
      // animation-duration to snap to the end of, because there is no style.
      for (const photo of container.querySelectorAll("[data-featured-photo]"))
        expect(photo.getAttribute("style")).toBeNull();

      // C — the bar is in position mode, which has no handover to dissolve.
      const fill = container.querySelector<HTMLElement>("[data-carousel-progress] > div")!;
      expect(fill.dataset.carouselFill).toBe("position");

      // D — the action is a complete no-op: it never touched the card.
      const region = card(container);
      expect(region.getAttribute("style")).toBeNull();
      expect(region.hasAttribute("data-reveal")).toBe(false);
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
      // The SLIDE's bullets. `container.querySelectorAll("li")` used to be
      // the same thing and is not any more: the map's own list of Google Maps
      // links is <li>s in this band too (#13), so an unqualified count reads
      // six and says nothing about the text block this test is about.
      expect(container.querySelectorAll("[data-featured-slide] li")).toHaveLength(5);
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

  // WAS "reserves the map's column from lg with nothing in it". The map landed
  // (#13), and the two halves of that old assertion went opposite ways: the
  // slot is no longer empty or aria-hidden, and it is no longer `hidden` below
  // `lg` either — the 390 comp draws a 390 x 200 map full bleed at the top of
  // the band, which the old build read as "not drawn". What survives unchanged
  // is that the SLOT paints nothing of its own; the comp's map frame has no
  // fill, and the band's #3d0707 is what shows while tiles are arriving.
  it("fills the map's column at every width, and paints nothing of its own", () => {
    const { container } = render(FeaturedProperties, {
      props: { slice: featuredPropertiesFixture() },
    });
    const slot = container.querySelector<HTMLElement>("[data-map-slot]")!;
    expect(slot.getAttribute("aria-hidden"), "the map is content, not decoration").toBeNull();
    expect(slot.querySelector("[data-property-map]"), "a map is mounted in it").not.toBeNull();
    const classes = slot.className.split(/\s+/);
    expect(classes, "drawn below lg too — the 390 comp has it").not.toContain("hidden");
    expect(classes).toContain("lg:col-start-1");
    expect(classes).toContain("lg:row-start-1");
    // LAST in the DOM (the card is the band's content) and FIRST on the phone.
    expect(classes, "ordered above the card below lg").toContain("max-lg:order-first");
    const card = container.querySelector("[data-featured-card]")!;
    expect(
      card.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING,
      "the card comes first in the DOM",
    ).toBeTruthy();
    // The SLOT draws nothing; a bg-* here would be a placeholder drawn.
    expect(classes.filter((c) => /(^|:)(bg|border|from|to)-/.test(c))).toEqual([]);
    expect(band(container).className).toContain("bg-dark");
    // …but the slot's transparency is not the interesting claim, because the
    // slot is transparent whatever its child does. The MAP is what paints the
    // column until the tiles arrive, and it must paint the BAND's ground —
    // hard-coded sand there was a full-bleed pale rectangle on #3d0707 that
    // this assertion's earlier form could not see.
    const map = slot.querySelector<HTMLElement>("[data-property-map]")!;
    const mapClasses = map.className.split(/\s+/);
    expect(mapClasses, "the map wears the band's ground").toContain("bg-dark");
    expect(mapClasses, "and not the light-ground tone").not.toContain("bg-light");
  });

  it("gives the map a pin for every slide whose listing has one", () => {
    const { container } = render(FeaturedProperties, {
      props: { slice: featuredPropertiesFixture() },
    });
    const slot = container.querySelector<HTMLElement>("[data-map-slot]")!;
    const slides = container.querySelectorAll("[data-featured-slide]").length;
    const links = slot.querySelectorAll("[data-map-link]");
    // The three fixture picks all carry a GeoPoint, so this is 3 = 3 — and the
    // point of writing it as a comparison is that `FeaturedSlide.location` is
    // new (it was requested by the model's graphQuery and dropped on the floor
    // in $lib/featured-properties until #13). A slide arriving without it
    // would silently cost a pin.
    expect(links).toHaveLength(slides);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(
        /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/,
      );
    }
  });

  // #122. The band is the map whose boot cost the most visible wait, so it is
  // the one worth asserting the placeholder really reaches — the component's
  // own tests cover the picture's shape, and this covers that the BAND gets
  // one, over the band's own ground, with this band's listings on it.
  it("opens the band's map on the fixed frame, with the slides' own pins on it", () => {
    const { container } = render(FeaturedProperties, {
      props: { slice: featuredPropertiesFixture() },
    });
    const slot = container.querySelector<HTMLElement>("[data-map-slot]")!;
    const picture = slot.querySelector<HTMLElement>("[data-map-home-box]");
    expect(picture, "the band's map opens on a picture, not a list of links").not.toBeNull();
    // One layer per frame, and the committed rasters they are crops of — held
    // as custom properties on the wrapper rather than as each layer's own
    // `background-image`, so only the frame the container query paints is ever
    // requested (#133).
    const layers = [...picture!.querySelectorAll<HTMLElement>("[data-map-home-frame]")];
    expect(layers.map((l) => l.dataset.mapHomeFrame)).toEqual(["full", "compact"]);
    expect(picture!.style.getPropertyValue("--map-home-full")).toBe("url(/map-home-full.webp)");
    expect(picture!.style.getPropertyValue("--map-home-compact")).toBe(
      "url(/map-home-compact.webp)",
    );
    // And the pins are THESE listings, linking where their list rows link.
    const rows = [...slot.querySelectorAll("[data-map-link]")].map((a) => a.getAttribute("href"));
    const pins = [...layers[0]!.querySelectorAll<HTMLAnchorElement>("[data-map-home-pin]")].map(
      (a) => a.getAttribute("href"),
    );
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(rows).toContain(pin);
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
      // …plus the map's, which are a different promise and get their own
      // assertion below rather than an exemption buried in this loop. Since
      // #122 there are TWO kinds of those: the list's rows, and the pins the
      // fixed-frame placeholder draws over the raster, which are links for the
      // same reason the rows are — Google Maps needs no script, and the list
      // is `sr-only` while the picture is up.
      for (const slice of [featuredPropertiesFixture(), featuredLaunchFixture()]) {
        const { container, unmount } = render(FeaturedProperties, { props: { slice } });
        const links = [...band(container).querySelectorAll("a")].filter(
          (l) => !l.hasAttribute("data-map-link") && !l.hasAttribute("data-map-home-pin"),
        );
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

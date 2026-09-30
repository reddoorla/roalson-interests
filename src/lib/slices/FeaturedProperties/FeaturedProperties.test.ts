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
import FeaturedProperties, { DWELL, KEN_BURNS, TILT_DEG } from "./index.svelte";

// THE ENGINE, for the one block below that boots the band's map: a fake that
// keeps maplibre's navigation handlers as real on/off state, so the band's
// rule can be read off what a map would actually let a visitor do. Every other
// case in this file never boots it — the setup's IntersectionObserver never
// fires — and is untouched by the mock.
const engine = vi.hoisted(() => {
  const handler = (enabled: boolean) => ({
    enabled,
    enable() {
      this.enabled = true;
    },
    disable() {
      this.enabled = false;
    },
    isEnabled() {
      return this.enabled;
    },
    isActive: () => false,
    disableRotation() {},
  });
  const maps: FakeMap[] = [];
  class FakeMap {
    canvas = document.createElement("canvas");
    canvasContainer = document.createElement("div");
    scrollZoom = handler(true);
    boxZoom = handler(true);
    dragRotate = handler(false);
    dragPan = handler(true);
    keyboard = handler(true);
    doubleClickZoom = handler(true);
    touchZoomRotate = handler(true);
    touchPitch = handler(false);
    constructor(options: { container?: HTMLElement }) {
      options.container?.appendChild(this.canvasContainer);
      this.canvasContainer.appendChild(this.canvas);
      this.canvas.setAttribute("tabindex", "0");
      maps.push(this);
    }
    /** The navigation handlers that are on, by name. */
    tools() {
      const names = [
        "scrollZoom",
        "boxZoom",
        "dragRotate",
        "dragPan",
        "keyboard",
        "doubleClickZoom",
        "touchZoomRotate",
        "touchPitch",
      ] as const;
      return names.filter((n) => this[n].enabled).sort();
    }
    on() {}
    addControl() {}
    removeControl() {}
    getCanvas() {
      return this.canvas;
    }
    getCanvasContainer() {
      return this.canvasContainer;
    }
    getZoom() {
      return 12;
    }
    getCenter() {
      return { lng: 0, lat: 0 };
    }
    getMaxZoom() {
      return 16;
    }
    project() {
      return { x: 0, y: 0 };
    }
    jumpTo() {}
    flyTo() {}
    easeTo() {}
    resize() {}
    remove() {}
    stop() {}
  }
  return { maps, module: { default: { Map: FakeMap, AttributionControl: class {} } } };
});
vi.mock("$lib/map-engine", () => engine.module);
vi.mock("$env/dynamic/public", () => ({ env: {} }));

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
        // The box at the drift's end scale: see "fetched for the width it is
        // drawn at" below.
        expect(img.getAttribute("sizes")).toBe(
          `(min-width: 1024px) ${+(65 * (1 + KEN_BURNS)).toFixed(2)}vw, ${+(100 * (1 + KEN_BURNS)).toFixed(2)}vw`,
        );
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

    // ── Ken Burns: one CSS transition (operator call, 2026-09-29) ─────────
    //
    // "can it be one clean transform scale with a transition? this seems
    // overbuilt." jsdom runs no transitions, so what is pinned here is the
    // STYLE each photo declares, when it is written, and — through a
    // stand-in `getAnimations` — that Pause and Play reach the transition's
    // own Animation. That the photo really moves, holds still while it
    // leaves and freezes on Pause is featured-properties.spec.ts's, in
    // Chromium.

    /** Every photo that can drift is on its own compositor layer in each of
     *  the four states below — until its drift has ENDED on stage, and from
     *  then until it rests (`ENDED`, `ENDED_OFF`; see `LAYER` in the slice). */
    const LAYER = "will-change: transform;";
    /** Every state's transform: the scale, then the SAME tilt, so each
     *  transition runs between two lists of the same functions and never
     *  turns the photo (see TILT_DEG in the slice: Firefox, 2026-09-30). */
    const at = (scale: number) => `transform: scale(${scale}) rotate(${TILT_DEG}deg);`;
    /** The photo a turn brings on: to 1 + KEN_BURNS over DWELL, linear,
     *  after the settle — which is the camera's flight, read from its own
     *  module. */
    const ON_STAGE = `${LAYER} ${at(1 + KEN_BURNS)} transition: transform ${DWELL}ms linear ${CAMERA_FLIGHT_MS}ms;`;
    /** The first slide's: nothing to arrive, so no settle — as the bar. */
    const FIRST = `${LAYER} ${at(1 + KEN_BURNS)} transition: transform ${DWELL}ms linear 0ms;`;
    /** A photo that left: held at its start value by a whole DWELL's delay… */
    const OFF_STAGE = `${LAYER} ${at(1)} transition: transform 0ms linear ${DWELL}ms;`;
    /** …until its wrapper's fade-out ENDS, and then at rest, hidden. */
    const RESTING = `${LAYER} ${at(1)} transition: none;`;
    /** ON_STAGE once its drift has run to its end: held still, no layer. */
    const ENDED = `${at(1 + KEN_BURNS)} transition: transform ${DWELL}ms linear ${CAMERA_FLIGHT_MS}ms;`;
    /** OFF_STAGE for a photo that left after its drift had ended. */
    const ENDED_OFF = `${at(1)} transition: transform 0ms linear ${DWELL}ms;`;
    const photosOf = (container: HTMLElement) => [
      ...container.querySelectorAll<HTMLElement>("[data-featured-photo]"),
    ];
    const stylesOf = (container: HTMLElement) =>
      photosOf(container).map((el) => el.getAttribute("style"));
    const advance = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      await tick();
    };
    /** The hand-over, which the dwell doubling did NOT change. */
    const DISSOLVE = CAMERA_FLIGHT_MS;

    it("drifts only the photo, as ONE transition: to 1 + KEN_BURNS over DWELL — the first slide from load", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      expect(stylesOf(container)).toEqual([FIRST, OFF_STAGE, OFF_STAGE]);
      // Never on the wrapper: its transition-duration is the comp's 0.5s
      // dissolve, and a second transitioned property there makes the computed
      // value a two-item list (two assertions in the interaction spec).
      for (const photo of photosOf(container)) {
        expect(photo.parentElement!.getAttribute("style")).toBeNull();
        expect(photo.className).not.toContain("transition");
      }
    });

    it("resolves every photo at its TILTED REST before the first drift is written, so none turns up from 0", () => {
      // The server's markup has no style, so without this the first drift
      // (and every hold at load) starts from `none`, and a transition from
      // `none` interpolates the tilt 0 → TILT_DEG across the dwell — below
      // Firefox's threshold for two thirds of it (see `primed` in the slice).
      // What is pinned here is the ORDER: each photo carries its tilted rest
      // when the browser is made to resolve it, and only after that does it
      // carry a drift. That the drift then starts tilted is the browser's —
      // featured-properties.spec.ts, slide 1's first dwell, every frame.
      const real = window.getComputedStyle.bind(window);
      const resolved: (string | null)[] = [];
      const read = vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
        if (el.hasAttribute("data-featured-photo")) resolved.push(el.getAttribute("style"));
        return real(el, pseudo);
      });
      try {
        const { container } = render(FeaturedProperties, {
          props: { slice: featuredPropertiesFixture() },
        });
        expect(resolved, "each photo, as the browser resolved it first").toEqual([
          `${LAYER} ${at(1)}`,
          `${LAYER} ${at(1)}`,
          `${LAYER} ${at(1)}`,
        ]);
        expect(stylesOf(container), "and then the drift and the holds").toEqual([
          FIRST,
          OFF_STAGE,
          OFF_STAGE,
        ]);
      } finally {
        read.mockRestore();
      }
    });

    it("a turn swaps the two styles — the clock's and a visitor's alike — and nothing is written between turns", async () => {
      // THE SAME DECLARATION FOR BOTH KINDS OF TURN is what makes a visitor's
      // turn drift exactly as a clock turn does: nothing here asks who turned.
      // And the style is written AT A TURN AND NEVER BETWEEN: the drift used
      // to be a new `scale()` written on every animation frame, which is what
      // stalled with the main thread (the operator's "stuttery").
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const writes: number[] = [];
      const observer = new MutationObserver((records) => {
        for (const r of records) writes.push(photosOf(container).indexOf(r.target as HTMLElement));
      });
      for (const photo of photosOf(container))
        observer.observe(photo, { attributes: true, attributeFilter: ["style"] });

      await advance(DWELL - 16);
      expect(writes, "a whole dwell on the clock, and not one write").toEqual([]);
      await advance(16);
      expect(stylesOf(container), "the clock's turn").toEqual([OFF_STAGE, ON_STAGE, OFF_STAGE]);
      expect(writes.sort(), "one write for each photo that changed places").toEqual([0, 1]);

      // Two visitor turns inside one dissolve: each photo that left carries
      // its own leaving transition, so each holds where it stood.
      await fireEvent.click(getByLabelText("Next slide"));
      await advance(200);
      await fireEvent.click(getByLabelText("Next slide"));
      expect(stylesOf(container), "two visitor turns").toEqual([ON_STAGE, OFF_STAGE, OFF_STAGE]);
      writes.length = 0;
      await advance(DISSOLVE + DWELL / 2);
      expect(writes, "half a dwell after a visitor's turn, and not one write").toEqual([]);
      observer.disconnect();
    });

    it("a photo brought back WHILE IT STILL SHOWS keeps its layer, whatever becomes of the hold it leaves", async () => {
      // Turned away and back inside the dissolve, the photo's held off-stage
      // transition is replaced before it ends, so the browser may report it
      // as a `transitioncancel`. That is not a drift ending: only a finished
      // `transitionend` drops the layer (see `ended`).
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      await fireEvent.click(getByLabelText("Next slide"));
      expect(stylesOf(container), "premise: turned away").toEqual([OFF_STAGE, ON_STAGE, OFF_STAGE]);
      await fireEvent.click(getByLabelText("Previous slide"));
      photosOf(container)[0].dispatchEvent(
        new TransitionEvent("transitioncancel", { propertyName: "transform", bubbles: true }),
      );
      await tick();
      expect(stylesOf(container), "back while it showed: on stage, on its layer").toEqual([
        ON_STAGE,
        OFF_STAGE,
        OFF_STAGE,
      ]);
    });

    it("a photo that left RESTS once its own fade-out has ended — and a turn back starts it from 1", async () => {
      // Not on a timer: the leaving hold lasts until the wrapper's opacity
      // transition ENDS, which is when the photo stops showing. jsdom runs no
      // transitions, so the `transitionend` is dispatched by hand.
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const fadeEnd = async (i: number, property = "opacity", from?: Element) => {
        const wrapper = photosOf(container)[i].parentElement!;
        (from ?? wrapper).dispatchEvent(
          new TransitionEvent("transitionend", { propertyName: property, bubbles: true }),
        );
        await tick();
      };
      await fireEvent.click(getByLabelText("Next slide"));
      expect(stylesOf(container), "premise: turned").toEqual([OFF_STAGE, ON_STAGE, OFF_STAGE]);
      await fadeEnd(0, "visibility");
      await fadeEnd(0, "opacity", photosOf(container)[0]);
      await fadeEnd(1);
      expect(stylesOf(container), "only the wrapper's own opacity, off stage").toEqual([
        OFF_STAGE,
        ON_STAGE,
        OFF_STAGE,
      ]);
      await fadeEnd(0);
      expect(stylesOf(container), "its fade-out over").toEqual([RESTING, ON_STAGE, OFF_STAGE]);
      await fireEvent.click(getByLabelText("Previous slide"));
      expect(stylesOf(container), "back, from 1").toEqual([ON_STAGE, OFF_STAGE, OFF_STAGE]);
      await fireEvent.click(getByLabelText("Next slide"));
      expect(stylesOf(container), "and it leaves held again").toEqual([
        OFF_STAGE,
        ON_STAGE,
        OFF_STAGE,
      ]);
    });

    it("a drift that ENDS on stage drops the photo's layer — and it comes back when the photo rests", async () => {
      // A layer with will-change keeps the raster it was drawn at, so a photo
      // held at 1 + KEN_BURNS on one is its start raster stretched, for as
      // long as it is held (see `LAYER` in the slice). What ends it is the
      // photo's OWN transition on `transform`, while on stage — dispatched by
      // hand, as jsdom runs no transitions. That the browser really fires it,
      // really re-rasters and that a Pause keeps the layer are the specs'.
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const end = async (i: number, property = "transform", from?: Element) => {
        (from ?? photosOf(container)[i]).dispatchEvent(
          new TransitionEvent("transitionend", { propertyName: property, bubbles: true }),
        );
        await tick();
      };
      await fireEvent.click(getByLabelText("Next slide"));
      expect(stylesOf(container), "premise: turned").toEqual([OFF_STAGE, ON_STAGE, OFF_STAGE]);
      await end(1, "opacity");
      await end(0);
      expect(stylesOf(container), "not a transform's, and not a photo on stage").toEqual([
        OFF_STAGE,
        ON_STAGE,
        OFF_STAGE,
      ]);
      await end(1);
      expect(stylesOf(container), "the drift on stage ended").toEqual([
        OFF_STAGE,
        ENDED,
        OFF_STAGE,
      ]);
      await fireEvent.click(getByLabelText("Pause slides"));
      await fireEvent.click(getByLabelText("Play slides"));
      expect(stylesOf(container), "Pause and Play start nothing").toEqual([
        OFF_STAGE,
        ENDED,
        OFF_STAGE,
      ]);

      // It leaves held, still with no layer; brought back while it still
      // shows it is already at 1 + KEN_BURNS, so nothing drifts and the layer
      // stays off. The photo it hands back to had not ended: it keeps its own.
      await fireEvent.click(getByLabelText("Next slide"));
      expect(stylesOf(container), "left after it ended").toEqual([OFF_STAGE, ENDED_OFF, ON_STAGE]);
      await fireEvent.click(getByLabelText("Previous slide"));
      expect(stylesOf(container), "back while it still shows").toEqual([
        OFF_STAGE,
        ENDED,
        OFF_STAGE,
      ]);

      // Once its fade-out ends it RESTS, on its layer again, before its next
      // drift — which then runs on it.
      await fireEvent.click(getByLabelText("Next slide"));
      await end(1, "opacity", photosOf(container)[1].parentElement!);
      expect(stylesOf(container), "at rest").toEqual([OFF_STAGE, RESTING, ON_STAGE]);
      await fireEvent.click(getByLabelText("Previous slide"));
      expect(stylesOf(container), "its next drift").toEqual([OFF_STAGE, ON_STAGE, OFF_STAGE]);
    });

    it("reduced motion turned on and off again starts the photo on stage from its rest — on its layer", async () => {
      // Re-primed (see `primed` in the slice), the photo on stage drifts again
      // from 1, so a drift that had ENDED before must not keep it off its
      // layer. A stand-in media query that can be flipped mid-test: the
      // preference is read through $lib/transitions' one listener.
      let reduce = false;
      let changed: ((event: { matches: boolean }) => void) | undefined;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        get matches() {
          return reduce && query.includes("prefers-reduced-motion");
        },
        media: query,
        addEventListener: (_: string, run: (event: { matches: boolean }) => void) => {
          if (query.includes("prefers-reduced-motion")) changed = run;
        },
        removeEventListener: () => {},
      }));
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      await fireEvent.click(getByLabelText("Next slide"));
      photosOf(container)[1].dispatchEvent(
        new TransitionEvent("transitionend", { propertyName: "transform", bubbles: true }),
      );
      await tick();
      expect(stylesOf(container), "premise: its drift ended").toEqual([
        OFF_STAGE,
        ENDED,
        OFF_STAGE,
      ]);
      expect(changed, "premise: the band hears the preference change").toBeTypeOf("function");
      reduce = true;
      changed!({ matches: true });
      await tick();
      expect(stylesOf(container), "reduced: no style at all").toEqual([null, null, null]);
      reduce = false;
      changed!({ matches: false });
      await tick();
      expect(stylesOf(container), "motion again: from rest, on its layer").toEqual([
        OFF_STAGE,
        ON_STAGE,
        OFF_STAGE,
      ]);
    });

    /** A stand-in for each photo's transition — jsdom has no Web Animations —
     *  that records what the slice asks of it, as "pause 1" / "play 1". */
    function stubAnimations() {
      const calls: string[] = [];
      const proto = Element.prototype as unknown as { getAnimations?: () => unknown[] };
      proto.getAnimations = function (this: Element) {
        if (!this.hasAttribute("data-featured-photo")) return [];
        const n = [...document.querySelectorAll("[data-featured-photo]")].indexOf(this);
        return [{ pause: () => calls.push(`pause ${n}`), play: () => calls.push(`play ${n}`) }];
      };
      return { calls, restore: () => delete proto.getAnimations };
    }

    it("Pause freezes the transition and Play resumes it — but only a pause that comes AFTER the turn", async () => {
      // WCAG 2.2.2: Pause must stop the motion. It does so on the transition's
      // own Animation, so resuming needs no arithmetic — the animation keeps
      // the time it had left — and no style is re-declared: a re-declared
      // `transform` would start a NEW transition, from wherever the photo is,
      // over a whole DWELL.
      const { calls, restore } = stubAnimations();
      try {
        const { container, getByLabelText } = render(FeaturedProperties, {
          props: { slice: featuredPropertiesFixture() },
        });
        calls.length = 0;
        await fireEvent.click(getByLabelText("Pause slides"));
        await fireEvent.click(getByLabelText("Play slides"));
        expect(calls, "on the clock").toEqual(["pause 0", "play 0"]);
        expect(stylesOf(container), "nothing re-declared").toEqual([FIRST, OFF_STAGE, OFF_STAGE]);

        // A PAUSE ALREADY ON AT THE TURN IS NOT A REQUEST TO STOP IT. An arrow
        // press focuses the arrow (APG: a pause), and a script that focuses
        // and clicks in one task lands both in ONE flush. The photo the turn
        // brought on must keep drifting.
        calls.length = 0;
        const next = getByLabelText("Next slide");
        void fireEvent.focusIn(next);
        await fireEvent.click(next);
        expect(getByLabelText("Play slides"), "premise: the arrow's focus is a pause").toBeTruthy();
        expect(stylesOf(container), "premise: turned").toEqual([OFF_STAGE, ON_STAGE, OFF_STAGE]);
        expect(calls, "the visitor's own turn, frozen").toEqual([]);

        // A real mouse puts the focus and the click in two flushes: the focus
        // freezes the photo about to leave (harmless — it holds anyway), and
        // still not the one the turn brings on.
        await fireEvent.click(getByLabelText("Play slides"));
        calls.length = 0;
        await fireEvent.focusIn(document.body);
        await fireEvent.focusIn(next);
        await fireEvent.click(next);
        expect(stylesOf(container), "premise: turned again").toEqual([
          OFF_STAGE,
          OFF_STAGE,
          ON_STAGE,
        ]);
        expect(
          calls.filter((c) => c.endsWith(" 2")),
          "the photo brought on",
        ).toEqual([]);

        // A Pause AFTER that turn does freeze it; Play resumes it.
        await fireEvent.click(getByLabelText("Play slides"));
        await fireEvent.click(getByLabelText("Pause slides"));
        expect(calls.slice(-2)).toEqual(["play 2", "pause 2"]);
      } finally {
        restore();
      }
    });

    it("under reduced motion a turn adds no transform and no transition, however long it is watched", async () => {
      // app.css cuts every transition to 0.01ms under reduce, which would SNAP
      // a declared end scale and hold it, so the style must not be written at
      // all — and with it goes the photo's `will-change`: nothing drifts.
      motion(true);
      vi.useFakeTimers();
      const { container, getByLabelText } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      await fireEvent.click(getByLabelText("Next slide"));
      // Past the end of a whole drift (DISSOLVE + DWELL), whatever DWELL is.
      let watched = 0;
      for (const ms of [0, 250, 600, DWELL / 2, DWELL / 2, 2000]) {
        await advance(ms);
        watched += ms;
        for (const photo of photosOf(container))
          expect(photo.getAttribute("style"), `${watched}ms after the turn`).toBeNull();
      }
      expect(watched, "watched for longer than a drift").toBeGreaterThan(DISSOLVE + DWELL);
    });

    it("drifts the operator's 1.00 → 1.06", () => {
      // "the ken burns still feels stuttery" … "being too slow may be the
      // answer, let's speed it up" (operator, 2026-09-29, after #204). The
      // amplitude, pinned once, as DWELL is: twice the 0.03 it was. That the
      // browser specs time this same number is featured-dwell.test.ts's.
      expect(KEN_BURNS).toBe(0.06);
    });

    it("tilts by the operator's 0.02deg — past the 1/4096 WebRender reads as no rotation at all", () => {
      // Measured in Firefox by the operator, 2026-09-30: smooth with
      // rotate(0.02deg) at both ends, ticking without. WebRender takes a
      // matrix whose off-diagonal is within 1/4096 of zero for a plain scale
      // (`ScaleOffset::from_transform`), so a "tidier" 0.01deg would quietly
      // be no tilt there. The photo is never drawn below scale 1, where the
      // off-diagonal is smallest: sin(TILT_DEG).
      expect(TILT_DEG).toBe(0.02);
      expect(Math.sin((TILT_DEG * Math.PI) / 180)).toBeGreaterThan(1 / 4096);
    });

    describe("fetched for the width it is drawn at, at the end of its drift", () => {
      /** A band whose three photos are Prismic images of these sizes. */
      const withPhotos = (...sizes: [number, number][]) => {
        const slice = featuredPropertiesFixture();
        const picks = slice.primary.properties as unknown as {
          property: { data: { feature_image: unknown } };
        }[];
        sizes.forEach(([width, height], i) => {
          picks[i].property.data.feature_image = {
            url: `https://images.prismic.io/roalson-interests/photo-${i}.jpg?auto=format,compress`,
            alt: `Photo ${i}`,
            dimensions: { width, height },
            copyright: null,
            id: `photo-${i}`,
            edit: { x: 0, y: 0, zoom: 1, background: "#ffffff" },
          };
        });
        return slice;
      };
      const imgs = (container: HTMLElement) => [
        ...container.querySelectorAll<HTMLImageElement>("[data-featured-photo]"),
      ];
      const END = 1 + KEN_BURNS;
      /** The comp's box, 928 × 542 — the wrapper's `aspect-[928/542]`. */
      const BOX = 928 / 542;
      const sizesFor = (scale: number) =>
        `(min-width: 1024px) ${+(65 * scale).toFixed(2)}vw, ${+(100 * scale).toFixed(2)}vw`;
      const widthsOf = (img: HTMLImageElement) =>
        img
          .getAttribute("srcset")!
          .split(", ")
          .map((c) => Number(/ (\d+)w$/.exec(c)![1]));

      it("sizes is the box at the end scale, and more for a photo wider than the box", () => {
        // The live band's three photos: 4:3 and 1.45:1 are narrower than the
        // box, so object-cover draws them its width; 1717 × 866 is wider, so
        // it is drawn at the box's HEIGHT and overflows it sideways — 1073.6
        // wide in a 927 box at 1440, which `65vw` said nothing about.
        const { container } = render(FeaturedProperties, {
          props: { slice: withPhotos([4032, 3024], [1872, 1290], [1717, 866]) },
        });
        expect(imgs(container).map((img) => img.getAttribute("sizes"))).toEqual([
          sizesFor(END),
          sizesFor(END),
          sizesFor((END * 1717) / 866 / BOX),
        ]);
      });

      it("a one-listing card never drifts, so it asks for the box alone", () => {
        const { container } = render(FeaturedProperties, {
          props: { slice: featuredLaunchFixture() },
        });
        expect(imgs(container).map((img) => img.getAttribute("sizes"))).toEqual([sizesFor(1)]);
      });

      it("offers 2048 between 1920 and 2560, and never more than the source has", () => {
        const { container } = render(FeaturedProperties, {
          props: { slice: withPhotos([4032, 3024], [1872, 1290], [1717, 866]) },
        });
        const [big, mid, wide] = imgs(container);
        expect(widthsOf(big)).toEqual([480, 768, 1024, 1440, 1920, 2048, 2560]);
        expect(widthsOf(mid)).toEqual([480, 768, 1024, 1440, 1872]);
        expect(widthsOf(wide)).toEqual([480, 768, 1024, 1440, 1717]);
        // The `src` fallback is still at most 1920.
        expect(imgs(container).map((img) => new URL(img.src).searchParams.get("w"))).toEqual([
          "1920",
          "1872",
          "1717",
        ]);
      });
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

    it("reveals the card at 24px over 600ms — and the fail-safe reveals it if nothing reports", async () => {
      // jsdom's IntersectionObserver is the no-op from vitest-setup.ts, so the
      // card stays in animateIn's HIDDEN state here until the fail-safe: that
      // state is what this reads, and then the fail-safe is. A no-op observer
      // never reports, which is exactly the dead observer it exists for.
      vi.useFakeTimers();
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const region = card(container);
      expect(region.style.opacity).toBe("0");
      expect(region.style.transform).toBe("translateY(24px)");
      expect(region.style.transition).toContain("600ms");
      expect(region.style.transition).toContain("opacity");
      expect(region.style.transition).toContain("transform");
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

      // The card ships `data-reveal` from the server (#105), so an observer
      // that never reports must not strand it: 2500ms, then shown.
      await vi.advanceTimersByTimeAsync(2499);
      expect(region.style.opacity).toBe("0");
      await vi.advanceTimersByTimeAsync(1);
      expect(region.hasAttribute("data-reveal")).toBe(false);
      expect(region.style.opacity).toBe("1");
    });

    it("ships `data-reveal` from the SERVER, hidden by its own 24px rule (#105)", () => {
      // The half of the decision jsdom cannot see: what the SERVER emits.
      // app.css hides `[data-reveal]` at animateIn's default 50%, and this
      // card travels 24px, so the marker ships only beside a rule of its own
      // at that travel (src/reveal-hidden-state.test.ts holds every such pair
      // together, and tests/interaction/featured-properties.spec.ts reads the
      // served bytes and the painted card).
      //
      // WHY THIS READS SOURCE AND NOT A RENDER. `animateIn` writes
      // `data-reveal` ITSELF while the element is hidden and removes it on
      // reveal, so a client render shows the attribute whether or not the
      // template ever contained it — measured when this case asserted the
      // opposite (#102's review). A render answers a different question.
      const source = readFileSync(
        resolve(process.cwd(), "src/lib/slices/FeaturedProperties/index.svelte"),
        "utf8",
      );
      const markup = source
        .slice(source.lastIndexOf("</script>"), source.lastIndexOf("<style>"))
        .replace(/<!--[\s\S]*?-->/g, "");
      const card = /<div\s[^>]*data-featured-card[^>]*>/.exec(markup)?.[0] ?? "";
      expect(card, "the card's opening tag").toContain("use:animateIn={REVEAL}");
      expect(card).toMatch(/\sdata-reveal[\s=>]/);
      expect(source).toContain('translateY: "24px"');
      expect(source).toMatch(/const REVEAL = \{[^}]*failSafe: \d+/);
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

      // B — no transform and no transition at all, not `scale(1)`: nothing
      // for app.css's 0.01ms transition-duration to snap to the end of,
      // because there is no style.
      for (const photo of container.querySelectorAll("[data-featured-photo]"))
        expect(photo.getAttribute("style")).toBeNull();

      // C — the bar is in position mode, which has no handover to dissolve.
      const fill = container.querySelector<HTMLElement>("[data-carousel-progress] > div")!;
      expect(fill.dataset.carouselFill).toBe("position");

      // D — the action never hides the card. It ships `data-reveal` (#105),
      // whose CSS is gated on no-preference, and the action's only act here
      // is to drop that marker: no opacity 0, no travel, ever.
      const region = card(container);
      expect(region.hasAttribute("data-reveal")).toBe(false);
      expect(region.style.opacity).not.toBe("0");
      expect(region.style.transform).not.toContain("24px");
      expect(region.style.transition).toBe("");
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
      // Nothing to drift over: a card that never turns has no dwell, so its
      // photo carries no transform and no transition.
      expect(only.querySelector("[data-featured-photo]")!.getAttribute("style")).toBeNull();
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

  // The client's on/off for the section (Figma 1908699525; Nicole: "whole
  // section will go away if toggled off").
  describe("the Show featured properties switch", () => {
    it("turned off, renders no section, heading, card or map", () => {
      const { container, queryByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ show_featured: false }) },
      });
      expect(band(container)).toBeNull();
      expect(container.querySelector("section, [data-map-slot], [data-featured-card]")).toBeNull();
      expect(queryByRole("heading")).toBeNull();
      expect(container.textContent?.trim()).toBe("");
    });

    it("on, or unset on a document saved before the field existed, shows the band", () => {
      for (const show_featured of [true, null, undefined]) {
        const { container, getByRole, unmount } = render(FeaturedProperties, {
          props: { slice: featuredPropertiesFixture({ show_featured } as never) },
        });
        expect(band(container).hidden).toBe(false);
        expect(band(container).dataset.featuredShown).toBe("3");
        expect(getByRole("heading", { level: 2 }).textContent).toBe("Featured Properties");
        unmount();
      }
    });
  });

  it("draws at most ten slides however many listings are picked", () => {
    const [first] = featuredPropertiesFixture().primary.properties;
    const photo = (first!.property as unknown as { data: { feature_image: unknown } }).data
      .feature_image;
    const picks = Array.from({ length: 12 }, (_, i) =>
      featuredPickFixture(`listing-${i + 1}`, `id-${i + 1}`, {
        title: `Listing ${i + 1}`,
        feature_image: photo as never,
      }),
    );
    const { container } = render(FeaturedProperties, {
      props: { slice: featuredPropertiesFixture({ properties: picks as never }) },
    });
    const slides = slidesOf(container);
    expect(slides).toHaveLength(10);
    expect(slides.at(-1)!.getAttribute("aria-label")).toBe("10 of 10");
    expect(band(container).dataset.featuredPicked).toBe("12");
    expect(band(container).dataset.featuredShown).toBe("10");
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
      const link = getByRole("link", { name: "Properties" });
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
        const link = getByRole("link", { name: "Properties" });
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
      const link = getByRole("link", { name: "Properties" });
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
      // on the sand card now (9.38:1, theme-contrast.test.ts) — garnet, which
      // is BrandButton's default and what the slide's LEARN MORE beside it
      // wears.
      const { getByRole } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      const link = getByRole("link", { name: "Properties" });
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
        const { container, queryByRole, unmount } = render(FeaturedProperties, {
          props: { slice: featuredPropertiesFixture(primary as never) },
        });
        // By its slot, not only by its name: with the label blanked, a check
        // for the name "Properties" alone would pass whatever was drawn.
        expect(queryByRole("link", { name: "Properties" }), JSON.stringify(primary)).toBeNull();
        expect(
          container.querySelector("[data-featured-portfolio]"),
          JSON.stringify(primary),
        ).toBeNull();
        unmount();
      }
    });

    it("stays with the band in the one-slide state, and goes with it in the empty one", () => {
      const one = render(FeaturedProperties, { props: { slice: featuredLaunchFixture() } });
      expect(one.getByRole("link", { name: "Properties" })).toBeTruthy();
      one.unmount();
      const none = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ properties: [] }) },
      });
      expect(none.queryByRole("link", { name: "Properties" })).toBeNull();
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
        // And since 2026-09-29 a THIRD: the picture's own credit
        // (`MAP_HOME_CREDIT`), the OpenMapTiles and OpenStreetMap licence
        // links — asserted as exactly those two, so the exemption is a claim.
        const credit = (l: Element) => l.closest("[data-map-home-credit]") !== null;
        expect(
          [...band(container).querySelectorAll("a")]
            .filter(credit)
            .map((l) => l.getAttribute("href")),
          "the picture's credit",
        ).toEqual(["https://www.openmaptiles.org/", "https://www.openstreetmap.org/copyright"]);
        const links = [...band(container).querySelectorAll("a")].filter(
          (l) =>
            !l.hasAttribute("data-map-link") && !l.hasAttribute("data-map-home-pin") && !credit(l),
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

  // THE BAND'S MAP IS A PICTURE WHILE THE SLIDESHOW RUNS, AND A MAP WHILE IT IS
  // STOPPED (operator call, 2026-09-23): "map should get all navigation tools
  // when the slideshow is paused, and be uninteractable when the slideshow is
  // running". The rule at the call site is `carousel.paused ||
  // !carousel.eligible`. Each case below is one state of the carousel, and
  // each asserts its PREMISE first — that the carousel really is in the state
  // the case names — from something the carousel renders, not from the rule.
  describe("the map's lock follows the slideshow", () => {
    /** The live region is `aria-live="off"` exactly while the clock is
     *  running (`rotating`) — the one thing the band draws off that value. */
    const running = (container: HTMLElement) =>
      card(container).querySelector("[aria-live]")!.getAttribute("aria-live") === "off";
    const PROPERTIES_SET = [
      "boxZoom",
      "doubleClickZoom",
      "dragPan",
      "keyboard",
      "scrollZoom",
      "touchZoomRotate",
    ];

    /** Render the band with its map booted on the fake engine. */
    async function withMap(slice = featuredPropertiesFixture()) {
      engine.maps.length = 0;
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(public cb: IntersectionObserverCallback) {}
          observe(el: Element) {
            this.cb(
              [
                {
                  isIntersecting: true,
                  target: el,
                  boundingClientRect: { height: 200 } as DOMRectReadOnly,
                  intersectionRect: { height: 200 } as DOMRectReadOnly,
                  rootBounds: { height: 844 } as DOMRectReadOnly,
                  intersectionRatio: 1,
                  time: 0,
                } as IntersectionObserverEntry,
              ],
              this as never,
            );
          }
          unobserve() {}
          disconnect() {}
          takeRecords() {
            return [];
          }
        },
      );
      const view = render(FeaturedProperties, { props: { slice } });
      await vi.waitFor(() => expect(engine.maps).toHaveLength(1));
      await tick();
      const map = engine.maps[0]!;
      return { ...view, map, canvas: map.canvas };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
    });

    it("running: the map offers no tool and takes no focus", async () => {
      const { container, map, canvas } = await withMap();
      expect(running(container), "premise: the slideshow is running").toBe(true);
      expect(map.tools()).toEqual([]);
      expect(canvas.hasAttribute("tabindex")).toBe(false);
    });

    it("Pause: every tool /properties has, and focus; Play takes them all back", async () => {
      const { container, getByRole, map, canvas } = await withMap();
      getByRole("button", { name: "Pause slides" }).click();
      await tick();
      expect(running(container), "premise: stopped by the visitor").toBe(false);
      expect(map.tools()).toEqual(PROPERTIES_SET);
      expect(canvas.getAttribute("tabindex")).toBe("0");

      getByRole("button", { name: "Play slides" }).click();
      await tick();
      expect(running(container), "premise: running again").toBe(true);
      expect(map.tools()).toEqual([]);
      expect(canvas.hasAttribute("tabindex")).toBe(false);
    });

    // M1 (operator call 2026-09-28): the map's own controls engage it. The
    // expand press on a running slideshow is a pause; collapsing is not a Play.
    it("pressing the map's expand on a running slideshow pauses it and unlocks the map", async () => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(public cb: ResizeObserverCallback) {}
          observe() {
            this.cb(
              [{ contentRect: { width: 390, height: 200 } } as ResizeObserverEntry],
              this as never,
            );
          }
          unobserve() {}
          disconnect() {}
        },
      );
      const { container, getByRole, map } = await withMap();
      expect(running(container), "premise: the slideshow is running").toBe(true);
      const expand = container.querySelector<HTMLButtonElement>("[data-map-expand]")!;
      expand.click();
      await tick();
      expect(getByRole("button", { name: "Play slides" }), "the press paused it").toBeTruthy();
      expect(map.tools()).toEqual(PROPERTIES_SET);

      container.querySelector<HTMLButtonElement>("[data-map-expand]")!.click();
      await tick();
      expect(
        getByRole("button", { name: "Play slides" }),
        "collapsing does not resume it; only Play does",
      ).toBeTruthy();
    });

    it("focus entering the carousel is a pause, and unlocks it the same way", async () => {
      const { container, map } = await withMap();
      const arrow = card(container).querySelector<HTMLButtonElement>(
        'button[aria-label="Next slide"]',
      )!;
      arrow.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: null }));
      await tick();
      expect(running(container), "premise: focus stopped the clock").toBe(false);
      expect(map.tools()).toEqual(PROPERTIES_SET);
    });

    // THE STATES IN WHICH NOBODY HAS STOPPED THE SLIDESHOW. A hidden tab
    // stops the clock and is not a pause, which is the case `!carousel.rotating`
    // gets wrong, and it is the case below this one that holds that.
    //
    // HOVER IS NOT A PAUSE, WHETHER OR NOT IT STOPS THE CLOCK — and that
    // "whether or not" is a correction. This case was written requiring the
    // hover to stop the clock ("premise: the hover stopped the clock"), which
    // it did when it was written. feat/manual-turns-animate then made hover no
    // pause at all (operator call: `pauseOnHover: false` on this band), and on
    // the tree with both branches the premise failed before the map was ever
    // looked at: 1 failed, deterministic, and on its own enough to keep `pnpm
    // verify` from reaching Playwright. The browser twin
    // (property-map-band-lock.spec.ts) had been written to pass either way
    // from the start; this one had not.
    //
    // So the premise is the one both trees share and the claim is about:
    // nobody paused the slideshow — the button still offers "Pause slides",
    // the name read off the same `paused` the lock is. What the hover did to
    // the clock is not asserted. Where it stops the clock this is a second
    // guard against `!rotating`; where it does not, the hidden tab is the only
    // one, and it is enough.
    it("a pointer resting on the card leaves the map locked, whether or not it stops the clock", async () => {
      const { container, getByRole, map } = await withMap();
      card(container).dispatchEvent(new Event("pointerenter"));
      await tick();
      expect(
        getByRole("button", { name: "Pause slides" }),
        "premise: nobody paused the slideshow",
      ).toBeTruthy();
      expect(map.tools(), "a hover is not a pause").toEqual([]);
      expect(map.canvas.hasAttribute("tabindex"), "and takes no focus").toBe(false);
    });

    it("a hidden tab stops the clock and is still no pause: the map stays locked", async () => {
      const { container, map } = await withMap();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      expect(running(container), "premise: the hidden tab stopped the clock").toBe(false);
      expect(map.tools()).toEqual([]);
    });

    it("under reduced motion nothing can run, so the map is interactive from the start", async () => {
      motion(true);
      const { container, map } = await withMap();
      expect(
        card(container).querySelector('button[aria-label="Pause slides"]'),
        "premise: no Pause, because no slideshow",
      ).toBeNull();
      expect(map.tools()).toEqual(PROPERTIES_SET);
    });
  });
});

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
import FeaturedProperties, { DWELL, TILT_DEG } from "./index.svelte";

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
/** 1-based number of the slide the live region names. */
const announced = (container: HTMLElement) =>
  Number(/Slide (\d+) of/.exec(card(container).querySelector("[aria-live]")!.textContent!)?.[1]);

describe("FeaturedProperties slice", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.featured_properties).toBe(FeaturedProperties);
  });

  describe("with the comp's three listings", () => {
    it("is a carousel named by its own visible heading, an h2", () => {
      const { container, getByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const heading = getByRole("heading", { level: 2 });
      expect(heading.textContent).toBe("Featured Properties");

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
      expect(second.getByText("7,863 SF")).toBeTruthy();
      expect(second.getAllByRole("listitem", { hidden: true })).toHaveLength(2);
      // "Learn more" three times over is three identical link names; the
      // suffix is what tells them apart to a screen reader's links list.
      const link = second.getByRole("link", {
        name: "Learn more about 101 W. Commerce Street",
        hidden: true,
      });
      expect(link.getAttribute("href")).toBe("/properties/101-w-commerce-street");
    });

    it("draws a photo on every slide, lazy, with the editor's alt text", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const images = [...container.querySelectorAll("[data-featured-photo]")];
      expect(images).toHaveLength(slidesOf(container).length);
      for (const img of images) {
        expect(img.getAttribute("loading")).toBe("lazy");
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
      expect(first.classList.contains("invisible")).toBe(false);
      const lines = first.querySelectorAll("[data-featured-line]");
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line.classList.contains("opacity-0")).toBe(false);
      for (const s of rest) {
        expect(s.getAttribute("aria-hidden")).toBe("true");
        // jsdom has no `inert` PROPERTY, so the spread writes the attribute.
        expect(s.hasAttribute("inert") || (s as unknown as { inert: boolean }).inert).toBe(true);
        // …and out of the paint: an off-stage slide left at opacity 0 still
        // covers the card, which is what made axe answer `bgOverlap` instead
        // of a contrast ratio for six of the card's seven text nodes.
        expect(s.classList.contains("invisible")).toBe(true);
      }
    });

    it("keeps every control OUTSIDE the slides, and Pause first among them (#34)", () => {
      // The carousel's contract: a slide that turns away goes inert, and a
      // button inside it would turn its own slide from under the focus it
      // holds — the browser drops that focus on <body>. The comp DRAWS the
      // arrows inside the card's panel; they get there by grid placement.
      const { container, getByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const controls = ["Pause slides", "Previous slide", "Next slide"].map((name) =>
        getByRole("button", { name }),
      );
      for (const b of card(container).querySelectorAll("button"))
        expect(b.closest("[data-featured-slide]")).toBeNull();
      expect(container.querySelector("[data-featured-slide] button")).toBeNull();
      expect(container.querySelector("[data-featured-slide] [data-carousel-progress]")).toBeNull();

      // …and BEFORE the slides in the DOM, so Pause is the first stop on the
      // way in (APG) and LEARN MORE comes after the controls.
      const [pause, ...arrows] = controls;
      for (const b of arrows)
        expect(
          pause.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
          b.getAttribute("aria-label")!,
        ).toBeTruthy();
      const firstSlide = slidesOf(container)[0];
      for (const b of controls)
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
    });

    // ── Ken Burns: one CSS transition (operator call, 2026-09-29) ─────────
    //
    // jsdom runs no transitions, so what is held here is what WCAG asks of the
    // drift: that Pause and Play reach the transition's own Animation, through
    // a stand-in `getAnimations`, and that reduced motion declares none. That
    // the photo really moves, holds still while it leaves and freezes on Pause
    // is featured-properties.spec.ts's, in Chromium.

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

    it("reduced motion turned on mid-visit drops every photo's drift, and turned off brings it back", async () => {
      // A stand-in media query that can be flipped mid-test: the preference
      // is read through $lib/transitions' one listener.
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
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      expect(stylesOf(container).some(Boolean), "premise: the photos drift").toBe(true);
      expect(changed, "premise: the band hears the preference change").toBeTypeOf("function");
      reduce = true;
      changed!({ matches: true });
      await tick();
      expect(stylesOf(container), "reduced: no style at all").toEqual([null, null, null]);
      reduce = false;
      changed!({ matches: false });
      await tick();
      expect(stylesOf(container).some(Boolean), "motion again").toBe(true);
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
        const declared = stylesOf(container);
        await fireEvent.click(getByLabelText("Pause slides"));
        await fireEvent.click(getByLabelText("Play slides"));
        expect(calls, "on the clock").toEqual(["pause 0", "play 0"]);
        expect(stylesOf(container), "nothing re-declared").toEqual(declared);

        // A PAUSE ALREADY ON AT THE TURN IS NOT A REQUEST TO STOP IT. An arrow
        // press focuses the arrow (APG: a pause), and a script that focuses
        // and clicks in one task lands both in ONE flush. The photo the turn
        // brought on must keep drifting.
        calls.length = 0;
        const next = getByLabelText("Next slide");
        void fireEvent.focusIn(next);
        await fireEvent.click(next);
        expect(getByLabelText("Play slides"), "premise: the arrow's focus is a pause").toBeTruthy();
        expect(announced(container), "premise: turned").toBe(2);
        expect(calls, "the visitor's own turn, frozen").toEqual([]);

        // A real mouse puts the focus and the click in two flushes: the focus
        // freezes the photo about to leave (harmless — it holds anyway), and
        // still not the one the turn brings on.
        await fireEvent.click(getByLabelText("Play slides"));
        calls.length = 0;
        await fireEvent.focusIn(document.body);
        await fireEvent.focusIn(next);
        await fireEvent.click(next);
        expect(announced(container), "premise: turned again").toBe(3);
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

    it("tilts past the 1/4096 WebRender reads as no rotation at all", () => {
      // Measured in Firefox by the operator, 2026-09-30: smooth with
      // rotate(0.02deg) at both ends, ticking without. WebRender takes a
      // matrix whose off-diagonal is within 1/4096 of zero for a plain scale
      // (`ScaleOffset::from_transform`), so a "tidier" 0.01deg would quietly
      // be no tilt there. The photo is never drawn below scale 1, where the
      // off-diagonal is smallest: sin(TILT_DEG).
      expect(Math.sin((TILT_DEG * Math.PI) / 180)).toBeGreaterThan(1 / 4096);
    });

    describe("fetched no wider than its source", () => {
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
      const widthsOf = (img: HTMLImageElement) =>
        img
          .getAttribute("srcset")!
          .split(", ")
          .map((c) => Number(/ (\d+)w$/.exec(c)![1]));

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

    // ── the clock, and no hover pause (2026-09-23) ─────────────────────────
    //
    // Two calls on one afternoon: "remove the pause on hover, they have a
    // pause button for that. also double the length on time on each property,
    // it feels like we're rushing." What they look like in a browser is
    // featured-properties.spec.ts's; what is pinned here is the wiring.

    it("dwells DWELL on each listing and turns on it", async () => {
      // DWELL is the number the carousel was BUILT with, not only the one
      // exported: the first slide has no settle to wait for, so the clock
      // turns on exactly DWELL, and the next after DISSOLVE + DWELL more —
      // within a frame, since DISSOLVE + DWELL need not be a whole number of
      // 16ms frames.
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

    it("reveals the card by its fail-safe if nothing reports", async () => {
      // jsdom's IntersectionObserver is the no-op from vitest-setup.ts, so the
      // card stays in animateIn's HIDDEN state here until the fail-safe: that
      // state is what this reads, and then the fail-safe is. A no-op observer
      // never reports, which is exactly the dead observer it exists for.
      vi.useFakeTimers();
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const region = card(container);
      expect(region.getAttribute("data-reveal"), "premise: hidden for the reveal").toBe("");

      // The card ships `data-reveal` from the server (#105), so an observer
      // that never reports must not strand it.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(region.hasAttribute("data-reveal")).toBe(false);
      expect(region.style.opacity).not.toBe("0");
    });

    it("under reduced motion there is no Pause to press, and the bar shows position", () => {
      motion(true);
      const { container, getByRole, queryByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      expect(queryByRole("button", { name: "Pause slides" })).toBeNull();
      expect(queryByRole("button", { name: "Play slides" })).toBeNull();
      expect(getByRole("button", { name: "Previous slide" })).toBeTruthy();
      expect(getByRole("button", { name: "Next slide" })).toBeTruthy();
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
      expect(lines.length).toBeGreaterThan(0);
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
      const travel = /translateY\(([^)]*)\)/.exec(region.style.transform)?.[1] ?? "0";
      expect(parseFloat(travel), "no travel").toBe(0);
      expect(region.style.transition).toBe("");
    });
  });

  describe("with ONE showable listing — launch day", () => {
    it("is a plain card: no carousel roles, no arrows, no bar, no live region", () => {
      const { container, getByRole, queryByRole } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      const region = card(container);
      expect(region.hasAttribute("role")).toBe(false);
      expect(region.hasAttribute("aria-roledescription")).toBe(false);
      for (const name of ["Pause slides", "Play slides", "Previous slide", "Next slide"])
        expect(queryByRole("button", { name }), name).toBeNull();
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

    it("draws every one of the live listing's five bullets", () => {
      const { container } = render(FeaturedProperties, {
        props: { slice: featuredLaunchFixture() },
      });
      // The SLIDE's bullets. `container.querySelectorAll("li")` used to be
      // the same thing and is not any more: the map's own list of Google Maps
      // links is <li>s in this band too (#13), so an unqualified count reads
      // six and says nothing about the text block this test is about.
      expect(container.querySelectorAll("[data-featured-slide] li")).toHaveLength(5);
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

  it("fills the map's column with a map, as content rather than decoration", () => {
    const { container } = render(FeaturedProperties, {
      props: { slice: featuredPropertiesFixture() },
    });
    const slot = container.querySelector<HTMLElement>("[data-map-slot]")!;
    expect(slot.getAttribute("aria-hidden"), "the map is content, not decoration").toBeNull();
    expect(slot.querySelector("[data-property-map]"), "a map is mounted in it").not.toBeNull();
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
    // The pins are THESE listings, linking where their list rows link.
    const rows = [...slot.querySelectorAll("[data-map-link]")].map((a) => a.getAttribute("href"));
    const pins = [...picture!.querySelectorAll<HTMLAnchorElement>("[data-map-home-pin]")].map((a) =>
      a.getAttribute("href"),
    );
    expect(pins.length).toBeGreaterThan(0);
    for (const pin of pins) expect(rows).toContain(pin);
  });

  describe("the portfolio link", () => {
    // Removed in review on 2026-09-21 and restored by the operator's call the
    // same day, on ONE condition: it goes in the card's own column and never
    // again as a band-wide overlay.
    it("goes to /properties — a path an editor can only TYPE, resolved by cmsHref", () => {
      const { getByRole } = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture() },
      });
      const link = getByRole("link", { name: "See all properties" });
      expect(link.getAttribute("href")).toBe("/properties");
    });

    it("is outside every slide and outside the script-only row, so it never goes inert or missing", () => {
      // Outside every slide is the carousel's contract: a slide that turns
      // away goes `inert`, and a control inside one goes with it (#34). And
      // NOT inside the arrows' `data-js-only` row, so it is drawn with no
      // script and with one listing (#47).
      for (const slice of [featuredPropertiesFixture(), featuredLaunchFixture()]) {
        const { getByRole, unmount } = render(FeaturedProperties, { props: { slice } });
        const link = getByRole("link", { name: "See all properties" });
        // WCAG 2.5.3: the words on the button are inside the name it is spoken by.
        expect(link.getAttribute("aria-label")!.toLowerCase()).toContain(
          link.textContent!.replace(/\s+/g, " ").trim().toLowerCase(),
        );
        expect(link.closest("[data-featured-slide]")).toBeNull();
        expect(link.closest("[data-js-only]")).toBeNull();
        unmount();
      }
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
        expect(
          queryByRole("link", { name: "See all properties" }),
          JSON.stringify(primary),
        ).toBeNull();
        expect(
          container.querySelector("[data-featured-portfolio]"),
          JSON.stringify(primary),
        ).toBeNull();
        unmount();
      }
    });

    it("stays with the band in the one-slide state, and goes with it in the empty one", () => {
      const one = render(FeaturedProperties, { props: { slice: featuredLaunchFixture() } });
      expect(one.getByRole("link", { name: "See all properties" })).toBeTruthy();
      one.unmount();
      const none = render(FeaturedProperties, {
        props: { slice: featuredPropertiesFixture({ properties: [] }) },
      });
      expect(none.queryByRole("link", { name: "See all properties" })).toBeNull();
    });

    it("points each slide's LEARN MORE at its own listing, and credits the map's data", () => {
      for (const slice of [featuredPropertiesFixture(), featuredLaunchFixture()]) {
        const { container, unmount } = render(FeaturedProperties, { props: { slice } });
        // The picture's credit (`MAP_HOME_CREDIT`): the OpenMapTiles and
        // OpenStreetMap licence links.
        expect(
          [...band(container).querySelectorAll("[data-map-home-credit] a")].map((l) =>
            l.getAttribute("href"),
          ),
          "the picture's credit",
        ).toEqual(
          expect.arrayContaining([
            "https://www.openmaptiles.org/",
            "https://www.openstreetmap.org/copyright",
          ]),
        );
        for (const slide of slidesOf(container)) {
          const title = slide.querySelector("h3")!.textContent!.trim();
          const link = within(slide).getByRole("link", {
            name: `Learn more about ${title}`,
            hidden: true,
          });
          expect(link.getAttribute("href"), title).toMatch(/^\/properties\/.+/);
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

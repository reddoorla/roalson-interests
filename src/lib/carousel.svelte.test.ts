import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";
import { createCarousel, type Carousel, type CarouselOptions } from "./carousel.svelte";
import CarouselFixture from "../routes/dev/a11y-fixtures/CarouselFixture.svelte";

// TWO LAYERS, ON PURPOSE.
//
// "in markup" renders CarouselFixture — the same file the axe gate audits — and
// mirrors Slider.test.ts case for case, so everything Slider got right is
// pinned on the markup a consumer would actually write. Of Slider's 23 cases,
// 18 are mirrored there under the same names, 1 is adapted (dots → `goTo`,
// tested headlessly: the comp draws no dots) and 4 are dropped because the
// feature is not in this primitive: the three `cardsPerView` cases (range
// announcement, positions-not-items, fade ignoring it — one slide at a time is
// all either consumer shows) and "keeps the dots when arrows are hidden" (no
// dots, no `showArrows` switch; a headless module cannot make a consumer
// render a control).
//
// "headless" drives `createCarousel` alone inside `$effect.root`, for what no
// Slider case covers: the clock, `progress`, `settle`, `enabled`, and the two
// places this deliberately behaves differently from Slider (a hover pause
// FREEZES the dwell instead of restarting it; focus moving WITHIN the carousel
// does not re-pause after Play).
//
// THE CLOCK IN THESE TESTS. Fake timers fake requestAnimationFrame at 16ms a
// frame and `performance.now()` with it, so dwells here are whole frames
// (1600ms = 100 frames) and an advance can be asserted to the frame.

const FRAME = 16;
const DWELL = 100 * FRAME;

type MediaListener = (e: { matches: boolean }) => void;

let prefersReduced = false;
const mediaListeners = new Set<MediaListener>();

/** The OS preference changing mid-session, as transitions.ts's one
 *  MediaQueryList would report it. */
const setReducedMotion = (matches: boolean) => {
  prefersReduced = matches;
  for (const run of [...mediaListeners]) run({ matches });
};

const setVisibility = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};

const roots: (() => void)[] = [];

beforeEach(() => {
  prefersReduced = false;
  mediaListeners.clear();
  // A NEW function each test: transitions.ts re-creates its list when
  // `window.matchMedia` itself is swapped, so every test gets a live listener.
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? prefersReduced : false,
    media: query,
    addEventListener: (_: string, cb: MediaListener) => mediaListeners.add(cb),
    removeEventListener: (_: string, cb: MediaListener) => mediaListeners.delete(cb),
  }));
});

afterEach(() => {
  for (const destroy of roots.splice(0)) destroy();
  cleanup();
  // Spies BEFORE the timers, and here rather than at the end of the test that
  // made them: a test that fails never reaches its own mockRestore, and a
  // leaked spy on cancelAnimationFrame keeps pointing at a dead fake clock — so
  // in every LATER test no frame can be cancelled and no pause can stop the
  // clock. Seen while mutation-testing: 6 honest failures reported as 13.
  vi.restoreAllMocks();
  vi.useRealTimers();
  // Back to jsdom's own getter ("visible"), whatever a test defined over it.
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
};

// ── in markup ───────────────────────────────────────────────────────────────

const renderFixture = (props: Record<string, unknown> = {}) =>
  render(CarouselFixture, { count: 4, label: "Test slides", ...props });

/** All slides, including the ones hidden from assistive tech. */
const allSlides = (getAllByRole: ReturnType<typeof render>["getAllByRole"]) =>
  getAllByRole("group", { hidden: true }) as HTMLElement[];

// jsdom has no `inert` setter, so a SPREAD lands as the attribute here and as
// the property in a real browser (Slider's direct `inert={…}` is an expando
// property in jsdom). Either is inert; "false" written as an attribute would
// be too, which is why the bag hands back `undefined` for the active slide.
const isInert = (el: HTMLElement) => el.inert === true || el.hasAttribute("inert");

/** 1-based number of the ONE slide left in the accessibility tree. Throws if
 *  there is not exactly one — "slide 2 is active" must not pass on a carousel
 *  that exposes two. */
const current = (container: HTMLElement) => {
  const exposed = [...container.querySelectorAll<HTMLElement>('[role="group"]')]
    .map((el, i) => ({ el, n: i + 1 }))
    .filter(({ el }) => el.getAttribute("aria-hidden") === null);
  if (exposed.length !== 1) throw new Error(`${exposed.length} slides exposed, expected 1`);
  return exposed[0].n;
};

describe("carousel semantics, in markup", () => {
  it("exposes a labelled carousel region with one slide group per item", () => {
    const { getByRole, getAllByRole } = renderFixture();
    const region = getByRole("region");
    expect(region.getAttribute("aria-roledescription")).toBe("carousel");
    expect(region.getAttribute("aria-label")).toBe("Test slides");

    const slides = allSlides(getAllByRole);
    expect(slides.length).toBe(4);
    expect(slides[0].getAttribute("aria-roledescription")).toBe("slide");
    expect(slides[0].getAttribute("aria-label")).toBe("1 of 4");
    expect(slides[3].getAttribute("aria-label")).toBe("4 of 4");
  });

  it("names the region from a visible heading when given one, and drops the label", () => {
    const { getByRole } = renderFixture({ labelledby: "featured-heading" });
    const region = getByRole("region");
    expect(region.getAttribute("aria-labelledby")).toBe("featured-heading");
    expect(region.getAttribute("aria-label")).toBeNull();
  });

  it("hides out-of-view slides from assistive tech and focus", async () => {
    const { getAllByRole, getByLabelText } = renderFixture();
    const slides = allSlides(getAllByRole);

    expect(slides[0].getAttribute("aria-hidden")).toBeNull();
    expect(isInert(slides[0])).toBe(false);
    expect(slides[1].getAttribute("aria-hidden")).toBe("true");
    expect(isInert(slides[1])).toBe(true);

    await fireEvent.click(getByLabelText("Next slide"));

    expect(slides[0].getAttribute("aria-hidden")).toBe("true");
    expect(isInert(slides[0])).toBe(true);
    expect(slides[1].getAttribute("aria-hidden")).toBeNull();
    expect(isInert(slides[1])).toBe(false);
  });

  it("announces the position politely when idle", () => {
    const { container } = renderFixture();
    const status = container.querySelector('[aria-live="polite"]');
    expect(status?.textContent).toContain("Slide 1 of 4");
    expect(status?.getAttribute("aria-atomic")).toBe("true");
  });

  it("stacks slides and exposes only the active one", async () => {
    // Slider's fade-mode case: the fixture IS the fade stack.
    const { getAllByRole, getByLabelText } = renderFixture();
    const slides = allSlides(getAllByRole);

    expect(isInert(slides[0])).toBe(false);
    expect(isInert(slides[1])).toBe(true);
    expect(slides[0].className).toContain("opacity-100");
    expect(slides[1].className).toContain("opacity-0");
    expect(slides[1].className).toContain("row-start-1");

    await fireEvent.click(getByLabelText("Next slide"));
    expect(isInert(slides[0])).toBe(true);
    expect(isInert(slides[1])).toBe(false);
  });
});

describe("carousel navigation, in markup", () => {
  it("advances with next, retreats with prev, and wraps by default", async () => {
    const { container, getByLabelText } = renderFixture({ count: 3 });
    const next = getByLabelText("Next slide");

    await fireEvent.click(next);
    expect(current(container)).toBe(2);

    await fireEvent.click(next);
    expect(current(container)).toBe(3);
    await fireEvent.click(next); // past the end — wraps home
    expect(current(container)).toBe(1);

    await fireEvent.click(getByLabelText("Previous slide")); // wraps back
    expect(current(container)).toBe(3);
  });

  it("marks the arrows aria-disabled at the bounds when loop is off", async () => {
    // aria-disabled instead of disabled: the bound arrow keeps keyboard
    // focus instead of dumping it to <body>, and activating it is a no-op.
    const { container, getByLabelText } = renderFixture({ count: 3, loop: false });
    const prev = getByLabelText("Previous slide") as HTMLButtonElement;
    const next = getByLabelText("Next slide") as HTMLButtonElement;

    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(prev.disabled).toBe(false);
    await fireEvent.click(prev); // no-op at the start bound
    expect(current(container)).toBe(1);

    await fireEvent.click(next);
    expect(prev.getAttribute("aria-disabled")).toBeNull();
    expect(next.getAttribute("aria-disabled")).toBeNull();

    await fireEvent.click(next);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    await fireEvent.click(next); // no-op at the end bound
    expect(current(container)).toBe(3);
  });

  it("supports arrow keys on the controls", async () => {
    const { container, getByLabelText } = renderFixture();
    const next = getByLabelText("Next slide");

    await fireEvent.keyDown(next, { key: "ArrowRight" });
    expect(current(container)).toBe(2);

    await fireEvent.keyDown(next, { key: "ArrowLeft" });
    expect(current(container)).toBe(1);
  });

  it("takes arrow keys from a link inside a slide too — the handler is the region's", async () => {
    const { container, getByText } = renderFixture();
    await fireEvent.keyDown(getByText("Link in slide 1"), { key: "ArrowRight" });
    expect(current(container)).toBe(2);
  });

  it("leaves modified arrows alone — Alt+Left is the browser's Back", async () => {
    const { container, getByLabelText } = renderFixture();
    const next = getByLabelText("Next slide");
    for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
      const event = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      next.dispatchEvent(event);
      await tick();
      expect(event.defaultPrevented, modifier).toBe(false);
    }
    expect(current(container)).toBe(1);
  });

  it("renders no controls when everything already fits", () => {
    const { container, queryByLabelText } = renderFixture({ count: 1 });
    expect(queryByLabelText("Next slide")).toBeNull();
    expect(queryByLabelText("Previous slide")).toBeNull();
    expect(container.querySelector("[data-carousel-progress]")).toBeNull();
  });
});

describe("carousel autoplay, in markup", () => {
  it("advances on the interval and wraps at the end", async () => {
    vi.useFakeTimers();
    const { container } = renderFixture({ count: 3, autoplay: DWELL });

    await advance(DWELL - FRAME);
    expect(current(container)).toBe(1); // one frame short: not yet
    await advance(FRAME);
    expect(current(container)).toBe(2);

    await advance(2 * DWELL);
    expect(current(container)).toBe(1);
  });

  it("cancels its frame on unmount", async () => {
    vi.useFakeTimers();
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { unmount } = renderFixture({ autoplay: DWELL });
    await advance(FRAME);
    expect(vi.getTimerCount(), "the clock is running before unmount").toBe(1);

    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts the full delay after manual navigation", async () => {
    // Models swipe-style nav: jsdom clicks don't move focus, so the sticky
    // focus pause doesn't engage — same as a real touch swipe.
    vi.useFakeTimers();
    const { container, getByLabelText } = renderFixture({ autoplay: DWELL });

    await advance(DWELL * 0.6);
    await fireEvent.click(getByLabelText("Next slide")); // now on 2
    await advance(DWELL - FRAME); // the old dwell would have ended long ago
    expect(current(container)).toBe(2);
    await advance(FRAME);
    expect(current(container)).toBe(3);
  });

  it("pauses while hovered and resumes on leave — from where it froze, not from the top", async () => {
    vi.useFakeTimers();
    const { container, getByRole } = renderFixture({ autoplay: DWELL });
    const region = getByRole("region");

    await advance(DWELL / 2);
    await fireEvent(region, new Event("pointerenter"));
    await advance(3 * DWELL);
    expect(current(container)).toBe(1);

    await fireEvent(region, new Event("pointerleave"));
    // Slider restarts the whole delay here. A bar cannot: it was half full.
    await advance(DWELL / 2 - FRAME);
    expect(current(container)).toBe(1);
    await advance(FRAME);
    expect(current(container)).toBe(2);
  });

  it("focus stops rotation for good — only the play control resumes it (APG)", async () => {
    vi.useFakeTimers();
    const { container, getByRole, getByLabelText } = renderFixture({ autoplay: DWELL });
    const region = getByRole("region");

    await fireEvent(region, new FocusEvent("focusin", { bubbles: true }));
    await advance(3 * DWELL);
    expect(current(container)).toBe(1);

    // Leaving does NOT resume — the pause is sticky, not focus-tracked.
    await fireEvent(region, new FocusEvent("focusout", { bubbles: true, relatedTarget: null }));
    await advance(3 * DWELL);
    expect(current(container)).toBe(1);

    await fireEvent.click(getByLabelText("Play slides"));
    await advance(DWELL);
    expect(current(container)).toBe(2);
  });

  it("does not re-pause when focus moves WITHIN the carousel after Play", async () => {
    // Slider pauses on every focusin, so Play → Tab to the arrows stops it
    // again against the user's explicit request. "Enters" means from outside.
    vi.useFakeTimers();
    const { container, getByLabelText } = renderFixture({ autoplay: DWELL });

    const toggle = getByLabelText("Pause slides");
    await fireEvent(toggle, new FocusEvent("focusin", { bubbles: true, relatedTarget: null }));
    expect(toggle.getAttribute("aria-label")).toBe("Play slides");
    await fireEvent.click(toggle); // keyboard activation: detail 0
    expect(toggle.getAttribute("aria-label")).toBe("Pause slides");

    await fireEvent(
      getByLabelText("Next slide"),
      new FocusEvent("focusin", { bubbles: true, relatedTarget: toggle }),
    );
    expect(toggle.getAttribute("aria-label")).toBe("Pause slides");
    await advance(DWELL);
    expect(current(container)).toBe(2);
  });

  it("a MOUSE press on Pause ends paused, though the press itself focuses the button first", async () => {
    // Chromium's order: pointerdown → focus (focus ENTERS, rotation stops, the
    // label flips to Play) → click. A plain toggle on that click starts
    // rotation again: the user pressed Pause and got Play.
    vi.useFakeTimers();
    const { container, getByLabelText } = renderFixture({ autoplay: DWELL });
    const toggle = getByLabelText("Pause slides");

    await fireEvent.pointerDown(toggle);
    await fireEvent(toggle, new FocusEvent("focusin", { bubbles: true, relatedTarget: null }));
    await fireEvent.click(toggle, { detail: 1 });

    expect(toggle.getAttribute("aria-label")).toBe("Play slides");
    await advance(3 * DWELL);
    expect(current(container)).toBe(1);

    // …and the next mouse press, on what now says Play, plays.
    await fireEvent.pointerDown(toggle);
    await fireEvent.click(toggle, { detail: 1 });
    expect(toggle.getAttribute("aria-label")).toBe("Pause slides");
    await advance(DWELL);
    expect(current(container)).toBe(2);
  });

  it("offers a pause control that stops rotation until played again", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = renderFixture({ autoplay: DWELL });

    await fireEvent.click(getByLabelText("Pause slides"));
    await advance(3 * DWELL);
    expect(current(container)).toBe(1);

    await fireEvent.click(getByLabelText("Play slides"));
    await advance(DWELL);
    expect(current(container)).toBe(2);
  });

  it("puts the pause control first in the carousel's tab order", () => {
    const { getByRole } = renderFixture({ autoplay: DWELL });
    const focusable = getByRole("region").querySelectorAll("button, a[href]");
    expect(focusable[0].getAttribute("aria-label")).toBe("Pause slides");
  });

  it("mutes the live region while rotating, politely announces when paused", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = renderFixture({ autoplay: DWELL });

    expect(container.querySelector('[aria-live="off"]')).toBeTruthy();
    expect(container.querySelector('[aria-live="polite"]')).toBeNull();
    await fireEvent.click(getByLabelText("Pause slides"));
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it("never rotates under prefers-reduced-motion — and drops the dead pause button", async () => {
    vi.useFakeTimers();
    prefersReduced = true;
    const { container, queryByLabelText, getByLabelText } = renderFixture({ autoplay: DWELL });

    await advance(5 * DWELL);
    expect(current(container)).toBe(1);
    expect(queryByLabelText("Pause slides")).toBeNull();
    expect(queryByLabelText("Play slides")).toBeNull();
    // Not a carousel that broke: the arrows are there and work.
    await fireEvent.click(getByLabelText("Next slide"));
    expect(current(container)).toBe(2);
  });

  it("stops the moment reduced motion is switched on mid-session", async () => {
    vi.useFakeTimers();
    const { container, queryByLabelText } = renderFixture({ autoplay: DWELL });
    await advance(DWELL);
    expect(current(container)).toBe(2);

    setReducedMotion(true);
    await advance(5 * DWELL);
    expect(current(container)).toBe(2);
    expect(queryByLabelText("Pause slides")).toBeNull();
  });

  it("parks at the last position instead of wrapping when loop is off", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = renderFixture({
      count: 3,
      autoplay: DWELL,
      loop: false,
    });

    await advance(5 * DWELL);
    expect(current(container)).toBe(3);
    const next = getByLabelText("Next slide") as HTMLButtonElement;
    expect(next.getAttribute("aria-disabled")).toBe("true");
    // Parked is not rotating: the clock is gone and the live region speaks.
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
  });

  it("stops rotating when the tab is hidden", async () => {
    vi.useFakeTimers();
    const { container } = renderFixture({ autoplay: DWELL });

    setVisibility("hidden");
    await advance(3 * DWELL);
    expect(current(container)).toBe(1);

    setVisibility("visible");
    await advance(DWELL);
    expect(current(container)).toBe(2);
  });
});

// ── headless ────────────────────────────────────────────────────────────────

/** `createCarousel` registers effects, so it needs an owner. */
function mount(options: CarouselOptions): Carousel {
  let carousel!: Carousel;
  roots.push(
    $effect.root(() => {
      carousel = createCarousel(options);
    }),
  );
  flushSync();
  return carousel;
}

describe("createCarousel, headless", () => {
  it("jumps directly with goTo, clamped to the slides that exist", () => {
    // Slider's "jumps directly via the dots", without the dots.
    const carousel = mount({ count: 4 });
    carousel.goTo(2);
    expect(carousel.index).toBe(2);
    carousel.goTo(99);
    expect(carousel.index).toBe(3);
    carousel.goTo(-5);
    expect(carousel.index).toBe(0);
    carousel.goTo(Number.NaN);
    expect(carousel.index).toBe(0);
  });

  it("wraps exactly at the ends: last → 0 going on, 0 → last going back", () => {
    const carousel = mount({ count: 3 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      carousel.next();
      seen.push(carousel.index);
    }
    expect(seen).toEqual([1, 2, 0, 1]);
    carousel.goTo(0);
    carousel.prev();
    expect(carousel.index).toBe(2);
  });

  it("reports the bounds only when loop is off", () => {
    const looping = mount({ count: 3 });
    expect([looping.atStart, looping.atEnd]).toEqual([false, false]);

    const bounded = mount({ count: 3, loop: false });
    expect([bounded.atStart, bounded.atEnd]).toEqual([true, false]);
    expect(bounded.prev()).toBe(false);
    bounded.goTo(2);
    expect([bounded.atStart, bounded.atEnd]).toEqual([false, true]);
    expect(bounded.next()).toBe(false);
    expect(bounded.index).toBe(2);
  });

  it("follows a count that shrinks under it", () => {
    let count = $state(4);
    const carousel = mount({ count: () => count });
    carousel.goTo(3);
    count = 2;
    expect(carousel.index).toBe(1);
    expect(carousel.slide(1)["aria-label"]).toBe("2 of 2");
    expect(carousel.statusText).toBe("Slide 2 of 2");
  });

  it("is adopted by script: hydrated only once effects have run", () => {
    let carousel!: Carousel;
    roots.push(
      $effect.root(() => {
        carousel = createCarousel({ count: 3 });
      }),
    );
    expect(carousel.hydrated, "what the server renders").toBe(false);
    flushSync();
    expect(carousel.hydrated).toBe(true);
  });

  it("claims no rotation before script adopts it — there is no clock on the server", () => {
    vi.useFakeTimers();
    let carousel!: Carousel;
    roots.push(
      $effect.root(() => {
        carousel = createCarousel({ count: 3, autoplay: DWELL });
      }),
    );
    // Before any effect has run is exactly what SSR (and a no-JS browser) gets:
    // autoplay is possible, so the pause control is in the markup, but nothing
    // is rotating and the live region must not ship muted.
    expect(carousel.eligible).toBe(true);
    expect(carousel.rotating).toBe(false);
    expect(carousel.status["aria-live"]).toBe("polite");
    flushSync();
    expect(carousel.rotating).toBe(true);
    expect(carousel.status["aria-live"]).toBe("off");
  });

  it("drives progress and the advance off one clock", async () => {
    vi.useFakeTimers();
    const carousel = mount({ count: 3, autoplay: DWELL });
    expect(carousel.rotating).toBe(true);
    expect(carousel.progress).toBe(0);

    await advance(DWELL / 4);
    expect(carousel.progress).toBeCloseTo(0.25, 10);
    await advance(DWELL / 2);
    expect(carousel.progress).toBeCloseTo(0.75, 10);
    expect(carousel.index).toBe(0);

    // The frame the bar would reach 1 on IS the frame the slide changes on.
    await advance(DWELL / 4 - FRAME);
    expect(carousel.index).toBe(0);
    expect(carousel.progress).toBeCloseTo(1 - FRAME / DWELL, 10);
    await advance(FRAME);
    expect(carousel.index).toBe(1);
    expect(carousel.progress).toBe(0);
  });

  it("freezes progress on every kind of pause and resumes from the same point", async () => {
    vi.useFakeTimers();
    const carousel = mount({ count: 3, autoplay: DWELL });
    const region = carousel.region as Record<string, (e?: unknown) => void>;

    // Every pause below lasts 7.3 dwells — deliberately NOT a whole number. A
    // clock that ignored the pause would come back round to the same fraction
    // after 7 and this would pass on a bar that never stopped.
    await advance(DWELL * 0.25);
    region.onpointerenter();
    await advance(7.3 * DWELL);
    expect(carousel.rotating).toBe(false);
    expect(carousel.progress).toBeCloseTo(0.25, 10);
    region.onpointerleave();

    await advance(DWELL * 0.25);
    carousel.pause();
    await advance(7.3 * DWELL);
    expect(carousel.progress).toBeCloseTo(0.5, 10);
    carousel.play();

    await advance(DWELL * 0.25);
    setVisibility("hidden");
    await advance(7.3 * DWELL);
    expect(carousel.progress).toBeCloseTo(0.75, 10);
    setVisibility("visible");

    // 0.75 of a dwell has run across three pauses; the slide turns after
    // exactly the last quarter — the bar and the rotation never disagreed.
    expect(carousel.index).toBe(0);
    await advance(DWELL * 0.25 - FRAME);
    expect(carousel.index).toBe(0);
    await advance(FRAME);
    expect(carousel.index).toBe(1);
  });

  it("holds the bar at 0 through `settle`, so a loop costs count × (dwell + settle)", async () => {
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME; // 512ms, a whole number of frames near the comp's 500
    const carousel = mount({ count: 3, autoplay: DWELL, settle: SETTLE });

    // The first slide has no transition to wait for.
    await advance(DWELL);
    expect(carousel.index).toBe(1);

    await advance(SETTLE);
    expect(carousel.progress).toBe(0);
    await advance(DWELL / 2);
    expect(carousel.progress).toBeCloseTo(0.5, 10);
    await advance(DWELL / 2);
    expect(carousel.index).toBe(2);

    // …and a full loop from here lands back on the same slide.
    await advance(3 * (DWELL + SETTLE) - FRAME);
    expect(carousel.index).toBe(1);
    await advance(FRAME);
    expect(carousel.index).toBe(2);
  });

  it("restarts the dwell after any manual change, settle included", async () => {
    vi.useFakeTimers();
    const carousel = mount({ count: 4, autoplay: DWELL, settle: 2 * FRAME });
    await advance(DWELL / 2);
    carousel.goTo(2);
    expect(carousel.progress).toBe(0);
    await advance(2 * FRAME + DWELL - FRAME);
    expect(carousel.index).toBe(2);
    await advance(FRAME);
    expect(carousel.index).toBe(3);
  });

  it("reports a full bar when parked at the end with loop off", async () => {
    vi.useFakeTimers();
    const carousel = mount({ count: 2, autoplay: DWELL, loop: false });
    await advance(DWELL);
    expect(carousel.index).toBe(1);
    expect(carousel.rotating).toBe(false);
    expect(carousel.eligible).toBe(true);
    expect(carousel.progress).toBe(1);
  });

  it("draws position, not progress, where nothing is timing out", () => {
    const carousel = mount({ count: 4 });
    expect(carousel.eligible).toBe(false);
    expect(carousel.progress).toBe(0);
    expect(carousel.position).toBe(0.25);
    carousel.goTo(3);
    expect(carousel.position).toBe(1);
    expect(mount({ count: 0 }).position).toBe(0);
  });

  it("is not eligible with one slide, with autoplay 0, or under reduced motion", () => {
    expect(mount({ count: 1, autoplay: DWELL }).eligible).toBe(false);
    expect(mount({ count: 3, autoplay: 0 }).eligible).toBe(false);
    expect(mount({ count: 3, autoplay: DWELL }).eligible).toBe(true);
    prefersReduced = true;
    expect(mount({ count: 3, autoplay: DWELL }).eligible).toBe(false);
  });

  it("switched off, hands back empty bags and never rotates — and comes back on", async () => {
    vi.useFakeTimers();
    let enabled = $state(false);
    const carousel = mount({
      count: 3,
      autoplay: DWELL,
      label: "Listings",
      enabled: () => enabled,
    });

    expect(carousel.region).toEqual({});
    expect(carousel.slide(1)).toEqual({});
    expect(carousel.status).toEqual({});
    expect(carousel.swipe).toEqual({});
    expect(carousel.statusText).toBe("");
    expect(carousel.next()).toBe(false);
    await advance(3 * DWELL);
    expect(carousel.index).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    enabled = true;
    flushSync();
    expect(carousel.region.role).toBe("region");
    expect(carousel.slide(1).inert).toBe(true);
    await advance(DWELL);
    expect(carousel.index).toBe(1);
  });

  it("keeps out of text fields: an arrow key in an input moves the caret, not the slide", () => {
    const carousel = mount({ count: 3 });
    const onkeydown = carousel.region.onkeydown as unknown as (e: KeyboardEvent) => void;
    const input = document.createElement("input");
    const event = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
    Object.defineProperty(event, "target", { value: input });
    onkeydown(event);
    expect(carousel.index).toBe(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("swipes: left goes on, right goes back", () => {
    const carousel = mount({ count: 3 });
    const onswipe = (carousel.swipe as unknown as Record<string, (e: unknown) => void>).onswipe;
    expect(typeof onswipe).toBe("function");
    onswipe({ detail: { direction: "left" } });
    expect(carousel.index).toBe(1);
    onswipe({ detail: { direction: "right" } });
    expect(carousel.index).toBe(0);
    onswipe({ detail: { direction: "top" } });
    expect(carousel.index).toBe(0);
  });

  it("listens to nothing when it cannot autoplay", () => {
    const add = vi.spyOn(document, "addEventListener");
    mount({ count: 3 });
    expect(add.mock.calls.filter(([type]) => type === "visibilitychange")).toEqual([]);
    expect(mediaListeners.size).toBe(0);

    mount({ count: 3, autoplay: DWELL });
    expect(add.mock.calls.filter(([type]) => type === "visibilitychange").length).toBe(1);
    // transitions.ts's ONE list, not a private one: a second carousel adds no
    // second media listener.
    mount({ count: 3, autoplay: DWELL });
    expect(mediaListeners.size).toBe(1);
  });
});

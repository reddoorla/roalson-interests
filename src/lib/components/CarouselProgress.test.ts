import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { flushSync, mount, tick, unmount } from "svelte";
import { PROGRESS_TONES } from "./CarouselProgress.svelte";
import CarouselFixture from "../../routes/dev/a11y-fixtures/CarouselFixture.svelte";

const FRAME = 16;
const DWELL = 100 * FRAME;

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const advance = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await tick();
};

const bar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-carousel-progress]")!;
const fill = (container: HTMLElement) => bar(container).firstElementChild as HTMLElement;
const scale = (container: HTMLElement) =>
  Number(/scaleX\(([^)]+)\)/.exec(fill(container).getAttribute("style") ?? "")?.[1]);

describe("CarouselProgress", () => {
  it("is the comp's 2px line, and says nothing to assistive tech", () => {
    const { container } = render(CarouselFixture, { count: 3 });
    const classes = bar(container).className.split(/\s+/);
    expect(classes).toContain("h-0.5");
    expect(classes).toContain("w-full");
    expect(classes).toContain("overflow-hidden");
    expect(bar(container).getAttribute("aria-hidden")).toBe("true");
    expect(bar(container).hasAttribute("data-js-only")).toBe(true);
    expect(fill(container).className).toContain("origin-left");
  });

  it("ships QUIET and goes live only when an effect has run (#47)", () => {
    // The arrows' rule and the arrows' test (CarouselArrows.test.ts): the bar
    // keeps its 2px of the row from the server's markup on, but a line that
    // cannot move is not shown as if it could.
    const target = document.createElement("div");
    document.body.append(target);
    const app = mount(CarouselFixture, { target, props: { count: 3, autoplay: DWELL } });
    try {
      const line = bar(target);
      expect(line.hasAttribute("data-carousel-quiet")).toBe(true);
      const classes = line.className.split(/\s+/);
      expect(classes).toContain("invisible");
      expect(classes, "the 2px is still reserved").toContain("h-0.5");
      expect(classes).not.toContain("hidden");

      flushSync();
      expect(bar(target).hasAttribute("data-carousel-quiet"), "script adopted it").toBe(false);
      expect(bar(target).className.split(/\s+/)).not.toContain("invisible");
    } finally {
      unmount(app);
      target.remove();
    }
  });

  it("draws nothing for a carousel that is switched off", async () => {
    const { container, rerender } = render(CarouselFixture, { count: 3, enabled: false });
    expect(container.querySelector("[data-carousel-progress]")).toBeNull();
    // The same render, switched on, has the bar — the null is the switch.
    await rerender({ enabled: true });
    expect(bar(container).dataset.carouselProgress).toBe("position");
  });

  it("draws the carousel's clock while it can autoplay — and freezes with it", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = render(CarouselFixture, { count: 3, autoplay: DWELL });
    expect(bar(container).dataset.carouselProgress).toBe("timed");
    expect(scale(container)).toBe(0);

    await advance(DWELL / 2);
    expect(scale(container)).toBeCloseTo(0.5, 10);
    // No easing on top of the clock — the VALUE the clock draws is `scaleX`,
    // and a transition on it would keep moving after a pause. The bar does
    // fade at a handover (see below), so the assertion is no longer "no
    // transition at all": it is that nothing eases the transform, and that
    // mid-dwell the fade is parked at 0ms with the fill fully opaque.
    expect(fill(container).className).not.toContain("transition-transform");
    expect(fill(container).className.split(/\s+/)).toContain("transition-opacity");
    expect(fill(container).className.split(/\s+/)).toContain("opacity-100");
    expect(fill(container).getAttribute("style")).toContain("transition-duration: 0ms");
    expect(fill(container).dataset.carouselFill).toBe("timed");

    await fireEvent.click(getByLabelText("Pause slides"));
    // 5.25 dwells, not 5: a bar that ignored the pause is back at 0.5 after a
    // whole number of them (mutation-tested: it was, and this passed).
    await advance(5.25 * DWELL);
    expect(scale(container)).toBeCloseTo(0.5, 10);

    await fireEvent.click(getByLabelText("Play slides"));
    await advance(DWELL / 2);
    expect(scale(container)).toBe(0); // the slide turned; the next dwell starts empty
  });

  // ── the handover dissolve ───────────────────────────────────────────────
  //
  // REVERSED DECISION. The bar used to snap to 0 at a turn and wait out the
  // consumer's dissolve there; the comp cross-dissolves a full bar into an
  // empty one, and the operator asked for the comp.
  //
  // AND THE FIRST ATTEMPT AT IT DID NOT EXIST ON SCREEN. It faded the opacity
  // while leaving `scaleX` snapped to 0, which is a 500ms cross-fade on a box
  // with no width: measured on a production build, painted width 0.00px for
  // every frame of the handover while opacity went 1.000 -> 0.102. The fill
  // now HOLDS 1 through the handover, which is what the clock last said
  // (a handover only ever follows a completed dwell). The transform is still
  // never eased — the case above proves that — so there is still one clock.

  it("dissolves the fill across the consumer's settle when the CLOCK turns", async () => {
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME; // 512ms, a whole number of frames near the comp's 500
    const { container } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });

    // Mid-dwell: opaque, and the fade parked at 0ms so nothing is pending.
    await advance(DWELL / 2);
    expect(fill(container).dataset.carouselFill).toBe("timed");
    expect(fill(container).getAttribute("style")).toContain("transition-duration: 0ms");

    // The frame the clock turns the slide.
    await advance(DWELL / 2);
    expect(fill(container).dataset.carouselFill).toBe("handover");
    expect(fill(container).className.split(/\s+/)).toContain("opacity-0");
    // The fade lasts exactly the carousel's own settle — not a number written
    // into this component, which would drift from whatever the consumer uses.
    expect(fill(container).getAttribute("style")).toContain(`transition-duration: ${SETTLE}ms`);
    // …and the fill is AT FULL WIDTH while it fades. This is the assertion the
    // first version got backwards: it asserted `scale === 0`, which is exactly
    // the state in which the fade cannot be seen at all.
    expect(scale(container), "a fading fill with no width paints nothing").toBe(1);

    // The handover ends with the settle: the value returns to the clock, which
    // is at the start of a fresh dwell, and the fill comes back opaque at
    // 0ms — at scaleX(0) there is nothing to watch arrive.
    await advance(SETTLE);
    expect(scale(container)).toBeLessThan(0.1);
    expect(fill(container).dataset.carouselFill).toBe("timed");
    expect(fill(container).className.split(/\s+/)).toContain("opacity-100");
    expect(fill(container).getAttribute("style")).toContain("transition-duration: 0ms");
  });

  it("does NOT dissolve when the turn happens with the clock stopped", async () => {
    // THE REASON `handover` IS GATED ON `rotating` AND NOT ON `settling`
    // ALONE. A turn parks `elapsed` at -settle, and with the clock stopped
    // there is no frame loop to run it back up: `settling` stays true for as
    // long as the carousel stays paused. A bar gated on it alone would fade
    // out and never come back — measured below at ten laps.
    //
    // Written with an explicit Pause because jsdom's `click` dispatches no
    // focus: in a browser, pressing an arrow focuses it and focus entering is
    // itself the pause (APG), which is the state this reproduces.
    //
    // This comment used to go on: "A turn with the clock still RUNNING — a
    // swipe, which focuses nothing — does dissolve, and ends on its own
    // settle; that is the case above." The case above is a CLOCK turn, and
    // what a visitor's turn with the clock running actually drew was a FULL
    // bar fading out over a dwell nobody had counted. It no longer dissolves
    // at all (2026-09-23) — see the next case.
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME;
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });
    await advance(DWELL / 2);

    await fireEvent.click(getByLabelText("Pause slides"));
    await fireEvent.click(getByLabelText("Next slide"));
    expect(fill(container).dataset.carouselFill).toBe("timed");
    expect(fill(container).className.split(/\s+/)).toContain("opacity-100");
    // Ten laps later, with nothing running that could end a handover.
    await advance(10 * (DWELL + SETTLE));
    expect(fill(container).dataset.carouselFill).toBe("timed");
    expect(fill(container).className.split(/\s+/)).toContain("opacity-100");
    expect(scale(container)).toBe(0);
  });

  it("a VISITOR's turn never hands over — not even with the clock running over its settle", async () => {
    // THE CASE THE ONE ABOVE USED TO WAVE THROUGH. `rotating && settling` is
    // also true after a visitor's turn the moment the clock runs again over
    // the settle that turn parked: an arrow and then Play, or a swipe, whose
    // pointer stops the clock and leaves with the finger. Measured on the
    // featured band (2026-09-23): 41 frames at 887px in `handover` after a
    // manual turn and Play — a full bar for a dwell abandoned part-way, which
    // is not what the clock last said. jsdom's click focuses nothing, so the
    // clock keeps running through this turn: exactly that state.
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME;
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });
    await advance(DWELL / 2);
    expect(scale(container), "part-way through the first dwell").toBeGreaterThan(0.3);

    await fireEvent.click(getByLabelText("Next slide"));
    // Every frame of the settle: empty, opaque, never the handover.
    for (let t = 0; t < SETTLE; t += FRAME) {
      expect(fill(container).dataset.carouselFill, `${t}ms into the settle`).toBe("timed");
      expect(scale(container), `${t}ms into the settle`).toBe(0);
      expect(fill(container).className.split(/\s+/)).toContain("opacity-100");
      await advance(FRAME);
    }
    // …and the clock WAS running over it: the restarted dwell fills from 0.
    await advance(DWELL / 4);
    expect(scale(container)).toBeGreaterThan(0.1);
    expect(scale(container)).toBeLessThan(0.5);
  });

  it("never dissolves in position mode, where there is no handover to draw", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.useFakeTimers();
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: 32 * FRAME },
    });
    expect(fill(container).dataset.carouselFill).toBe("position");
    await fireEvent.click(getByLabelText("Next slide"));
    await advance(3 * DWELL);
    expect(fill(container).dataset.carouselFill).toBe("position");
    // Position mode eases the TRANSFORM instead, and has no opacity of its own.
    expect(fill(container).className).toContain("transition-transform");
    expect(fill(container).className).not.toContain("opacity-");
  });

  it("draws position where nothing is timing out", async () => {
    const { container, getByLabelText } = render(CarouselFixture, { count: 4 });
    expect(bar(container).dataset.carouselProgress).toBe("position");
    expect(scale(container)).toBe(0.25);
    await fireEvent.click(getByLabelText("Next slide"));
    expect(scale(container)).toBe(0.5);
    await fireEvent.click(getByLabelText("Previous slide"));
    await fireEvent.click(getByLabelText("Previous slide")); // wraps to the last
    expect(scale(container)).toBe(1);
    expect(fill(container).className).toContain("transition-transform");
  });

  it("falls back to position under reduced motion instead of a dead empty track", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container } = render(CarouselFixture, { count: 3, autoplay: DWELL });
    expect(bar(container).dataset.carouselProgress).toBe("position");
    expect(scale(container)).toBeCloseTo(1 / 3, 10);
  });

  it("takes the tone's two classes", () => {
    const { container } = render(CarouselFixture, { count: 3, tone: "cream" });
    expect(bar(container).className).toContain(PROGRESS_TONES.cream.track);
    expect(fill(container).className.split(/\s+/)).toContain(PROGRESS_TONES.cream.fill);
  });
});

// ── the colours, recomputed ─────────────────────────────────────────────────
//
// In position mode this bar is the only VISIBLE "2 of 3", so both of its edges
// are information (WCAG 1.4.11, 3:1): fill against track, and track against the
// ground it sits on. Everything below is computed from app.css's tokens and the
// class strings the component actually ships — not from numbers in a comment.

type Rgb = [number, number, number];

const css = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)![1];
const token = (name: string): Rgb => {
  const raw = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(theme)?.[1].trim();
  const hex = raw === "white" ? "#ffffff" : raw === "black" ? "#000000" : raw;
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`--color-${name} is "${raw}"`);
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
};

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** What `bg-<token>` or `bg-<token>/<pct>` paints over `ground`. An alpha is
 *  composited the way a browser does it: per channel, in sRGB, rounded. */
function painted(cls: string, ground: Rgb): Rgb {
  const m = /^bg-([a-z-]+?)(?:\/(\d+))?$/.exec(cls);
  if (!m) throw new Error(`"${cls}" is not a bg-<token>[/<pct>] class`);
  const colour = token(m[1]);
  const alpha = m[2] === undefined ? 1 : Number(m[2]) / 100;
  return colour.map((c, i) => Math.round(c * alpha + ground[i] * (1 - alpha))) as Rgb;
}

const GROUNDS = {
  // Sand is the homepage card; off-white and white are the listing page's
  // flat cards and any plain ground. Garnet is the listing's featured card,
  // `dark` the homepage band itself.
  garnet: ["light", "background", "white"],
  cream: ["primary", "dark"],
} as const;

const NON_TEXT = 3;

describe("CarouselProgress tones", () => {
  const cases = Object.entries(GROUNDS).flatMap(([tone, grounds]) =>
    grounds.map((ground) => ({ tone: tone as keyof typeof PROGRESS_TONES, ground })),
  );

  it.each(cases)(
    "$tone on bg-$ground: fill, track and ground are each 3:1 apart",
    ({ tone, ground }) => {
      const g = token(ground);
      const fillRgb = painted(PROGRESS_TONES[tone].fill, g);
      const trackRgb = painted(PROGRESS_TONES[tone].track, g);
      const pairs = {
        "fill:track": contrast(fillRgb, trackRgb),
        "track:ground": contrast(trackRgb, g),
        "fill:ground": contrast(fillRgb, g),
      };
      for (const [pair, ratio] of Object.entries(pairs))
        expect(ratio, `${pair} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(NON_TEXT);
    },
  );

  it("cannot use the comp's own colours: dust is 1.73:1 on sand, and garnet leaves no room for ANY track", () => {
    const sand = token("light");
    expect(contrast(token("dust"), sand)).toBeLessThan(NON_TEXT);
    // Three colours each 3:1 apart need 9:1 between the outer two.
    expect(contrast(token("primary"), sand)).toBeLessThan(NON_TEXT * NON_TEXT);
    expect(contrast(token("dark"), sand)).toBeGreaterThan(NON_TEXT * NON_TEXT);
    // …searched, not just argued: no alpha of garnet works on the homepage card.
    const passing = Array.from({ length: 99 }, (_, i) => i + 1).filter((pct) => {
      const track = painted(`bg-primary/${pct}`, sand);
      return contrast(token("primary"), track) >= NON_TEXT && contrast(track, sand) >= NON_TEXT;
    });
    expect(passing).toEqual([]);
  });

  it("covers every tone the component ships", () => {
    expect(Object.keys(GROUNDS).sort()).toEqual(Object.keys(PROGRESS_TONES).sort());
  });
});

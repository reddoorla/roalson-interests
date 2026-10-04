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
  it("says nothing to assistive tech, and is hidden from a browser with no script", () => {
    const { container } = render(CarouselFixture, { count: 3 });
    expect(bar(container).getAttribute("aria-hidden")).toBe("true");
    expect(bar(container).hasAttribute("data-js-only")).toBe(true);
  });

  it("ships QUIET and goes live only when an effect has run (#47)", () => {
    // The arrows' rule and the arrows' test (CarouselArrows.test.ts): a line
    // that cannot move is not shown as if it could.
    const target = document.createElement("div");
    document.body.append(target);
    const app = mount(CarouselFixture, { target, props: { count: 3, autoplay: DWELL } });
    try {
      expect(bar(target).hasAttribute("data-carousel-quiet")).toBe(true);
      expect(bar(target).classList.contains("invisible")).toBe(true);

      flushSync();
      expect(bar(target).hasAttribute("data-carousel-quiet"), "script adopted it").toBe(false);
      expect(bar(target).classList.contains("invisible"), "stranded hidden after hydration").toBe(
        false,
      );
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
  // (a handover only ever follows a completed dwell).

  it("dissolves the fill across the consumer's settle when the CLOCK turns", async () => {
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME; // 512ms, a whole number of frames near the comp's 500
    const { container } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });

    await advance(DWELL / 2);
    expect(fill(container).dataset.carouselFill).toBe("timed");

    // The frame the clock turns the slide.
    await advance(DWELL / 2);
    expect(fill(container).dataset.carouselFill).toBe("handover");
    // The fill is AT FULL WIDTH while it fades. This is the assertion the
    // first version got backwards: it asserted `scale === 0`, which is exactly
    // the state in which the fade cannot be seen at all.
    expect(scale(container), "a fading fill with no width paints nothing").toBe(1);

    // The handover ends with the settle: the value returns to the clock, which
    // is at the start of a fresh dwell.
    await advance(SETTLE);
    expect(scale(container)).toBeLessThan(0.1);
    expect(fill(container).dataset.carouselFill).toBe("timed");
  });

  // ── a visitor's turn (#146) ─────────────────────────────────────────────
  //
  // REVERSED ON THE OPERATOR'S CALL (manual turns animate, 2026-09-23). A
  // visitor's turn used to drop the fill to 0 on the frame of the turn, and two
  // cases here pinned that snap. The fill now fades out at the width it was
  // DRAWN at — never full, which would be a count nobody finished — and is held
  // at opacity 0 for as long as the turn's settle lasts.

  it("a VISITOR's turn with the clock stopped fades the fill it found, and holds it out", async () => {
    // jsdom's `click` dispatches no focus, so the Pause stands in for the
    // arrow's own focus, which is the pause a browser press makes (APG).
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME;
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });
    await advance(DWELL / 2);
    const found = scale(container);
    expect(found, "part-way through the first dwell").toBeCloseTo(0.5, 10);

    await fireEvent.click(getByLabelText("Pause slides"));
    await fireEvent.click(getByLabelText("Next slide"));
    expect(fill(container).dataset.carouselFill).toBe("departing");
    // The width it was drawn at, not 0: a fade on a box with no width paints
    // nothing (the handover's lesson, above).
    expect(scale(container), "the fill keeps the width it was drawn at").toBe(found);

    // Ten laps later, with nothing running: still out. No timer brings back
    // a count the turn abandoned.
    await advance(10 * (DWELL + SETTLE));
    expect(fill(container).dataset.carouselFill).toBe("departing");
    expect(scale(container)).toBe(found);

    // Play runs the settle down on the clock, and only then does the fill
    // come back, at the top of a fresh dwell — never full.
    await fireEvent.click(getByLabelText("Play slides"));
    for (let t = 0; t < SETTLE - FRAME; t += FRAME) {
      expect(fill(container).dataset.carouselFill, `${t}ms into the settle`).toBe("departing");
      await advance(FRAME);
    }
    await advance(2 * FRAME);
    expect(fill(container).dataset.carouselFill).toBe("timed");
    expect(scale(container)).toBeLessThan(0.05);
  });

  it("a VISITOR's turn with the clock running fades the same way — and never hands over", async () => {
    // `rotating && settling` is true over the settle a visitor's turn parks
    // once the clock runs: the state that once drew a FULL bar (41 frames at
    // 887px on the featured band, 2026-09-23). jsdom's click focuses nothing,
    // so the clock runs straight through this turn.
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME;
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });
    await advance(DWELL / 2);
    const found = scale(container);
    expect(found, "part-way through the first dwell").toBeGreaterThan(0.3);

    await fireEvent.click(getByLabelText("Next slide"));
    // Every frame of the settle: the width it had, fading, never the handover.
    for (let t = 0; t < SETTLE - FRAME; t += FRAME) {
      expect(fill(container).dataset.carouselFill, `${t}ms into the settle`).toBe("departing");
      expect(scale(container), `${t}ms into the settle`).toBe(found);
      await advance(FRAME);
    }
    // …and the clock WAS running over it: the restarted dwell fills from 0.
    await advance(DWELL / 4);
    expect(fill(container).dataset.carouselFill).toBe("timed");
    expect(scale(container)).toBeGreaterThan(0.1);
    expect(scale(container)).toBeLessThan(0.5);
  });

  it("a second press inside the fade keeps the width that is fading", async () => {
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME;
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });
    await advance(DWELL / 2);
    const found = scale(container);
    await fireEvent.click(getByLabelText("Next slide"));
    await advance(5 * FRAME);
    await fireEvent.click(getByLabelText("Next slide"));
    // Not re-read off `progress`, which the first turn already restarted: that
    // would cut the running fade to a zero-width box.
    expect(fill(container).dataset.carouselFill).toBe("departing");
    expect(scale(container)).toBe(found);
  });

  it("a visitor's turn inside a CLOCK handover keeps the full bar that is fading", async () => {
    vi.useFakeTimers();
    const SETTLE = 32 * FRAME;
    const { container, getByLabelText } = render(CarouselFixture, {
      props: { count: 3, autoplay: DWELL, settle: SETTLE },
    });
    await advance(DWELL + 4 * FRAME);
    expect(fill(container).dataset.carouselFill).toBe("handover");
    expect(scale(container)).toBe(1);
    await fireEvent.click(getByLabelText("Next slide"));
    // Same width: the fade already running is left alone rather than cut to
    // a box with no width.
    expect(fill(container).dataset.carouselFill).toBe("departing");
    expect(scale(container)).toBe(1);
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

  it("draws the timed track while it times a slide, and the 3:1 track where it draws position", () => {
    const timed = render(CarouselFixture, { count: 3, autoplay: DWELL });
    const timedBar = bar(timed.container);
    expect(timedBar.dataset.carouselProgress).toBe("timed");
    expect(timedBar.className.split(/\s+/)).toContain(PROGRESS_TONES.garnet.timedTrack);
    timed.unmount();
    const still = render(CarouselFixture, { count: 3 });
    expect(bar(still.container).dataset.carouselProgress).toBe("position");
    expect(bar(still.container).className.split(/\s+/)).toContain(PROGRESS_TONES.garnet.track);
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

  // The timed track gives up track:ground (it is a countdown, not the only
  // "2 of 3"); the fill must still read against both what is left and the card.
  it.each(cases)(
    "$tone on bg-$ground while timed: the fill clears 3:1 against the timed track",
    ({ tone, ground }) => {
      const g = token(ground);
      const fillRgb = painted(PROGRESS_TONES[tone].fill, g);
      const trackRgb = painted(PROGRESS_TONES[tone].timedTrack, g);
      expect(contrast(fillRgb, trackRgb)).toBeGreaterThanOrEqual(NON_TEXT);
      expect(contrast(fillRgb, g)).toBeGreaterThanOrEqual(NON_TEXT);
    },
  );

  it("covers every tone the component ships", () => {
    expect(Object.keys(GROUNDS).sort()).toEqual(Object.keys(PROGRESS_TONES).sort());
  });
});

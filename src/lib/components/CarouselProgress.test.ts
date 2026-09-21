import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
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

  it("draws the carousel's clock while it can autoplay — and freezes with it", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = render(CarouselFixture, { count: 3, autoplay: DWELL });
    expect(bar(container).dataset.carouselProgress).toBe("timed");
    expect(scale(container)).toBe(0);

    await advance(DWELL / 2);
    expect(scale(container)).toBeCloseTo(0.5, 10);
    // No easing on top of the clock: a transition would keep moving after a pause.
    expect(fill(container).className).not.toContain("transition");

    await fireEvent.click(getByLabelText("Pause slides"));
    // 5.25 dwells, not 5: a bar that ignored the pause is back at 0.5 after a
    // whole number of them (mutation-tested: it was, and this passed).
    await advance(5.25 * DWELL);
    expect(scale(container)).toBeCloseTo(0.5, 10);

    await fireEvent.click(getByLabelText("Play slides"));
    await advance(DWELL / 2);
    expect(scale(container)).toBe(0); // the slide turned; the next dwell starts empty
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

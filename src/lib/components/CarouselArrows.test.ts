import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { ARROW_TONES } from "./CarouselArrows.svelte";
import CarouselFixture from "../../routes/dev/a11y-fixtures/CarouselFixture.svelte";

// Rendered through CarouselFixture: the arrows take a `createCarousel`
// instance, which needs a component (an effect owner) to exist in. What the
// buttons DO is carousel.svelte.test.ts's business; this file is about what
// they ARE — named controls, the tones, the pause control's place.

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

const arrows = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[data-js-only]:has(> button)")!;

const CONTROLS = ["Pause slides", "Previous slide", "Next slide"];

describe("CarouselArrows", () => {
  it("names both arrows, and hides their glyphs from assistive tech", () => {
    const { getByRole } = render(CarouselFixture, { count: 3 });
    for (const name of ["Previous slide", "Next slide"]) {
      const glyphs = [...getByRole("button", { name }).querySelectorAll("svg")];
      expect(glyphs.length, name).toBeGreaterThan(0);
      for (const svg of glyphs) expect(svg.getAttribute("aria-hidden"), name).toBe("true");
    }
  });

  it("is never a submit button", () => {
    const { getByLabelText } = render(CarouselFixture, { count: 3, autoplay: 1600 });
    // All three: a consumer may put the carousel inside a <form> (a listings
    // search), where a bare <button> submits it.
    for (const name of CONTROLS)
      expect(getByLabelText(name).getAttribute("type"), name).toBe("button");
  });

  it("ships in the server's markup but is hidden from a browser with no script", () => {
    const { container } = render(CarouselFixture, { count: 3 });
    expect(arrows(container).hasAttribute("data-js-only")).toBe(true);
    // The contract that attribute relies on, read from the file that keeps it.
    const appHtml = readFileSync(resolve(process.cwd(), "src/app.html"), "utf8");
    expect(appHtml).toMatch(/<noscript>[\s\S]*\[data-js-only\]\s*\{\s*display:\s*none/);
  });

  it("ships QUIET and goes live only when an effect has run (#47)", () => {
    // The state between the server's markup and hydration, which `render`
    // cannot show: @testing-library flushes effects, so `hydrated` is already
    // true by the time it hands back a container. `mount` + a read BEFORE
    // `flushSync` is the same DOM the browser holds while the bundle is on its
    // way — or forever, if it never arrives.
    const target = document.createElement("div");
    document.body.append(target);
    const app = mount(CarouselFixture, { target, props: { count: 3, autoplay: 1600 } });
    try {
      const wrapper = arrows(target);
      for (const name of CONTROLS)
        expect(wrapper.querySelector(`button[aria-label="${name}"]`), name).not.toBeNull();
      expect(wrapper.hasAttribute("data-carousel-quiet")).toBe(true);
      // `inert` reaches the DOM as the IDL property (Svelte prefers a setter
      // when one exists), which real browsers reflect back to the attribute
      // and jsdom does not — so the ATTRIBUTE is asserted in the browser, in
      // tests/interaction/featured-properties.spec.ts.
      expect(wrapper.inert, "not focusable, not clickable").toBe(true);
      expect(wrapper.classList.contains("invisible"), "quiet: not shown").toBe(true);

      flushSync();
      expect(wrapper.hasAttribute("data-carousel-quiet"), "script adopted it").toBe(false);
      expect(wrapper.inert).toBe(false);
      expect(wrapper.classList.contains("invisible"), "stranded hidden after hydration").toBe(
        false,
      );
    } finally {
      unmount(app);
      target.remove();
    }
  });

  it("takes its colours from the tone", () => {
    const light = render(CarouselFixture, { count: 3 });
    expect(light.getByLabelText("Next slide").className).toContain(ARROW_TONES.garnet);
    cleanup();

    const dark = render(CarouselFixture, { count: 3, tone: "cream" });
    expect(dark.getByLabelText("Next slide").className).toContain(ARROW_TONES.cream);
  });

  it("draws nothing for a carousel that is switched off", async () => {
    const { queryByLabelText, getByLabelText, rerender } = render(CarouselFixture, {
      count: 3,
      autoplay: 1600,
      enabled: false,
    });
    for (const name of CONTROLS) expect(queryByLabelText(name), name).toBeNull();
    // The same render, switched on, has all three — the null is the switch.
    await rerender({ enabled: true });
    for (const name of CONTROLS) expect(getByLabelText(name), name).toBeTruthy();
  });

  it("adds no pause control to a carousel that does not autoplay", () => {
    const { queryByLabelText, getByLabelText } = render(CarouselFixture, { count: 3 });
    expect(queryByLabelText("Pause slides")).toBeNull();
    expect(getByLabelText("Previous slide")).toBeTruthy();
    expect(getByLabelText("Next slide")).toBeTruthy();
  });

  it("puts Pause before the arrows when it autoplays, and swaps its glyph with its name", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = render(CarouselFixture, { count: 3, autoplay: 1600 });
    const order = [...arrows(container).querySelectorAll("button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(order.indexOf("Pause slides")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("Pause slides")).toBeLessThan(order.indexOf("Previous slide"));
    expect(order.indexOf("Previous slide")).toBeLessThan(order.indexOf("Next slide"));

    const toggle = getByLabelText("Pause slides");
    const playing = toggle.querySelector("svg")!.innerHTML;
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-label")).toBe("Play slides");
    expect(toggle.querySelector("svg")!.innerHTML, "the glyph follows the name").not.toBe(playing);
  });
});

// ── the tones, measured ─────────────────────────────────────────────────────
//
// The glyph is the control's only content (WCAG 1.4.11, 3:1), at rest and on
// its hover fill, against the grounds each tone is placed on — computed from
// app.css's tokens and the class strings the component ships.

type Rgb = [number, number, number];

const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(
  readFileSync(resolve(process.cwd(), "src/app.css"), "utf8"),
)![1];
const token = (name: string): Rgb | null => {
  const raw = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(theme)?.[1].trim();
  if (raw === undefined || raw === "transparent" || raw === "currentColor") return null;
  const hex = raw === "white" ? "#ffffff" : raw === "black" ? "#000000" : raw;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`--color-${name} is "${raw}"`);
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

/** What the tone's `<utility>-<token>[/<pct>]` paints over `ground`, at rest
 *  or under `hover:` — null when it sets none. */
function painted(classes: string, utility: "text" | "bg", hover: boolean, ground: Rgb) {
  for (const c of classes.split(/\s+/)) {
    const variants = c.split(":");
    const m = new RegExp(`^${utility}-([a-z-]+?)(?:/(\\d+))?$`).exec(variants.pop()!);
    if (!m || (hover ? !variants.includes("hover") : variants.length > 0)) continue;
    const colour = token(m[1]);
    if (!colour) continue;
    const alpha = m[2] === undefined ? 1 : Number(m[2]) / 100;
    return colour.map((v, i) => Math.round(v * alpha + ground[i] * (1 - alpha))) as Rgb;
  }
  return null;
}

const GROUNDS = {
  // "garnet" on the sand card and the listing's off-white and white grounds;
  // "cream" on the garnet card and the dark band.
  garnet: ["light", "background", "white"],
  cream: ["primary", "dark"],
} as const;

const NON_TEXT = 3;

describe("CarouselArrows tones", () => {
  const cases = Object.entries(GROUNDS).flatMap(([tone, grounds]) =>
    grounds.map((ground) => ({ tone: tone as keyof typeof ARROW_TONES, ground })),
  );

  it.each(cases)(
    "$tone on bg-$ground: the glyph clears 3:1 at rest and on hover",
    ({ tone, ground }) => {
      const classes = ARROW_TONES[tone];
      const g = token(ground)!;
      const restFill = painted(classes, "bg", false, g) ?? g;
      const rest = painted(classes, "text", false, restFill);
      expect(rest, `the ${tone} tone sets no glyph colour`).not.toBeNull();
      const hoverFill = painted(classes, "bg", true, g) ?? restFill;
      const hovered = painted(classes, "text", true, hoverFill) ?? rest!;
      expect(contrast(rest!, restFill), "at rest").toBeGreaterThanOrEqual(NON_TEXT);
      expect(contrast(hovered, hoverFill), "on hover").toBeGreaterThanOrEqual(NON_TEXT);
    },
  );

  it("covers every tone the component ships", () => {
    expect(Object.keys(GROUNDS).sort()).toEqual(Object.keys(ARROW_TONES).sort());
  });
});

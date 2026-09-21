import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { ARROW_TONES } from "./CarouselArrows.svelte";
import CarouselFixture from "../../routes/dev/a11y-fixtures/CarouselFixture.svelte";

// Rendered through CarouselFixture: the arrows take a `createCarousel`
// instance, which needs a component (an effect owner) to exist in. What the
// buttons DO is carousel.svelte.test.ts's business; this file is about what
// they ARE — the comp's glyph, the tones, the pause control's place.

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

describe("CarouselArrows", () => {
  it("names both arrows and draws ONE glyph twice, the left one turned", () => {
    const { getByLabelText } = render(CarouselFixture, { count: 3 });
    const prev = getByLabelText("Previous slide").querySelector("svg")!;
    const next = getByLabelText("Next slide").querySelector("svg")!;

    const d = (svg: SVGElement) =>
      [...svg.querySelectorAll("path")].map((p) => p.getAttribute("d"));
    expect(d(next).length).toBe(2);
    expect(d(prev)).toEqual(d(next));
    expect(prev.getAttribute("class")).toContain("rotate-180");
    expect(next.getAttribute("class")).not.toContain("rotate-180");
    expect(next.getAttribute("aria-hidden")).toBe("true");
  });

  it("is a 40px ring, and never a submit button", () => {
    // The 44px hit area is NOT asserted here: a class name said 44 while
    // Chromium measured 42 (an absolute inset starts inside the border). It is
    // measured, with elementFromPoint, in tests/interaction/carousel.spec.ts.
    const { getByLabelText } = render(CarouselFixture, { count: 3 });
    const next = getByLabelText("Next slide");
    expect(next.getAttribute("type")).toBe("button");
    const classes = next.className.split(/\s+/);
    for (const needed of ["size-10", "rounded-full", "border", "relative"])
      expect(classes, needed).toContain(needed);
  });

  it("ships in the server's markup but is hidden from a browser with no script", () => {
    const { container } = render(CarouselFixture, { count: 3 });
    expect(arrows(container).hasAttribute("data-js-only")).toBe(true);
    // The contract that attribute relies on, read from the file that keeps it.
    const appHtml = readFileSync(resolve(process.cwd(), "src/app.html"), "utf8");
    expect(appHtml).toMatch(/<noscript>[\s\S]*\[data-js-only\]\s*\{\s*display:\s*none/);
  });

  it("takes its colours from the tone: garnet on light grounds, cream on dark", () => {
    const light = render(CarouselFixture, { count: 3 });
    expect(light.getByLabelText("Next slide").className).toContain(ARROW_TONES.garnet);
    cleanup();

    const dark = render(CarouselFixture, { count: 3, tone: "cream" });
    const next = dark.getByLabelText("Next slide");
    expect(next.className).toContain(ARROW_TONES.cream);
    const resting = next.className.split(/\s+/).filter((c) => !c.includes(":"));
    expect(resting).toContain("text-background");
    expect(resting, "garnet on garnet").not.toContain("text-primary");
  });

  it("sets no focus ring of its own — the ring is the ground's", () => {
    // The first version gave the cream tone `focus-visible:outline-background`
    // because the site's ring was garnet everywhere, 1:1 on the garnet card.
    // app.css now has each GROUND set `--focus-ring` for what sits on it, so a
    // cream arrow on `bg-primary` or `bg-dark` already gets off-white — and a
    // tone that also set one would be a second rule to change when the first
    // does. jsdom resolves no stylesheet: the colour itself is read in a
    // browser, in tests/interaction/carousel.spec.ts.
    for (const [tone, classes] of Object.entries(ARROW_TONES)) {
      expect(classes, tone).not.toMatch(/(^|[\s:])(outline|ring)-/);
    }
  });

  it("never fills on hover at a bound — the arrow there does nothing", () => {
    for (const tone of Object.values(ARROW_TONES)) {
      const hovers = tone.split(/\s+/).filter((c) => c.includes("hover:"));
      expect(hovers.length).toBe(2);
      for (const c of hovers) expect(c.startsWith("not-aria-disabled:hover:"), c).toBe(true);
    }
  });

  it("adds no pause control to a carousel that does not autoplay", () => {
    const { container, queryByLabelText } = render(CarouselFixture, { count: 3 });
    expect(queryByLabelText("Pause slides")).toBeNull();
    expect(arrows(container).querySelectorAll("button").length).toBe(2);
  });

  it("puts Pause before the arrows when it autoplays, and swaps its glyph with its name", async () => {
    vi.useFakeTimers();
    const { container, getByLabelText } = render(CarouselFixture, { count: 3, autoplay: 1600 });
    const buttons = [...arrows(container).querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Pause slides",
      "Previous slide",
      "Next slide",
    ]);

    const toggle = getByLabelText("Pause slides");
    expect(toggle.querySelectorAll("path").length, "two bars").toBe(2);
    await fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-label")).toBe("Play slides");
    expect(toggle.querySelectorAll("path").length, "one triangle").toBe(1);
  });
});

// ── the glyph is the comp's, and it is the one ArrowRight already ships ─────
//
// `carousel-arrows.figma/` holds Figma's own SVG exports of the two arrows
// (6843:977 `r arrow`, 6843:972 `l arrow`), byte for byte. They are not served;
// they are here so the claim "this renders the comp's vector" is recomputed
// rather than remembered. If ArrowRight's path is ever redrawn, this says the
// carousel arrows moved with it.

type Point = [number, number];

/** Absolute vertices of a path that uses only M / L / H / V / Z. */
function vertices(d: string): Point[] {
  const out: Point[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MLHVZ])([^MLHVZ]*)/g)) {
    const n = args
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (cmd === "Z") continue;
    if (cmd === "H") for (const v of n) out.push([(x = v), y]);
    else if (cmd === "V") for (const v of n) out.push([x, (y = v)]);
    else for (let i = 0; i < n.length; i += 2) out.push([(x = n[i]), (y = n[i + 1])]);
  }
  // A closing vertex that repeats the first says nothing new.
  const [first, last] = [out[0], out[out.length - 1]];
  if (out.length > 1 && first[0] === last[0] && first[1] === last[1]) out.pop();
  return out;
}

const pathData = (svg: string) => [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);

const readExport = (name: string) =>
  readFileSync(resolve(process.cwd(), "src/lib/components/carousel-arrows.figma", name), "utf8");

function expectSamePoints(actual: Point[], expected: Point[], tolerance: number) {
  expect(actual.length).toBe(expected.length);
  expect(actual.length).toBeGreaterThan(3);
  actual.forEach(([ax, ay], i) => {
    expect(Math.abs(ax - expected[i][0]), `x of vertex ${i}`).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(ay - expected[i][1]), `y of vertex ${i}`).toBeLessThanOrEqual(tolerance);
  });
}

describe("the comp's arrow exports", () => {
  const right = readExport("r-arrow.svg");
  const left = readExport("l-arrow.svg");
  const arrowRight = readFileSync(
    resolve(process.cwd(), "src/lib/components/ArrowRight.svelte"),
    "utf8",
  );

  it("are a 40px ring with a 1px stroke inside it", () => {
    for (const svg of [right, left]) {
      expect(svg).toContain('viewBox="0 0 40 40"');
      expect(svg).toMatch(/<rect[^>]*width="39" height="39" rx="19\.5"[^>]*stroke="#652323"/);
    }
  });

  it("carry ArrowRight's two paths, moved by the 7.5 inset of the 25px glyph box", () => {
    const [tx, ty] = /translate\(([\d.]+) ([\d.]+)\)/.exec(arrowRight)!.slice(1).map(Number);
    const shipped = pathData(arrowRight).map(vertices);
    const exported = pathData(right).map(vertices);
    expect(exported.length).toBe(2);
    shipped.forEach((points, i) =>
      expectSamePoints(
        exported[i],
        points.map(([x, y]): Point => [x + tx + 7.5, y + ty + 7.5]),
        0.001,
      ),
    );
  });

  it("draw the left arrow as the right one turned 180° about the ring's centre", () => {
    const turned = pathData(right).map((d) => vertices(d).map(([x, y]): Point => [40 - x, 40 - y]));
    const exported = pathData(left).map(vertices);
    expect(exported.length).toBe(2);
    turned.forEach((points, i) => expectSamePoints(exported[i], points, 0.0001));
  });
});

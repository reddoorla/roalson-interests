import { describe, it, expect, beforeEach, vi } from "vitest";
import { fade, fly, slide } from "./transitions";

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

function element() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  mockMatchMedia(false);
});

describe("motion-aware transitions — normal motion", () => {
  it("passes params through to the underlying transition", () => {
    const config = fade(element(), { duration: 350, delay: 40 });
    expect(config.duration).toBe(350);
    expect(config.delay).toBe(40);
  });

  it("keeps svelte's defaults when no params are given", () => {
    const config = fade(element());
    expect(config.duration).toBe(400); // svelte/transition fade default
  });

  it("fly and slide behave the same", () => {
    expect(fly(element(), { duration: 500 }).duration).toBe(500);
    expect(slide(element(), { duration: 500 }).duration).toBe(500);
  });
});

describe("motion-aware transitions — prefers-reduced-motion", () => {
  beforeEach(() => {
    mockMatchMedia(true);
  });

  it("collapses fade duration and delay to zero", () => {
    const config = fade(element(), { duration: 700, delay: 200 });
    expect(config.duration).toBe(0);
    expect(config.delay).toBe(0);
  });

  it("collapses fly duration and delay to zero", () => {
    const config = fly(element(), { duration: 700, delay: 200, y: 40 });
    expect(config.duration).toBe(0);
    expect(config.delay).toBe(0);
  });

  it("collapses slide duration and delay to zero", () => {
    const config = slide(element(), { duration: 700, delay: 200 });
    expect(config.duration).toBe(0);
    expect(config.delay).toBe(0);
  });

  // This used to assert `typeof config.css === "function"` — the old contract,
  // where reduced motion meant `svelteFade` with duration 0. That still let
  // Svelte sample `css` at t=0 and commit the frame, which is the defect
  // INSTANT removes (see the style-free describe below). What "usable" has to
  // mean here is that the element still appears at all: a zero-length, applied
  // -nothing config, not a missing one.
  it("still returns a usable config so elements appear/disappear", () => {
    const config = fade(element(), { duration: 700 });
    expect(config).toBeTypeOf("object");
    expect(config.duration).toBe(0);
    expect(config.css).toBeUndefined();
  });
});

describe("motion-aware transitions — environment guards", () => {
  it("does not crash when matchMedia is unavailable", () => {
    // @ts-expect-error — simulating an environment without matchMedia
    delete window.matchMedia;
    const config = fade(element(), { duration: 250 });
    expect(config.duration).toBe(250);
  });
});

// Zeroing the duration is NOT sufficient on its own: Svelte still samples the
// config's `css` at t=0 and commits that frame, so `fly({ y: 22 })` paints its
// full 22px offset for one frame before snapping back. That is visible motion
// for someone who asked for none, and any layout read landing in that frame is
// wrong. With no `css` and no `tick` there is nothing for Svelte to apply.
describe("reduced motion collapses to a style-free config", () => {
  function reduce(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  it("emits neither css nor tick under reduced motion", () => {
    reduce(true);
    const node = document.createElement("div");
    for (const [name, config] of [
      ["fade", fade(node, { duration: 400 })],
      ["fly", fly(node, { y: 22, duration: 400 })],
      ["slide", slide(node, { duration: 400 })],
    ] as const) {
      expect(config.duration, name).toBe(0);
      expect(config.delay ?? 0, name).toBe(0);
      expect(config.css, `${name} still commits a t=0 frame`).toBeUndefined();
      expect(config.tick, name).toBeUndefined();
    }
  });

  it("still animates normally when the preference is off", () => {
    reduce(false);
    const node = document.createElement("div");
    expect(fade(node, { duration: 400 }).css).toBeTypeOf("function");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import ContentWidth from "./ContentWidth.svelte";

class FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  // @ts-expect-error — replacing global for test
  window.IntersectionObserver = FakeIntersectionObserver;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});

afterEach(() => cleanup());

const body = () =>
  createRawSnippet(() => ({
    render: () => "<p>Inner content</p>",
  }));

describe("ContentWidth", () => {
  it("applies animateIn hidden styles when animateInOnScroll is true", () => {
    const { getByText } = render(ContentWidth, {
      animateInOnScroll: true,
      children: body(),
    });

    const inner = getByText("Inner content").parentElement as HTMLElement;
    expect(inner.style.opacity).toBe("0");
    expect(inner.style.transform).toBe("translateY(50%)");
    expect(inner.style.transition).toContain("opacity");
  });

  it("does not apply animateIn styles when animateInOnScroll is false", () => {
    const { getByText } = render(ContentWidth, {
      animateInOnScroll: false,
      children: body(),
    });

    const inner = getByText("Inner content").parentElement as HTMLElement;
    expect(inner.style.opacity).toBe("");
    expect(inner.style.transform).toBe("");
  });
});

// #171. `xl:` is Tailwind's default 1280, not the 1340 app.css used to
// declare. Between 1326 and 1340 the two disagree: at 1330 the box is already
// `xl` (92%, centred), so each gutter is 4% = 53.2px; the old constant still
// used the md branch and drew 55px.
describe("ContentWidth edge fade", () => {
  it("matches the gutter the xl box really leaves at 1330", () => {
    const before = window.innerWidth;
    window.innerWidth = 1330;
    try {
      const { container } = render(ContentWidth, { edgeFadeColor: "#fff", children: body() });
      const fade = container.querySelector<HTMLElement>(".absolute.right-0")!;
      expect(fade.style.width).toBe("53.2px");
    } finally {
      window.innerWidth = before;
    }
  });
});

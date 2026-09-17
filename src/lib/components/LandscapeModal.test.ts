import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import LandscapeModal from "./LandscapeModal.svelte";

// The overlay shows only when BOTH queries match: a coarse pointer and a
// narrow landscape viewport. Drive them per test. Reduced motion always
// matches: jsdom has no WAAPI (Element.animate), and under reduced motion
// `$lib/transitions` collapses the fade to duration 0 so Svelte never
// animates — the same arrangement Nav.test.ts uses.
function mockMatchMedia(coarse: boolean, landscape: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? true
      : query.includes("pointer: coarse")
        ? coarse
        : query.includes("orientation: landscape")
          ? landscape
          : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

// jsdom performs no layout — treat connected elements as visible so
// trapFocus's getClientRects() filter keeps them.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    return (this.isConnected ? [{}] : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const frame = () => new Promise((r) => requestAnimationFrame(r));

describe("LandscapeModal", () => {
  it("stays hidden unless the pointer is coarse AND the viewport is narrow landscape", () => {
    mockMatchMedia(true, false);
    const { queryByRole } = render(LandscapeModal);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("shows an announced modal dialog when both queries match", () => {
    mockMatchMedia(true, true);
    const { getByRole } = render(LandscapeModal);
    const dialog = getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("landscape-heading");
    expect(dialog.querySelector("#landscape-heading")?.textContent).toMatch(/portrait/i);
  });

  // A fixed full-viewport overlay that leaves focus on the hidden page behind
  // it is a WCAG 2.4.3 failure: Tab keeps walking content the user cannot see.
  // Focus has to move INTO the overlay when it appears (#123).
  it("moves focus into the dialog when it opens", async () => {
    // Something on the page has focus before the overlay appears.
    const trigger = document.createElement("button");
    trigger.textContent = "page control";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    mockMatchMedia(true, true);
    const { getByRole } = render(LandscapeModal);
    await frame();

    const dialog = getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(trigger);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  disableSmoothScroll,
  flushLayoutForKitScroll,
  holdAnchoringForRestore,
  releaseAnchoring,
  restoreSmoothScroll,
} from "./instantNavScroll";
import type { AfterNavigate, BeforeNavigate } from "$app/navigation";

const afterNav = (type: AfterNavigate["type"]) => ({ type }) as AfterNavigate;

let rafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.documentElement.style.scrollBehavior = "";
  rafSpy = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
});

afterEach(() => {
  rafSpy.mockRestore();
});

describe("instantNavScroll", () => {
  it("flushLayoutForKitScroll only reads layout: it never scrolls or touches the style", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo");
    document.documentElement.style.scrollBehavior = "auto";
    flushLayoutForKitScroll();
    expect(scrollSpy).not.toHaveBeenCalled();
    expect(document.documentElement.style.scrollBehavior).toBe("auto");
    scrollSpy.mockRestore();
  });

  it("never scrolls on its own — kit owns the scroll target (hash/noscroll/popstate safety)", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo");
    disableSmoothScroll({} as BeforeNavigate);
    restoreSmoothScroll(afterNav("link"));
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it("flips scroll-behavior to auto before navigation so kit's scroll is instant", () => {
    disableSmoothScroll({} as BeforeNavigate);
    expect(document.documentElement.style.scrollBehavior).toBe("auto");
  });

  it("restores the inline style a frame after navigation completes", () => {
    disableSmoothScroll({} as BeforeNavigate);
    restoreSmoothScroll(afterNav("link"));
    expect(document.documentElement.style.scrollBehavior).toBe("");
  });

  it("restores after popstate too — back/forward restore should also be instant", () => {
    disableSmoothScroll({} as BeforeNavigate);
    restoreSmoothScroll(afterNav("popstate"));
    expect(document.documentElement.style.scrollBehavior).toBe("");
  });

  it("does nothing on initial load (enter): nothing was disabled", () => {
    restoreSmoothScroll(afterNav("enter"));
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("never scrolls on enter, even when kit restored a saved position", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo");
    restoreSmoothScroll({
      type: "enter",
      to: { scroll: { x: 0, y: 1500 } },
    } as unknown as AfterNavigate);
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});

describe("holdAnchoringForRestore", () => {
  // Kit 3's own restore test: the history entry's index in history.state, and
  // a saved scroll for that index in sessionStorage.
  const kitState = (index: number | undefined, scroll?: { x: number; y: number }) => {
    history.replaceState(
      index === undefined ? null : { "sveltekit:metadata": { historyIndex: index } },
      "",
    );
    sessionStorage.setItem(
      "sveltekit:history-info",
      JSON.stringify(index === undefined || !scroll ? {} : { [index]: { scroll } }),
    );
  };

  afterEach(() => {
    releaseAnchoring();
    history.replaceState(null, "");
    sessionStorage.clear();
  });

  it("turns anchoring off when kit will restore a saved position, until released", () => {
    kitState(1700000000000, { x: 0, y: 1500 });
    holdAnchoringForRestore();
    expect(document.documentElement.style.overflowAnchor).toBe("none");
    expect(document.body.style.overflowAnchor).toBe("none");
    releaseAnchoring();
    expect(document.documentElement.style.overflowAnchor).toBe("");
    expect(document.body.style.overflowAnchor).toBe("");
  });

  it("leaves anchoring on for a first visit, so a font swap keeps the reader's line", () => {
    kitState(undefined);
    holdAnchoringForRestore();
    expect(document.documentElement.style.overflowAnchor).toBe("");
  });

  it("leaves anchoring on when the history entry has no saved scroll", () => {
    kitState(1700000000000);
    holdAnchoringForRestore();
    expect(document.documentElement.style.overflowAnchor).toBe("");
  });
});

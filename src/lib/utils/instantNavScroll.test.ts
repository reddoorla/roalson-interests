import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  disableSmoothScroll,
  flushLayoutForKitScroll,
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

  // Kit 3 restores a reload's saved position before hydration, and scroll
  // anchoring can move it when hydration changes the page's height (#306).
  const enterTo = (x: number, y: number) =>
    ({ type: "enter", to: { scroll: { x, y } } }) as unknown as AfterNavigate;

  it("on enter, puts the page back on kit's restored target, instantly, if it moved", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    restoreSmoothScroll(enterTo(0, 1500)); // jsdom sits at 0,0
    expect(scrollSpy).toHaveBeenCalledWith({ left: 0, top: 1500, behavior: "instant" });
    scrollSpy.mockRestore();
  });

  it("on enter, leaves the page alone when it is already on kit's target", () => {
    const scrollSpy = vi.spyOn(window, "scrollTo");
    restoreSmoothScroll(enterTo(0, 0));
    expect(scrollSpy).not.toHaveBeenCalled();
    scrollSpy.mockRestore();
  });
});

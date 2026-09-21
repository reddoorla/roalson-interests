import { afterEach, describe, expect, it, vi } from "vitest";
import { lockBodyScroll } from "./scrollLock";

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  vi.restoreAllMocks();
});

describe("lockBodyScroll", () => {
  it("hides body overflow and the release restores what was there", () => {
    document.body.style.overflow = "clip";
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("pays a classic scrollbar's width back as padding, and takes it off again", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1024);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1009);
    const release = lockBodyScroll();
    expect(document.body.style.paddingRight).toBe("15px");
    release();
    expect(document.body.style.paddingRight).toBe("");
  });

  it("adds no padding where scrollbars overlay the page", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(390);
    const release = lockBodyScroll();
    expect(document.body.style.paddingRight).toBe("");
    release();
  });

  it("nests: the inner release leaves the outer lock standing", () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    inner();
    expect(document.body.style.overflow).toBe("hidden");
    outer();
    expect(document.body.style.overflow).toBe("");
  });
});

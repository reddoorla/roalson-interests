import { afterEach, describe, expect, it, vi } from "vitest";
import { lockBodyScroll } from "./scrollLock";

afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.documentElement.style.cssText = "";
  vi.restoreAllMocks();
});

/** A window `inner` wide whose html lays out `laidOut` wide: the difference is
 *  the classic scrollbar strip `scrollbar-gutter: stable` reserves. */
function windowOf(inner: number, laidOut: number) {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(inner);
  vi.spyOn(document.documentElement, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, laidOut, 900),
  );
}

const root = () => document.documentElement.style;

describe("lockBodyScroll", () => {
  it("hides body overflow and the release restores what was there", () => {
    document.body.style.overflow = "clip";
    const release = lockBodyScroll();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("clip");
  });

  // #172: nothing paints into a reserved strip, so the lock releases it for
  // the overlays and pays it back to the page and to the fixed nav.
  it("releases a classic scrollbar's strip, and pays it back as padding and a variable", () => {
    windowOf(1455, 1440);
    const release = lockBodyScroll();
    expect(root().getPropertyValue("scrollbar-gutter")).toBe("auto");
    expect(document.body.style.paddingRight).toBe("15px");
    expect(root().getPropertyValue("--scroll-lock-gutter")).toBe("15px");
    release();
    expect(root().getPropertyValue("scrollbar-gutter")).toBe("");
    expect(document.body.style.paddingRight).toBe("");
    expect(root().getPropertyValue("--scroll-lock-gutter")).toBe("");
  });

  // The measure is html's box, not `clientWidth`: on this site clientWidth
  // reads the whole window while the page lays out 15px narrower.
  it("measures the strip off html's box, not clientWidth", () => {
    windowOf(1455, 1440);
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1455);
    const release = lockBodyScroll();
    expect(document.body.style.paddingRight).toBe("15px");
    release();
  });

  it("changes nothing but overflow where scrollbars overlay the page", () => {
    windowOf(390, 390);
    const release = lockBodyScroll();
    expect(document.body.style.paddingRight).toBe("");
    expect(root().getPropertyValue("scrollbar-gutter")).toBe("");
    expect(root().getPropertyValue("--scroll-lock-gutter")).toBe("");
    release();
  });

  it("nests: the inner release leaves the outer lock standing", () => {
    windowOf(1455, 1440);
    const outer = lockBodyScroll();
    // The strip is released now, so the page lays out the whole window.
    windowOf(1455, 1455);
    const inner = lockBodyScroll();
    inner();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.paddingRight).toBe("15px");
    expect(root().getPropertyValue("scrollbar-gutter")).toBe("auto");
    outer();
    expect(document.body.style.overflow).toBe("");
    expect(root().getPropertyValue("scrollbar-gutter")).toBe("");
  });
});

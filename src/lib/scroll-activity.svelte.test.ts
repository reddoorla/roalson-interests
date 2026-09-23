import { describe, expect, it, vi } from "vitest";

import { pageScrolling, SCROLL_SETTLE_MS, watchPageScroll } from "./scroll-activity.svelte";

/** A `scroll` on the window is what the document dispatches; the module takes
 *  no interest in anything else about it. */
const scroll = () => window.dispatchEvent(new Event("scroll"));

const settle = () => new Promise((r) => setTimeout(r, SCROLL_SETTLE_MS + 60));

describe("the page's own scroll, debounced", () => {
  it("says nothing is scrolling until something asks", () => {
    // No watcher, no listener: the module is inert in a page that draws no
    // map, which is most of this site.
    scroll();
    expect(pageScrolling()).toBe(false);
  });

  it("goes true on the first scroll event and false after the settle", async () => {
    const release = watchPageScroll();
    try {
      expect(pageScrolling(), "still, before anything happens").toBe(false);
      scroll();
      expect(pageScrolling(), "the first event is enough").toBe(true);
      await settle();
      expect(pageScrolling(), "and silence ends it").toBe(false);
    } finally {
      release();
    }
  });

  it("holds through a long scroll — the debounce restarts on every event", async () => {
    const release = watchPageScroll();
    try {
      // Six events a frame apart: 100ms of scrolling, which is LESS than the
      // 120ms settle end to end, so a naive "120ms after the first event"
      // would already have let go. The point of the debounce is that it
      // measures silence, not duration.
      for (let i = 0; i < 6; i++) {
        scroll();
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(pageScrolling(), "a scroll that is still delivering events").toBe(true);
      await settle();
      expect(pageScrolling()).toBe(false);
    } finally {
      release();
    }
  });

  it("keeps one listener for however many maps ask, and drops it with the last", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    try {
      const a = watchPageScroll();
      const b = watchPageScroll();
      const scrolls = () => add.mock.calls.filter(([name]) => name === "scroll").length;
      expect(scrolls(), "two maps, one listener").toBe(1);

      a();
      expect(
        remove.mock.calls.filter(([name]) => name === "scroll").length,
        "the first release keeps it — the second map is still asking",
      ).toBe(0);
      // An effect teardown that ran twice must not take the count negative and
      // leak the listener for the rest of the page.
      a();
      b();
      expect(remove.mock.calls.filter(([name]) => name === "scroll").length).toBe(1);

      // And a later ask attaches a fresh one rather than relying on the old.
      const c = watchPageScroll();
      expect(scrolls()).toBe(2);
      c();
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });

  it("forgets a scroll in flight when the last watcher leaves", async () => {
    const release = watchPageScroll();
    scroll();
    expect(pageScrolling()).toBe(true);
    release();
    // Not "true until the timer happens to fire": a map unmounting mid-scroll
    // would otherwise leave the next one to mount reading a stale true.
    expect(pageScrolling()).toBe(false);
  });
});

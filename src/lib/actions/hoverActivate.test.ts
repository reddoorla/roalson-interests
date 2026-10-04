import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CENTRE_ID } from "./centreWatch";
import { FINE_HOVER, HOVER_DWELL_MS, hoverActivate } from "./hoverActivate";

const queries: string[] = [];

function stubMatchMedia(fineAndWide: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => {
    queries.push(media);
    return {
      matches: fineAndWide,
      media,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
}

function list(ids: string[]) {
  const ul = document.createElement("ul");
  for (const id of ids) {
    const li = document.createElement("li");
    li.setAttribute(CENTRE_ID, id);
    const inner = document.createElement("span");
    li.append(inner);
    ul.append(li);
  }
  document.body.append(ul);
  return ul;
}

const card = (ul: HTMLElement, id: string) =>
  ul.querySelector(`[${CENTRE_ID}="${id}"] span`) as HTMLElement;

function move(target: Element, x: number, y: number, pointerType = "mouse") {
  const event = new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
}

describe("hoverActivate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queries.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("asks for a fine hovering pointer at the given width", () => {
    stubMatchMedia(true);
    hoverActivate(list(["a"]), { minWidth: 1024, onactive: () => {} });
    expect(queries).toContain(`${FINE_HOVER} and (min-width: 1024px)`);
  });

  it("reports the card under a resting mouse after the dwell, and not before", () => {
    stubMatchMedia(true);
    const ul = list(["a", "b"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "b"), 10, 10);
    vi.advanceTimersByTime(HOVER_DWELL_MS - 1);
    expect(onactive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onactive).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("only reports the card the mouse settles on when it crosses several", () => {
    stubMatchMedia(true);
    const ul = list(["a", "b", "c"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10);
    vi.advanceTimersByTime(HOVER_DWELL_MS / 2);
    move(card(ul, "b"), 10, 20);
    vi.advanceTimersByTime(HOVER_DWELL_MS / 2);
    move(card(ul, "c"), 10, 30);
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    expect(onactive.mock.calls).toEqual([["c"]]);
  });

  it("does not restart the dwell for movement inside the same card", () => {
    stubMatchMedia(true);
    const ul = list(["a"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10);
    vi.advanceTimersByTime(HOVER_DWELL_MS - 50);
    move(card(ul, "a"), 12, 11);
    vi.advanceTimersByTime(50);
    expect(onactive).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("ignores a pointermove at the same position, which is a scroll moving cards under a still mouse", () => {
    stubMatchMedia(true);
    const ul = list(["a", "b"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10);
    window.dispatchEvent(new Event("scroll"));
    move(card(ul, "b"), 10, 10);
    vi.advanceTimersByTime(HOVER_DWELL_MS * 2);
    expect(onactive).not.toHaveBeenCalled();
  });

  it("drops a pending dwell when the pointer leaves the list", () => {
    stubMatchMedia(true);
    const ul = list(["a"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10);
    ul.dispatchEvent(new MouseEvent("pointerleave"));
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    expect(onactive).not.toHaveBeenCalled();
  });

  it("ignores touch and pen", () => {
    stubMatchMedia(true);
    const ul = list(["a"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10, "touch");
    move(card(ul, "a"), 20, 20, "pen");
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    expect(onactive).not.toHaveBeenCalled();
  });

  it("does nothing where the media query fails", () => {
    stubMatchMedia(false);
    const ul = list(["a"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10);
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    expect(onactive).not.toHaveBeenCalled();
  });

  it("does nothing while disabled, and a disable drops the pending dwell", () => {
    stubMatchMedia(true);
    const ul = list(["a"]);
    const onactive = vi.fn();
    const action = hoverActivate(ul, { minWidth: 1024, onactive });
    move(card(ul, "a"), 10, 10);
    action.update({ minWidth: 1024, onactive, enabled: false });
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    move(card(ul, "a"), 20, 20);
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    expect(onactive).not.toHaveBeenCalled();
  });

  it("stops listening when destroyed", () => {
    stubMatchMedia(true);
    const ul = list(["a"]);
    const onactive = vi.fn();
    hoverActivate(ul, { minWidth: 1024, onactive }).destroy();
    move(card(ul, "a"), 10, 10);
    vi.advanceTimersByTime(HOVER_DWELL_MS);
    expect(onactive).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reveal, revealInvalid } from "./reveal";

// What jsdom can hold: the two calls, their arguments and their ORDER, and
// which element each lands on. Where they land against the pinned bar is
// tests/interaction/contact.spec.ts's, in a browser that scrolls.

type Scroll = (arg?: boolean | ScrollIntoViewOptions) => void;
const proto = Element.prototype as { scrollIntoView?: Scroll };
const original = proto.scrollIntoView;

/** Every scrollIntoView made while it is installed, as [element, options]. */
let scrolls: [Element, unknown][];
const installScrollIntoView = () => {
  proto.scrollIntoView = function (this: Element, arg) {
    scrolls.push([this, arg]);
  };
};

beforeEach(() => {
  scrolls = [];
  document.body.innerHTML = "";
});

afterEach(() => {
  if (original) proto.scrollIntoView = original;
  else delete proto.scrollIntoView;
  vi.restoreAllMocks();
});

const panel = () => {
  const el = document.createElement("div");
  el.tabIndex = -1;
  document.body.append(el);
  return el;
};

describe("reveal", () => {
  it("focuses WITHOUT scrolling, then scrolls the element to the start — in that order", () => {
    installScrollIntoView();
    const el = panel();
    const calls: string[] = [];
    const focus = vi.spyOn(el, "focus").mockImplementation(() => void calls.push("focus"));
    const scroll = vi.spyOn(el, "scrollIntoView").mockImplementation(() => {
      calls.push("scrollIntoView");
    });

    reveal(el);

    // preventScroll is the fix's first half: focus()'s own scroll is the one
    // that is decided mid-glide and lands the panel under the bar.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // "start", never "nearest": Chromium leaves a glide in flight alone when
    // "nearest" finds nothing to do, which is the race all over again.
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
    expect(calls).toEqual(["focus", "scrollIntoView"]);
  });

  it("really moves focus", () => {
    installScrollIntoView();
    const el = panel();
    reveal(el);
    expect(document.activeElement).toBe(el);
  });

  it("can focus one element and land another — a control, by its label", () => {
    installScrollIntoView();
    const el = panel();
    const anchor = document.createElement("label");
    document.body.prepend(anchor);

    reveal(el, anchor);

    expect(document.activeElement).toBe(el);
    expect(scrolls).toEqual([[anchor, { block: "start" }]]);
  });

  it("is a no-op for an element that has not rendered", () => {
    installScrollIntoView();
    expect(() => reveal(null)).not.toThrow();
    expect(() => reveal(undefined)).not.toThrow();
    expect(scrolls).toEqual([]);
  });

  it("still focuses where scrollIntoView does not exist (jsdom, as shipped)", () => {
    expect(proto.scrollIntoView, "jsdom grew scrollIntoView: drop the ?. in reveal").toBe(
      undefined,
    );
    const el = panel();
    expect(() => reveal(el)).not.toThrow();
    expect(document.activeElement).toBe(el);
  });
});

describe("revealInvalid", () => {
  /** A form of two required, empty fields, each under its label, each wearing
   *  the handler the way Field.svelte wears it. */
  const form = () => {
    document.body.innerHTML = `
      <form>
        <label for="a">Name</label><input id="a" name="name" required />
        <label for="b">Email</label><input id="b" name="email" required />
      </form>`;
    const el = document.querySelector("form")!;
    const [a, b] = Array.from(el.querySelectorAll("input"));
    for (const input of [a, b]) input.addEventListener("invalid", revealInvalid);
    return { el, a, b, labelA: a.labels![0], labelB: b.labels![0] };
  };

  /** Frames run when the test says so: the handler must WAIT for one. */
  let frames: FrameRequestCallback[];
  const runFrames = () => frames.splice(0).forEach((cb) => cb(0));
  beforeEach(() => {
    frames = [];
    installScrollIntoView();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
  });

  it("lands the control the browser focused, by its LABEL, a frame later", () => {
    const { el, a, labelA } = form();
    // What interactive validation does: fire `invalid` at each refused
    // control, THEN focus the first.
    expect(el.checkValidity()).toBe(false);
    a.focus();
    expect(scrolls, "nothing before the browser has focused").toEqual([]);

    runFrames();

    expect(document.activeElement).toBe(a);
    expect(scrolls).toEqual([[labelA, { block: "start" }]]);
  });

  it("acts for the focused control only, though every refused control asks", () => {
    const { el, a, b, labelB } = form();
    a.value = "Ada Lovelace";
    expect(el.checkValidity()).toBe(false);
    b.focus();
    runFrames();
    expect(scrolls).toEqual([[labelB, { block: "start" }]]);
  });

  it("keeps the page still for checkValidity(), which moves focus nowhere", () => {
    const { el } = form();
    expect(el.checkValidity()).toBe(false);
    expect(frames.length, "both refused controls asked").toBe(2);
    runFrames();
    expect(scrolls).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { animateIn } from "./animateIn";

// `data-reveal` is the declarative twin of animateIn's inline hidden state:
// app.css hides `[data-reveal]` at first paint so server-rendered markup can be
// hidden BEFORE hydration instead of after it. The contract the action owes
// that CSS is narrow and mechanical — mark while hidden, unmark the moment it
// reveals, and never leave a marker behind on a node it has stopped driving.
//
// The rest of this file covers the three ways the reveal could strand content
// at opacity 0 once the hidden state ships in the markup: no IntersectionObserver
// at all, an observer that never fires, and an inline transition that is never
// handed back to the stylesheet.

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  cb: IntersectionObserverCallback;
  disconnected = false;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    FakeIntersectionObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  enter() {
    this.cb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

let listeners: ((event: MediaQueryListEvent) => void)[] = [];
let reduced = false;

function mockMatchMedia() {
  listeners = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" ? reduced : false;
    },
    media: query,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
      listeners = listeners.filter((l) => l !== fn);
    },
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

const turnReduceOn = () => {
  reduced = true;
  for (const fn of [...listeners]) fn({ matches: true } as MediaQueryListEvent);
};

function element() {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** jsdom has no TransitionEvent constructor. The action reads `propertyName`
 *  and `target`; dispatch supplies the target, so only the former is faked. */
function endOpacityTransition(node: HTMLElement) {
  const e = Object.assign(new Event("transitionend", { bubbles: true }), {
    propertyName: "opacity",
  });
  node.dispatchEvent(e);
}

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  // @ts-expect-error — replacing global for test
  window.IntersectionObserver = FakeIntersectionObserver;
  reduced = false;
  mockMatchMedia();
  Object.defineProperty(window, "innerWidth", {
    value: 1024,
    configurable: true,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("animateIn — the data-reveal marker", () => {
  it("marks the element while it is hidden", () => {
    const el = element();
    animateIn(el);
    expect(el.hasAttribute("data-reveal")).toBe(true);
    expect(el.style.opacity).toBe("0");
  });

  it("unmarks it when it reveals", () => {
    const el = element();
    animateIn(el);
    FakeIntersectionObserver.instances[0]!.enter();
    expect(el.hasAttribute("data-reveal")).toBe(false);
    expect(el.style.opacity).toBe("1");
  });

  it("marks and unmarks in triggered mode too", () => {
    const el = element();
    const handle = animateIn(el, { trigger: false });
    expect(el.hasAttribute("data-reveal")).toBe(true);
    handle.update({ trigger: true });
    expect(el.hasAttribute("data-reveal")).toBe(false);
  });
});

// Server-rendered markup that carries `data-reveal` depends on JS to ever
// appear. Every path where the reveal machinery cannot run has to end with the
// content visible, or the fix trades a flash for a blank page.
describe("animateIn — content can never be stranded invisible", () => {
  it("reveals in place, unmarked, when there is no IntersectionObserver", () => {
    const saved = window.IntersectionObserver;
    // @ts-expect-error — simulating a browser without the API
    delete window.IntersectionObserver;
    try {
      const el = element();
      // Constructing the observer would throw and take the whole mount with
      // it, which on a server-hidden element means it is never revealed.
      expect(() => animateIn(el)).not.toThrow();
      expect(el.hasAttribute("data-reveal")).toBe(false);
      expect(el.style.opacity).toBe("1");
    } finally {
      window.IntersectionObserver = saved;
    }
  });

  it("reveals via the fail-safe when the observer never fires", () => {
    vi.useFakeTimers();
    try {
      const el = element();
      animateIn(el, { failSafe: 2500 });
      expect(el.style.opacity).toBe("0");
      vi.advanceTimersByTime(2500);
      expect(el.hasAttribute("data-reveal")).toBe(false);
      expect(el.style.opacity).toBe("1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("arms no fail-safe unless asked (a blanket timer pre-reveals below-fold content)", () => {
    vi.useFakeTimers();
    try {
      const el = element();
      animateIn(el);
      vi.advanceTimersByTime(60_000);
      expect(el.style.opacity).toBe("0");
    } finally {
      vi.useRealTimers();
    }
  });
});

// `applyHidden` writes `style.transition` INLINE, and an inline declaration
// outranks every class. Left in place it becomes the element's transition list
// for the rest of the page's life — silently disabling the hover motion of
// anything that both reveals and reacts.
describe("animateIn — the inline transition is handed back to the stylesheet", () => {
  it("releases the inline styles when the reveal's transition ends", () => {
    const el = element();
    animateIn(el);
    FakeIntersectionObserver.instances[0]!.enter();
    expect(el.style.transition).not.toBe("");

    endOpacityTransition(el);

    expect(el.style.transition).toBe("");
    expect(el.style.opacity).toBe("");
    expect(el.style.transform).toBe("");
  });

  it("ignores a descendant's transition (releasing there would strip it mid-reveal)", () => {
    const el = element();
    const child = document.createElement("span");
    el.appendChild(child);
    animateIn(el);
    FakeIntersectionObserver.instances[0]!.enter();

    endOpacityTransition(child);

    expect(el.style.transition).not.toBe("");
  });

  it("releases on a timer when no transitionend ever arrives (background tab)", () => {
    vi.useFakeTimers();
    try {
      const el = element();
      animateIn(el, { duration: 400, delayMax: 0 });
      FakeIntersectionObserver.instances[0]!.enter();
      expect(el.style.transition).not.toBe("");
      vi.advanceTimersByTime(400 + 300);
      expect(el.style.transition).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a re-hide cancels a pending release, so the new hidden state survives", () => {
    vi.useFakeTimers();
    try {
      const el = element();
      const handle = animateIn(el, { trigger: true, duration: 400 });
      expect(el.style.opacity).toBe("1");
      handle.update({ trigger: false });
      expect(el.style.opacity).toBe("0");
      // The release scheduled by the reveal must not land on the new hide and
      // strip the transition it just wrote.
      vi.advanceTimersByTime(400 + 300);
      expect(el.style.opacity).toBe("0");
      expect(el.style.transition).not.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("animateIn — the marker under the reduced-motion preference", () => {
  it("stays a complete no-op when the preference is already on", () => {
    reduced = true;
    const el = element();
    animateIn(el);
    expect(el.hasAttribute("data-reveal")).toBe(false);
    expect(el.style.opacity).toBe("");
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("clears a server-rendered marker when the preference is already on", () => {
    // The CSS hidden state does not apply under `reduce`, so the element is
    // visible either way — but a marker nothing is driving any more must not
    // linger on the node.
    reduced = true;
    const el = element();
    el.setAttribute("data-reveal", "");
    animateIn(el);
    expect(el.hasAttribute("data-reveal")).toBe(false);
    expect(el.style.opacity).toBe("1");
  });

  it("unmarks an element it had hidden when the preference is switched on mid-session", () => {
    const el = element();
    animateIn(el);
    expect(el.hasAttribute("data-reveal")).toBe(true);

    turnReduceOn();

    expect(el.style.opacity).toBe("1");
    expect(el.hasAttribute("data-reveal")).toBe(false);
    expect(FakeIntersectionObserver.instances[0]!.disconnected).toBe(true);
  });
});

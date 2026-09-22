import { cleanup, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeroBackgroundVideo from "./HeroBackgroundVideo.svelte";

// The MOVING state of the hero's video layer lives here and not in a browser
// spec, on purpose. Revealing the layer requires a real heartbeat from a real
// player.vimeo.com iframe, which a browser test can only get by depending on a
// third party on every CI run. In jsdom the iframe's `contentWindow` is ours to
// name, so a beat can be posted exactly as the player posts one — origin and
// source included — and the reveal, the watchdog and the WCAG 2.2.2 control are
// deterministic. tests/interaction/home-hero-video.spec.ts takes the half that
// needs a layout engine: the pin, the reduced-motion ruling and the tab order.

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: this.observed[0] } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)" ? reducedMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

const ID = "1229048743";

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  // @ts-expect-error — replacing global for test
  window.IntersectionObserver = FakeIntersectionObserver;
  mockMatchMedia(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Engage (first input) + near the viewport — the two mount conditions. */
async function engageAndIntersect() {
  FakeIntersectionObserver.instances[0].trigger(true);
  window.dispatchEvent(new Event("pointermove"));
  await tick();
}

/** A beat as the component's OWN iframe would post it. */
function beat(container: HTMLElement, event = "playProgress") {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://player.vimeo.com",
      source: container.querySelector("iframe")!.contentWindow as unknown as MessageEventSource,
      data: JSON.stringify({ event }),
    }),
  );
}

const layer = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-hero-video]");
const toggle = (c: HTMLElement) => c.querySelector<HTMLButtonElement>("[data-hero-video-toggle]");

describe("HeroBackgroundVideo", () => {
  it("renders NOTHING at all without a usable id — the hero keeps its own ground", () => {
    for (const vimeoId of [undefined, null, "", "   ", "ask marketing", "https://evil.test/1"]) {
      const { container, unmount } = render(HeroBackgroundVideo, { props: { vimeoId } });
      // No element of any kind — Svelte's own anchor comment is all that is
      // left, and a comment paints nothing and announces nothing.
      expect(container.querySelectorAll("*"), String(vimeoId)).toHaveLength(0);
      expect(container.innerHTML.replace(/<!---*>/g, "").trim(), String(vimeoId)).toBe("");
      unmount();
    }
  });

  it("renders the layer but never the iframe under prefers-reduced-motion", async () => {
    mockMatchMedia(true);
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    // The layer IS there — so a test can tell "reduced motion declined it" from
    // "no id was configured", which render identically otherwise.
    expect(layer(container)).toBeTruthy();
    // The gate bails before the observer is even constructed.
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    window.dispatchEvent(new Event("pointermove"));
    await tick();
    expect(container.querySelector("iframe")).toBeNull();
    expect(toggle(container)).toBeNull();
  });

  it("waits for engagement AND the viewport before it creates the iframe", async () => {
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    expect(container.querySelector("iframe")).toBeNull();

    // Near the viewport is not enough: an automated audit scrolls but never inputs.
    FakeIntersectionObserver.instances[0].trigger(true);
    await tick();
    expect(container.querySelector("iframe")).toBeNull();

    window.dispatchEvent(new Event("pointermove"));
    await tick();
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("src")).toBe(
      "https://player.vimeo.com/video/1229048743?background=1&muted=1&loop=1&autoplay=1&dnt=1",
    );
  });

  it("keeps the decorative embed out of the tab order and out of the a11y tree", async () => {
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    await engageAndIntersect();
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("tabindex")).toBe("-1");
    expect(iframe.getAttribute("aria-hidden")).toBe("true");
    // …and the whole layer is click-through, so it cannot eat a press aimed at
    // the hero underneath.
    expect(layer(container)!.className).toContain("pointer-events-none");
  });

  it("stays transparent until a beat arrives, then reveals", async () => {
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    await engageAndIntersect();
    const iframe = container.querySelector("iframe")!;
    expect(iframe.className).toContain("opacity-0");
    expect(layer(container)!.hasAttribute("data-hero-video-playing")).toBe(false);

    beat(container);
    await tick();
    expect(iframe.className).toContain("opacity-100");
    expect(layer(container)!.hasAttribute("data-hero-video-playing")).toBe(true);
  });

  it("offers no pause control until the video has proved it moves", async () => {
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    await engageAndIntersect();
    // The iframe exists, but nothing has played — a control here would be dead.
    expect(toggle(container)).toBeNull();

    beat(container);
    await tick();
    expect(toggle(container)).toBeTruthy();
  });

  // WCAG 2.2.2. The clip is 8s and loops, so a mechanism is required.
  it("pauses the motion on press, and says what pressing it will do next", async () => {
    const { container } = render(HeroBackgroundVideo, {
      props: { vimeoId: ID, label: "hero film" },
    });
    await engageAndIntersect();
    beat(container);
    await tick();

    const iframe = container.querySelector("iframe")!;
    const posted: string[] = [];
    // The player is cross-origin in life and unreachable here; what the control
    // owes is the message AND the hiding, so both halves are observed.
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: { postMessage: (data: string) => posted.push(data) },
    });

    const button = toggle(container)!;
    expect(button.getAttribute("aria-label")).toBe("Pause the hero film");
    expect(button.getAttribute("type")).toBe("button");

    button.click();
    await tick();
    expect(posted.map((p) => JSON.parse(p).method)).toContain("pause");
    // "Pause, stop, or HIDE" — satisfied by the half we control, so the motion
    // stops even if the player ignores the message.
    expect(iframe.className).toContain("opacity-0");
    expect(toggle(container)!.getAttribute("aria-label")).toBe("Play the hero film");

    toggle(container)!.click();
    await tick();
    expect(posted.map((p) => JSON.parse(p).method)).toContain("play");
    expect(toggle(container)!.getAttribute("aria-label")).toBe("Pause the hero film");
  });

  it("keeps the control mounted across a pause, so focus never falls to <body>", async () => {
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    await engageAndIntersect();
    beat(container);
    await tick();

    const before = toggle(container)!;
    before.click();
    await tick();
    // Same element, not a re-created one: `offered` latches on the first beat.
    expect(toggle(container)).toBe(before);
  });

  it("falls back to the ground when beats stop (iOS autoplay suspension)", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
    });
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    await engageAndIntersect();
    beat(container);
    await tick();
    expect(container.querySelector("iframe")!.className).toContain("opacity-100");

    // Watchdog polls each second; >2.5s without a beat hides the video.
    vi.advanceTimersByTime(4000);
    await tick();
    expect(container.querySelector("iframe")!.className).toContain("opacity-0");
    // The control stays: the visitor may still want it stopped for good.
    expect(toggle(container)).toBeTruthy();
  });

  it("ignores beats from another player.vimeo.com embed on the same page", async () => {
    const { container } = render(HeroBackgroundVideo, { props: { vimeoId: ID } });
    await engageAndIntersect();
    const sibling = document.createElement("iframe");
    document.body.appendChild(sibling);
    try {
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://player.vimeo.com",
          source: sibling.contentWindow as unknown as MessageEventSource,
          data: JSON.stringify({ event: "playProgress" }),
        }),
      );
      await tick();
      expect(container.querySelector("iframe")!.className).toContain("opacity-0");
      expect(toggle(container)).toBeNull();
    } finally {
      sibling.remove();
    }
  });

  // The cover floor is the one number in this component, so it is measured
  // rather than asserted as a class name. 528 × 16/9 = 938.67 → 939.
  it("sizes the embed to cover the band it is given, from the band's height alone", async () => {
    const { container } = render(HeroBackgroundVideo, {
      props: { vimeoId: ID, bandHeight: 528 },
    });
    await engageAndIntersect();
    expect(container.querySelector("iframe")!.getAttribute("style")).toContain(
      "width: max(100%, 939px)",
    );

    cleanup();
    FakeIntersectionObserver.instances = [];
    const tall = render(HeroBackgroundVideo, { props: { vimeoId: ID, bandHeight: 800 } });
    await engageAndIntersect();
    // 800 × 16/9 = 1422.2 → 1423.
    expect(tall.container.querySelector("iframe")!.getAttribute("style")).toContain(
      "width: max(100%, 1423px)",
    );
  });
});

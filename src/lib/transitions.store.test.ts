import { describe, it, expect, vi, afterEach } from "vitest";
import { prefersReducedMotion, reducedMotion } from "./transitions";

// One MediaQueryList for the whole app, watched rather than sampled. The
// template consulted the preference in three unconnected places — this module
// per transition run, Slider with its own listener, and a once-at-mount sample
// in animateIn — so turning Reduce Motion on mid-session stopped the carousel
// but left every scroll reveal running until a reload.
type Stub = {
  matches: boolean;
  listeners: Set<(e: MediaQueryListEvent) => void>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function stubMatchMedia(matches: boolean): Stub {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const stub: Stub = {
    matches,
    listeners,
    addEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => {
      listeners.add(fn);
    }),
    removeEventListener: vi.fn((_: string, fn: (e: MediaQueryListEvent) => void) => {
      listeners.delete(fn);
    }),
  };
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? stub.matches : false,
    media: query,
    addEventListener: stub.addEventListener,
    removeEventListener: stub.removeEventListener,
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return stub;
}

function fire(stub: Stub, matches: boolean) {
  stub.matches = matches;
  for (const run of [...stub.listeners]) run({ matches } as MediaQueryListEvent);
}

afterEach(() => vi.restoreAllMocks());

describe("reducedMotion store", () => {
  it("emits the current preference to a new subscriber", () => {
    stubMatchMedia(true);
    const seen: boolean[] = [];
    const stop = reducedMotion.subscribe((v) => seen.push(v));
    expect(seen).toEqual([true]);
    stop();
  });

  it("pushes a mid-session change to every subscriber", () => {
    const stub = stubMatchMedia(false);
    const a: boolean[] = [];
    const b: boolean[] = [];
    const stopA = reducedMotion.subscribe((v) => a.push(v));
    const stopB = reducedMotion.subscribe((v) => b.push(v));
    fire(stub, true);
    expect(a).toEqual([false, true]);
    expect(b).toEqual([false, true]);
    stopA();
    stopB();
  });

  it("stops delivering after unsubscribe", () => {
    const stub = stubMatchMedia(false);
    const seen: boolean[] = [];
    const stop = reducedMotion.subscribe((v) => seen.push(v));
    stop();
    fire(stub, true);
    expect(seen).toEqual([false]);
  });

  it("survives a subscriber that unsubscribes itself while being notified", () => {
    // animateIn tears itself down the moment the preference turns on, so the
    // set is mutated mid-notify. Iterating it live would skip the next one.
    const stub = stubMatchMedia(false);
    const other: boolean[] = [];
    let stopSelf: () => void = () => {};
    stopSelf = reducedMotion.subscribe(() => stopSelf());
    const stopOther = reducedMotion.subscribe((v) => other.push(v));
    fire(stub, true);
    expect(other).toEqual([false, true]);
    stopOther();
  });

  it("keeps ONE change listener however many subscribers there are", () => {
    const stub = stubMatchMedia(false);
    const stops = [0, 1, 2, 3].map(() => reducedMotion.subscribe(() => {}));
    expect(stub.addEventListener).toHaveBeenCalledTimes(1);
    stops.forEach((s) => s());
  });

  it("emits false and never throws where there is no matchMedia", () => {
    // SSR, and jsdom before a test stubs one.
    const original = window.matchMedia;
    // @ts-expect-error — deleting the API is exactly the condition under test.
    delete window.matchMedia;
    const seen: boolean[] = [];
    const stop = reducedMotion.subscribe((v) => seen.push(v));
    expect(seen).toEqual([false]);
    stop();
    window.matchMedia = original;
  });

  it("re-reads the preference per call in prefersReducedMotion()", () => {
    const stub = stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    stub.matches = true;
    expect(prefersReducedMotion()).toBe(true);
  });
});

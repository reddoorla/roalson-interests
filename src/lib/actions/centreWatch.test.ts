import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { centreWatch, CENTRE_BAND, CENTRE_ID } from "./centreWatch";

// The action's whole job is to construct an observer with the right root and
// to pick the right entry out of a batch, so both of those are watched
// directly. jsdom has neither a layout nor a real IntersectionObserver, and
// that is fine: what is asserted here is the DECISION, and the geometry it
// decides on is measured in a browser by tests/interaction/property-map.spec.ts
// (identical to an independent box test at nine scroll positions).
interface Made {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
}

let made: Made[] = [];

function stubObserver() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      record: Made;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.record = { callback, options, observed: [], disconnected: false };
        made.push(this.record);
      }
      observe(el: Element) {
        this.record.observed.push(el);
      }
      unobserve() {}
      disconnect() {
        this.record.disconnected = true;
      }
      takeRecords() {
        return [];
      }
    },
  );
}

/** A matchMedia whose answer is `wide`, and whose `change` listeners this test
 *  can fire — the resize past the breakpoint. */
function stubMatchMedia(wide: boolean) {
  const listeners = new Set<() => void>();
  const state = { wide };
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: state.wide,
    media,
    onchange: null,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  return {
    resizeTo(next: boolean) {
      state.wide = next;
      for (const fn of listeners) fn();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function list(ids: string[]) {
  const ul = document.createElement("ul");
  for (const id of ids) {
    const li = document.createElement("li");
    li.setAttribute(CENTRE_ID, id);
    ul.append(li);
  }
  document.body.append(ul);
  return ul;
}

const entry = (target: Element, isIntersecting: boolean, time: number) =>
  ({ target, isIntersecting, time }) as IntersectionObserverEntry;

beforeEach(() => {
  made = [];
  document.body.innerHTML = "";
});
afterEach(() => vi.unstubAllGlobals());

describe("centreWatch", () => {
  it("watches a zero-height root on the viewport's middle, one entry per card", () => {
    stubMatchMedia(true);
    stubObserver();
    const ul = list(["a", "b", "c"]);
    centreWatch(ul, { minWidth: 1024, onactive: () => {} });
    expect(made).toHaveLength(1);
    expect(made[0]!.options?.rootMargin).toBe(CENTRE_BAND);
    expect(made[0]!.options?.rootMargin).toBe("-50% 0px -50% 0px");
    expect(made[0]!.observed).toHaveLength(3);
  });

  it("reports the child on the line", () => {
    stubMatchMedia(true);
    stubObserver();
    const ul = list(["a", "b"]);
    const seen: string[] = [];
    centreWatch(ul, { minWidth: 1024, onactive: (id) => seen.push(id) });
    made[0]!.callback([entry(ul.children[1]!, true, 10)], null as never);
    expect(seen).toEqual(["b"]);
  });

  // A fast scroll delivers a BATCH, and the array's order is not the order the
  // crossings happened in. Only the newest intersecting entry describes where
  // the page is now — taking the first or the last of the array is right most
  // of the time and wrong exactly when the scroll was fast.
  //
  // TWO batches, and that is the whole test. The first version used one whose
  // newest intersecting entry happened to ALSO be the first in the array, so
  // replacing "newest by time" with "the first one I find" passed it — the
  // mutation was run and came back green, which is the only reason this is
  // now shaped like this. `b` is the answer to both orderings below, so
  // "first" is wrong on batch one and "last" is wrong on batch two.
  it("takes the newest intersecting entry of a batch, not the first or the last", () => {
    stubMatchMedia(true);
    stubObserver();
    const ul = list(["a", "b", "c"]);
    const seen: string[] = [];
    centreWatch(ul, { minWidth: 1024, onactive: (id) => seen.push(id) });
    // Oldest first: "the first intersecting entry" would answer `a`.
    made[0]!.callback(
      [
        entry(ul.children[0]!, true, 10),
        entry(ul.children[2]!, false, 30),
        entry(ul.children[1]!, true, 20),
      ],
      null as never,
    );
    // Newest first: "the last intersecting entry" would answer `a`.
    made[0]!.callback(
      [
        entry(ul.children[1]!, true, 20),
        entry(ul.children[2]!, false, 30),
        entry(ul.children[0]!, true, 10),
      ],
      null as never,
    );
    expect(seen).toEqual(["b", "b"]);
  });

  // Twice per card the centre falls in the 20px gap and nothing is on the line.
  // Clearing the answer there would let the map go twice per card.
  it("says nothing at all when no child is on the line", () => {
    stubMatchMedia(true);
    stubObserver();
    const ul = list(["a", "b"]);
    const seen: string[] = [];
    centreWatch(ul, { minWidth: 1024, onactive: (id) => seen.push(id) });
    made[0]!.callback(
      [entry(ul.children[0]!, false, 10), entry(ul.children[1]!, false, 11)],
      null as never,
    );
    expect(seen).toEqual([]);
  });

  // Not "runs and is ignored": below `lg` the map does not pin, so there is
  // nothing to drive, and an observer per section on every phone is a cost for
  // no behaviour.
  it("constructs no observer at all below its breakpoint", () => {
    stubMatchMedia(false);
    stubObserver();
    centreWatch(list(["a", "b"]), { minWidth: 1024, onactive: () => {} });
    expect(made).toHaveLength(0);
  });

  it("starts and stops as the viewport crosses the breakpoint", () => {
    const media = stubMatchMedia(false);
    stubObserver();
    const watch = centreWatch(list(["a", "b"]), { minWidth: 1024, onactive: () => {} });
    expect(made).toHaveLength(0);
    media.resizeTo(true);
    expect(made).toHaveLength(1);
    expect(made[0]!.disconnected).toBe(false);
    media.resizeTo(false);
    expect(made[0]!.disconnected).toBe(true);
    watch.destroy();
    expect(media.listenerCount).toBe(0);
  });

  it("is off for a section with no map to drive", () => {
    stubMatchMedia(true);
    stubObserver();
    centreWatch(list(["a"]), { minWidth: 1024, enabled: false, onactive: () => {} });
    expect(made).toHaveLength(0);
  });

  it("lets go of its observer and its listener when it is destroyed", () => {
    const media = stubMatchMedia(true);
    stubObserver();
    const watch = centreWatch(list(["a", "b"]), { minWidth: 1024, onactive: () => {} });
    expect(made[0]!.disconnected).toBe(false);
    watch.destroy();
    expect(made[0]!.disconnected).toBe(true);
    expect(media.listenerCount).toBe(0);
  });

  // The server, and a browser that answers nothing about its own width: the
  // list already works without this, so the enhancement simply does not run.
  it("does nothing where matchMedia is not answering", () => {
    vi.stubGlobal("matchMedia", undefined);
    stubObserver();
    centreWatch(list(["a"]), { minWidth: 1024, onactive: () => {} });
    expect(made).toHaveLength(0);
  });
});

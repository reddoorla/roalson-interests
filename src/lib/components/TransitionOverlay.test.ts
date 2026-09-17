import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";
import TransitionOverlay from "./TransitionOverlay.svelte";

// The wash that covers a client navigation. It used to be two seconds of opaque
// black that ate clicks: mounted on EVERY navigation (back/forward and external
// ones included), never cleared its timer, not hidden from assistive tech, and
// with no pointer-events-none — so `elementFromPoint` returned the sheet and a
// second tap went nowhere.
//
// Modelled on PreNavTransition.test.ts, which drives the same two lifecycle
// hooks and shares the `shouldIntercept` predicate with this component — the
// pair must not disagree about which navigations get covered.

afterEach(() => cleanup());

type NavCallback = (nav: FakeNav) => void;

interface FakeNav {
  type: string;
  willUnload: boolean;
  from: { url: URL } | null;
  to: { url: URL; route: { id: string | null } } | null;
}

let beforeNavigateCb: NavCallback | undefined;
let afterNavigateCb: (() => void) | undefined;

vi.mock("$app/navigation", () => ({
  beforeNavigate: (cb: NavCallback) => {
    beforeNavigateCb = cb;
  },
  afterNavigate: (cb: () => void) => {
    afterNavigateCb = cb;
  },
}));

function makeNav(
  toPath: string | null,
  {
    fromPath = "/",
    type = "link",
    willUnload = false,
  }: { fromPath?: string; type?: string; willUnload?: boolean } = {},
): FakeNav {
  return {
    type,
    willUnload,
    from: { url: new URL(fromPath, "https://example.com") },
    to: toPath ? { url: new URL(toPath, "https://example.com"), route: { id: toPath } } : null,
  };
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

beforeEach(() => {
  beforeNavigateCb = undefined;
  afterNavigateCb = undefined;
  mockMatchMedia(false);
  vi.useFakeTimers();

  // jsdom has no Web Animations API; Svelte 5 transitions need element.animate.
  if (!Element.prototype.animate) {
    Element.prototype.animate = vi.fn(
      () =>
        ({
          cancel() {},
          finish() {},
          pause() {},
          play() {},
          onfinish: null,
          oncancel: null,
          finished: Promise.resolve(),
        }) as unknown as Animation,
    );
  }
});

afterEach(() => {
  vi.useRealTimers();
});

/** ANY sheet at all — deliberately NOT keyed on the `data-transition-overlay`
 *  attribute the fixed component carries.
 *
 *  This helper was written that way first, and it made all four "does not
 *  cover …" cases below pass against the OLD component — which mounts a sheet
 *  on every navigation, including the three it must not, but carries no such
 *  attribute. The selector found nothing, so "no sheet is raised" was trivially
 *  true and the tests could not have failed however wrong the component was.
 *
 *  The component renders its sheet or renders nothing, so its first child IS
 *  the sheet, whatever attributes that sheet happens to have. */
const sheet = (container: HTMLElement) => container.firstElementChild;

describe("TransitionOverlay — which navigations get a wash", () => {
  it("covers an ordinary client navigation", async () => {
    const { container } = render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about"));
    await tick();

    expect(sheet(container)).toBeTruthy();
  });

  it("does not cover back/forward (popstate should feel instant)", async () => {
    const { container } = render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about", { type: "popstate" }));
    await tick();

    expect(sheet(container)).toBeNull();
  });

  it("does not cover an unloading navigation, which nothing would lift", async () => {
    // afterNavigate never arrives for a full page load or an external link, so
    // a sheet raised here is the one case that could be left up over a page the
    // user is still looking at.
    const { container } = render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about", { willUnload: true }));
    await tick();

    expect(sheet(container)).toBeNull();
  });

  it("does not cover a same-page navigation (hash or query only)", async () => {
    const { container } = render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about", { fromPath: "/about" }));
    await tick();

    expect(sheet(container)).toBeNull();
  });

  it("raises no sheet at all under reduced motion", async () => {
    mockMatchMedia(true);
    const { container } = render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about"));
    await tick();

    expect(sheet(container)).toBeNull();
  });
});

describe("TransitionOverlay — the sheet is never in the way", () => {
  it("is pointer-transparent and hidden from assistive tech", async () => {
    const { container } = render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about"));
    await tick();

    const el = sheet(container)!;
    expect(el).toBeTruthy();
    // Unreachable by role and by hit test, so a data attribute is the only
    // honest handle the browser-level spec has on it.
    expect(el.hasAttribute("data-transition-overlay")).toBe(true);
    // Without this a tap during the wash hit the sheet instead of the link
    // under it, and was silently eaten.
    expect(el.className, "the sheet must not take pointer events").toContain("pointer-events-none");
    // Decorative: it says nothing, so it should not be in the accessibility
    // tree at all.
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});

// TIMERS are the observable here, not the sheet's presence — and that is a
// correction, not a preference. Svelte keeps the node mounted for the whole
// outro, and in jsdom (no Web Animations API, a stubbed `element.animate`) that
// outro never completes, so the node is never removed. Written against node
// presence, as these three were first, two of them could only ever FAIL and the
// third could only ever PASS: "a second navigation does not flash the page
// through" was green against the very component whose stale timer causes the
// flash, because a lingering outro node satisfied it.
//
// What IS observable in this environment is the component's timer bookkeeping,
// which is also where the defect actually lives: the old component armed no
// ceiling at all and never cleared the timer belonging to a superseded
// navigation. The browser-level behaviour (the wash itself) is beachfront's
// tests/interaction/page-transition.spec.ts, which is not ported here.
describe("TransitionOverlay — how long the cover lasts", () => {
  it("arms a ceiling as the cover goes up", async () => {
    render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about"));
    await tick();

    // Exactly one timer: the MAX_COVER_MS failsafe. Without it a navigation
    // that never completes leaves the sheet up over a page the reader can no
    // longer use — `afterNavigate` is the only thing that would have lifted it.
    expect(vi.getTimerCount(), "no ceiling armed for the cover").toBe(1);
  });

  it("holds for a couple of frames once the route arrives, not a second", async () => {
    render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/about"));
    await tick();

    afterNavigateCb!();
    // The ceiling is REPLACED by the short hold, never left running alongside
    // it — a stale failsafe would lift a cover that is already gone.
    expect(vi.getTimerCount(), "the ceiling outlived the navigation it bounded").toBe(1);

    // The old hold was 1050ms plus a 700ms fade: nearly two seconds of cover
    // over a page that had been ready for most of it. `afterNavigate` runs
    // before the incoming route has painted, so the hold is not zero either —
    // a couple of frames is the whole job.
    await vi.advanceTimersByTimeAsync(200);
    expect(vi.getTimerCount(), "still holding 200ms after the route arrived").toBe(0);
  });

  it("does not leave a superseded navigation's timer running", async () => {
    render(TransitionOverlay);

    beforeNavigateCb!(makeNav("/first"));
    await tick();
    afterNavigateCb!();

    // 100ms into the hold, a second navigation starts. The first one's hide
    // timer belongs to a swap that is no longer happening: left running, it
    // fires mid-cover and flashes the outgoing page through.
    await vi.advanceTimersByTimeAsync(100);
    beforeNavigateCb!(makeNav("/second", { fromPath: "/first" }));
    await tick();

    // Past where the stale hide would have fired, and past the fade it would
    // have started, a correct component is still covering: the second
    // navigation has not completed, so its ceiling is what remains pending.
    await vi.advanceTimersByTimeAsync(1100);
    expect(vi.getTimerCount(), "the second cover has nothing left to lift it").toBe(1);
  });
});

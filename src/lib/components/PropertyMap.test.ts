import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { tick } from "svelte";

import PropertyMap from "./PropertyMap.svelte";
import { DEFAULT_MAP_STYLE_URL, type MapPoint } from "$lib/property-map";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The component reads PUBLIC_MAP_STYLE_URL at instance init, as TurnstileWidget
// reads its sitekey — so the env is mutable per render.
const mockEnv = vi.hoisted(() => ({ env: {} as { PUBLIC_MAP_STYLE_URL?: string } }));
vi.mock("$env/dynamic/public", () => mockEnv);

// The 426 KB engine, replaced by something a jsdom test can watch. Every
// method the component calls is here and nothing else is: if the component
// starts calling something new, this throws rather than passing quietly.
const engine = vi.hoisted(() => {
  const created: {
    options: Record<string, unknown>;
    handlers: Record<string, (e?: unknown) => void>;
    controls: { control: unknown; position: string }[];
    canvas: HTMLCanvasElement;
    canvasContainer: HTMLDivElement;
    jumps: unknown[];
    eases: unknown[];
    flights: unknown[];
    /** Every `scrollZoom.enable()` / `.disable()`, in order. The in-page map
     *  is constructed with scroll-zoom OFF and only `expanded` turns it on. */
    scrollZoomCalls: ("enable" | "disable")[];
    removed: boolean;
  }[] = [];

  class FakeMap {
    handlers: Record<string, (e?: unknown) => void> = {};
    canvas = document.createElement("canvas");
    canvasContainer = document.createElement("div");
    record: (typeof created)[number];
    scrollZoomEnabled: boolean;
    scrollZoom = {
      enable: () => {
        this.scrollZoomEnabled = true;
        this.record.scrollZoomCalls.push("enable");
      },
      disable: () => {
        this.scrollZoomEnabled = false;
        this.record.scrollZoomCalls.push("disable");
      },
      isEnabled: () => this.scrollZoomEnabled,
    };
    constructor(options: Record<string, unknown>) {
      this.scrollZoomEnabled = options.scrollZoom !== false;
      this.record = {
        options,
        handlers: this.handlers,
        controls: [],
        canvas: this.canvas,
        canvasContainer: this.canvasContainer,
        jumps: [],
        eases: [],
        flights: [],
        scrollZoomCalls: [],
        removed: false,
      };
      created.push(this.record);
    }
    getCanvasContainer() {
      return this.canvasContainer;
    }
    on(name: string, fn: (e?: unknown) => void) {
      this.handlers[name] = fn;
    }
    addControl(control: unknown, position: string) {
      this.record.controls.push({ control, position });
    }
    getCanvas() {
      return this.canvas;
    }
    getZoom() {
      return 7;
    }
    getMaxZoom() {
      return 16;
    }
    project() {
      return { x: 10, y: 20 };
    }
    jumpTo(camera: unknown) {
      this.record.jumps.push(camera);
    }
    easeTo(camera: unknown) {
      this.record.eases.push(camera);
    }
    flyTo(camera: unknown) {
      this.record.flights.push(camera);
    }
    resize() {}
    remove() {
      this.record.removed = true;
    }
  }

  class FakeAttributionControl {
    constructor(public options: Record<string, unknown>) {}
  }

  return {
    created,
    module: { default: { Map: FakeMap, AttributionControl: FakeAttributionControl } },
  };
});

vi.mock("$lib/map-engine", () => engine.module);

/** An IntersectionObserver that reports one fixed sighting the moment it is
 *  asked to observe — a map `mapHeight` tall of which `visible` px are inside a
 *  `root` px window.
 *
 *  The shape is not padding: PropertyMap boots only when at least half the map,
 *  or half the window, is really on screen (#103), and it reads
 *  `boundingClientRect`, `intersectionRect` and `rootBounds` to decide. An
 *  entry carrying only `isIntersecting` is what this stub used to send, and the
 *  component threw on it — which is the test doing its job. */
function stubIntersecting({ mapHeight = 595, visible = 595, root = 900 } = {}) {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(public cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        this.cb(
          [
            {
              isIntersecting: visible > 0,
              target: el,
              boundingClientRect: { height: mapHeight } as DOMRectReadOnly,
              intersectionRect: { height: visible } as DOMRectReadOnly,
              rootBounds: { height: root } as DOMRectReadOnly,
              intersectionRatio: mapHeight === 0 ? 0 : visible / mapHeight,
              time: 0,
            } as IntersectionObserverEntry,
          ],
          this as never,
        );
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
}

/**
 * A ResizeObserver whose callback the TEST can fire again, with a new box.
 *
 * `rerender` is not a way to trigger a re-fit: it re-runs the boot effect,
 * whose cleanup calls `destroy()`, so the map is torn down and re-booting
 * asynchronously by the time the next assertion runs — and `destroy()` clears
 * the very flag a suspension test is about. (Measured: after one
 * `view.rerender`, the camera effect's next run sees `map = null, ready =
 * false`. A "0 flights" assertion written that way passes because there is no
 * map, which is the vacuous-green shape this repo hunts.)
 *
 * A resize does not go near the boot effect, and a re-fit IS what a box change
 * asks for — so this is both the honest trigger and the real one.
 */
function stubResizableTo(width: number, height: number) {
  const fire: ((box: { width: number; height: number }) => void)[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(public cb: ResizeObserverCallback) {}
      observe(el: Element) {
        void el;
        this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as never);
        fire.push((box) => this.cb([{ contentRect: box } as ResizeObserverEntry], this as never));
      }
      unobserve() {}
      disconnect() {}
    },
  );
  return (box: { width: number; height: number }) => {
    for (const f of fire) f(box);
  };
}

/** A ResizeObserver that reports one fixed box the moment it is observed. */
function stubResizeTo(width: number, height: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(public cb: ResizeObserverCallback) {}
      observe(el: Element) {
        this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as never);
        void el;
      }
      unobserve() {}
      disconnect() {}
    },
  );
}

const points: MapPoint[] = [
  {
    id: "a",
    title: "IH 10 at Menger Springs",
    lat: 29.7732434,
    lng: -98.7301826,
    href: "/properties/ih-10-at-menger-springs",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=29.7732434,-98.7301826",
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=29.7732434,-98.7301826",
  },
  {
    id: "b",
    title: "Highway 77 at General Cavazos",
    lat: 27.4900712,
    lng: -97.8487066,
    href: null,
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=27.4900712,-97.8487066",
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=27.4900712,-97.8487066",
  },
];

beforeEach(() => {
  engine.created.length = 0;
  delete mockEnv.env.PUBLIC_MAP_STYLE_URL;
});

describe("what the server sends, which is the whole of the no-JS state", () => {
  it("is a named list of the section's listings, one link each", () => {
    const { getByRole, container } = render(PropertyMap, {
      props: { points, label: "Land", engine: "off" },
    });
    const list = getByRole("list", { name: "Land listings" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    const links = [...container.querySelectorAll<HTMLAnchorElement>("[data-map-link]")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(points.map((p) => p.mapsUrl));
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("names Google Maps in every link, so the destination is not a surprise", () => {
    const { container } = render(PropertyMap, {
      props: { points, label: "Land", engine: "off" },
    });
    for (const a of container.querySelectorAll("[data-map-link]")) {
      expect(a.textContent).toContain("open in Google Maps");
    }
  });

  // A section whose listings all have an empty GeoPoint must not leave a box.
  it("renders nothing at all with no pins", () => {
    const { container } = render(PropertyMap, {
      props: { points: [], label: "Sold", engine: "off" },
    });
    expect(container.querySelector("[data-property-map]")).toBeNull();
  });

  it("does not claim to be ready before a map has drawn a frame", () => {
    const { container } = render(PropertyMap, {
      props: { points, label: "Land", engine: "off" },
    });
    expect(container.querySelector("[data-property-map]")!.hasAttribute("data-map-ready")).toBe(
      false,
    );
  });
});

describe("when the engine is asked for", () => {
  it('stays off entirely for engine="off", however visible the box is', async () => {
    stubIntersecting();
    render(PropertyMap, { props: { points, label: "Land", engine: "off" } });
    await tick();
    await tick();
    expect(engine.created).toHaveLength(0);
  });

  it("boots once the container intersects, on the default style", async () => {
    stubIntersecting();
    render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    expect(engine.created[0]!.options.style).toBe(DEFAULT_MAP_STYLE_URL);
  });

  // The rule that keeps 426 KB off a page the visitor has only glimpsed —
  // and off the featured carousel's first dwell, which is what it cost before
  // (#103). "Half" is the smaller of half the MAP and half the WINDOW,
  // because a map taller than the window can never be half of itself visible.
  describe("only when half of it is really on screen", () => {
    it("does not boot on a sliver", async () => {
      // The homepage band at 1440x900: an 827px map with 372px on screen, 45%.
      stubIntersecting({ mapHeight: 827, visible: 372, root: 900 });
      render(PropertyMap, { props: { points, label: "Land" } });
      await tick();
      await tick();
      expect(engine.created).toHaveLength(0);
    });

    it("boots once half of it is", async () => {
      stubIntersecting({ mapHeight: 827, visible: 450, root: 900 });
      render(PropertyMap, { props: { points, label: "Land" } });
      await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    });

    it("boots a map TALLER than the window once half the window holds it", async () => {
      // 827 in a 400px window: half the map (413.5) is unreachable, so the
      // threshold has to be half the window (200). Without that clamp this
      // map would never load at all.
      stubIntersecting({ mapHeight: 827, visible: 260, root: 400 });
      render(PropertyMap, { props: { points, label: "Land" } });
      await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    });

    it("…and that same window does not boot it on 100px", async () => {
      stubIntersecting({ mapHeight: 827, visible: 100, root: 400 });
      render(PropertyMap, { props: { points, label: "Land" } });
      await tick();
      await tick();
      expect(engine.created).toHaveLength(0);
    });
  });

  it("takes PUBLIC_MAP_STYLE_URL when one is set", async () => {
    mockEnv.env.PUBLIC_MAP_STYLE_URL = "https://tiles.example.test/style.json";
    stubIntersecting();
    render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    expect(engine.created[0]!.options.style).toBe("https://tiles.example.test/style.json");
  });

  // The licence, not a preference: OpenStreetMap data is ODbL. The comp draws
  // no attribution and this departs from it on purpose, so the control being
  // added is asserted rather than assumed.
  it("always adds an attribution control, clear of the expand affordance", async () => {
    stubIntersecting();
    render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const [added] = engine.created[0]!.controls;
    expect(added, "an attribution control is added").toBeTruthy();
    expect(added!.position).toBe("bottom-left");
    expect(engine.created[0]!.options.attributionControl).toBe(false);
  });

  // MapLibre names its canvas "Map" and gives it role="region", so two maps on
  // the Properties page would be two identically named landmarks.
  it("renames the canvas after the section it is showing", async () => {
    stubIntersecting();
    render(PropertyMap, { props: { points, label: "Improved Projects" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    expect(engine.created[0]!.canvas.getAttribute("aria-label")).toBe(
      "Improved Projects listings, interactive map",
    );
  });

  it("draws a flat, north-up map — no rotation, no pitch", async () => {
    stubIntersecting();
    render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const { options } = engine.created[0]!;
    expect(options.dragRotate).toBe(false);
    expect(options.pitchWithRotate).toBe(false);
    expect(options.touchPitch).toBe(false);
  });

  it("tears the map down when the component goes", async () => {
    stubIntersecting();
    const { unmount } = render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    unmount();
    expect(engine.created[0]!.removed).toBe(true);
  });
});

describe("the expand affordance", () => {
  // The comp draws it on both 390 maps and on neither 1440 map. The rule here
  // is the CONTAINER's height, never a viewport query — which is also what
  // makes it correct for the expanded state.
  it("is drawn on a 200px box and not on a 595px one", async () => {
    stubResizeTo(350, 200);
    const short = render(PropertyMap, { props: { points, label: "Land", engine: "off" } });
    await tick();
    expect(short.container.querySelector("[data-map-expand]")).not.toBeNull();
    short.unmount();

    stubResizeTo(397, 595);
    const tall = render(PropertyMap, { props: { points, label: "Land", engine: "off" } });
    await tick();
    expect(tall.container.querySelector("[data-map-expand]")).toBeNull();
  });

  // Nothing is measured on the server, so nothing is drawn there either: the
  // control needs script, and `data-js-only` is the second half of that.
  it("is absent until the box has been measured, and is marked js-only", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { container } = render(PropertyMap, {
      props: { points, label: "Land", engine: "off" },
    });
    await tick();
    expect(container.querySelector("[data-map-expand]")).toBeNull();

    stubResizeTo(350, 200);
    const measured = render(PropertyMap, { props: { points, label: "Land", engine: "off" } });
    await tick();
    expect(
      measured.container.querySelector("[data-map-expand]")!.hasAttribute("data-js-only"),
    ).toBe(true);
  });

  it("says which way it goes, in its name and in aria-expanded", async () => {
    stubResizeTo(350, 200);
    const { container } = render(PropertyMap, {
      props: { points, label: "Land", engine: "off" },
    });
    await tick();
    const button = container.querySelector<HTMLButtonElement>("[data-map-expand]")!;
    expect(button.getAttribute("aria-label")).toBe("Enlarge the Land map");
    expect(button.getAttribute("aria-expanded")).toBe("false");

    button.click();
    await tick();
    const after = container.querySelector<HTMLButtonElement>("[data-map-expand]")!;
    expect(after.getAttribute("aria-label")).toBe("Collapse the Land map");
    expect(after.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-property-map]")!.getAttribute("data-expanded")).toBe(
      "true",
    );
  });

  it("carries a 44 x 44 target around the comp's 20.88px box (WCAG 2.5.8)", async () => {
    stubResizeTo(350, 200);
    const { container } = render(PropertyMap, {
      props: { points, label: "Land", engine: "off" },
    });
    await tick();
    // jsdom resolves no stylesheet, so the classes are what can be asserted —
    // the rendered geometry is measured in a real browser by
    // tests/interaction/property-map.spec.ts.
    const button = container.querySelector<HTMLButtonElement>("[data-map-expand]")!;
    const classes = button.className.split(/\s+/);
    expect(classes).toContain("h-11");
    expect(classes).toContain("w-11");
    const painted = button.querySelector("span")!.className;
    expect(painted).toContain("h-[20.88px]");
    expect(painted).toContain("w-[20.884px]");
    expect(painted).toContain("bg-primary");
  });
});

// ---------------------------------------------------------------------------
// The camera this component does NOT own
// ---------------------------------------------------------------------------

/** Boot a map, measured at `box`, and fire MapLibre's own `load` — which is
 *  the only thing that sets `ready`, and therefore the only thing that lets any
 *  camera rule past its first refusal. */
async function booted(props: Record<string, unknown>, box = { width: 397, height: 595 }) {
  stubResizeTo(box.width, box.height);
  stubIntersecting({ mapHeight: box.height, visible: box.height });
  const view = render(PropertyMap, { props: { points, label: "Land", ...props } });
  await vi.waitFor(() => expect(engine.created).toHaveLength(1));
  const record = engine.created[0]!;
  record.handlers.load?.();
  await tick();
  await tick();
  return { view, record };
}

describe("the camera the page drives", () => {
  it("is constructed already framed on the active listing, so nothing moves at load", async () => {
    const { record } = await booted({ active: "b" });
    // `fitCamera` of one point clamps to the frame's maxZoom, and the centre is
    // that point corrected for the pin's tip.
    expect(record.options.zoom).toBe(12);
    expect((record.options.center as number[])[0]).toBeCloseTo(points[1]!.lng, 6);
    // Nothing flew: the map opened where it belonged.
    expect(record.flights).toHaveLength(0);
  });

  it("flies when the page changes which listing is active", async () => {
    const { view, record } = await booted({ active: "b" });
    await view.rerender({ points, label: "Land", active: "a" });
    await tick();
    expect(record.flights).toHaveLength(1);
    const flight = record.flights[0] as { center: number[]; zoom: number; duration: number };
    expect(flight.center[0]).toBeCloseTo(points[0]!.lng, 6);
    expect(flight.zoom).toBe(12);
    expect(flight.duration).toBe(500);
  });

  // WHAT THIS BLOCK CAN AND CANNOT SAY, because the previous version of it
  // claimed the wrong one. A stub Map can measure the SUSPENSION'S STATE
  // MACHINE — given a tagged movestart, what does the camera do next — and it
  // is genuinely worth measuring here, where every branch is reachable in
  // milliseconds. It can say NOTHING about which real gestures carry an
  // `originalEvent`, because it is the thing inventing the events: the old
  // single test hand-built `movestart` with `originalEvent: new Event(
  // "pointerdown")` and was read as evidence that the guard fired on the
  // gestures visitors make. It does not fire on a wheel zoom — measured in
  // Chromium against maplibre-gl 6.10.0, where a wheel's `movestart` carries
  // no `originalEvent` at all — and no stub could ever have shown that.
  // tests/interaction/property-map-camera.spec.ts drives real gestures.
  // WHICH RE-FIT THE SUSPENSION ACTUALLY PROTECTS, measured rather than
  // assumed — and the first version of these two tests had it wrong. With a
  // single listing active the fitted camera is INDEPENDENT of the box: a
  // one-point bounds has zero span, the zoom clamps to the frame's `maxZoom`
  // and the centre is the point corrected by the frame's own padding, so a
  // resize asks for the camera the map is already commanded to and
  // `cameraMove` answers "arrived" whatever `userMoved` says. A control
  // written that way expected a flight and got none.
  //
  // The re-fit that really moves is the FIT-THEM-ALL one: with `active: null`
  // the camera is fitted to every point INSIDE the box, so its shape decides
  // it. That is also the case the flag was originally written for, back when a
  // box change was the only thing that moved this camera at all.
  it("re-fits on a box change when nobody has driven the map", async () => {
    const resize = stubResizableTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, { props: { points, label: "Land", active: null } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const record = engine.created[0]!;
    record.handlers.load?.();
    await tick();
    await tick();
    const before = record.flights.length + record.jumps.length + record.eases.length;

    resize({ width: 397, height: 700 });
    await tick();
    await tick();
    expect(record.flights.length + record.jumps.length + record.eases.length).toBeGreaterThan(
      before,
    );
    view.unmount();
  });

  it("declines that same re-fit once a gesture has driven the map", async () => {
    const resize = stubResizableTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, { props: { points, label: "Land", active: null } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const record = engine.created[0]!;
    record.handlers.load?.();
    await tick();
    await tick();

    record.handlers.movestart?.({ originalEvent: new Event("pointerdown") });
    await tick();
    const before = record.flights.length + record.jumps.length + record.eases.length;

    // Same listing, new box — exactly the case the control above moves for.
    resize({ width: 397, height: 700 });
    await tick();
    await tick();
    expect(record.flights.length + record.jumps.length + record.eases.length).toBe(before);
    view.unmount();
  });

  it("follows again the moment the page asks for a different listing", async () => {
    const { view, record } = await booted({ active: "b" });
    record.handlers.movestart?.({ originalEvent: new Event("pointerdown") });
    await tick();
    await view.rerender({ points, label: "Land", active: "a" });
    await tick();
    // The half that was PERMANENT: nothing but `destroy()` used to clear it,
    // so one pan killed the camera for the life of the page.
    expect(record.flights).toHaveLength(1);
    expect((record.flights[0] as { center: number[] }).center[0]).toBeCloseTo(points[0]!.lng, 6);
  });

  // NOT TESTED HERE, DELIBERATELY, AND THIS NOTE IS THE POINT OF SAYING SO.
  // The remaining case is "the visitor comes back to the listing they dragged
  // on" — b → a → b, which must fly on BOTH changes, because a gesture is an
  // event and not a property of a listing. (The first version of the rule kept
  // the id forever and re-suspended on the return trip, stranding the camera.)
  //
  // It needs two consecutive `active` changes, and two `rerender`s cannot
  // express it: the first one re-runs the boot effect, whose cleanup calls
  // `destroy()` — so by the second the map is null, `ready` is false, and
  // `drivenAt` has been reset by the teardown rather than by the rule. A test
  // written here would report "no flight" for a map that does not exist, which
  // is precisely the shape it would exist to catch.
  //
  // It is measured in tests/interaction/property-map-camera.spec.ts ("a drag
  // holds the view while the same listing is active, then lets go", step 3),
  // against a real MapLibre map and a real mouse drag.

  it("is not driven by a programmatic move — only one carrying an originalEvent", async () => {
    const { view, record } = await booted({ active: "b" });
    // The map's OWN flights fire `movestart` too, with no `originalEvent`.
    // Were those counted, the first flight would suspend the camera forever.
    record.handlers.movestart?.({});
    await tick();
    await view.rerender({ points, label: "Land", active: "a" });
    await tick();
    expect(record.flights).toHaveLength(1);
  });

  it("builds the in-page map with scroll-zoom OFF", async () => {
    const { record } = await booted({ active: "b" });
    // The pinned box may not take the page's wheel. This is the map's STARTING
    // state; what holds it from then on is the effect the next case drives —
    // mutating this option to `true` on its own left the browser test green.
    expect(record.options.scrollZoom).toBe(false);
  });

  it("gives scroll-zoom back while expanded, and takes it away again", async () => {
    // A COMPACT box (200 < COMPACT_MAX_HEIGHT's 300), because the expand
    // affordance is only rendered on one — `{#if measured && (compact ||
    // expanded)}`. Booted at 397x595 there is no button, and a version of this
    // case that guarded the clicks with `if (expand)` asserted NOTHING while
    // passing. That is the shape this file exists to catch.
    const { view, record } = await booted({ active: "b" }, { width: 350, height: 200 });
    const expand = view.container.querySelector<HTMLButtonElement>("[data-map-expand]");
    expect(expand, "a compact box draws the expand affordance").not.toBeNull();
    expect(record.scrollZoomCalls.at(-1), "off while the box is in the page").toBe("disable");

    expand!.click();
    await tick();
    expect(record.scrollZoomCalls.at(-1), "on once expanded").toBe("enable");

    view.container.querySelector<HTMLButtonElement>("[data-map-expand]")!.click();
    await tick();
    expect(record.scrollZoomCalls.at(-1), "and off again on collapse").toBe("disable");
  });

  it("does not fly for an active id it has no pin for", async () => {
    const { view, record } = await booted({ active: "a" });
    await view.rerender({ points, label: "Land", active: "a-listing-with-no-geopoint" });
    await tick();
    expect(record.flights).toHaveLength(0);
    // And it did not fall back to the fit either: the view is simply held.
    expect(record.jumps).toHaveLength(0);
  });
});

describe("pressing a pin", () => {
  /** The pins are `aria-hidden` and `tabindex=-1` drawings of the list, so they
   *  are found by their data attribute rather than by role. */
  const pin = (container: HTMLElement, nth = 0) =>
    container.querySelectorAll<HTMLButtonElement>("[data-map-pin]")[nth]!;

  it("opens the sheet when the caller draws no detail of its own", async () => {
    const { view } = await booted({});
    expect(view.container.querySelectorAll("[data-map-pin]").length).toBeGreaterThan(0);
    pin(view.container).click();
    await tick();
    expect(view.container.querySelector("[data-map-sheet]")).not.toBeNull();
  });

  it("reports the listing instead, and opens no sheet, when the caller takes it", async () => {
    const seen: string[] = [];
    const { view } = await booted({ onselect: (id: string) => seen.push(id) });
    pin(view.container).click();
    await tick();
    expect(seen).toHaveLength(1);
    expect(points.map((p) => p.id)).toContain(seen[0]);
    expect(view.container.querySelector("[data-map-sheet]")).toBeNull();
  });

  // The whole point of routing a press through the caller: a press must not be
  // a second way for a listing to become active. It reports, and nothing else.
  //
  // THIS TEST USED TO BE UNFAILABLE, in two ways at once, and both are fixed
  // here rather than papered over.
  //
  //  1. It counted `record.flights` only. `press()` already reaches for
  //     `easeTo` on a cluster, so the obvious regression — a single press that
  //     eases the camera onto its own listing — would not have been a flight
  //     and would not have been counted. Every camera method is counted now.
  //  2. It pressed the pin of the listing that was ALREADY active, so even a
  //     press that set `active` itself would have asked for the camera that
  //     was already there and moved nothing. It presses a pin for a DIFFERENT
  //     listing now, which is the case with a visible consequence.
  //
  // And it asserts the press did something: a press that silently did nothing
  // would otherwise be the easiest way to make this green.
  it("reports the press and moves no camera of its own", async () => {
    const seen: string[] = [];
    const { view, record } = await booted({ active: "a", onselect: (id: string) => seen.push(id) });
    const before = {
      flights: record.flights.length,
      eases: record.eases.length,
      jumps: record.jumps.length,
    };

    // A pin that is NOT the active listing. `points[1]` is "b"; the markers are
    // drawn in `clusterPoints` order, so the pin is found by its id rather than
    // by position.
    const target = view.container.querySelector<HTMLButtonElement>(`[data-map-pin="b"]`);
    expect(target, "the non-active listing has a pin of its own to press").not.toBeNull();
    target!.click();
    await tick();

    // Positive evidence the press was actually handled…
    expect(seen, "the press was reported to the caller").toEqual(["b"]);
    // …and that it opened no sheet, because the caller draws the detail.
    expect(view.container.querySelector("[data-map-sheet]")).toBeNull();
    // …and that NOTHING asked the camera to go anywhere. `active` is still "a".
    expect(record.flights).toHaveLength(before.flights);
    expect(record.eases).toHaveLength(before.eases);
    expect(record.jumps).toHaveLength(before.jumps);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";

import PropertyMap from "./PropertyMap.svelte";
import {
  CAMERA_FLIGHT_MS,
  DEFAULT_MAP_STYLE_URL,
  frameFor,
  homeMarkers,
  MAP_HOME_FADE_MS,
  MAP_HOME,
  type MapPoint,
} from "$lib/property-map";

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

/** The artifact a finished cross-fade produces, dispatched on the canvas host
 *  itself — which is the one element whose fade may retire the picture (#134).
 *  jsdom runs no transitions and has no TransitionEvent constructor, so
 *  `propertyName` is an own property on a plain Event. */
function endTheFade(container: HTMLElement, propertyName = "opacity") {
  const host = container.querySelector("[data-map-canvas]")!;
  host.dispatchEvent(Object.assign(new Event("transitionend"), { propertyName }));
}

/** Boot a map, measured at `box`, and fire MapLibre's own `load` — which is
 *  the only thing that sets `ready`, and therefore the only thing that lets any
 *  camera rule past its first refusal.
 *
 *  THE MOVE LOG IS ZEROED AT THE END, and that is #122's doing. The map is now
 *  constructed at MAP_HOME — the fixed frame the committed placeholder is a
 *  picture of — so a map whose caller already has an `active` listing HANDS
 *  OVER to it with one flight. That hand-over is a claim in its own right and
 *  is asserted in exactly one case below; every other case here is about what
 *  the camera does NEXT, and counting from zero is what keeps those assertions
 *  as strong as they were ("one flight", not "one more than whatever happened
 *  at boot"). `boot` is returned so a case can still look at it.
 *
 *  THE HAND-OVER IS NO LONGER AT `load`, and that is #132. The flight waits
 *  for the PICTURE to be retired: a map that flew while its own placeholder
 *  was still on screen put the committed picture and a different live map up
 *  together for the whole 300ms fade. So this helper ends the cross-fade
 *  before it reads the log, and returns `held` — what the camera did while the
 *  picture was up, which every case can assert is nothing. */
async function booted(props: Record<string, unknown>, box = { width: 397, height: 595 }) {
  stubResizeTo(box.width, box.height);
  stubIntersecting({ mapHeight: box.height, visible: box.height });
  const view = render(PropertyMap, { props: { points, label: "Land", ...props } });
  await vi.waitFor(() => expect(engine.created).toHaveLength(1));
  const record = engine.created[0]!;
  record.handlers.load?.();
  await tick();
  await tick();
  const held = {
    flights: [...record.flights],
    jumps: [...record.jumps],
    eases: [...record.eases],
    /** Whether there was a picture to hold the camera in the first place —
     *  without it `held` is empty for the uninteresting reason. */
    picture: view.container.querySelector("[data-map-home-box]") !== null,
  };
  // THE FAKE CLOCK IS ONLY FOR THE HAND-OVER, and it is here because #130 and
  // #137 landed the same day without seeing each other. The hand-over is a
  // FLIGHT, and since #127 a flight holds the next one for `CAMERA_FLIGHT_MS`
  // — so a case that changed `active` straight after this helper returned was
  // correctly answered `in-flight` and counted zero. Five cases below went red
  // on exactly that, and every one of them is about the move AFTER the boot.
  // Landing the hand-over here is what makes "one flight" mean the one the
  // case asked for. (Real timers everywhere else in this file: `booted` is
  // never called from the `vi.useFakeTimers()` block below, and the clock is
  // handed back before it returns.)
  vi.useFakeTimers();
  endTheFade(view.container);
  await tick();
  await tick();
  const boot = {
    flights: [...record.flights],
    jumps: [...record.jumps],
    eases: [...record.eases],
  };
  vi.advanceTimersByTime(CAMERA_FLIGHT_MS + 1);
  flushSync();
  vi.useRealTimers();
  record.flights.length = 0;
  record.jumps.length = 0;
  record.eases.length = 0;
  return { view, record, boot, held };
}

describe("the camera the page drives", () => {
  // THE #122 GUARD, and it is one of the two that issue names: "assert
  // MAP_HOME is what MapLibre is actually constructed with. If the constant
  // and the camera ever part company the placeholder is a lie and nothing else
  // would notice." The other half — that the committed raster was RENDERED at
  // this same camera — is scripts/map-home.test.ts's.
  //
  // THIS CASE REPLACES ONE TITLED "is constructed already framed on the active
  // listing, so nothing moves at load", and that claim is no longer true. It
  // was true, and it was #112's: the homepage band opened on slide 0 and
  // nothing travelled. It now opens on the fixed frame and flies to slide 0,
  // because a map that opened anywhere else would land its tiles somewhere the
  // picture underneath them is not, and that jump is the whole thing the
  // placeholder exists to remove. 500ms, under WCAG 2.2.2's five seconds, and
  // a jump rather than a flight under `prefers-reduced-motion`.
  it("is constructed at exactly MAP_HOME when a placeholder is drawn", async () => {
    const { record, boot, held } = await booted({ active: "b" });
    // The placeholder really was in the DOM — otherwise this case would be
    // asserting the boot camera of a map that has nothing to agree with.
    // (`booted` ends the cross-fade before it returns, so this is read there.)
    expect(held.picture).toBe(true);
    const want = MAP_HOME[frameFor({ width: 397, height: 595 })].camera;
    expect(record.options.center).toEqual([want.lng, want.lat]);
    expect(record.options.zoom).toBe(want.zoom);
    // AND IT STAYS THERE WHILE THE PICTURE IS UP (#132). `load` has fired and
    // there is an active listing to go to, so the only thing holding the
    // camera is the placeholder over it. This is the half that was missing:
    // opening at MAP_HOME means nothing if the map leaves on the next frame,
    // which is what it did — 14618.92 px of picture-to-live pin delta on
    // /properties at 1440, measured on a production build.
    expect(held.flights, "no flight while the picture is on screen").toHaveLength(0);
    expect(held.jumps, "and no jump either").toHaveLength(0);
    // And THEN it hands over to the listing the caller asked for: one flight,
    // to `fitCamera` of that point, which clamps to the frame's maxZoom.
    expect(boot.flights).toHaveLength(1);
    const handover = boot.flights[0] as { center: number[]; zoom: number };
    expect(handover.center[0]).toBeCloseTo(points[1]!.lng, 6);
    expect(handover.zoom).toBe(12);
  });

  it("is constructed at the fit, as before, when no placeholder is drawn", async () => {
    // A section with nothing inside MAP_HOME gets no picture — so there is
    // nothing for the camera to agree with, and the old rule stands: open on
    // the active listing and do not move. `points[1]` alone is Kingsville,
    // 197 km south of the frame.
    stubResizeTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, {
      props: { points: [points[1]!], label: "Out of San Antonio", active: "b" },
    });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const record = engine.created[0]!;
    record.handlers.load?.();
    await tick();
    await tick();
    expect(view.container.querySelector("[data-map-home-box]")).toBeNull();
    expect(record.options.zoom).toBe(12);
    expect((record.options.center as number[])[0]).toBeCloseTo(points[1]!.lng, 6);
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
  //
  // AND AT #122 IT STOPPED BEING THE FIT. `active: null` now resolves to this
  // section's MAP_HOME, a CHOSEN frame, which is by construction independent
  // of the box — so 397x595 -> 397x700 moves nothing at all and the control
  // below measured zero. A whole class of camera moves is simply gone: no
  // desktop resize disturbs a map at rest any more.
  //
  // What still moves it is a box change that crosses `COMPACT_MAX_HEIGHT`,
  // because MAP_HOME's two frames are two cameras (z8.0 compact, z8.6 full).
  // That is also the box change the real site produces — the expand affordance
  // below `lg`, 200 -> min(70dvh, 520px) — so these two cases now drive the
  // only resize that has ever mattered on production data.
  it("re-frames on a box change that crosses the frame threshold", async () => {
    const resize = stubResizableTo(350, 200);
    stubIntersecting({ mapHeight: 200, visible: 200 });
    const view = render(PropertyMap, { props: { points, label: "Land", active: null } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const record = engine.created[0]!;
    record.handlers.load?.();
    await tick();
    await tick();
    // The premise, asserted rather than assumed: it opened on the COMPACT
    // frame's home.
    expect(record.options.zoom).toBe(MAP_HOME.compact.camera.zoom);
    const before = record.flights.length + record.jumps.length + record.eases.length;

    resize({ width: 350, height: 520 });
    await tick();
    await tick();
    expect(record.flights.length + record.jumps.length + record.eases.length).toBeGreaterThan(
      before,
    );
    // And it went to the OTHER home, not to a fit of the points.
    expect(record.jumps.at(-1)).toEqual({
      center: [MAP_HOME.full.camera.lng, MAP_HOME.full.camera.lat],
      zoom: MAP_HOME.full.camera.zoom,
    });
    view.unmount();
  });

  it("does NOT move for a box change that stays inside one frame", async () => {
    // The other half of the same rule, and the thing #122 actually changed.
    // This case did not exist before because there was nothing to say: every
    // box change re-fitted. Now most of them do nothing, and that is worth a
    // test rather than a comment.
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
    expect(record.flights.length + record.jumps.length + record.eases.length).toBe(before);
    view.unmount();
  });

  it("declines that same re-frame once a gesture has driven the map", async () => {
    const resize = stubResizableTo(350, 200);
    stubIntersecting({ mapHeight: 200, visible: 200 });
    const view = render(PropertyMap, { props: { points, label: "Land", active: null } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    const record = engine.created[0]!;
    record.handlers.load?.();
    await tick();
    await tick();

    record.handlers.movestart?.({ originalEvent: new Event("pointerdown") });
    await tick();
    const before = record.flights.length + record.jumps.length + record.eases.length;

    // Same listing, same box change the control above moves for.
    resize({ width: 350, height: 520 });
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

  // WHO ASKED (#118 review, MAJOR 2). The suspension ends when the VISITOR
  // asks for a different listing, and on the homepage band the index moves on
  // a 4000ms clock with nobody touching anything. `active` alone cannot tell
  // those apart, so the caller says.
  it("does not end a suspension for a change the page made on its own", async () => {
    const { view, record } = await booted({ active: "b", activeBy: "auto" });
    record.handlers.movestart?.({ originalEvent: new Event("pointerdown") });
    await tick();
    await view.rerender({ points, label: "Land", active: "a", activeBy: "auto" });
    await tick();
    // The band advanced. Nobody asked for it, so the visitor's view stands.
    expect(record.flights).toHaveLength(0);
  });

  it("ends it for the same change when the visitor is the one who asked", async () => {
    // The control for the case above, one prop apart — and the reason the two
    // are written as a pair: an `activeBy` the component simply ignored would
    // pass the first test and fail this one.
    const { view, record } = await booted({ active: "b", activeBy: "auto" });
    record.handlers.movestart?.({ originalEvent: new Event("pointerdown") });
    await tick();
    await view.rerender({ points, label: "Land", active: "a", activeBy: "visitor" });
    await tick();
    expect(record.flights).toHaveLength(1);
  });

  // COALESCING (#118 review MAJOR 3; re-based on the flight itself by #127 and
  // #128). The camera will not launch a second flight over one still in the
  // air. The RULE is `cameraMove`'s and is unit-tested there against every
  // input; what this measures is that a `scroll` event is no longer any part
  // of it, which is the half of the correction visible from here.
  //
  // Both halves in ONE test, deliberately: "a flight happened" proves nothing
  // unless the same breath says a scroll was arriving while it did.
  it("flies on a card change even while the document is scrolling", async () => {
    const { view, record } = await booted({ active: "b" });
    window.dispatchEvent(new Event("scroll"));
    await view.rerender({ points, label: "Land", active: "a" });
    await tick();
    // Against the code this replaces, this is 0: the document's own scroll was
    // the gate, so a wheel notch (one event, then silence) suppressed the
    // flight it should have allowed and a held scroll suppressed every flight
    // for as long as it lasted.
    expect(record.flights, "the page's scroll is not the camera's business").toHaveLength(1);
  });

  // THE OTHER HALF IS NOT HERE, AND THIS NOTE IS THE POINT OF SAYING SO.
  // "Several crossings, and no arc abandoned" needs consecutive `active`
  // changes on a live map, which `rerender` cannot express: it re-runs the
  // boot effect, whose cleanup calls `destroy()` (see stubResizableTo's note,
  // and `record.removed` is true after the first one). A version written here
  // read "0 flights" for a map that no longer existed — a green for the
  // opposite reason, which is exactly the shape that shipped the defect.
  //
  // It is measured in PropertyMap.camera.svelte.test.ts, which holds the props
  // in a `$state` object instead and so keeps ONE map alive across a whole
  // drive on a clock it owns — the file that can see where the refusal's input
  // comes from, which is where #127 lived. And end to end, on a real MapLibre
  // map against real inputs (`End`, `PageDown`, a smooth `scrollTo`, and a
  // real `page.mouse.wheel` at a notch gap wider than any debounce), in
  // tests/interaction/property-map-camera-prod.spec.ts, with the fleet's
  // reduced-motion emulation lifted — without which `scroll-behavior` is
  // `auto`, no card is ever crossed on the way, and the whole class is
  // structurally unobservable.

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

// ---------------------------------------------------------------------------
// The fixed-frame placeholder (#122)
// ---------------------------------------------------------------------------

/** A `matchMedia` that answers `matches` for `prefers-reduced-motion: reduce`
 *  and nothing else — the same shape CarouselProgress.test.ts drives. */
function stubReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe("the picture the server draws where the map will be", () => {
  // Every case here renders with `engine: "off"`, so nothing below can be
  // confused with what MapLibre did: this is the SERVER's markup, which is
  // also what a scripting-off browser gets and what a crawler reads.
  const render0 = () => render(PropertyMap, { props: { points, label: "Land", engine: "off" } });

  it("draws one layer per frame, each with its own committed raster", async () => {
    const { container } = render0();
    await tick();
    const layers = [...container.querySelectorAll<HTMLElement>("[data-map-home-frame]")];
    expect(layers.map((l) => l.dataset.mapHomeFrame)).toEqual(Object.keys(MAP_HOME));
    for (const layer of layers) {
      const frame = MAP_HOME[layer.dataset.mapHomeFrame as keyof typeof MAP_HOME];
      // The size comes from the same constant the generator rendered at, so a
      // raster regenerated at another size cannot be served at the old one —
      // which would scale it, and a scaled placeholder cannot line up with the
      // tiles.
      expect(layer.style.backgroundSize).toBe(`${frame.raster.width}px ${frame.raster.height}px`);
      // AND THE URL IS NOT HERE, which is the whole of #133. A
      // `background-image` on the layer is fetched whichever layer the
      // container query ends up painting — measured as both rasters on up to
      // 16 of 16 production loads — so the file name is handed to CSS as a
      // custom property and only the rule that wins turns it into a request.
      expect(layer.style.backgroundImage, "the layer names no image of its own").toBe("");
    }
    // One property per frame, on the wrapper, written from the same constant:
    // the file name still has exactly one source.
    const box = container.querySelector<HTMLElement>("[data-map-home-box]")!;
    for (const [key, frame] of Object.entries(MAP_HOME)) {
      expect(box.style.getPropertyValue(`--map-home-${key}`)).toBe(`url(/${frame.file})`);
    }
  });

  it("puts every marker at its MAP_HOME offset from the box's centre", async () => {
    const { container } = render0();
    await tick();
    for (const key of Object.keys(MAP_HOME) as (keyof typeof MAP_HOME)[]) {
      const layer = container.querySelector<HTMLElement>(`[data-map-home-frame="${key}"]`)!;
      const drawn = [...layer.querySelectorAll<HTMLElement>("[data-map-home-pin]")];
      const markers = homeMarkers(points, key).filter((m) => m.count === 1);
      expect(drawn).toHaveLength(markers.length);
      for (const [i, marker] of markers.entries()) {
        const el = drawn[i]!;
        expect(el.dataset.mapHomePin).toBe(marker.point!.id);
        // `left/top` at the centre and the offset in the transform is what
        // makes this renderable with no box: with the camera fixed, the box's
        // centre pixel is MAP_HOME's coordinate at every container size.
        expect(el.style.left).toBe("50%");
        expect(el.style.top).toBe("50%");
        expect(el.style.transform).toBe(
          `translate(${marker.dx}px,${marker.dy}px) translate(-50%,-100%)`,
        );
      }
    }
  });

  it("makes every single-listing marker a link to the same place its row is", async () => {
    // The trade this PR makes: the list goes visually hidden under the
    // picture, so the picture has to carry the pointer path. `tabindex="-1"`
    // + `aria-hidden` is the LIVE marker's contract, unchanged — the list is
    // still what the keyboard and the screen reader get.
    const { container } = render0();
    await tick();
    const layer = container.querySelector<HTMLElement>('[data-map-home-frame="full"]')!;
    const links = [...layer.querySelectorAll<HTMLAnchorElement>("[data-map-home-pin]")];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const point = points.find((p) => p.id === link.dataset.mapHomePin)!;
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe(point.mapsUrl);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("tabindex")).toBe("-1");
      expect(link.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("keeps the listings list, as the map's accessible equivalent", async () => {
    // #13's definition of done is still met and this says how: the list is in
    // the DOM, named, complete, and every row still links to Google Maps. What
    // changed is that it is `sr-only` from the server rather than from the
    // moment the canvas arrives.
    const { container, getByRole } = render0();
    await tick();
    const list = getByRole("list", { name: "Land listings" });
    expect(list.querySelectorAll("li")).toHaveLength(points.length);
    for (const a of container.querySelectorAll("[data-map-link]")) {
      expect(a.className).toContain("sr-only");
    }
  });

  it("leaves the list visible when there is no picture to replace it with", async () => {
    // The other side of the same rule, and the reason `homeFrames` is
    // all-or-nothing: a box that draws no placeholder must not have had its
    // list hidden.
    const { container } = render(PropertyMap, {
      props: { points: [points[1]!], label: "Out of San Antonio", engine: "off" },
    });
    await tick();
    expect(container.querySelector("[data-map-home-box]")).toBeNull();
    expect(container.querySelector("[data-map-link]")!.className).not.toContain("sr-only");
  });
});

describe("the hand-over from the picture to the canvas", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the picture until the canvas says its fade is over", async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    stubResizeTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    engine.created[0]!.handlers.load?.();
    await tick();
    // FULLY OPAQUE, not fading: the canvas travels and the picture does not.
    // Both at 50% would show the tone ground through them — a flash of exactly
    // the state the placeholder replaces.
    expect(view.container.querySelector("[data-map-home-box]")).not.toBeNull();

    // A CLOCK IS NOT THE EVIDENCE, and this case used to accept one: it
    // advanced MAP_HOME_FADE_MS and expected the picture gone. On a loaded
    // machine the transition had run half of its 300ms at that point
    // (measured: opacity 0.535164), so the version that passed here shipped a
    // visible dip to the tone ground. Time alone proves nothing.
    vi.advanceTimersByTime(MAP_HOME_FADE_MS * 3);
    await tick();
    expect(
      view.container.querySelector("[data-map-home-box]"),
      "a clock must not be able to retire the picture",
    ).not.toBeNull();

    // Nor does a transition of something ELSE on the same element.
    endTheFade(view.container, "transform");
    await tick();
    expect(view.container.querySelector("[data-map-home-box]")).not.toBeNull();

    endTheFade(view.container);
    await tick();
    expect(view.container.querySelector("[data-map-home-box]")).toBeNull();
  });

  it("ignores an opacity transition that ended on something INSIDE the canvas", async () => {
    // #134. `transitionend` BUBBLES, so a handler that checks only
    // `propertyName` retires the picture for any descendant that fades —
    // and maplibre-gl.css ships `.maplibregl-marker { transition: opacity
    // .2s }`, a hundred milliseconds SHORTER than the fade it would cut
    // short. Latent today (the pins are plain SVG), which is exactly why it
    // needs a case: nothing else in the system would notice it arriving.
    //
    // `endTheFade` cannot see this. It dispatches on `[data-map-canvas]`
    // itself, so the host IS the target and a missing target check looks
    // identical to a present one — the reason the defect survived #130's
    // thirteen mutations.
    vi.useFakeTimers();
    stubReducedMotion(false);
    stubResizeTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    engine.created[0]!.handlers.load?.();
    await tick();

    const host = view.container.querySelector("[data-map-canvas]")!;
    const child = document.createElement("div");
    child.className = "maplibregl-marker";
    host.appendChild(child);
    child.dispatchEvent(
      Object.assign(new Event("transitionend", { bubbles: true }), { propertyName: "opacity" }),
    );
    await tick();
    expect(
      view.container.querySelector("[data-map-home-box]"),
      "a child's fade must not retire the picture",
    ).not.toBeNull();

    // And the host's own still does, so the clause above denies rather than
    // disables.
    endTheFade(view.container);
    await tick();
    expect(view.container.querySelector("[data-map-home-box]")).toBeNull();
  });

  it("gives up on a fade that never ends, rather than stranding the picture", async () => {
    // The leak guard, at ten times the duration. It is not what ends the fade
    // — the case above proves the event is — but a `transitionend` that never
    // arrives would otherwise leave a full-size raster in the DOM under an
    // opaque canvas for the life of the page.
    vi.useFakeTimers();
    stubReducedMotion(false);
    stubResizeTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    engine.created[0]!.handlers.load?.();
    await tick();
    vi.advanceTimersByTime(MAP_HOME_FADE_MS * 10 + 1);
    await tick();
    expect(view.container.querySelector("[data-map-home-box]")).toBeNull();
  });

  it("cuts straight to the canvas under prefers-reduced-motion", async () => {
    // #122's rule, and it is BOTH halves in one preference: the canvas's
    // transition is `none` and the picture is removed on the same tick, so
    // there is no cross-fade rather than a fast one.
    vi.useFakeTimers();
    stubReducedMotion(true);
    stubResizeTo(397, 595);
    stubIntersecting({ mapHeight: 595, visible: 595 });
    const view = render(PropertyMap, { props: { points, label: "Land" } });
    await vi.waitFor(() => expect(engine.created).toHaveLength(1));
    engine.created[0]!.handlers.load?.();
    await tick();
    expect(view.container.querySelector("[data-map-home-box]")).toBeNull();
    // Nothing was scheduled, so nothing can fire late.
    expect(vi.getTimerCount()).toBe(0);
  });
});

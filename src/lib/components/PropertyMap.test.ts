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
    jumps: unknown[];
    eases: unknown[];
    removed: boolean;
  }[] = [];

  class FakeMap {
    handlers: Record<string, (e?: unknown) => void> = {};
    canvas = document.createElement("canvas");
    record: (typeof created)[number];
    constructor(options: Record<string, unknown>) {
      this.record = {
        options,
        handlers: this.handlers,
        controls: [],
        canvas: this.canvas,
        jumps: [],
        eases: [],
        removed: false,
      };
      created.push(this.record);
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

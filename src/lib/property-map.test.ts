import { describe, it, expect } from "vitest";

import { propertyFixture } from "$lib/property-fixture";
import {
  activeTarget,
  CAMERA_FLIGHT_MS,
  cameraMove,
  clusterDiameter,
  clusterPoints,
  clusterSignature,
  COMPACT_MAX_HEIGHT,
  DEFAULT_MAP_STYLE_URL,
  expansionZoom,
  fitCamera,
  frameFor,
  MAP_FRAMES,
  MAP_TILE_HOST,
  mapStyleUrl,
  PIN_ASPECT,
  PIN_HOLE,
  PIN_PATH,
  PIN_VIEWBOX,
  pixelDistance,
  projectX,
  projectY,
  sectionPoints,
  slidePoints,
  unprojectLat,
  unprojectLng,
  type Box,
  type MapPoint,
} from "$lib/property-map";

// THE REAL PORTFOLIO, read from roalson-interests' Content API on 2026-09-22.
// All 22 published listings, every one with a filled `location` GeoPoint, none
// sold. Transcribed here rather than fetched because these are the numbers the
// clustering and the camera were TUNED against, and a tuning measured against
// a network call is a tuning nobody can reproduce. If the portfolio changes,
// nothing below becomes wrong — it becomes a record of what was true when the
// numbers were chosen, which is the point.
const LAND: [string, number, number][] = [
  ["highway-77-at-general-cavazos-kingsville", 27.4900712, -97.8487066],
  ["ih-10-at-fm-725-seguin", 29.5585468, -98.0289331],
  ["ih-10-at-highway-87-comfort", 29.9813307, -98.9022732],
  ["ih-35-at-wonderworld-san-marcos", 29.8573194, -97.9566765],
  ["116-old-san-antonio-road", 29.767739, -98.713165],
  ["11714-perrin-beitel-road", 29.546801, -98.4102378],
  ["402-w-nueva-street", 29.4231304, -98.5008086],
  ["cascade-caverns-at-old-san-antonio-road", 29.7569264, -98.7052274],
  ["ih-10-at-highway-46", 29.7781603, -98.7385082],
  ["ih-10-at-menger-springs", 29.7732434, -98.7301826],
  ["ih-10-at-scenic-loop", 29.7553243, -98.7044549],
  ["ih-10-east-at-loop-1604", 29.4660314, -98.2935417],
  ["loop-1604-at-dove-canyon", 29.4170735, -98.7107392],
  ["loop-1604-at-highway-181", 29.2685057, -98.306694],
  ["menger-springs-road", 29.7705116, -98.7307834],
  ["st-marys-at-martin-river-walk", 29.4289662, -98.4917414],
  ["urban-loop-road", 29.4213922, -98.5011994],
];

const IMPROVED: [string, number, number][] = [
  ["101-w-commerce-street", 29.4253747, -98.4939913],
  ["13810-lookout-road", 29.5658789, -98.3668426],
  ["25331-ih-10-west", 29.6773878, -98.638346],
  ["5001-walzem-road", 29.510603, -98.39129],
  ["5930-bandera-road", 29.4832616, -98.6030709],
];

const point = ([id, lat, lng]: [string, number, number]): MapPoint => ({
  id,
  title: id,
  lat,
  lng,
  href: `/properties/${id}`,
  mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
  directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
});

const land = LAND.map(point);
const improved = IMPROVED.map(point);

/** The comp's four frames. */
const PANEL = { width: 397, height: 595 }; // Properties page, 1440
const BAND = { width: 512, height: 827 }; // Homepage band, 1440
const PHONE = { width: 350, height: 200 }; // Properties page, 390
const PHONE_BAND = { width: 390, height: 200 }; // Homepage band, 390

function minSeparation(markers: { lat: number; lng: number }[], zoom: number): number {
  let min = Infinity;
  for (let i = 0; i < markers.length; i += 1) {
    for (let j = i + 1; j < markers.length; j += 1) {
      min = Math.min(min, pixelDistance(markers[i]!, markers[j]!, zoom));
    }
  }
  return min;
}

describe("the tile provider", () => {
  it("defaults to OpenFreeMap and is one env var away from anything else", () => {
    expect(mapStyleUrl(undefined)).toBe(DEFAULT_MAP_STYLE_URL);
    expect(mapStyleUrl(null)).toBe(DEFAULT_MAP_STYLE_URL);
    expect(mapStyleUrl("https://example.test/style.json")).toBe("https://example.test/style.json");
  });

  // An env var set to nothing on a host's dashboard is the common way this
  // goes wrong, and it must not be the way the map goes blank.
  it("treats an empty or whitespace value as unset", () => {
    expect(mapStyleUrl("")).toBe(DEFAULT_MAP_STYLE_URL);
    expect(mapStyleUrl("   ")).toBe(DEFAULT_MAP_STYLE_URL);
  });

  // THIS USED TO ASSERT `DEFAULT_MAP_STYLE_URL.startsWith(MAP_TILE_HOST)`, and
  // that stopped being true the day the style became ours (see
  // scripts/map-style.mjs). The two halves it was conflating are now separate
  // claims, and both are load-bearing:
  //
  //   - the STYLE is same-origin, so `connect-src 'self'` covers it and no
  //     third party can repaint this map by deploying;
  //   - the TILES are still on MAP_TILE_HOST, which is why svelte.config.js
  //     still carries exactly that one external connect-src entry. The
  //     assertion that the committed style points NOWHERE else lives in
  //     scripts/map-style.test.ts, which can read the file.
  it("loads the style from our own origin, not from the tile provider", () => {
    expect(DEFAULT_MAP_STYLE_URL.startsWith("/")).toBe(true);
    expect(DEFAULT_MAP_STYLE_URL.startsWith("//")).toBe(false);
    expect(DEFAULT_MAP_STYLE_URL).not.toContain(MAP_TILE_HOST);
    // A relative URL has no host to allow, and `new URL` says so for us.
    expect(() => new URL(DEFAULT_MAP_STYLE_URL)).toThrow();
    expect(new URL(DEFAULT_MAP_STYLE_URL, "https://roalsoninterests.com").origin).toBe(
      "https://roalsoninterests.com",
    );
  });

  // The CSP entry is still spent, and still on the tiles. A bare origin with no
  // path, because it is a source expression in a header, not a URL to fetch.
  it("still names the tile host svelte.config.js has to allow", () => {
    expect(MAP_TILE_HOST).toBe("https://tiles.openfreemap.org");
    expect(new URL(MAP_TILE_HOST).pathname).toBe("/");
  });
});

describe("the pins a section carries", () => {
  it("skips a listing with an empty GeoPoint and keeps the rest", () => {
    const withPin = propertyFixture({ title: "With a pin" }, { id: "a", uid: "a" });
    const without = propertyFixture({ title: "No pin", location: {} }, { id: "b", uid: "b" });
    const points = sectionPoints([withPin, without]);
    expect(points.map((p) => p.title)).toEqual(["With a pin"]);
  });

  it("carries a search link, a directions link and the listing's own page", () => {
    const [p] = sectionPoints([
      propertyFixture({ title: "25331 IH 10 West" }, { id: "a", uid: "25331-ih-10-west" }),
    ]);
    expect(p!.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=29.6572,-98.6297");
    expect(p!.directionsUrl).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=29.6572,-98.6297",
    );
    expect(p!.href).toBe("/properties/25331-ih-10-west");
  });

  it("takes the homepage band's pins off the slides, not off documents", () => {
    const points = slidePoints([
      {
        id: "one",
        href: "/properties/one",
        title: "One",
        sizeLabel: "",
        image: {} as never,
        highlights: [],
        location: { latitude: 29.4253747, longitude: -98.4939913 },
      },
      // A slide whose listing has no pin: it keeps its photo and its place in
      // the carousel; the map simply has one fewer marker.
      {
        id: "two",
        href: null,
        title: "Two",
        sizeLabel: "",
        image: {} as never,
        highlights: [],
        location: null,
      },
    ]);
    expect(points.map((p) => p.id)).toEqual(["one"]);
    expect(points[0]!.directionsUrl).toContain("destination=29.4253747,-98.4939913");
  });
});

describe("Web Mercator, in MapLibre's 512px units", () => {
  it("round-trips a coordinate at every zoom the maps use", () => {
    for (const zoom of [3, 6.948, 9.606, 12, 16]) {
      for (const p of [...land, ...improved]) {
        expect(unprojectLng(projectX(p.lng, zoom), zoom)).toBeCloseTo(p.lng, 9);
        expect(unprojectLat(projectY(p.lat, zoom), zoom)).toBeCloseTo(p.lat, 9);
      }
    }
  });

  it("doubles every screen distance per zoom level", () => {
    const a = land[0]!;
    const b = land[1]!;
    expect(pixelDistance(a, b, 8)).toBeCloseTo(pixelDistance(a, b, 7) * 2, 6);
  });
});

describe("the camera each frame lands on", () => {
  // The measured fit zooms, and the only reason they are written down: they
  // are what the clustering below is tuned at, and the reason a maxZoom is
  // needed at all (no multi-pin section comes anywhere near it).
  it("fits the real sections at the zooms the numbers were chosen at", () => {
    const full = MAP_FRAMES.full;
    const compact = MAP_FRAMES.compact;
    expect(fitCamera(land, PANEL, full)!.zoom).toBeCloseTo(6.9481, 3);
    expect(fitCamera(improved, PANEL, full)!.zoom).toBeCloseTo(9.6443, 3);
    expect(fitCamera(land, BAND, full)!.zoom).toBeCloseTo(7.4989, 3);
    expect(fitCamera(improved, BAND, full)!.zoom).toBeCloseTo(10.1007, 3);
    expect(fitCamera(land, PHONE, compact)!.zoom).toBeCloseTo(5.0076, 3);
    expect(fitCamera(improved, PHONE, compact)!.zoom).toBeCloseTo(8.3016, 3);
    // The two 390 maps are different widths and the same fit: land's 277 km
    // north-south is what binds on a 200px box, not its 101.7 km east-west.
    expect(fitCamera(land, PHONE_BAND, compact)!.zoom).toBeCloseTo(
      fitCamera(land, PHONE, compact)!.zoom,
      9,
    );
    // …and every one of them is well under the cap, which is why the cap only
    // ever shows up on a one-listing section.
    for (const zoom of [6.9481, 9.6443, 7.4989, 10.1007, 5.0076, 8.3016]) {
      expect(zoom).toBeLessThan(full.maxZoom);
    }
  });

  // The assertion that the padding is real. A marker is anchored at its TIP
  // and the glyph reaches 0.801019S above it — 38.45px at S=48 — so a
  // northernmost pin fitted flush to the top edge would have its head cut off.
  it("keeps every point inside the box minus the padding, on every frame", () => {
    for (const [name, points, box, frame] of [
      ["land / panel", land, PANEL, MAP_FRAMES.full],
      ["improved / panel", improved, PANEL, MAP_FRAMES.full],
      ["land / band", land, BAND, MAP_FRAMES.full],
      ["land / phone", land, PHONE, MAP_FRAMES.compact],
      ["improved / phone", improved, PHONE, MAP_FRAMES.compact],
    ] as const) {
      const cam = fitCamera(points, box, frame)!;
      const cx = projectX(cam.lng, cam.zoom);
      const cy = projectY(cam.lat, cam.zoom);
      for (const p of points) {
        const x = projectX(p.lng, cam.zoom) - cx + box.width / 2;
        const y = projectY(p.lat, cam.zoom) - cy + box.height / 2;
        expect(x, `${name}: ${p.id} left`).toBeGreaterThanOrEqual(frame.padding.left - 0.001);
        expect(x, `${name}: ${p.id} right`).toBeLessThanOrEqual(
          box.width - frame.padding.right + 0.001,
        );
        expect(y, `${name}: ${p.id} top`).toBeGreaterThanOrEqual(frame.padding.top - 0.001);
        expect(y, `${name}: ${p.id} bottom`).toBeLessThanOrEqual(
          box.height - frame.padding.bottom + 0.001,
        );
      }
    }
  });

  // The whole job of maxZoom: a section with one listing has bounds of zero
  // size, and without a cap the fit is infinite — a doorstep, not a district.
  it("caps a one-listing section at the frame's maxZoom, centred on it", () => {
    const one = fitCamera([improved[0]!], PANEL, MAP_FRAMES.full)!;
    expect(one.zoom).toBe(MAP_FRAMES.full.maxZoom);
    // The centre is offset by half the padding difference, not by nothing:
    // the box's middle is not the fitted region's middle.
    expect(one.lat).toBeCloseTo(improved[0]!.lat, 2);
    expect(one.lng).toBeCloseTo(improved[0]!.lng, 3);
  });

  it("has nothing to show for an empty section", () => {
    expect(fitCamera([], PANEL, MAP_FRAMES.full)).toBeNull();
  });
});

describe("the camera the page drives", () => {
  // Every case below varies ONE input of `cameraMove` against this baseline,
  // which is a map that would move: ready, undriven, measured, no preference,
  // and an active listing it has a pin for.
  const baseline = {
    active: land[3]!.id,
    points: land,
    box: PANEL as Box,
    frame: MAP_FRAMES.full,
    ready: true,
    userMoved: false,
    reducedMotion: false,
  };

  it("flies to the active listing, at the frame's own maxZoom", () => {
    const move = cameraMove(baseline);
    expect(move.move).toBe("fly");
    // The zoom is NOT a number this function chose: a one-point bounds has no
    // span, so `fitCamera` clamps to the frame's cap and that is the answer.
    expect(move.move === "fly" && move.camera.zoom).toBe(MAP_FRAMES.full.maxZoom);
  });

  it("puts the listing's own coordinate at the centre, corrected for the pin's tip", () => {
    // The pin is anchored at its TIP, so `MAP_FRAMES.full.padding` is 52 top
    // against 44 bottom and the fitted centre sits (44 - 52) / 2 = -4px of it.
    // In degrees at z12 that is a shift NORTH, so the pin draws 4px BELOW the
    // box's middle — measured on a production build as `translate(196px,
    // 301.5px)` in a 392.2 x 595 box (196.1 and 297.5 + 4).
    const move = cameraMove(baseline);
    if (move.move !== "fly") throw new Error("expected a flight");
    const zoom = move.camera.zoom;
    const dx = projectX(move.camera.lng, zoom) - projectX(land[3]!.lng, zoom);
    const dy = projectY(move.camera.lat, zoom) - projectY(land[3]!.lat, zoom);
    expect(dx).toBeCloseTo(0, 6);
    expect(dy).toBeCloseTo(-4, 6);
  });

  it("jumps instead of flying under prefers-reduced-motion", () => {
    const move = cameraMove({ ...baseline, reducedMotion: true });
    expect(move.move).toBe("jump");
    // Same destination — the preference is about the travel, not the answer.
    const flying = cameraMove(baseline);
    expect(move.move === "jump" && flying.move === "fly" && move.camera).toEqual(
      flying.move === "fly" ? flying.camera : null,
    );
  });

  it("fits every pin, and jumps, when nothing is active", () => {
    const move = cameraMove({ ...baseline, active: null });
    expect(move.move).toBe("jump");
    expect(move.move === "jump" && move.camera).toEqual(fitCamera(land, PANEL, MAP_FRAMES.full));
  });

  // The four refusals. Each of these can only ever DENY a move — none of them
  // can grant one — and each is asserted by flipping exactly one input of a
  // baseline that does move.
  it("does not move before MapLibre has drawn a frame", () => {
    expect(cameraMove({ ...baseline, ready: false })).toEqual({
      move: "none",
      why: "not-ready",
    });
  });

  it("stops following once a visitor has driven the map", () => {
    expect(cameraMove({ ...baseline, userMoved: true })).toEqual({
      move: "none",
      why: "user-moved",
    });
  });

  it("will not fit a box nobody has measured", () => {
    expect(cameraMove({ ...baseline, box: { width: 0, height: 0 } })).toEqual({
      move: "none",
      why: "unmeasured",
    });
    expect(cameraMove({ ...baseline, box: { width: 397, height: 0 } })).toEqual({
      move: "none",
      why: "unmeasured",
    });
  });

  it("has nowhere to go with no pins", () => {
    expect(cameraMove({ ...baseline, points: [], active: null })).toEqual({
      move: "none",
      why: "no-points",
    });
  });

  // The one that is easy to get wrong in the OTHER direction: a listing with
  // an empty `location` keeps its card (see `sectionPoints`), so the page can
  // legitimately name an id this map has no pin for. Falling back to the fit
  // would pull the whole section into view and then push it out again on every
  // such card.
  it("holds the view for an active id it has no pin for", () => {
    expect(cameraMove({ ...baseline, active: "a-listing-with-no-geopoint" })).toEqual({
      move: "none",
      why: "unknown-active",
    });
  });

  it("refuses in that order: not-ready before user-moved before unmeasured", () => {
    expect(
      cameraMove({ ...baseline, ready: false, userMoved: true, box: { width: 0, height: 0 } }).move,
    ).toBe("none");
    expect(
      (
        cameraMove({
          ...baseline,
          ready: false,
          userMoved: true,
          box: { width: 0, height: 0 },
        }) as { why: string }
      ).why,
    ).toBe("not-ready");
    expect(
      (
        cameraMove({ ...baseline, userMoved: true, box: { width: 0, height: 0 } }) as {
          why: string;
        }
      ).why,
    ).toBe("user-moved");
  });

  // The refusal that only exists because `ready` re-asks the question: at the
  // instant MapLibre finishes loading, the answer is the camera the map was
  // BUILT with, and flying to where you already are is not nothing — it is a
  // 500ms animation and a movestart/moveend pair on a map nobody touched.
  it("does not move a map that is already at the answer", () => {
    const first = cameraMove(baseline);
    if (first.move !== "fly") throw new Error("expected a flight");
    expect(cameraMove({ ...baseline, commanded: first.camera })).toEqual({
      move: "none",
      why: "arrived",
    });
    // …and it is the CAMERA that is compared, not the active id. Growing the
    // box does NOT move a single-listing answer — the point is the point, and
    // only the padding correction depends on the frame — so the same map on a
    // taller panel is still "arrived":
    expect(cameraMove({ ...baseline, box: BAND, commanded: first.camera })).toEqual({
      move: "none",
      why: "arrived",
    });
    // …whereas changing the FRAME does move it: `compact` pads 26 top against
    // 44 bottom, so the correction is +9px where `full`'s is -4.
    expect(
      cameraMove({
        ...baseline,
        box: PHONE,
        frame: MAP_FRAMES.compact,
        commanded: first.camera,
      }).move,
    ).toBe("fly");
  });

  it("resolves an active id to the point, to null, or to nothing at all", () => {
    expect(activeTarget(null, land)).toBeNull();
    expect(activeTarget(land[2]!.id, land)).toBe(land[2]);
    expect(activeTarget("not-a-listing", land)).toBeUndefined();
  });

  it("flies for as long as the homepage band's own dissolve", () => {
    // Not a free number: FeaturedProperties' DISSOLVE is 500, and the photo
    // and the map are meant to arrive together.
    expect(CAMERA_FLIGHT_MS).toBe(500);
  });
});

describe("clustering, because land cannot be drawn honestly without it", () => {
  // The number that makes clustering non-optional. Cascade Caverns and IH-10
  // at Scenic Loop are 0.193 km apart on the ground.
  it("has real collisions at the panel's own fit zoom", () => {
    const zoom = fitCamera(land, PANEL, MAP_FRAMES.full)!.zoom;
    const closest = minSeparation(land, zoom);
    expect(closest).toBeLessThan(1);
    // …and separating them by one pin box needs a street-level zoom no
    // section overview will ever sit at.
    const a = land.find((p) => p.id === "cascade-caverns-at-old-san-antonio-road")!;
    const b = land.find((p) => p.id === "ih-10-at-scenic-loop")!;
    let needed = zoom;
    while (pixelDistance(a, b, needed) < MAP_FRAMES.full.pin) needed += 0.5;
    expect(needed).toBeGreaterThan(14);
  });

  // THE assertion in this file. A one-pass greedy clustering satisfies it for
  // the SEEDS and not for the markers, because a marker sits at its members'
  // centroid — measured at 13.23px between two 48px pins on the expanded
  // 350 x 520 frame before `clusterPoints` learned to repeat its pass. Every
  // frame the site draws is in the table, the expanded one included, because
  // that is the one the single-pass version was worst on.
  it("leaves no two markers overlapping on any real section and frame", () => {
    for (const [name, points, box, frame] of [
      ["land / panel 397x595", land, PANEL, MAP_FRAMES.full],
      ["improved / panel", improved, PANEL, MAP_FRAMES.full],
      ["land / band 512x827", land, BAND, MAP_FRAMES.full],
      ["improved / band", improved, BAND, MAP_FRAMES.full],
      ["land / phone 350x200", land, PHONE, MAP_FRAMES.compact],
      ["land / phone band 390x200", land, PHONE_BAND, MAP_FRAMES.compact],
      ["improved / phone", improved, PHONE, MAP_FRAMES.compact],
      ["land / expanded 350x520", land, { width: 350, height: 520 }, MAP_FRAMES.full],
    ] as const) {
      const zoom = fitCamera(points, box, frame)!.zoom;
      const markers = clusterPoints(points, zoom, frame.clusterRadius);
      // Non-vacuity: "no two of one marker overlap" is true and says nothing.
      expect(markers.length, `${name}: something to measure`).toBeGreaterThan(1);
      expect(minSeparation(markers, zoom), `${name}: closest two markers`).toBeGreaterThanOrEqual(
        frame.clusterRadius,
      );
    }
  });

  it("accounts for every listing exactly once, whatever the zoom", () => {
    for (const zoom of [3, 5, 6.948, 9, 12, 16]) {
      const markers = clusterPoints(land, zoom, MAP_FRAMES.full.clusterRadius);
      const ids = markers.flatMap((m) => m.points.map((p) => p.id));
      expect(new Set(ids).size, `zoom ${zoom}`).toBe(land.length);
      expect(ids.length, `zoom ${zoom}: no listing in two clusters`).toBe(land.length);
    }
  });

  // The groupings the site actually draws, written down so a change to the
  // radius, the padding or the frame has to be looked at rather than noticed.
  // The first of these is what the production build was measured showing on
  // 2026-09-22: five pins and two discs reading 6.
  it("draws the real sections the way the browser was measured drawing them", () => {
    const shape = (
      points: MapPoint[],
      box: Box,
      frame: (typeof MAP_FRAMES)[keyof typeof MAP_FRAMES],
    ) => {
      const zoom = fitCamera(points, box, frame)!.zoom;
      return clusterPoints(points, zoom, frame.clusterRadius)
        .map((m) => m.points.length)
        .sort((a, b) => b - a);
    };
    expect(shape(land, PANEL, MAP_FRAMES.full)).toEqual([6, 6, 1, 1, 1, 1, 1]);
    expect(shape(land, BAND, MAP_FRAMES.full)).toEqual([6, 5, 1, 1, 1, 1, 1, 1]);
    expect(shape(improved, PANEL, MAP_FRAMES.full)).toEqual([1, 1, 1, 1, 1]);
    // 200px of frame across 277 km: the whole metro is one disc, and the
    // Kingsville tract 250 km south is the other. That is the truth at that
    // zoom rather than a failure of it — and it is the case the expand
    // affordance exists for, which the next line measures.
    expect(shape(land, PHONE, MAP_FRAMES.compact)).toEqual([16, 1]);
    expect(shape(land, { width: 350, height: 520 }, MAP_FRAMES.full)).toEqual([7, 7, 1, 1, 1]);
  });

  it("stops clustering once the pins genuinely fit beside each other", () => {
    const markers = clusterPoints(land, 16, MAP_FRAMES.full.clusterRadius);
    expect(markers.length).toBe(land.length);
  });

  it("gives a cluster a stable id whichever order its members arrive in", () => {
    const zoom = 7;
    const a = clusterSignature(clusterPoints(land, zoom, 48));
    const b = clusterSignature(clusterPoints([...land].reverse(), zoom, 48));
    // Different seeds can group differently; the ID of a given grouping may
    // not depend on arrival order, which is what keyed markers rely on.
    for (const marker of clusterPoints(land, zoom, 48)) {
      expect(marker.id).toBe(
        marker.points
          .map((p) => p.id)
          .sort()
          .join("|"),
      );
    }
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });

  it("travels to a zoom that actually splits the cluster it was pressed on", () => {
    const zoom = fitCamera(land, PANEL, MAP_FRAMES.full)!.zoom;
    const radius = MAP_FRAMES.full.clusterRadius;
    for (const cluster of clusterPoints(land, zoom, radius)) {
      if (cluster.points.length < 2) continue;
      const next = expansionZoom(cluster, radius, 16);
      expect(next, `${cluster.id} must move the camera in`).toBeGreaterThan(zoom);
      expect(
        clusterPoints(cluster.points, next, radius).length,
        `${cluster.id} still one marker at zoom ${next}`,
      ).toBeGreaterThan(1);
    }
  });

  it("sends a single pin nowhere, and a coincident pair to maxZoom", () => {
    const single = { points: [land[0]!] };
    expect(expansionZoom(single, 48, 16)).toBe(16);
    const twins = { points: [land[0]!, { ...land[0]!, id: "twin" }] };
    expect(expansionZoom(twins, 48, 16)).toBe(16);
  });
});

describe("the frame a container is", () => {
  it("is compact for the comp's 200px maps and full for its 595 and 827", () => {
    expect(frameFor({ width: 350, height: 200 })).toBe("compact");
    expect(frameFor({ width: 390, height: 200 })).toBe("compact");
    expect(frameFor({ width: 397, height: 595 })).toBe("full");
    expect(frameFor({ width: 512, height: 827 })).toBe("full");
    // The expand affordance grows a phone map to 520, which is a FULL frame:
    // that is the whole point of expanding it.
    expect(frameFor({ width: 350, height: 520 })).toBe("full");
    expect(frameFor({ width: 350, height: COMPACT_MAX_HEIGHT })).toBe("full");
  });

  it("draws the comp's two pin sizes and nothing between them", () => {
    expect(MAP_FRAMES.full.pin).toBe(48);
    expect(MAP_FRAMES.compact.pin).toBe(22);
  });
});

describe("the pin, as the comp draws it", () => {
  // The five measured numbers are internally consistent, which is the check
  // that they came off one component: 0.10 (inset) + 0.801019 (glyph height)
  // is exactly 0.901019 (the tip).
  it("puts the tip where the glyph's inset and height say it is", () => {
    expect(0.1 + 0.801019).toBeCloseTo(PIN_ASPECT, 9);
    expect(PIN_VIEWBOX).toBe(`0 0 1 ${PIN_ASPECT}`);
  });

  it("draws a silhouette whose tangent points lie on the head circle", () => {
    // r = 0.620 / 2, centred 0.10 + r below the box top.
    const r = 0.31;
    const cy = 0.41;
    const match = PIN_PATH.match(/L([\d.]+) ([\d.]+)A([\d.]+) [\d.]+ 0 1 0 ([\d.]+) ([\d.]+)/);
    expect(match, "the path is a tip, a tangent, a major arc and a close").not.toBeNull();
    const [, x1, y1, pathR, x2, y2] = match!.map(Number) as unknown as number[];
    expect(pathR).toBeCloseTo(r, 6);
    expect(Math.hypot(x1! - 0.5, y1! - cy), "first tangent point on the circle").toBeCloseTo(r, 3);
    expect(Math.hypot(x2! - 0.5, y2! - cy), "second tangent point on the circle").toBeCloseTo(r, 3);
    // Mirrored about the pin's axis, and above the tip.
    expect(x1! + x2!).toBeCloseTo(1, 3);
    expect(y1!).toBeCloseTo(y2!, 6);
    expect(y1!).toBeLessThan(PIN_ASPECT);
  });

  it("punches the hole inside the head and nowhere near the tip", () => {
    expect(PIN_HOLE.r * 2).toBeCloseTo(0.33375, 6);
    expect(PIN_HOLE.cy).toBeCloseTo(0.405, 6);
    // Wholly inside the 0.310 head.
    expect(Math.hypot(PIN_HOLE.cx - 0.5, PIN_HOLE.cy - 0.41) + PIN_HOLE.r).toBeLessThan(0.31);
  });

  it("sizes a cluster disc to hold its count at both pin sizes", () => {
    // A 22px pin's head is 13.64 across — too small for two digits — so the
    // disc has a floor.
    expect(clusterDiameter(2, 22)).toBe(26);
    expect(clusterDiameter(9, 48)).toBeCloseTo(29.76, 2);
    expect(clusterDiameter(13, 48)).toBeCloseTo(29.76, 2);
    expect(clusterDiameter(100, 48)).toBeCloseTo(37.76, 2);
    for (const pin of [22, 48]) {
      expect(clusterDiameter(17, pin)).toBeGreaterThanOrEqual(26);
    }
  });
});

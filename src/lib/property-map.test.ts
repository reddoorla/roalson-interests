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
  homeCamera,
  homeFrames,
  homeMarkers,
  MAP_FRAMES,
  MAP_HOME,
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

describe("the style URL", () => {
  // THE TITLE USED TO SAY "defaults to OpenFreeMap and is one env var away from
  // anything else". It stopped being true on 2026-09-22 — the default is
  // `/map-style.json`, OUR file on OUR origin — and it was the exact belief the
  // rewritten case below exists to kill, left standing two cases above it.
  // (Review of #113.) The describe block was "the tile provider" for the same
  // reason: these three cases are about the STYLE, and the tile provider is a
  // separate claim with its own case at the bottom.
  //
  // What `mapStyleUrl` actually promises: a default, and an override. WHICH
  // default is the next case's business, not this one's.
  it("takes the default when unset, and any override when set", () => {
    expect(mapStyleUrl(undefined)).toBe(DEFAULT_MAP_STYLE_URL);
    expect(mapStyleUrl(null)).toBe(DEFAULT_MAP_STYLE_URL);
    expect(mapStyleUrl("https://example.test/style.json")).toBe("https://example.test/style.json");
    // An override really is honoured against a DIFFERENT host, so "one env var
    // away" is a measured claim rather than a remembered one.
    expect(mapStyleUrl(`${MAP_TILE_HOST}/styles/liberty`)).toBe(`${MAP_TILE_HOST}/styles/liberty`);
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

  // COALESCING, the rule that closes the flight-per-card class (#118 review,
  // MAJOR 3; re-based on the flight itself by #127/#128). The refusal is the
  // whole mechanism: the component re-asks when the flight it issued lands,
  // and the answer it gets then is a flight to wherever `active` has got to.
  //
  // WHAT THESE CASES CANNOT SEE, stated here because it is exactly what let
  // #127 ship. `flying` arrives as a PARAMETER, so nothing in this block can
  // tell a truthful source from a blind one: the field this replaces passed
  // every case below unchanged while being, in a browser, absent for any
  // scroll slower than its own 120ms debounce. The guard that watches the
  // SOURCE is in PropertyMap.test.ts ("the hold belongs to the flight, not to
  // the page"), where the component keeps the clock and a fake one drives it.
  describe("while a flight this map issued is still in the air", () => {
    it("refuses the flight — and names the reason, so nothing else can claim it", () => {
      expect(cameraMove({ ...baseline, flying: true })).toEqual({
        move: "none",
        why: "in-flight",
      });
      // The control, one input away: the same state with nothing in the air.
      expect(cameraMove({ ...baseline, flying: false }).move).toBe("fly");
      // …and an omitted field is a still camera, because every other caller of
      // this function (the unit tests above, a server render) has issued no
      // flight to be waiting on.
      expect(cameraMove(baseline).move).toBe("fly");
    });

    it("does not refuse a JUMP, because an instant move cannot smear", () => {
      // `active: null` is the fit-them-all answer, which is a jump; so is any
      // move at all under reduced motion. Neither is interruptible, and
      // holding them would leave a resize mid-scroll showing the wrong box.
      expect(cameraMove({ ...baseline, active: null, flying: true }).move).toBe("jump");
      expect(cameraMove({ ...baseline, reducedMotion: true, flying: true }).move).toBe("jump");
    });

    it("still answers `arrived` first, so a landing does not re-ask for nothing", () => {
      const first = cameraMove(baseline);
      if (first.move !== "fly") throw new Error("expected a flight");
      // Ordering, stated as a test because it is the one thing about this
      // refusal's PLACE that matters: were it above `arrived`, a map already
      // at its answer would report "in-flight" for the whole 500ms and then be
      // re-asked at the landing for a move that was never due.
      expect(cameraMove({ ...baseline, commanded: first.camera, flying: true })).toEqual({
        move: "none",
        why: "arrived",
      });
    });

    it("is still only a refusal — every earlier one outranks it", () => {
      for (const [state, why] of [
        [{ ready: false }, "not-ready"],
        [{ userMoved: true }, "user-moved"],
        [{ box: { width: 0, height: 0 } }, "unmeasured"],
        [{ active: "a-listing-with-no-geopoint" }, "unknown-active"],
      ] as const) {
        expect(cameraMove({ ...baseline, ...state, flying: true })).toEqual({
          move: "none",
          why,
        });
      }
    });
  });

  // THE HOLD, which is the other half of #122's claim and the whole of #132.
  // Opening at MAP_HOME is not "no pin jump" on its own: with a listing active
  // at boot — the homepage band's slide 0, or /properties above `lg` for
  // anyone who arrives already scrolled — the first frame after `load`
  // answered `fly`, and a 500ms flight inside a 300ms cross-fade shows the
  // picture and a different live map at once. Measured on a production build
  // as the largest picture-pin-to-live-pin distance over every frame of the
  // fade: 14618.92 px on /properties at 1440 scrolled to the centre line,
  // 1772.50 px on the band at 1440, 1800.65 px at 390.
  describe("while the picture of MAP_HOME is still on screen", () => {
    const home = MAP_HOME.full.camera;

    it("answers MAP_HOME rather than the active listing, and does not travel", () => {
      const under = cameraMove({ ...baseline, home, pictureUp: true });
      expect(under.move, "no flight under an opaque picture").toBe("jump");
      expect(under.move === "jump" && under.camera).toEqual(home);
      // The control, ONE input away: the same state with the picture gone is
      // the flight this map was always going to make.
      const after = cameraMove({ ...baseline, home, pictureUp: false });
      expect(after.move).toBe("fly");
      expect(after.move === "fly" && after.camera.zoom).toBe(MAP_FRAMES.full.maxZoom);
      // …and an omitted field is "no picture", because every map without a
      // placeholder — and every call in a test that is not about this — has
      // none to wait for.
      expect(cameraMove({ ...baseline, home }).move).toBe("fly");
    });

    it("says `arrived` for the map that booted there, which is every one of them", () => {
      // What the component really asks, at the instant `load` fires: `boot`
      // constructed the map at MAP_HOME and recorded it as `commanded`, so the
      // answer is that it is already where it belongs. This is the case that
      // used to answer `fly` and start a 500ms flight inside a 300ms fade.
      expect(cameraMove({ ...baseline, home, commanded: home, pictureUp: true })).toEqual({
        move: "none",
        why: "arrived",
      });
    });

    it("follows the picture across a frame change instead of freezing", () => {
      // THE DEFECT THE FIRST VERSION OF THIS FIX HAD. A blunt refusal — "no
      // move while the picture is up" — passes the case above and leaves the
      // camera at the compact frame while the container query has already
      // repainted the picture at the full one, which is the same two-cameras
      // defect one step along. The expand affordance below `lg` makes exactly
      // this box change, 200 -> min(70dvh, 520px).
      const expanded = cameraMove({
        ...baseline,
        box: PANEL as Box,
        frame: MAP_FRAMES.full,
        home: MAP_HOME.full.camera,
        commanded: MAP_HOME.compact.camera,
        pictureUp: true,
      });
      expect(expanded.move).toBe("jump");
      expect(expanded.move === "jump" && expanded.camera).toEqual(MAP_HOME.full.camera);
    });

    it("cannot grant a move that a refusal above it denies", () => {
      // It decides WHERE, never WHETHER, so every refusal still outranks it.
      for (const [state, why] of [
        [{ ready: false }, "not-ready"],
        [{ userMoved: true }, "user-moved"],
        [{ box: { width: 0, height: 0 } }, "unmeasured"],
        [{ active: "a-listing-with-no-geopoint" }, "unknown-active"],
      ] as const) {
        expect(cameraMove({ ...baseline, ...state, home, pictureUp: true })).toEqual({
          move: "none",
          why,
        });
      }
    });

    // THE ORDERING GUARD, and it is the only thing in this repo that can see
    // the #130/#137 merge go wrong. The two rules came from different PRs on
    // the same day and compose in exactly one order:
    //
    //   `underPicture` decides the move is a JUMP   (#130, the line above)
    //   `in-flight` refuses a FLIGHT and never a jump (#137, the line below)
    //
    // Reverse them and everything still compiles, every other case in this
    // file and in PropertyMap.test.ts still passes, and one move is silently
    // lost: the frame change the expand affordance makes while the picture is
    // up, if a flight happens to be in the air. The picture repaints at the
    // other frame immediately (its container query is on the box's height) and
    // the camera does not — which is #132, the 14618.92 px defect, coming back
    // through a door neither PR had a reason to look at.
    //
    // WHY IT IS A UNIT CASE AND NOT A BROWSER ONE, stated because the
    // temptation to go looking for it in Playwright is real and would be a
    // wasted day. In PropertyMap.svelte as wired today the two flags cannot
    // both be true: every move under the picture is a jump, a jump calls
    // `endFlight()`, and `handedOver` only ever goes false -> true, so no
    // flight can be in the air while a picture is still up. That invariant is
    // a CONSEQUENCE of the ordering below plus that wiring — it is not what
    // makes the ordering right, and it is not something a caller of this
    // exported function is obliged to maintain. `cameraMove` has to answer
    // correctly for the state it is handed.
    it("does not let a flight in the air refuse a jump the picture requires", () => {
      // The plain case: the picture is up, so the answer is MAP_HOME and it is
      // a jump — the flight in the air is about flights and has no opinion.
      expect(cameraMove({ ...baseline, home, pictureUp: true, flying: true })).toEqual({
        move: "jump",
        camera: home,
      });

      // The case that actually costs something, and the one the ordering is
      // for: the box has crossed COMPACT_MAX_HEIGHT while the picture is up,
      // so the picture is already showing the FULL frame and the camera is
      // still commanded to the compact one. That move is due, it is a jump,
      // and a flight in the air must not swallow it.
      const reframed = {
        ...baseline,
        box: PANEL as Box,
        frame: MAP_FRAMES.full,
        home: MAP_HOME.full.camera,
        commanded: MAP_HOME.compact.camera,
        pictureUp: true,
        flying: true,
      };
      expect(cameraMove(reframed)).toEqual({
        move: "jump",
        camera: MAP_HOME.full.camera,
      });
      // The control, one input away: with no picture over it that same state
      // is a flight, and THEN the hold applies.
      expect(cameraMove({ ...reframed, pictureUp: false })).toEqual({
        move: "none",
        why: "in-flight",
      });
    });

    it("means nothing for a section that has no picture to be under", () => {
      // `pictureUp` can only ever be true where `home` is non-null — the
      // component computes them from the same expression — and a section
      // outside MAP_HOME gets neither.
      expect(cameraMove({ ...baseline, home: null, pictureUp: true }).move).toBe("fly");
    });
  });

  // THE VISITOR'S ZOOM (`zoom`, 2026-09-23). The wheel zooms the in-page map
  // now, and a zoom that was thrown away at the next card crossing was not one
  // anyone could use; see `CameraState.zoom`. Each case varies the baseline by
  // that one input, as the rest of this block does.
  describe("once the visitor has chosen a zoom", () => {
    it("flies to the next listing at THAT zoom, still centred on it", () => {
      const move = cameraMove({ ...baseline, zoom: 13.25 });
      if (move.move !== "fly") throw new Error("expected a flight");
      expect(move.camera.zoom).toBe(13.25);
      // Same pin-tip correction as at the frame's zoom: -4px, measured in the
      // world units of the zoom it actually lands at.
      const dx = projectX(move.camera.lng, 13.25) - projectX(land[3]!.lng, 13.25);
      const dy = projectY(move.camera.lat, 13.25) - projectY(land[3]!.lat, 13.25);
      expect(dx).toBeCloseTo(0, 6);
      expect(dy).toBeCloseTo(-4, 6);
      // …and FURTHER OUT is as much the visitor's as closer in.
      const out = cameraMove({ ...baseline, zoom: 9.5 });
      expect(out.move === "fly" && out.camera.zoom).toBe(9.5);
    });

    it("means nothing without a chosen zoom — the frame's own maxZoom, as before", () => {
      for (const zoom of [undefined, null]) {
        const move = cameraMove({ ...baseline, zoom });
        expect(move.move === "fly" && move.camera.zoom).toBe(MAP_FRAMES.full.maxZoom);
      }
    });

    it("leaves a chosen FRAME alone: MAP_HOME, and the fit where there is no home", () => {
      const home = MAP_HOME.full.camera;
      expect(cameraMove({ ...baseline, active: null, home, zoom: 13.25 })).toEqual({
        move: "jump",
        camera: home,
      });
      const fit = cameraMove({ ...baseline, active: null, zoom: 13.25 });
      expect(fit.move === "jump" && fit.camera).toEqual(fitCamera(land, PANEL, MAP_FRAMES.full));
    });

    it("leaves the picture's camera alone while the picture is up (#132)", () => {
      const home = MAP_HOME.full.camera;
      expect(cameraMove({ ...baseline, home, pictureUp: true, zoom: 13.25 })).toEqual({
        move: "jump",
        camera: home,
      });
    });

    it("grants nothing — every refusal still outranks it", () => {
      for (const [state, why] of [
        [{ ready: false }, "not-ready"],
        [{ userMoved: true }, "user-moved"],
        [{ box: { width: 0, height: 0 } }, "unmeasured"],
        [{ active: "a-listing-with-no-geopoint" }, "unknown-active"],
        [{ flying: true }, "in-flight"],
      ] as const) {
        expect(cameraMove({ ...baseline, ...state, zoom: 13.25 })).toEqual({ move: "none", why });
      }
    });

    it("answers `arrived` for a map already at the listing at that zoom", () => {
      const first = cameraMove({ ...baseline, zoom: 13.25 });
      if (first.move !== "fly") throw new Error("expected a flight");
      expect(cameraMove({ ...baseline, zoom: 13.25, commanded: first.camera })).toEqual({
        move: "none",
        why: "arrived",
      });
    });
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

// ---------------------------------------------------------------------------
// MAP_HOME — the fixed opening frame, and the placeholder's geometry (#122)
// ---------------------------------------------------------------------------

/** Every published listing, which is what the frame was chosen against. */
const all = [...land, ...improved];

/** How many of `points` fall inside a frame's reference box at MAP_HOME —
 *  counted from the coordinates, NOT from `homeMarkers`, so this is a second
 *  path to the same number rather than a restatement of the first. */
function insideHome(points: MapPoint[], frame: keyof typeof MAP_HOME): number {
  const { camera, reference } = MAP_HOME[frame];
  const cx = projectX(camera.lng, camera.zoom);
  const cy = projectY(camera.lat, camera.zoom);
  return points.filter(
    (p) =>
      Math.abs(projectX(p.lng, camera.zoom) - cx) <= reference.width / 2 &&
      Math.abs(projectY(p.lat, camera.zoom) - cy) <= reference.height / 2,
  ).length;
}

describe("MAP_HOME, the frame the operator chose", () => {
  // Operator's call from three framed options, 2026-09-22: centre 29.62,
  // -98.52. The ZOOMS were derived here, and these cases are that derivation
  // re-run — not a transcription of it. If the portfolio moves they become a
  // record of what was true when the frame was chosen, which is the point.
  it("is frame A's centre at both zooms", () => {
    expect(MAP_HOME.full.camera).toEqual({ lng: -98.52, lat: 29.62, zoom: 8.6 });
    expect(MAP_HOME.compact.camera).toEqual({ lng: -98.52, lat: 29.62, zoom: 8.0 });
    // One centre, two zooms: the compact box is 200 tall and a frame fitted to
    // the same GEOGRAPHY in 200px would land at z6.59 — all of South Texas as
    // a postage stamp. The frames differ in how much they show, never where.
    expect(MAP_HOME.compact.camera.lng).toBe(MAP_HOME.full.camera.lng);
    expect(MAP_HOME.compact.camera.lat).toBe(MAP_HOME.full.camera.lat);
  });

  it("covers 18 of the 22 listings at 397 x 595 and 17 at 350 x 200", () => {
    expect(MAP_HOME.full.reference).toEqual(PANEL);
    expect(MAP_HOME.compact.reference).toEqual(PHONE);
    expect(all).toHaveLength(22);
    expect(insideHome(all, "full")).toBe(18);
    expect(insideHome(all, "compact")).toBe(17);
  });

  it("gives 9 listings a pin of their own, against 5 at today's auto-fit", () => {
    // #115 quantified. The four outside the frame are not lost — they keep
    // their card, their list row, and the camera flies to them when they
    // become active. What changes is how many of the ones ON the map are
    // distinguishable.
    for (const frame of ["full", "compact"] as const) {
      const markers = homeMarkers(all, frame);
      expect(markers.filter((m) => m.count === 1)).toHaveLength(9);
      expect(markers.filter((m) => m.count > 1).reduce((n, m) => n + m.count, 0)).toBe(13);
    }
    const today = fitCamera(all, PANEL, MAP_FRAMES.full)!;
    // 6.948088, dragged there by ONE listing 197 km south of the next-nearest
    // (Kingsville, 27.4901). #122's comment quotes 6.971 for this; measured
    // here against the same 22 coordinates it is 6.948088439550839, and the
    // `land` section alone gives the identical number because Kingsville and
    // Comfort — the two extremes — are both in it.
    expect(today.zoom).toBeCloseTo(6.948088, 6);
    expect(
      clusterPoints(all, today.zoom, MAP_FRAMES.full.clusterRadius).filter(
        (c) => c.points.length === 1,
      ),
    ).toHaveLength(5);
  });
});

describe("the placeholder's markers", () => {
  // The claim the whole cross-fade rests on: these are not a second opinion
  // about where the pins go, they are `clusterPoints` at MAP_HOME's zoom —
  // the same call the live map makes on its first frame.
  it("are clusterPoints at MAP_HOME's zoom, as centre-relative offsets", () => {
    for (const frame of ["full", "compact"] as const) {
      const { camera } = MAP_HOME[frame];
      const live = clusterPoints(all, camera.zoom, MAP_FRAMES[frame].clusterRadius);
      const drawn = homeMarkers(all, frame);
      expect(drawn.map((m) => m.id)).toEqual(live.map((c) => c.id));
      const cx = projectX(camera.lng, camera.zoom);
      const cy = projectY(camera.lat, camera.zoom);
      for (const [i, cluster] of live.entries()) {
        // What `map.project()` will return, minus the box's centre — which is
        // MAP_HOME's coordinate at EVERY container size, because the camera is
        // fixed. That is why the server can place these without a box.
        expect(drawn[i]!.dx).toBeCloseTo(projectX(cluster.lng, camera.zoom) - cx, 10);
        expect(drawn[i]!.dy).toBeCloseTo(projectY(cluster.lat, camera.zoom) - cy, 10);
      }
    }
  });

  it("carries the listing on a single pin and the count on a cluster", () => {
    for (const marker of homeMarkers(all, "full")) {
      if (marker.count === 1) expect(marker.point).not.toBeNull();
      else expect(marker.point).toBeNull();
    }
  });

  it("puts the centre listing within a pixel of the box's centre", () => {
    // A listing at MAP_HOME's exact coordinate must land at dx = dy = 0, which
    // is the one offset that can be checked without re-deriving Mercator.
    const centre = point(["centre", MAP_HOME.full.camera.lat, MAP_HOME.full.camera.lng]);
    const [marker] = homeMarkers([centre], "full");
    expect(marker!.dx).toBeCloseTo(0, 9);
    expect(marker!.dy).toBeCloseTo(0, 9);
  });
});

describe("whether a section opens on MAP_HOME", () => {
  it("does for both of the real sections, at both frames", () => {
    expect(homeFrames(land)).toEqual({
      full: MAP_HOME.full.camera,
      compact: MAP_HOME.compact.camera,
    });
    expect(homeFrames(improved)).toEqual({
      full: MAP_HOME.full.camera,
      compact: MAP_HOME.compact.camera,
    });
  });

  // THE EDGE #122 LEFT TO BE DECIDED. A section with nothing inside MAP_HOME
  // gets NO placeholder and boots on `fitCamera` exactly as it did before —
  // because the alternatives are a picture of San Antonio standing in for
  // listings that are not in San Antonio, or a raster derived from published
  // content, which is the dependence this whole design exists to remove.
  it("does not for a section whose listings are all outside it", () => {
    const kingsville = land.filter((p) => p.id.includes("kingsville"));
    expect(kingsville).toHaveLength(1);
    expect(homeCamera(kingsville, "full")).toBeNull();
    expect(homeCamera(kingsville, "compact")).toBeNull();
    expect(homeFrames(kingsville)).toBeNull();
    // Houston, 300 km east: nothing borderline about it.
    expect(homeFrames([point(["houston", 29.7604, -95.3698])])).toBeNull();
  });

  it("is all frames or none, so the list is never hidden over a blank box", () => {
    // The two frames really do disagree about a band of latitude, and this is
    // it. At 29.62 N the Mercator scale is 634.8 px/degree at z8.6 and
    // 418.8 px/degree at z8.0, so the 595-tall reference reaches 0.4686 deg
    // north (to 30.0886) and the 200-tall one 0.2388 deg (to 29.8588). A
    // listing at 30.00 is inside `full` and outside `compact` — and
    // `homeFrames` answers null rather than hiding the list on a phone that
    // would then draw nothing.
    const north = [point(["north", 30.0, MAP_HOME.full.camera.lng])];
    expect(homeCamera(north, "full")).not.toBeNull();
    expect(homeCamera(north, "compact")).toBeNull();
    expect(homeFrames(north)).toBeNull();
  });

  it("answers nothing for a section with no pins at all", () => {
    expect(homeFrames([])).toBeNull();
  });
});

describe("the committed raster's geometry", () => {
  it("is big enough for every box each frame is drawn in", () => {
    // `background-size` is the raster's own pixel size and the position is
    // `center`, so a container BIGGER than the raster shows ground at its
    // edges. These are the widest boxes each frame is ever drawn at, MEASURED
    // with scripting off rather than read off the comp — which is the mistake
    // that shipped once: the comp's band is 827 tall, the real one is 843.4 at
    // 1440, 983.6 at 1920 and 1170.5 at 2560, so a 896-tall raster left 43.8px
    // of bare ground above and below the map at 1920. The Properties panel is
    // a fixed 397 x 595 at every width (`max-w-[1440px]` caps it), and below
    // `lg` the compact box is a full-bleed 1023 x 200.
    expect(MAP_HOME.full.raster.width).toBeGreaterThanOrEqual(1073);
    expect(MAP_HOME.full.raster.height).toBeGreaterThanOrEqual(1171);
    expect(MAP_HOME.compact.raster.width).toBeGreaterThanOrEqual(1023);
    // The compact frame is chosen by `frameFor` at any height under 300.
    expect(MAP_HOME.compact.raster.height).toBeGreaterThanOrEqual(COMPACT_MAX_HEIGHT);
    for (const frame of ["full", "compact"] as const) {
      expect(MAP_HOME[frame].raster.width).toBeGreaterThanOrEqual(MAP_HOME[frame].reference.width);
      expect(MAP_HOME[frame].raster.height).toBeGreaterThanOrEqual(
        MAP_HOME[frame].reference.height,
      );
    }
  });

  it("has one raster per frame the component draws", () => {
    expect(Object.keys(MAP_HOME).sort()).toEqual(Object.keys(MAP_FRAMES).sort());
    expect(new Set(Object.values(MAP_HOME).map((f) => f.file)).size).toBe(
      Object.keys(MAP_HOME).length,
    );
  });
});

describe("where 'no listing is active' goes, once there is a chosen frame", () => {
  // THE DEFECT THIS BLOCK EXISTS FOR, found on a production build by
  // tests/interaction/map-home.spec.ts and by nothing in jsdom. The map is
  // CONSTRUCTED at MAP_HOME, and `cameraMove` answered `fitCamera(points)` for
  // a null `active` — so on every Properties-page map below `lg`, where
  // `centreWatch` is gated `minWidth: 1024` and `active` is null forever, the
  // camera jumped to the auto-fit on the first frame after `load`. Measured at
  // 390 x 844 on /properties: the committed picture drew 8 own pins with
  // clusters of 6 and 3; the live map one frame later drew 2 own pins and a
  // cluster of 15 — z6.948, not z8.0. The placeholder was a true picture of a
  // camera that lasted one frame.
  const resting = {
    active: null,
    points: land,
    box: PANEL as Box,
    frame: MAP_FRAMES.full,
    ready: true,
    userMoved: false,
    reducedMotion: false,
  };

  it("is MAP_HOME, not the auto-fit, when the section has one", () => {
    const move = cameraMove({ ...resting, home: MAP_HOME.full.camera });
    expect(move.move).toBe("jump");
    expect(move.move === "jump" && move.camera).toEqual(MAP_HOME.full.camera);
  });

  it("is still the auto-fit for a section that has none", () => {
    const move = cameraMove({ ...resting, home: null });
    expect(move.move).toBe("jump");
    expect(move.move === "jump" && move.camera).toEqual(fitCamera(land, PANEL, MAP_FRAMES.full));
  });

  it("does not touch where an ACTIVE listing goes", () => {
    // The chosen frame is where the map RESTS. A listing the page has asked
    // for is still `fitCamera` of that one point at the frame's maxZoom, home
    // or no home — otherwise the camera could never follow a card at all.
    const active = { ...resting, active: land[3]!.id };
    const withHome = cameraMove({ ...active, home: MAP_HOME.full.camera });
    const without = cameraMove({ ...active, home: null });
    expect(withHome).toEqual(without);
    expect(withHome.move).toBe("fly");
    expect(withHome.move === "fly" && withHome.camera.zoom).toBe(MAP_FRAMES.full.maxZoom);
  });

  it("refuses to move once the map is already home", () => {
    // `commanded` is what `boot` recorded, and boot builds the map AT
    // MAP_HOME — so the first run of the camera effect must answer "arrived",
    // not re-issue the camera the map already has.
    const move = cameraMove({
      ...resting,
      home: MAP_HOME.full.camera,
      commanded: MAP_HOME.full.camera,
    });
    expect(move).toEqual({ move: "none", why: "arrived" });
  });
});

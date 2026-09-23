<script lang="ts" module>
  /**
   * The comp's per-section property map (#13), with its ground tones EXPORTED
   * from this module script as `MAP_TONES`.
   *
   * (That first sentence is this file's whole row in docs/COMPONENTS.md:
   * scripts/capability-index.mjs keeps the FIRST sentence of the FIRST comment
   * and cannot see a `<script module>` export, so the name is in it or
   * nowhere — the same workaround BrandButton uses. The component's own
   * description is the comment on the instance script below.)
   *
   * THE BOX'S OWN GROUND, AND WHY IT IS A PROP.
   *
   * Before the tiles arrive — and forever, with scripting off — this component
   * is not a map. It is a list of links, and a list of links needs a ground it
   * is legible on. The first version hard-coded `bg-light text-primary`, which
   * is right on the Properties page (sand panel on an off-white page, 8.87:1)
   * and wrong on the homepage band, where it painted a full-bleed SAND
   * rectangle over the band's #3d0707 until MapLibre finished booting —
   * measured at 513 × 826.4 at 1455 × 900 and 375 × 200 at 390 × 844, i.e. the
   * whole reserved column. Three comments in that PR asserted the opposite
   * ("the band's #3d0707 is what shows through"), and the guard that claimed
   * to measure it read `[data-map-slot]`, which is transparent and is NOT the
   * element that paints. The child was.
   *
   * So the caller says which ground it is placing the map on, the way
   * CarouselArrows and CarouselProgress already do. Measured, both ways round:
   *
   *   garnet  sand ground, garnet text      8.87:1   — the Properties page
   *   cream   #3d0707 ground, off-white     14.85:1  — the homepage band
   *
   * `cream` paints the band's own colour rather than going transparent: it is
   * the same pixel either way, and an explicit ground is what src/focus-floor
   * .test.ts needs in order to give the list's focus ring a colour.
   */
  export const MAP_TONES = {
    garnet: "bg-light text-primary",
    cream: "bg-dark text-background",
  } as const;
</script>

<script lang="ts">
  // The comp's per-section property map (#13): 397 x 595 in the Properties
  // page's left column at 1440, 350 x 200 above the cards at 390, 512 x 827
  // full-bleed on the homepage band and 390 x 200 full-bleed on its phone
  // frame. Sold sections get none (the 1440 tree draws one and its wrapper is
  // `visible: false`).
  //
  // WHAT IS SERVER-RENDERED IS A LIST, NEVER A BOX. #13's definition of done
  // says the no-JS state must not be a blank box, and the honest reading of
  // that is that the FIRST state is the list: every listing's title as a link
  // to `mapsUrl()` — Google Maps centred on its pin, no key, no script, no CSP
  // host. MapLibre is 426 KB and arrives only once this container has
  // intersected the viewport, so on both pages that list is what a visitor
  // sees first even with scripting on, and it is all a crawler or a
  // scripting-off browser ever sees.
  //
  // IT STAYS AFTER THE MAP MOUNTS, and that is the accessibility decision in
  // this file. The pins are `aria-hidden` and `tabindex="-1"`: a marker is a
  // drawing of a list item, and putting both in the tab order would be two
  // stops per listing. Worse, a CLUSTERED listing has no marker of its own at
  // all, so markers-as-controls would put five Boerne tracts behind a zoom
  // gesture for a keyboard user. The list is therefore the map's accessible
  // equivalent for the whole life of the page — visually hidden once the map
  // is drawn, and each link comes back as a garnet chip on the map's own
  // top-left the moment it takes focus, so WCAG 2.4.7 has something to show.
  //
  // WHY THE PINS ARE PLAIN MARKUP AND NOT `maplibregl.Marker`. The operator's
  // call on this build was "more consistency and control over styling is
  // preferable to me". A `{#each}` of <button>s holding an inline SVG filled
  // with `var(--color-primary)` is the comp's pin in the theme's own tokens,
  // keyed by cluster id, with Svelte doing the diffing; MapLibre only supplies
  // `map.project()` and the per-frame loop below writes the transforms. That
  // also keeps `maplibre-gl.css`'s marker and popup skins out of the argument.
  //
  // THE ATTRIBUTION IS A DELIBERATE DEPARTURE FROM THE COMP. The comp has none
  // anywhere, and the Google capture it was drawn over has Google's own
  // cropped off. OpenStreetMap data is ODbL and attribution is a licence
  // condition, not a style choice, so MapLibre's AttributionControl stays —
  // moved to bottom-left, out of the expand affordance's corner, and toned to
  // the brand. tests/interaction/property-map.spec.ts asserts the string
  // "OpenStreetMap" is really on the page rather than that no error appeared.
  //
  // Deep imports, not `{ Expand, Shrink } from "@lucide/svelte"`. That barrel
  // re-exports every icon in the pack as its own .svelte file, and reaching it
  // makes Vitest transform all of them. Measured on this machine, a file that
  // imports this component and asserts nothing: 50.2s through the barrel,
  // 5.5s through these two paths — and PropertyMap.test.ts's fifteen cases now
  // run in 4.6s total. Nothing else changes: same components, same props.
  // Modal.svelte and Accordion.svelte still take the barrel and still pay for
  // it (Modal.test.ts: 37.5s for 18 assertions); that is issue #97, not this
  // file's to change.
  import Expand from "@lucide/svelte/icons/expand";
  import Shrink from "@lucide/svelte/icons/shrink";
  import { tick, untrack } from "svelte";

  import type { MapEngine } from "$lib/map-engine";
  import {
    activeTarget,
    CAMERA_FLIGHT_MS,
    cameraMove,
    clusterDiameter,
    clusterPoints,
    COMPACT_MAX_HEIGHT,
    expansionZoom,
    fitCamera,
    frameFor,
    homeFrames,
    homeMarkers,
    MAP_FRAMES,
    MAP_HOME,
    MAP_HOME_FADE_MS,
    MAP_HOME_GROUND,
    mapStyleUrl,
    PIN_ASPECT,
    PIN_HOLE,
    PIN_PATH,
    PIN_VIEWBOX,
    type Camera,
    type MapCluster,
    type MapFrame,
    type MapPoint,
  } from "$lib/property-map";
  import { pageScrolling, watchPageScroll } from "$lib/scroll-activity.svelte";
  import { reducedMotion } from "$lib/transitions";

  interface Props {
    /** The section's pins, in the editor's order — `listingOrder`, which is
     *  also the order the cards are in and the order clustering walks. */
    points: MapPoint[];
    /** Names the map and its list, e.g. "Land". Read as "Map of the Land
     *  listings" / "Land listings on the map". */
    label: string;
    /** "off" never loads MapLibre — the state /dev/a11y-fixtures audits, so
     *  the axe gate stays hermetic (no tile host on the critical path). */
    engine?: "auto" | "off";
    /** The ground this map is placed ON, because until the tiles arrive the box
     *  IS that ground plus a list of links. See MAP_TONES. */
    tone?: keyof typeof MAP_TONES;
    /** THE CAMERA THIS COMPONENT DOES NOT OWN. The id of the `points` entry
     *  the PAGE says is active, or null for "fit them all" — which is what an
     *  undriven map has always done. The rules are all in `cameraMove`; this
     *  file only reports `ready` and `userMoved` into them. It is also what
     *  ENDS a gesture's suspension of the camera — see `drivenAt` below.
     *
     *  There is exactly ONE source of truth for which listing is active, and
     *  it is whatever the caller puts here. Pressing a pin does not set it —
     *  see `onselect`. */
    active?: string | null;
    /**
     * WHO ASKED FOR THE CURRENT `active` — the only question this component
     * cannot answer for itself, and the reason it has to be a prop (#118
     * review, MAJOR 2).
     *
     * A gesture suspends the camera, and what ends the suspension is the
     * visitor asking to be somewhere else. `active` alone cannot tell that
     * apart from the PAGE moving on by itself: the homepage band advances
     * every 4000ms with nobody touching anything, so the shipped rule —
     * "`active` changed, therefore the visitor asked" — threw a visitor's own
     * zoom away with no user action at all. Measured on a production build of
     * `/` at 390x844 with motion allowed: expand the band's map, four wheel-up
     * ticks take it from z12 to z12.5387, and ~9s later, with no further
     * input, the camera has issued 2 `flyTo` back to z12.
     *
     * So the caller says. `"visitor"` is the default because on the Properties
     * page it is simply true — `active` there is the card the visitor scrolled
     * to the middle of their own screen, and a scroll is a visitor. The
     * homepage band passes `"auto"` for the turns its clock made and
     * `"visitor"` for the turns an arrow, a key or a swipe made.
     */
    activeBy?: "visitor" | "auto";
    /** Supplied: pressing a single-listing pin calls this with that listing's
     *  id INSTEAD of opening the details sheet. Absent: the sheet, exactly as
     *  before.
     *
     *  WHY THE SHEET IS OPTIONAL RATHER THAN GONE. On the Properties page the
     *  CARD is the detail — it carries the same title and the same two links,
     *  in the column the pin sits beside — so a sheet is a second, smaller
     *  copy of it drawn over the map, and worse, a second place a listing can
     *  be "open". There the pin's job is to point AT the card, so the caller
     *  passes `onselect` and scrolls it into view; the centre rule then makes
     *  it active, and the camera follows from that one mechanism rather than
     *  from a press. On the homepage band there is no card beside the map at
     *  all, so the sheet is the only detail there is and it stays. */
    onselect?: (id: string) => void;
    class?: string;
  }

  let {
    points,
    label,
    engine = "auto",
    tone = "garnet",
    active = null,
    activeBy = "visitor",
    onselect,
    class: passedClasses = "",
  }: Props = $props();

  type MapInstance = InstanceType<MapEngine["Map"]>;

  let boxEl: HTMLDivElement | undefined = $state();
  let canvasHost: HTMLDivElement | undefined = $state();
  let map: MapInstance | null = null;

  /** Only a rendered first frame sets this. Not "the import resolved", not
   *  "no error was thrown" — MapLibre's own `load`, which it fires when the
   *  style and the first tiles are in. The list is visible until then. */
  let ready = $state(false);
  let expanded = $state(false);
  let box = $state({ width: 0, height: 0 });
  let zoom = $state(0);
  let clusterEls = $state<Record<string, HTMLElement | undefined>>({});
  let selected: MapPoint | null = $state(null);
  /**
   * THE LISTING THAT WAS ACTIVE WHEN THE VISITOR LAST DROVE THE MAP, or
   * `undefined` if they never have. `null` is a real value here — it is what
   * `active` is when nothing is on the centre line — so "never" has to be a
   * third thing rather than a falsy one.
   *
   * This replaces a plain `userMoved` boolean, and the reason is measured
   * rather than stylistic. The boolean was set by a gesture and cleared by
   * NOTHING but `destroy()`: at 1440x900 on /dev/properties, one 40px drag
   * over the map left the camera dead for the rest of the page — 0 flights at
   * every later card crossing, and the pins at scrollY 500 and 760
   * byte-identical. One pan permanently switched off the feature this whole
   * component exists for.
   *
   * A gesture suspends the camera — until THE VISITOR asks for a different
   * listing.
   *
   * WHY THAT LINE AND NOT ANOTHER. The flag's job is to stop the map being
   * yanked out from under someone who is looking around it; it is not to end
   * the feature. So the question is what ends the looking, and the honest
   * answer is the visitor asking to be somewhere else. Until then they are
   * still reading the card they were reading when they grabbed the map, and
   * every re-fit — a resize, a re-render, a `ready` flip — must leave their
   * view alone.
   *
   * AND "THE VISITOR" IS THE HALF THAT WAS MISSING. This shipped as "until the
   * PAGE asks for a different listing", i.e. any change of `active` at all,
   * and the homepage band changes `active` on a 4000ms timer with nobody
   * touching anything — so on that band the suspension ended, every time,
   * with no user action. Measured on a production build of `/` at 390x844,
   * motion allowed: expand the band's map (the one state where scroll-zoom is
   * deliberately the visitor's), four wheel-up ticks to z12.5387, then no
   * further input — ~9s later the camera had issued 2 `flyTo` back to z12 and
   * the zoom was gone while the map was still expanded. Nobody could hold a
   * view on that map for longer than one dwell. `activeBy` is how the caller
   * says which kind of change this was; see the prop.
   *
   * Two rules were considered and rejected, recorded so they are not re-tried:
   *
   *  - CLEAR ON THE NEXT DOCUMENT SCROLL ("scrolling the list means I am
   *    reading the list again"). It reads well and measures badly: on
   *    /properties the scroll IS how cards are crossed, so a 1px scroll ends
   *    the suspension and the very next crossing yanks the view — which is
   *    the same complaint, one step along, that the wheel half of this defect
   *    was. It also ends a pan on the homepage band the instant the visitor
   *    scrolls past the band at all. (That objection still stands, and it is
   *    worth saying plainly that the rule which shipped INSTEAD of it was the
   *    worse one: this one at least needs the visitor to do something.)
   *  - A TIMEOUT. A number nobody can justify, and it fires while the visitor
   *    is still looking.
   *
   * What this costs, said plainly: a pan is not carried from one listing to
   * the next. That is deliberate — the next listing is tens of kilometres
   * away (70 km for the two the tests drive with) and a preserved offset
   * would put it off the box.
   */
  let drivenAt = $state<string | null | undefined>(undefined);

  /** A suspension is outstanding. WHEN it ends is the effect below; this is
   *  only "is there one", which is all `cameraMove` needs to be told. */
  const userMoved = $derived(drivenAt !== undefined);

  /**
   * AND HERE IS WHERE IT ENDS: the VISITOR asked for a different listing.
   *
   * ONE mechanism, and that is a correction. This was written as two — the
   * line above also read `&& drivenAt === active`, so the suspension would
   * evaporate the moment `active` moved on even if this effect had not run
   * yet — and the second was justified in a comment as protecting against
   * effect ordering. Both halves were then mutated on purpose to find out
   * which was load-bearing:
   *
   *   - plain `drivenAt !== undefined`, this effect intact  → still green
   *   - plain derived AND this effect moved BELOW the camera effect → still
   *     green, which is the case the ordering argument predicted would fail
   *   - this effect's body removed, compound derived intact → RED (the camera
   *     never moves again once the visitor returns to the listing they
   *     dragged on)
   *
   * So the clause was redundant and the rationale written for it was simply
   * wrong: Svelte re-runs the camera effect when this one writes `drivenAt`,
   * whichever order they are declared in. It is gone rather than kept "just
   * in case", because a guard nothing can be shown to need is a guard the
   * next reader has to re-derive.
   *
   * `untrack` so this effect is driven by its inputs and not by its own write.
   *
   * `activeBy` is read here rather than in `cameraMove` because it is about
   * this TRANSITION of `active`, not about where the camera belongs: by the
   * time the band's clock has moved on twice, nothing in the state says which
   * of those moves the visitor made. Both props are written in the same
   * reactive flush by the caller, so the value read here is the one that
   * describes the change that woke this effect.
   */
  $effect(() => {
    const a = active;
    const by = activeBy;
    untrack(() => {
      if (by !== "visitor") return;
      if (drivenAt !== undefined && drivenAt !== a) drivenAt = undefined;
    });
  });
  /** The box MapLibre was last told about. See the camera effect. */
  let sized = { width: 0, height: 0 };
  /** The camera this map was last TOLD to be at — set by `boot` and by every
   *  move. Deliberately NOT `$state`: it is a record of what was done, and an
   *  effect that re-ran on its own write would be a loop. */
  let commanded: Camera | null = null;

  const measured = $derived(box.height > 0);
  const compact = $derived(box.height < COMPACT_MAX_HEIGHT);
  const frame = $derived(MAP_FRAMES[frameFor(box)]);

  /**
   * THE FIXED OPENING FRAME (#122), and the single answer both halves read.
   *
   * Non-null means two things at once and they must never be decided apart:
   * the server draws the committed raster at MAP_HOME with the section's real
   * pins over it, AND `boot` constructs MapLibre at exactly that camera, so
   * the tiles land pixel-aligned under the picture and nothing jumps at the
   * swap. Null — a section with no marker inside MAP_HOME — means neither: no
   * picture, and the camera opens on `fitCamera` exactly as it did before.
   * See `homeFrames` for why that is the answer and what it costs.
   *
   * It is computed from `points` alone, never from `box`, which is what lets
   * the SERVER draw it: the marker offsets are relative to the box's centre,
   * and with the camera fixed that centre is MAP_HOME's coordinate at every
   * container size. See `homeMarkers`.
   */
  const home = $derived(homeFrames(points));
  /** There is a map in the box — the canvas, or the picture of one. What the
   *  list's visual state has always keyed off, widened by exactly the case
   *  #122 adds. */
  const drawn = $derived(ready || home !== null);
  /**
   * The canvas has finished coming up, so the picture underneath it can go.
   *
   * THE CROSS-FADE IS ONE-SIDED ON PURPOSE. Fading the placeholder OUT while
   * the canvas fades IN puts both at 50% halfway through, and 50% over 50%
   * over the tone ground is a visible dip to the sand — a flash of the thing
   * the placeholder exists to replace. So the picture stays fully opaque and
   * only the canvas travels; when the canvas is opaque the picture is
   * invisible anyway and is simply removed. The removal is the only reason
   * this flag exists.
   *
   * THE BROWSER SAYS WHEN, NOT A TIMER, and that is a correction this file
   * paid for. It was first written as `setTimeout(MAP_HOME_FADE_MS)` started
   * when `ready` flipped, on the reasoning that the CSS transition starts in
   * the same flush and therefore ends at the same moment. Measured on
   * /dev/home at 1455x900 with motion allowed, at the instant the picture was
   * removed: the canvas host's computed opacity was **0.535164**. The
   * transition had run barely half of its 300ms — a style recalculation under
   * load does not begin when a `setTimeout` does — so the picture went while
   * the canvas was still half transparent, and for those frames the band's
   * #3d0707 showed through the map. axe found it before a human did: with the
   * whole canvas subtree under an ancestor at partial opacity it answered
   * `color-contrast` with three `imgNode` INCOMPLETES for the OpenStreetMap
   * credit rather than a ratio, and featured-properties.spec.ts's audit went
   * red naming the credit it could no longer measure.
   *
   * `transitionend` is the artifact a finished fade produces, so it is what
   * ends the hand-over. The timer survives only as a leak guard at ten times
   * the duration: a transition that never fires its event would otherwise
   * strand the picture under an opaque canvas forever. It is never what ends
   * this in practice, and if it ever is, something is already wrong.
   *
   * NOT `out:fade`, which is what the FIRST version used. A Svelte transition
   * drives `element.animate`, which jsdom does not implement: the component
   * threw `element.animate is not a function` the instant `ready` flipped, and
   * four unrelated cases in PropertyMap.test.ts went red — the pins, the sheet
   * and the scroll-zoom hand-over — because everything after the boot was
   * running against a crashed component. The test that caught it was not
   * testing the fade at all.
   */
  let handedOver = $state(false);
  $effect(() => {
    if (!ready) return;
    // No transition to wait for: `motion-reduce:transition-none` on the canvas
    // host means `transitionend` will never fire, so the hand-over is the same
    // tick. #122's "no cross-fade under prefers-reduced-motion", both halves.
    if ($reducedMotion) {
      handedOver = true;
      return;
    }
    const guard = setTimeout(() => (handedOver = true), MAP_HOME_FADE_MS * 10);
    return () => clearTimeout(guard);
  });
  const homeLayers = $derived(
    home === null
      ? []
      : (Object.keys(MAP_HOME) as MapFrame[]).map((key) => ({
          key,
          spec: MAP_HOME[key],
          pin: MAP_FRAMES[key].pin,
          markers: homeMarkers(points, key),
        })),
  );
  const clusters = $derived(
    ready ? clusterPoints(points, zoom, frame.clusterRadius) : ([] as MapCluster[]),
  );

  /**
   * The centre and zoom the map is CONSTRUCTED with.
   *
   * MAP_HOME FIRST, AND THAT IS THE #122 DECISION THIS FILE CARRIES. When a
   * placeholder is drawn the map MUST open at exactly the camera the picture
   * was rendered at, or the tiles arrive somewhere else and the swap is the
   * jump the whole design exists to remove. There is no second opinion to
   * drift from: `home` is the same value the markup reads.
   *
   * WHAT IT COSTS, AND IT IS A REAL COST. The line this replaces resolved
   * `active` through `activeTarget`, so a map opened already framed on the
   * active listing and "nothing moves at load" was literally true — the
   * homepage band's own comment says so, and #112 meant it. It is no longer
   * true there: the band opens on MAP_HOME and FLIES to slide 0 once MapLibre
   * has drawn its first frame. That is the operator's own ask read plainly —
   * "a specific frame to always show as the default start … and then load the
   * tile so that we have movement when necessary" — and the alternative was to
   * give the band no placeholder at all, which is where the wait is worst. It
   * is 500ms and WCAG 2.2.2 governs motion over five seconds, so no criterion
   * changes; under `prefers-reduced-motion` `cameraMove` answers `jump` and
   * there is no travel at all. Recorded because it was deliberate, not because
   * it is free.
   *
   * WITHOUT a placeholder this is exactly what it always was: `active` through
   * the same `activeTarget` as `cameraMove` so a map never boots somewhere it
   * would immediately fly away from, and an id with no pin falls back to the
   * fit HERE and only here — a boot has no previous view to hold.
   */
  function camera() {
    const opening = home?.[frameFor(box)];
    if (opening) return opening;
    const target = activeTarget(active, points) ?? null;
    return fitCamera(target ? [target] : points, box, {
      padding: frame.padding,
      maxZoom: frame.maxZoom,
    });
  }

  async function boot(host: HTMLDivElement) {
    let maplibre: MapEngine;
    let styleUrl: string;
    try {
      // `$env/dynamic/public` is imported HERE and not at module scope, and
      // that is not tidiness. Its virtual module reads a global SvelteKit only
      // sets during hydration, so evaluating it under jsdom throws "Cannot read
      // properties of undefined (reading 'env')" — which took down every unit
      // test that merely RENDERS a page holding a map (PropertyListing's and
      // the featured slice's, neither of which has any business knowing this
      // component uses an env var). Deferred to the one path that needs it, it
      // is evaluated exactly where the engine is: in a browser, on demand.
      const [engineModule, publicEnv] = await Promise.all([
        import("$lib/map-engine"),
        import("$env/dynamic/public"),
      ]);
      maplibre = engineModule.default;
      styleUrl = mapStyleUrl(publicEnv.env.PUBLIC_MAP_STYLE_URL);
    } catch (err) {
      // Offline, a blocked chunk, a browser with no WebGL2 — the list below is
      // already the whole content, so there is nothing to fall back TO. Warn
      // so "the map isn't showing" can be triaged instead of guessed at.
      console.warn("[property-map] engine did not load:", err);
      return;
    }
    if (!host.isConnected) return;

    const start = camera();
    commanded = start;
    const instance = new maplibre.Map({
      container: host,
      style: styleUrl,
      center: start ? [start.lng, start.lat] : [0, 0],
      zoom: start ? start.zoom : 1,
      minZoom: 3,
      maxZoom: 16,
      // The comp's map is flat and north-up; nothing on this site reads a
      // bearing, and a rotated map is a way to get lost on a 200px box.
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // THE PINNED BOX MAY NOT EAT THE PAGE'S SCROLL. maplibre-gl 6.10.0's
      // `ScrollZoomHandler.wheel` ends in an unconditional `preventDefault()`,
      // so every wheel event that lands on the canvas is taken from the
      // document. Measured at 1440x900 on /dev/properties at scrollY 500, with
      // the map pinned across x 80..472 (27.2% of the viewport's width) and
      // y 100..695: ONE 120px wheel tick over the map moved the page 0px, and
      // five ticks moved 120px against 600px for the same five ticks over the
      // cards column. Before this PR that cost 595px of page once; now the box
      // is PINNED, so the obstacle follows the visitor for the whole section.
      //
      // `cooperativeGestures` was the alternative and is worse here: it draws a
      // "use ctrl + scroll to zoom" overlay over a 392px panel, and it still
      // takes a trackpad pinch (which arrives as a ctrl-wheel and is exactly
      // the gesture it tells you to make). Off is the honest setting for a box
      // whose job is to be read past.
      //
      // Scroll-zoom is not gone, it MOVED: `expanded` turns it back on (see
      // the effect below), which is the state a visitor opens on purpose and
      // closes again.
      //
      // This option is the map's STARTING state only; the effect is what holds
      // it from then on. Measured, by mutating this line to `true` on its own:
      // the browser test stayed green, because the effect disables it again on
      // its first run. It is kept because it closes the window between the
      // constructor and that first run, not because it is the guard.
      scrollZoom: false,
      attributionControl: false,
      // Belt to `$lib/transitions`' braces below: told the preference, MapLibre
      // collapses every easeTo/flyTo of its own to a jumpTo.
      reduceMotion: $reducedMotion,
    });
    map = instance;

    instance.addControl(
      new maplibre.AttributionControl({ compact: false }),
      // Bottom-LEFT: the expand affordance owns bottom-right at 390, and a
      // licence notice may not be the thing a finger covers.
      "bottom-left",
    );

    // MapLibre names the canvas "Map" and gives it role="region", so two maps
    // on the Properties page would be two identically named landmarks.
    instance.getCanvas().setAttribute("aria-label", `${label} listings, interactive map`);

    // WHICH GESTURES COUNT AS "THE VISITOR DROVE THIS MAP", measured against
    // maplibre-gl 6.10.0 in Chromium rather than assumed — the old version of
    // this listener was the only thing that decided it, and the only test on it
    // hand-built a `movestart` against a stub Map, which cannot observe what
    // real gestures carry. Measured, on /dev/properties:
    //
    //   drag pan          movestart.originalEvent = mousemove   tagged
    //   double-click zoom movestart.originalEvent = dblclick    tagged
    //   keyboard (+, →)   movestart.originalEvent = keydown     tagged
    //   WHEEL ZOOM        movestart.originalEvent = undefined   NOT TAGGED
    //
    // The wheel is the one real gesture MapLibre leaves untagged: its
    // ScrollZoomHandler drives the zoom from the render loop, so the move it
    // starts looks programmatic. That is why a visitor's own zoom used to be
    // thrown away at the very next card crossing — the exact thing the flag
    // exists to prevent.
    //
    // So the predicate is in two halves, one for each of those rows.
    instance.on("movestart", (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) drivenAt = active;
    });
    // The untagged half. Only while scroll-zoom is ENABLED — which is only when
    // the map is expanded — because with it disabled the wheel is scrolling the
    // document past the map, not driving the map, and counting that as a
    // gesture would suspend the camera on every scroll down the page.
    instance.getCanvasContainer().addEventListener(
      "wheel",
      () => {
        if (instance.scrollZoom.isEnabled()) drivenAt = active;
      },
      { passive: true },
    );
    instance.on("move", reposition);
    instance.on("zoom", () => {
      zoom = instance.getZoom();
      reposition();
    });
    instance.on("load", () => {
      zoom = instance.getZoom();
      ready = true;
      void tick().then(reposition);
    });
  }

  function destroy() {
    map?.remove();
    map = null;
    ready = false;
    // A re-boot gets a map that has been told nothing yet, and one nobody has
    // driven — both of these describe the instance, not the visitor.
    sized = { width: 0, height: 0 };
    commanded = null;
    drivenAt = undefined;
  }

  /** The per-frame loop. Svelte owns the markers' MARKUP; this owns where they
   *  are, because re-running the keyed `{#each}` sixty times a second to move
   *  seventeen boxes would be the wrong tool. */
  function reposition() {
    const instance = map;
    if (!instance) return;
    for (const cluster of clusters) {
      const el = clusterEls[cluster.id];
      if (!el) continue;
      const p = instance.project([cluster.lng, cluster.lat]);
      // A single listing is a PIN, anchored at its tip (the viewBox stops
      // there); a group is a DISC, centred on the place it stands for.
      const anchor = cluster.points.length === 1 ? "-50%, -100%" : "-50%, -50%";
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(${anchor})`;
    }
  }

  function press(cluster: MapCluster) {
    const instance = map;
    if (!instance) return;
    if (cluster.points.length === 1) {
      const point = cluster.points[0]!;
      // The caller that draws its own detail takes the press instead. It must
      // NOT also set `active` from here: the one rule that decides which
      // listing is active is the caller's, and a press that wrote it directly
      // would be a second mechanism racing the first. So this only reports the
      // press; on /properties the caller scrolls that card to the centre and
      // the centre rule does the rest.
      if (onselect) {
        selected = null;
        onselect(point.id);
        return;
      }
      selected = point;
      return;
    }
    selected = null;
    instance.easeTo({
      center: [cluster.lng, cluster.lat],
      zoom: expansionZoom(cluster, frame.clusterRadius, instance.getMaxZoom()),
      duration: $reducedMotion ? 0 : 400,
    });
  }

  // The container's box, which is the only thing that decides the frame: a
  // 200px-tall map takes the comp's 22px pin and the expand affordance, a
  // 595px one takes its 48px pin and neither. No viewport media query is
  // consulted anywhere in this file, so the SAME rule covers the expanded
  // state — expanding a phone map to 520px makes it a full frame, which is
  // exactly what expanding it is for.
  $effect(() => {
    const el = boxEl;
    // Guarded the way Footer.svelte guards its own: jsdom ships no
    // ResizeObserver, and a component that throws at mount takes every test
    // that merely renders the page down with it. With none, the box is never
    // measured, `measured` stays false, and what is left is the server's list.
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      box = { width: rect.width, height: rect.height };
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // The page's scroll listener, for as long as this map is on the page. One
  // listener is shared by every map (see $lib/scroll-activity); this is only
  // this component's claim on it.
  $effect(() => watchPageScroll());

  // THE ONE PLACE THE CAMERA MOVES after boot — a box change, an `active`
  // change and the page falling still all come through the same door, because
  // two effects each holding a camera opinion is two cameras. (It used to be a
  // re-fit on a box change alone; adding a second effect for `active` would
  // have had the fit and the flight overwrite each other on every resize, in
  // an order decided by declaration.)
  //
  // `resize()` runs before the decision and outside it: telling MapLibre its
  // canvas changed size is not a camera move, and it is owed even when every
  // rule below declines one.
  $effect(() => {
    // EVERY REACTIVE INPUT IS READ BEFORE THE FIRST `return`, and that is not
    // style. Svelte re-tracks an effect's dependencies on each run, so a
    // signal read *after* a bail is not a dependency of the run that bailed —
    // and this effect's first run is at mount, before the engine exists, when
    // the bail was the second line. The only thing it had read by then was
    // `box`, so `active` never woke it: the camera was measured, on a real
    // scroll down /dev/properties, not moving ONCE. Pin transforms identical
    // at scrollY 450, 800 and 1050 while the centre rule was correctly
    // reporting potranco-road, hwy-90-castroville, ih-35-new-braunfels.
    const size = box;
    const state = {
      active,
      points,
      box: size,
      frame,
      ready,
      userMoved,
      reducedMotion: $reducedMotion,
      // The same value `camera()` boots with and the markup draws — so "no
      // listing is active" resolves to the frame the picture is OF, for the
      // whole life of the map and not just its first frame (#122).
      home: home?.[frameFor(size)] ?? null,
      commanded,
      // READ FOR ITS DEPENDENCY AS MUCH AS FOR ITS VALUE. `cameraMove` answers
      // `page-scrolling` while this is true and the move would have been a
      // flight; this effect is then re-run by the same signal going false at
      // the settle, and the flight it issues is to wherever `active` ended up.
      // That is the whole coalescing mechanism: no queue, no timer of its own,
      // and no second place holding a camera opinion.
      pageScrolling: pageScrolling(),
    };
    const instance = map;
    if (!instance || size.width === 0) return;
    // Only when the box really changed. `active` now shares this effect, and
    // on the Properties page it changes on every card the scroll crosses — a
    // `resize()` per card would re-read the canvas's layout for a canvas that
    // has not moved. Deliberately NOT `$state`: this is a record of what was
    // last done, not an input to anything.
    if (size.width !== sized.width || size.height !== sized.height) {
      sized = size;
      instance.resize();
    }

    const move = cameraMove(state);
    if (move.move === "none") return;
    commanded = move.camera;
    const center: [number, number] = [move.camera.lng, move.camera.lat];
    if (move.move === "jump") {
      instance.jumpTo({ center, zoom: move.camera.zoom });
      return;
    }
    // No `essential: true`. That flag exists to override the browser's
    // reduced-motion preference, and this animation is decoration on a scroll
    // the visitor is already driving — exactly the kind that must obey it.
    // `cameraMove` has already answered `jump` in that case; not passing
    // `essential` is the second brace, since the map is constructed with
    // MapLibre's own `reduceMotion`.
    instance.flyTo({ center, zoom: move.camera.zoom, duration: CAMERA_FLIGHT_MS });
  });

  $effect(() => {
    void clusters;
    void tick().then(reposition);
  });

  $effect(() => {
    void expanded;
    void tick().then(() => map?.resize());
  });

  // SCROLL-ZOOM BELONGS TO THE EXPANDED MAP AND NOWHERE ELSE. The in-page box
  // is constructed with it off (see `boot`); opening the expand affordance —
  // which exists only below `lg`, where the panel grows to `min(70dvh, 520px)`
  // — is a deliberate "I want to work this map now", and it is the one state
  // where taking the wheel is what the visitor asked for. Collapsing gives it
  // back. Driven off `expanded` rather than set once, because the same Map
  // instance serves both states.
  $effect(() => {
    // `ready` is read for its DEPENDENCY, not its value: `map` is a plain
    // variable, so without a reactive signal that changes when the engine
    // arrives this effect would never re-run after boot, and a map expanded
    // before its first frame would stay un-zoomable.
    void ready;
    const instance = map;
    if (!instance) return;
    if (expanded) instance.scrollZoom.enable();
    else instance.scrollZoom.disable();
  });

  $effect(() => {
    if (engine === "off" || points.length === 0) return;
    const host = canvasHost;
    if (!host) return;
    let cancelled = false;
    // HALF OF IT HAS TO BE ON SCREEN, and "half" is the smaller of half the
    // map and half the window — an 837px map in a 400px window can never be
    // half of ITSELF visible, and a threshold it can never cross is a map that
    // never loads.
    //
    // This started as 300px of LEAD (`rootMargin: "300px 0px"`), and what that
    // actually did took measuring rather than reading. The map IS below the
    // fold on the homepage — at 1455x900 the hero is 1007 tall and the map
    // slot's top is at y = 1007, so ZERO pixels of it are on screen at rest.
    // 300px of lead expands the observer's root to 1200, which reaches a map
    // a whole viewport away: it fired at load, and 426 KB of parse plus a
    // WebGL context landed inside the featured carousel's first 4-second
    // dwell. That is measurable from outside — `featured-properties.spec.ts`
    // stamps the carousel's turns in the page, and the first one overshot by
    // 458.6ms, 1029.7ms and 2609.8ms on cold runs, against a spec allowing
    // 300. "A little lead" was the whole defect.
    //
    // Two things were tried and did not fix it, both recorded so they are not
    // tried again. Deferring the boot to `load` + `requestIdleCallback` made
    // it WORSE (the turn was missed outright in two of four runs): nothing
    // about scheduling makes a 426 KB parse cheaper, it only moves which
    // four-second window it lands in. `optimizeDeps.include: ["maplibre-gl"]`
    // (vite.config.ts) took the worst case from 2609.8ms to 364.6ms by
    // stopping Vite discovering the dependency mid-session — a real fix, and a
    // dev-server one that says nothing about production.
    //
    // Requiring half-visibility is what actually removes the conflict, and it
    // is the better rule anyway: a visitor who never scrolls to the map now
    // pays nothing for it, which is what "lazy" was supposed to mean. The
    // price is that the map arrives a little later than it used to — at
    // 1440x900 the homepage band needs about 520px of scroll rather than 107 —
    // and until then its box shows the list of listings, which is the same
    // content. See issue #103.
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((e) => e.isIntersecting);
        if (!entry) return;
        const root = entry.rootBounds?.height ?? window.innerHeight;
        const enough = Math.min(entry.boundingClientRect.height, root) / 2;
        if (entry.intersectionRect.height < enough) return;
        io.disconnect();
        if (!cancelled) void boot(host);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    io.observe(host);
    return () => {
      cancelled = true;
      io.disconnect();
      destroy();
    };
  });
</script>

<!-- Escape closes the sheet. On the window rather than on the box, because the
     box is a <div> with no role and a key handler on one is exactly the
     non-interactive-element interaction the compiler's a11y rules refuse. -->
<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && selected) selected = null;
  }}
/>

{#if points.length > 0}
  <div
    bind:this={boxEl}
    data-property-map
    data-map-ready={ready ? "" : undefined}
    data-map-home={home ? "" : undefined}
    data-expanded={expanded ? "true" : undefined}
    class="relative isolate overflow-hidden {MAP_TONES[tone]} {passedClasses}"
  >
    <!-- THE CONTENT. First in the DOM and first in the tab order, before the
         canvas and before every control, because it is what the map is a
         picture of.
         `drawn` — ready OR a placeholder — rather than `ready`, because the
         list's job is to be the map's accessible equivalent and there is now a
         map to be the equivalent OF before MapLibre arrives. It is the same
         treatment the canvas has always been given and not a new one; what is
         new is that a scripting-off browser gets it too, which is stated
         plainly in the journal because it is the one population this trades
         against. Every marker below is a real link to the same place the list
         item points at, so nothing is unreachable by pointer. -->
    <ul
      data-map-list
      aria-label="{label} listings"
      class={drawn ? "" : "flex h-full flex-col gap-3 overflow-y-auto p-5"}
    >
      {#each points as point (point.id)}
        <li>
          <a
            data-map-link
            href={point.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            class={drawn ? "sr-only" : "t-body-2 underline underline-offset-2"}
          >
            {point.title}<span class="sr-only"> — open in Google Maps</span>
          </a>
        </li>
      {/each}
    </ul>

    <!-- THE FIXED-FRAME PLACEHOLDER (#122): the committed raster of MAP_HOME
         with this section's REAL pins over it, server-rendered, visible from
         first paint and with scripting off.
         WHY A CONTAINER QUERY AND NOT A MEDIA QUERY. Which frame a map is, is
         its own measured height and never the viewport's width — that is the
         rule `frameFor` already holds, and `/dev/a11y-fixtures` draws a 200
         and a 595 map side by side at one viewport width, where a media query
         would answer the same thing twice. `container-type: size` is on this
         wrapper rather than on the root, deliberately: the wrapper is
         `absolute inset-0` so its size comes from the containing block and
         size containment cannot change anyone's layout, whereas the root
         contributes to the homepage band's grid row.
         Only the matching layer is FETCHED: a background image on a
         `display: none` element is not requested, so a phone pays 27.4 KB and
         a desktop 62.1 KB, never both.
         The camera is fixed, so the box's centre pixel is MAP_HOME's
         coordinate at every container size — `background-position: center` at
         the raster's own pixel size (never `cover`, which would scale it and
         break alignment with the tiles), and the markers below are offsets
         from that same centre. -->
    {#if home && !handedOver}
      <!-- `--map-home-ground` is written from the constant rather than typed
           into the stylesheet, so the colour the margin paints and the colour
           `scripts/map-home.test.ts` checks against the style file are the
           same string. A second literal in CSS is a second thing to drift. -->
      <div
        data-map-home-box
        aria-hidden="true"
        style="--map-home-ground:{MAP_HOME_GROUND}"
        class="pointer-events-none absolute inset-0"
      >
        {#each homeLayers as layer (layer.key)}
          <div
            data-map-home-frame={layer.key}
            style="background-image:url(/{layer.spec.file});background-size:{layer.spec.raster
              .width}px {layer.spec.raster.height}px"
            class="absolute inset-0"
          >
            {#each layer.markers as marker (marker.id)}
              {@const at = `left:50%;top:50%;transform:translate(${marker.dx}px,${marker.dy}px)`}
              {#if marker.point}
                <!-- A LINK, where the live marker is a button, and that is the
                     whole no-JS story: the sheet the live pin opens needs
                     script, and Google Maps does not. Same href, same target
                     and same rel as this listing's row in the list above.
                     `tabindex="-1"` + `aria-hidden` is the live marker's own
                     contract, unchanged: a marker is a drawing of a list item
                     and the list is what the keyboard and the screen reader
                     get. -->
                <a
                  data-map-home-pin={marker.point.id}
                  href={marker.point.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabindex="-1"
                  aria-hidden="true"
                  style="{at} translate(-50%,-100%)"
                  class="pointer-events-auto absolute"
                >
                  <svg
                    width={layer.pin}
                    height={layer.pin * PIN_ASPECT}
                    viewBox={PIN_VIEWBOX}
                    aria-hidden="true"
                    focusable="false"
                    class="block"
                  >
                    <path d={PIN_PATH} fill="var(--color-primary)" />
                    <circle
                      cx={PIN_HOLE.cx}
                      cy={PIN_HOLE.cy}
                      r={PIN_HOLE.r}
                      fill="var(--color-light)"
                    />
                  </svg>
                </a>
              {:else}
                {@const d = clusterDiameter(marker.count, layer.pin)}
                <!-- Inert, unlike the live cluster: pressing one zooms the
                     camera in on its members, and there is no camera yet. -->
                <span
                  data-map-home-cluster={marker.count}
                  style="{at} translate(-50%,-50%);width:{d}px;height:{d}px;font-size:{Math.round(
                    d * 0.42,
                  )}px"
                  class="absolute grid place-items-center rounded-full bg-primary font-semibold
                    text-light tabular-nums"
                >
                  {marker.count}
                </span>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/if}

    <!-- MapLibre's own box. `aria-hidden` is not a shortcut: the canvas keeps
         MapLibre's keyboard handler and its own accessible name (set above), so
         it is only the marker OVERLAY that is hidden, and only because the list
         above says the same thing better.
         The opacity transition is the WHOLE cross-fade: the canvas comes up
         over a placeholder that stays fully opaque underneath it, so the two
         are the same map at the same camera for MAP_HOME_FADE_MS and the swap
         reads as a sharpening rather than a cut. `motion-reduce:transition-none`
         is #122's reduced-motion rule, and it is paired with `handedOver`
         flipping immediately under the same preference — one setting, both
         halves, no cross-fade at all. -->
    <div
      bind:this={canvasHost}
      data-map-canvas
      ontransitionend={(e) => {
        // The one property this element animates, named rather than assumed:
        // a `transitionend` for anything else must not retire the picture.
        if (e.propertyName === "opacity" && ready) handedOver = true;
      }}
      style="transition-duration:{MAP_HOME_FADE_MS}ms"
      class="absolute inset-0 transition-opacity motion-reduce:transition-none
        {ready ? '' : 'pointer-events-none opacity-0'}"
    ></div>

    {#if ready}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {#each clusters as cluster (cluster.id)}
          {@const count = cluster.points.length}
          <!-- `data-map-pin` carries the LISTING'S OWN ID, not an empty marker.
               A pin is a drawing of one list item, and saying which one costs
               nothing, keeps `[data-map-pin]` matching as a presence selector
               everywhere it already did, and is what lets a browser test assert
               that the ACTIVE listing's pin is the one at the map's centre
               rather than that some pin is. A cluster stands for no single
               listing, so it carries its count instead, as it already did. -->
          <button
            bind:this={clusterEls[cluster.id]}
            type="button"
            tabindex="-1"
            aria-hidden="true"
            data-map-pin={count === 1 ? cluster.points[0]!.id : undefined}
            data-map-cluster={count > 1 ? count : undefined}
            onclick={() => press(cluster)}
            class="pointer-events-auto absolute top-0 left-0 cursor-pointer border-0 bg-transparent p-0"
          >
            {#if count === 1}
              <!-- `np_pin-map_4984332` — see $lib/property-map for the five
                   measured numbers and the tangent construction they imply. -->
              <svg
                width={frame.pin}
                height={frame.pin * PIN_ASPECT}
                viewBox={PIN_VIEWBOX}
                aria-hidden="true"
                focusable="false"
                class="block"
              >
                <path d={PIN_PATH} fill="var(--color-primary)" />
                <circle
                  cx={PIN_HOLE.cx}
                  cy={PIN_HOLE.cy}
                  r={PIN_HOLE.r}
                  fill="var(--color-light)"
                />
              </svg>
            {:else}
              {@const d = clusterDiameter(count, frame.pin)}
              <span
                style="width:{d}px;height:{d}px;font-size:{Math.round(d * 0.42)}px"
                class="grid place-items-center rounded-full bg-primary font-semibold text-light
                  tabular-nums"
              >
                {count}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if ready && selected}
      <!-- The comp draws no popup, so this is invented — and it is a SHEET on
           the map's bottom edge rather than a callout on the pin, because the
           390 map is 200px tall and a callout would be most of it plus an
           anchor-flipping problem at every edge. Google links out per the
           operator's ask; both are `target="_blank" rel="noopener noreferrer"`
           and neither costs a CSP change — a link navigation is not governed
           by one, which tests/interaction/property-map.spec.ts measures rather
           than asserts. -->
      <div
        data-map-sheet
        class="absolute inset-x-0 bottom-0 z-[2] flex items-start justify-between gap-4 bg-light/95
          p-4 text-primary"
      >
        <div class="min-w-0">
          <p class="t-h4 truncate">{selected.title}</p>
          <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {#if selected.href}
              <a class="t-body-2 underline underline-offset-2" href={selected.href}>
                View listing<span class="sr-only"> — {selected.title}</span>
              </a>
            {/if}
            <a
              class="t-body-2 underline underline-offset-2"
              href={selected.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get directions<span class="sr-only"> to {selected.title}, in Google Maps</span>
            </a>
          </p>
        </div>
        <button
          type="button"
          onclick={() => (selected = null)}
          aria-label="Close {selected.title}"
          class="-m-2 grid h-11 w-11 shrink-0 cursor-pointer place-items-center"
        >
          <span aria-hidden="true" class="text-lg leading-none">&times;</span>
        </button>
      </div>
    {/if}

    {#if measured && (compact || expanded)}
      <!-- `np_expand_2178917`. The comp draws it on BOTH 390 maps and on
           neither 1440 map, 20.884 x 20.880 with a 2px radius in solid garnet,
           its right and bottom edges exactly 10.0 from the map's, around a
           12.884 x 12.880 off-white four-corner expand glyph.
           ITS BEHAVIOUR IS UNWIRED IN FIGMA (`interactions: []`, a real
           absence — the same read returns interactions for the hero buttons
           and the carousel arrows), so see docs/workJournal.md for why this
           grows the box in place rather than opening Modal.svelte or calling
           requestFullscreen.
           The PAINTED box is the comp's 20.88; the TARGET is 44 x 44 around
           it (WCAG 2.5.8), the same split Nav.svelte and Modal.svelte use. -->
      <button
        type="button"
        data-js-only
        data-map-expand={expanded ? "collapse" : "expand"}
        aria-expanded={expanded}
        aria-label={expanded ? `Collapse the ${label} map` : `Enlarge the ${label} map`}
        onclick={() => (expanded = !expanded)}
        class="absolute right-0 bottom-0 z-[3] grid h-11 w-11 cursor-pointer place-items-end
          bg-transparent pr-[10px] pb-[10px]"
      >
        <span
          class="grid h-[20.88px] w-[20.884px] place-items-center rounded-[2px] bg-primary
            text-light"
        >
          {#if expanded}
            <Shrink size={13} strokeWidth={2} aria-hidden="true" />
          {:else}
            <Expand size={13} strokeWidth={2} aria-hidden="true" />
          {/if}
        </span>
      </button>
    {/if}
  </div>
{/if}

<style>
  /* The expanded height, and the reason it is CSS rather than an inline style:
     above `lg` the comp draws no expand affordance at all, so the expanded
     height must simply not exist there — the panel goes back to the 595 its
     caller sets, the measured box stops being compact, and the button
     disappears with it. An inline height would have to be unwound by script on
     a resize, and would beat the caller's class while it was there. */
  @media (max-width: 63.9375rem) {
    [data-expanded="true"] {
      height: min(70dvh, 520px);
    }
  }

  /* The focused chip. The list is `sr-only` once the map is drawn, and an
     `sr-only` link that takes focus is a WCAG 2.4.7 failure with nothing to
     show — so a focused one comes back on the map's own top-left, in the
     brand's garnet, over everything. Written here rather than as
     `focus:not-sr-only` because that utility's `position: static` and an
     authored `absolute` are the same specificity, and which one wins is
     decided by the stylesheet's order rather than by the class attribute's —
     exactly the defect HeroBackgroundVideo.svelte records paying for. */
  /* WHICH FRAME'S PICTURE IS ON SCREEN, decided by the box's own height and
     nothing else — `COMPACT_MAX_HEIGHT` (300) is `frameFor`'s threshold, and
     these two rules are that function in CSS because the server cannot run it.
     The 299.98 is the same boundary from below; a `height < 300px` range query
     would be tidier and buys nothing here.
     The wrapper carries `container-type: size` rather than the root: it is
     `absolute inset-0`, so its size is the containing block's and size
     containment cannot change what the root contributes to the homepage band's
     grid row. A browser with no container-query support matches NEITHER rule
     and shows no placeholder at all, which is exactly the pre-#122 state —
     the degradation is "as before", never "the wrong frame". */
  [data-map-home-box] {
    container-type: size;
  }
  [data-map-home-frame] {
    display: none;
    background-color: var(--map-home-ground);
    background-repeat: no-repeat;
    background-position: center center;
  }
  @container (max-height: 299.98px) {
    [data-map-home-frame="compact"] {
      display: block;
    }
  }
  @container (min-height: 300px) {
    [data-map-home-frame="full"] {
      display: block;
    }
  }

  [data-map-ready] [data-map-link]:focus,
  [data-map-home] [data-map-link]:focus {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 4;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    clip-path: none;
    white-space: nowrap;
    background-color: var(--color-primary);
    color: var(--color-light);
    padding: 8px 12px;
    text-decoration: underline;
  }

  /* MapLibre's attribution, toned to the brand. It is a licence condition, so
     it is legible rather than hidden: sand ground, garnet text, and the
     4.5:1 the palette already measures for that pair (8.87:1). */
  /* OPAQUE, not 88%. Two reasons and they are the same reason. A translucent
     chip over map tiles has no fixed contrast — the ratio depends on whatever
     imagery happens to be under it — and axe says so: it answers
     `color-contrast` for this element and its three links with `incomplete`,
     "Element's background color could not be determined because element
     contains an image node". That incomplete is what forced the whole map
     subtree out of the band's axe run, which in turn silenced axe over the
     OpenStreetMap credit this component argues is a LICENCE CONDITION. At
     100% it is garnet on sand, 8.87:1, measurable and fixed.

     AND IT TAKES THREE CLASSES TO SAY IT, which is the correction. The rule
     below read `[data-property-map] .maplibregl-ctrl-attrib` — specificity
     (0,2,0), one attribute and one class — and the rule it has to beat is
     maplibre's own `.maplibregl-ctrl.maplibregl-ctrl-attrib`, which is ALSO
     (0,2,0). An exact tie is settled by order, maplibre-gl.css is injected
     after this component's styles, and so the opaque chip above was never once
     painted: measured `rgba(255, 255, 255, 0.5)` on /dev/home AND
     /dev/properties, i.e. maplibre's `hsla(0,0%,100%,.5)` untouched. Measured
     again ON A PRODUCTION BUILD, because a cascade order is exactly the kind of
     thing `vite dev` can flatter — `pnpm build && pnpm preview`, `/` and
     `/properties`, both `rgba(255, 255, 255, 0.5)` before and both
     `rgb(232, 225, 209)` after. It was shipped, not a dev artefact. Every
     consequence the comment above describes was therefore still live — axe
     answered `color-contrast` with `imgNode` incomplete for
     `.maplibregl-ctrl-attrib-inner` and both licence links, on a chip this file
     claimed was opaque. Naming `.maplibregl-ctrl` here makes it (0,3,0) and
     wins on specificity rather than on injection order, which nothing in this
     repo controls. (Found by the axe case in featured-properties.spec.ts once
     that band's map was allowed to finish booting; review of #121.) */
  :global([data-property-map] .maplibregl-ctrl.maplibregl-ctrl-attrib) {
    background-color: var(--color-light);
    color: var(--color-primary);
    font-size: 10px;
    line-height: 1.4;
    padding: 2px 6px;
  }
  /* Same tie, same fix: maplibre's `.maplibregl-ctrl-attrib a` is (0,1,1) and
     this was (0,2,1), so the COLOUR here always did win — but it is written
     with the same three classes as its parent so the pair cannot drift apart
     the next time one of them is edited. */
  :global([data-property-map] .maplibregl-ctrl.maplibregl-ctrl-attrib a) {
    color: var(--color-primary);
    text-decoration: underline;
  }
  /* ABOVE THE PIN SHEET, NOT UNDER IT. The sheet is `inset-x-0 bottom-0`, and
     on the 200px phone map it covers the bottom third — measured with a pin
     open at 390x844: sheet 471..536, attribution 522..536, and
     `elementFromPoint` at the credit's centre returned the SHEET. That hid the
     OpenStreetMap credit, which this component treats as an ODbL condition
     rather than a style choice, and it hid the expand control with it. Both
     now sit above the sheet; the credit's chip is opaque so it stays legible
     over it. property-map.spec.ts hit-tests both with a sheet open. */
  :global([data-property-map] .maplibregl-ctrl-bottom-left) {
    z-index: 3;
  }
</style>

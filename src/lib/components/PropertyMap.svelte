<script lang="ts" module>
  /**
   * The comp's per-section property map (#13), with its ground tones EXPORTED
   * from this module script as `MAP_TONES`.
   *
   * (That paragraph is this file's row in docs/COMPONENTS.md, which reads
   * `<script module>` exports into its surface column since #59. The
   * component's own description is the comment on the instance script below.)
   *
   * THE BOX'S OWN GROUND, AND WHY IT IS A PROP.
   *
   * Before the tiles arrive — and forever, with scripting off — this component
   * is not a map. It is a list of links, and a list of links needs a ground it
   * is legible on. The first version hard-coded `bg-light text-primary`, which
   * is right on the Properties page (sand panel on an off-white page, 9.38:1)
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
   *   garnet  sand ground, garnet text      9.38:1   — the Properties page
   *   cream   #3d0707 ground, off-white     15.13:1  — the homepage band
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
  // frame. Past Projects (the comp's Sold section, `section.past`) gets none
  // (the 1440 tree draws one and its wrapper is `visible: false`).
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
  // moved to bottom-left, out of the control column's corner, and toned to
  // the brand. tests/interaction/property-map.spec.ts asserts the string
  // "OpenStreetMap" is really on the page rather than that no error appeared.
  // On a COMPACT frame it is MapLibre's own compact credit: the whole line
  // for MAP_CREDIT_OPEN_MS after the first frame, or until the visitor's first
  // pan, zoom or press, and then its (i), which opens to the same text on a
  // press; on a full frame, and in the expanded overlay at any window height,
  // it is the whole chip (`fullControls`). See `placeCredit` for why.
  // The raster picture under the canvas carries the same line as plain markup
  // (`MAP_HOME_CREDIT`), since before `load` there is no control to show it.
  //
  // Deep imports, not `{ Expand, Shrink } from "@lucide/svelte"`. That barrel
  // re-exports every icon in the pack as its own .svelte file, and reaching it
  // makes Vitest transform all of them. Measured on this machine, a file that
  // imports this component and asserts nothing: 50.2s through the barrel,
  // 5.5s through these two paths — and PropertyMap.test.ts's fifteen cases now
  // run in 4.6s total. Nothing else changes: same components, same props.
  // src/lucide-imports.test.ts holds every lucide import to this form (#97).
  import Expand from "@lucide/svelte/icons/expand";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import Shrink from "@lucide/svelte/icons/shrink";
  import { tick, untrack } from "svelte";

  import { trapFocus } from "$lib/actions/trapFocus";
  import type { MapEngine } from "$lib/map-engine";
  import {
    ACTIVE_PIN_SCALE,
    activeTarget,
    CAMERA_FLIGHT_MS,
    cameraMove,
    clusterDiameter,
    clusterPoints,
    DIMMED_MARKER_OPACITY,
    expansionZoom,
    fitCamera,
    frameFor,
    homeFrames,
    homeMarkers,
    MAP_CREDIT_OPEN_MS,
    MAP_FRAMES,
    MAP_HOME,
    MAP_HOME_CREDIT,
    MAP_HOME_FADE_MS,
    MAP_HOME_GROUND,
    MAP_MAX_ZOOM,
    MAP_MIN_ZOOM,
    MAP_ZOOM_STEP_MS,
    mapStyleUrl,
    markerDimmed,
    PIN_ASPECT,
    PIN_HOLE,
    PIN_PATH,
    PIN_VIEWBOX,
    wheelRun,
    type Camera,
    type MapCluster,
    type MapFrame,
    type MapPoint,
    type WheelRun,
  } from "$lib/property-map";
  import { reducedMotion } from "$lib/transitions";
  import { lockBodyScroll } from "$lib/utils/scrollLock";

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
     * after every 8000ms dwell with nobody touching anything, so the shipped
     * rule — "`active` changed, therefore the visitor asked" — threw a
     * visitor's own zoom away with no user action at all. Measured on a
     * production build of `/` at 390x844 with motion allowed, when the dwell
     * was still 4000ms: expand the band's map, four wheel-up ticks take it
     * from z12 to z12.5387, and ~9s later, with no further input, the camera
     * has issued 2 `flyTo` back to z12.
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
    /**
     * WHETHER A VISITOR MAY DRIVE THIS MAP AT ALL. True — the default, and
     * what `/properties` always gets — or false, where the map is a picture
     * the page is scrolled, swiped and tabbed straight past.
     *
     * The homepage band's rule, operator call 2026-09-23: "map should get all
     * navigation tools when the slideshow is paused, and be uninteractable
     * when the slideshow is running". The band passes `carousel.paused ||
     * !carousel.eligible`: `paused` is the user's own stop (the Pause button,
     * or focus entering the carousel) and is the same value the button's
     * "Play slides" / "Pause slides" name is read off, so the lock and the
     * button cannot disagree; `!eligible` is "nothing can run here at all",
     * i.e. reduced motion. NOT `!carousel.rotating`, which the brief for this
     * change ruled out because `rotating` is also false on hover. Measured on
     * a production build of `/` at 1440x900: a pointer resting on the MAP
     * does not pause the slideshow (the band turned 3791ms later — the map is
     * outside the carousel's region); a pointer resting on the CARD does (no
     * turn in 12s). So under `!rotating` the map would unlock whenever the
     * pointer sat on the card beside it, and on a hidden tab — states in which
     * the slideshow has not been stopped by anybody. (Hover stopped pausing
     * this band later that day, `pauseOnHover: false`; the hidden tab stands.)
     *
     * ONE SWITCH FOR THE WHOLE SET, so the set cannot half-apply: every
     * maplibre navigation handler this map was built with (`navigation`), the
     * pins' press, whether the canvas can take focus and what it is called,
     * and the grab cursor. Going false also hands the camera back to the page
     * — see `applyInteractive`.
     */
    interactive?: boolean;
    /** Called when one of the map's own controls (+, −, expand) is pressed
     *  while `interactive` is false: the caller unlocks the map and the
     *  control then acts. Absent, + and − do nothing on a locked map. The
     *  homepage band passes `carousel.pause` (M1, operator call 2026-09-28). */
    onengage?: () => void;
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
    interactive = true,
    onengage,
    class: passedClasses = "",
  }: Props = $props();

  type MapInstance = InstanceType<MapEngine["Map"]>;

  /** Every maplibre handler that moves the camera. The ones a map actually
   *  HAS are read off the instance at boot (`navigation`), not listed here —
   *  this is only where to look. `cooperativeGestures` is not in it: it is a
   *  mode that changes what the wheel means, not a way to navigate. */
  const NAVIGATION = [
    "scrollZoom",
    "boxZoom",
    "dragRotate",
    "dragPan",
    "keyboard",
    "doubleClickZoom",
    "touchZoomRotate",
    "touchPitch",
  ] as const;
  type Navigation = (typeof NAVIGATION)[number];
  /** The part of every maplibre handler this file uses. */
  interface Handler {
    enable(): void;
    disable(): void;
    isEnabled(): boolean;
    isActive(): boolean;
  }
  const handler = (instance: MapInstance, name: Navigation) => instance[name] as Handler;

  let boxEl: HTMLDivElement | undefined = $state();
  let canvasHost: HTMLDivElement | undefined = $state();
  let map: MapInstance | null = null;
  /** Puts the credit of the given kind on the live map, replacing the other
   *  kind (a no-op if it is already that kind). `boot` sets it, `destroy`
   *  clears it; null means there is no map to put a credit on. */
  let placeCredit: ((compact: boolean) => void) | null = null;
  /** Ends the compact credit's open window — its whole line collapses to the
   *  (i), and every compact credit placed after this starts collapsed. Called
   *  by the visitor's first pan, zoom or press, and by `creditClock`; a no-op
   *  after the first call. `boot` sets it, `destroy` clears it. */
  let settleCredit: (() => void) | null = null;
  /** MAP_CREDIT_OPEN_MS from MapLibre's `load`: the open window's other end. */
  let creditClock: ReturnType<typeof setTimeout> | undefined;

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
   * The listing whose link in the map's list has focus, or null.
   *
   * The pins are `tabindex="-1"`, so the keyboard reaches a listing through
   * its link — which comes back as the chip on the map's top-left. That
   * listing's marker is drawn at full opacity for as long as the chip is up,
   * the keyboard's half of "a pin under hover goes to full opacity": a
   * dimmed marker is what the chip is naming, and it must not look disabled
   * while it is being named. See `markerDimmed`.
   */
  let heldLink: string | null = $state(null);
  /** The dimmed opacity for a marker standing for the listings `ids` — a pin's
   *  or a cluster's — or undefined when it is drawn at full. `--map-dim` is
   *  written from the constant, so the value the stylesheet applies and the
   *  value src/lib/map-marker-contrast.test.ts measures are one. The sheet's
   *  listing is held like the focused link's: a pin pressed on a map with no
   *  `onselect` (the homepage band) opens a sheet naming it and leaves
   *  `active` alone, and the listing the visitor chose must not look disabled
   *  beside one they did not. */
  const dimFor = (ids: readonly string[]) =>
    markerDimmed(ids, active, points, [heldLink, selected?.id]) ? DIMMED_MARKER_OPACITY : undefined;
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
   * and the homepage band changes `active` on an 8000ms timer with nobody
   * touching anything — so on that band the suspension ended, every time,
   * with no user action. Measured on a production build of `/` at 390x844,
   * motion allowed, at the then 4000ms dwell: expand the band's map (at the
   * time, the one state where scroll-zoom was the visitor's; since the
   * reversal it is every state, which only makes this easier to reach), four
   * wheel-up ticks to z12.5387, then no further input — ~9s later the camera
   * had issued 2 `flyTo` back to z12 and
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
   * would put it off the box. The ZOOM is carried, since 2026-09-23; see
   * `chosenZoom` below for why that half can be and the pan cannot.
   */
  let drivenAt = $state<string | null | undefined>(undefined);

  /**
   * THE ZOOM THE VISITOR LAST CHOSE, or null if they never have — handed to
   * `cameraMove` as `zoom`, so every flight to a listing after it lands this
   * close instead of at the frame's own `maxZoom`. The reasoning, and the
   * measurement that made it necessary, are on `CameraState.zoom`.
   *
   * RECORDED AT `zoomend`, ONLY WHILE A SUSPENSION IS OUTSTANDING, AND ONLY
   * ON A LISTING'S CAMERA (`onListing`). The first two are what make it the
   * visitor's number and never the camera's; the third is what makes it a
   * number that means anything at the NEXT listing. Three things the first
   * version of this got wrong, all found by verifying #150 against the
   * integrated tree and each with its own guard:
   *
   *  1. A ZOOM CHOSEN ON A FRAME WAS CARRIED TO EVERY LISTING. The recorder
   *     asked only "is a suspension outstanding", so on /properties at 1440,
   *     where the land map is drawn at load on MAP_HOME (z8.6) with nothing
   *     active, five notches out over the overview recorded z7.7021 — and the
   *     first listing the visitor then scrolled to flew at z7.7021 instead of
   *     z12, and so did every one after. `cameraMove` already refused to
   *     apply this number to a FRAME ("MAP_HOME is a chosen frame, not a
   *     distance from a listing"); the recorder never asked the same question
   *     about where the number came from. `onListing` is that question.
   *  2. A WHEEL THAT STOPPED A FLIGHT CARRIED THE ARC'S MID-AIR ZOOM. maplibre
   *     ends a flight the moment a gesture handler goes active
   *     (`HandlerManager.handleEvent` -> `stop(true)`), wherever the Van Wijk
   *     arc had got to — z9.87 or z11.79 in the verifier's runs, from a camera
   *     at rest at z12 — and the wheel then zooms FROM there. Three notches IN
   *     recorded z11.3963: a visitor who zoomed in had every later listing
   *     carried further OUT than where they started. The camera's own flight
   *     is never the visitor's, so what is carried is where that flight was
   *     GOING plus what the wheel did to it (`shortfall`).
   *  3. A CROSSING DURING THE WHEEL'S OWN EASE DROPPED IT. The suspension ended
   *     the instant the page moved on, before the wheel's `zoomend`, so the
   *     zoom was never recorded and the flight went at the old one (12.3457 at
   *     the crossing, 12 after it). A gesture still in progress now finishes
   *     first (`releaseDue`).
   *
   * THE CAMERA'S OWN FLIGHT ENDING is told apart from everything else by the
   * event data this component hands `flyTo` and `jumpTo` (`OWN_MOVE`), which
   * maplibre copies onto every event that move fires, its stop included. That
   * replaces a paragraph here that reasoned about WHICH gesture's `drivenAt`
   * was set before the flight's `zoomend` fired; the flight's `zoomend` is now
   * simply never recorded, whichever gesture stopped it.
   *
   * Plain, like `commanded` and `flying`: it is read by the camera effect and
   * written only inside a suspension, whose END is the reactive change that
   * re-runs that effect. A `$state` here would wake it for a move it is about
   * to refuse.
   */
  let chosenZoom: number | null = null;

  /**
   * THE CAMERA `commanded` NAMES IS ONE LISTING'S — the only kind a visitor's
   * zoom can be carried FROM. False for a FRAME: MAP_HOME with nothing active,
   * the fit where a section has no home, and MAP_HOME under its own picture
   * whatever is active (#132). Set wherever `commanded` is, from the same
   * inputs that chose the camera; plain for the same reason `commanded` is.
   */
  let onListing = false;

  /**
   * HOW FAR SHORT OF ITS TARGET ZOOM THE CAMERA'S LAST FLIGHT WAS when a
   * visitor's gesture stopped it, or 0 when none did — the part of the zoom
   * on screen that is the ARC's, not the visitor's. Added to the zoom a wheel
   * ends on before it is carried, so three notches in over an interrupted
   * flight carry "the listing's zoom, three notches closer" rather than "the
   * arc's waypoint, three notches closer". Zeroed by every camera command,
   * because a new target is a new baseline.
   *
   * WHAT IT DOES NOT DO: move the camera. A gesture that stops a flight leaves
   * the view where the arc was, between two listings, exactly as a drag that
   * cuts one short always has — the suspension is what holds it, and the next
   * listing the visitor asks for is where it goes. Only the number carried
   * past that is corrected.
   */
  let shortfall = 0;

  /**
   * THE VISITOR ASKED FOR A DIFFERENT LISTING WHILE A GESTURE OF THEIRS WAS
   * STILL IN PROGRESS, so the suspension ends when that gesture does — at its
   * `moveend`, after its `zoomend` has recorded what it chose — and not
   * before. Ending it at once put the camera's flight on top of the visitor's
   * own zoom ease: `flyTo` stops every handler, so the wheel's ease was cut off
   * where it stood and its `zoomend` fired with no suspension to record into.
   * The wait is bounded by maplibre's own ease — 200ms after the last notch,
   * plus the 200ms it holds `isActive()` before `zoomend` — and it is the
   * visitor's gesture, not a timer of ours, that ends it.
   *
   * ONE GAP, READ IN maplibre's SOURCE AND NOT CLOSED: the first notch after
   * 400ms of quiet is held for 40ms while maplibre decides wheel from trackpad
   * (`ScrollZoomHandler._timeout`), and no public API says a zoom is coming. A
   * crossing inside those 40ms still ends the suspension at once. Issue #157
   * has what that costs and why it is not reachable by hand.
   */
  let releaseDue = false;

  /**
   * THE CLICK OF A +/− PRESS WHOSE EASE IS STILL RUNNING, or null. The ease is
   * the visitor's gesture as much as a wheel's is, but no maplibre handler is
   * active for it, so without this `gestureInProgress` said no and a listing
   * asked for inside its 300ms ended the suspension before `zoomend` recorded
   * the step (#173). Cleared by that ease's own `moveend` — maplibre copies
   * its event data, so `originalEvent` is this click — which fires whether it
   * finished or something stopped it.
   */
  let stepping: MouseEvent | null = null;

  /** The event data every camera command of this component carries, which
   *  maplibre copies onto the events that move fires — `movestart` to
   *  `moveend`, and the `zoomend` / `moveend` of the stop when a gesture cuts
   *  it short (`_afterEase(eventData)` in camera.ts). */
  const OWN_MOVE = { propertyMapCamera: true } as const;
  const ownMove = (e: unknown) =>
    (e as { propertyMapCamera?: unknown } | undefined)?.propertyMapCamera === true;

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
   *
   * ASKING IS NOT THE SAME AS LETTING GO, which is `releaseDue`: a gesture
   * still in progress when the ask arrives finishes first, and its own
   * `moveend` (in `boot`) is what ends the suspension. The ask is re-read on
   * every change, so a visitor who comes back to the listing they were
   * driving on before the gesture ends has asked for nothing, and nothing is
   * released.
   */
  $effect(() => {
    const a = active;
    const by = activeBy;
    untrack(() => {
      if (by !== "visitor") return;
      const asked = drivenAt !== undefined && drivenAt !== a;
      releaseDue = asked && gestureInProgress(map);
      if (asked && !releaseDue) drivenAt = undefined;
    });
  });
  /** The box MapLibre was last told about. See the camera effect. */
  let sized = { width: 0, height: 0 };
  /** The camera this map was last TOLD to be at — set by `boot` and by every
   *  move. Deliberately NOT `$state`: it is a record of what was done, and an
   *  effect that re-ran on its own write would be a loop. */
  let commanded: Camera | null = null;

  /**
   * IS A FLIGHT THIS MAP ISSUED STILL IN THE AIR (#127, #128).
   *
   * `flying` is the record and `landed` is the alarm clock, and they are two
   * variables rather than one on purpose. `flying` is plain, like `commanded`
   * beside it: the camera effect READS it, so a `$state` written at the bottom
   * of that effect would wake the effect on its own write. `landed` is
   * `$state` and only the TIMER ever writes it — that write is the re-ask, and
   * the flight it sends out goes to wherever `active` has got to by then. No
   * queue, no retained target, nothing to go stale.
   *
   * The timer is `CAMERA_FLIGHT_MS` because that is the `duration` the `flyTo`
   * below is given. The hold is not a guess at how long maplibre will take; it
   * is the number this component told maplibre to take. (`map.isEasing()` was
   * the alternative and is the same answer read the other way round — it was
   * declined because it is a poll, not a signal: nothing about it can wake a
   * Svelte effect when the flight lands, so it would need this timer anyway to
   * drive the re-ask and would then be a second opinion beside it.)
   */
  let flying = false;
  let landed = $state(0);
  let flightTimer: ReturnType<typeof setTimeout> | undefined;

  /** A flight has just been issued: hold the next one until this one lands. */
  function beginFlight() {
    flying = true;
    clearTimeout(flightTimer);
    flightTimer = setTimeout(() => {
      flying = false;
      landed += 1;
    }, CAMERA_FLIGHT_MS);
  }

  /** Nothing of ours is in the air any more — a `jumpTo` (which cancels
   *  MapLibre's easing outright), or a map going away. No bump: a jump has
   *  already set `commanded` to where it went, so there is nothing to re-ask
   *  for, and a bump here would be a write to `landed` from inside the very
   *  effect that reads it. */
  function endFlight() {
    flying = false;
    clearTimeout(flightTimer);
    flightTimer = undefined;
  }

  /**
   * THE NAVIGATION HANDLERS THIS MAP WAS BUILT WITH, read off the instance the
   * moment it exists — so "all navigation tools" is, by construction, exactly
   * the set `/properties` has, and a handler `boot` switches on or off joins or
   * leaves it without anyone keeping a second list. Measured on a production
   * build of /properties at 1440x900 (2026-09-23): scrollZoom, boxZoom,
   * dragPan, keyboard, doubleClickZoom and touchZoomRotate on; dragRotate and
   * touchPitch off. The +/− buttons are this component's own markup, not
   * maplibre's NavigationControl, so they are not handlers and not in here.
   */
  let navigation: Navigation[] = [];
  /** What the live map was last set to — null until the first `applyInteractive`,
   *  so the boot is told apart from a real change. Plain: a record, not an input. */
  let applied: boolean | null = null;
  /** Bumped when the map is handed back to the page, so the camera effect looks
   *  again even when nothing else it reads has changed. See `applyInteractive`. */
  let handedBack = $state(0);

  /** The live camera is where this component last put it. Within a millionth:
   *  a flight that landed and a jump both end on the exact target. */
  const isAt = (instance: MapInstance, camera: Camera) => {
    const c = instance.getCenter();
    return (
      Math.abs(c.lng - camera.lng) < 1e-6 &&
      Math.abs(c.lat - camera.lat) < 1e-6 &&
      Math.abs(instance.getZoom() - camera.zoom) < 1e-6
    );
  };

  /** One of this map's navigation handlers is active. For the wheel that is
   *  from maplibre's first zoom frame until 200ms after its ease settles,
   *  which is exactly the window whose end fires `zoomend`. */
  function handlerActive(instance: MapInstance) {
    return navigation.some((name) => handler(instance, name).isActive());
  }

  /** A visitor's gesture is moving this map right now: a handler is active,
   *  or a +/− press is still easing (`stepping`). False with no map. A
   *  function declaration so the effect above, which runs long after this
   *  script, can call it by name. */
  function gestureInProgress(instance: MapInstance | null) {
    return instance !== null && (stepping !== null || handlerActive(instance));
  }

  /**
   * TURN THE WHOLE INTERACTION SET ON OR OFF (`interactive`), and nothing in it
   * one piece at a time.
   *
   * GOING OFF IS THE HOMEPAGE BAND'S PLAY BUTTON, and four things happen then
   * beyond the switches, each because leaving it out was a way for the map to
   * be left in a state nobody can get it out of:
   *
   *  1. WHAT IS IN PROGRESS ENDS FIRST. A drag or a wheel's zoom ease still
   *     running when its handler is disabled is never told to stop — maplibre
   *     skips a disabled handler — so `moveend` would never fire for it.
   *     `map.stop()` ends every gesture and any ease, UNLESS a flight of this
   *     component's is in the air and no gesture is active: that one is the
   *     page's own camera, and it lands where `commanded` says.
   *  2. THE SUSPENSION ENDS. A gesture while paused set `drivenAt`, and a
   *     suspension survives the clock's turns (`activeBy: "auto"`, #118) — so
   *     without this, Play would resume the photos under a map that no longer
   *     follows them.
   *  3. THE VISITOR'S ZOOM IS FORGOTTEN (`chosenZoom`). A locked map is the
   *     slideshow's picture again, framed the slideshow's way; carrying a zoom
   *     nobody can now change would be a setting with no control. The
   *     operator's call to reverse, and one line.
   *  4. THE CAMERA GOES BACK TO THE SLIDE ON SCREEN. `commanded` is what this
   *     component last TOLD the map, so after a pan it still says "arrived" at
   *     the listing the visitor panned away from; forgetting it when the live
   *     camera is somewhere else is what makes the next look a flight. The
   *     bump is what makes there BE a next look.
   *
   * The pin sheet closes too: it is a detail of a listing the slideshow is
   * about to turn away from, drawn by a press that is no longer possible.
   *
   * GOING ON does only the switches. Nothing is in progress on a locked map,
   * and the camera is already where the slideshow put it.
   */
  function applyInteractive(instance: MapInstance, on: boolean) {
    if (applied === on) return;
    const locking = applied === true;
    applied = on;
    if (locking && (gestureInProgress(instance) || !flying)) instance.stop();
    for (const name of navigation) {
      const h = handler(instance, name);
      if (h.isEnabled() === on) continue;
      if (on) h.enable();
      else h.disable();
    }
    // Focus and name. maplibre gives the canvas `tabindex="0"` and names it
    // "Map" in its constructor; a locked canvas takes no focus at all (not
    // -1, which a click would still land on) and must not announce itself as
    // interactive while it is not.
    const canvas = instance.getCanvas();
    if (on) canvas.setAttribute("tabindex", "0");
    else canvas.removeAttribute("tabindex");
    canvas.setAttribute(
      "aria-label",
      on ? `${label} listings, interactive map` : `${label} listings, map`,
    );
    // The grab cursor is maplibre's `.maplibregl-interactive` on this element;
    // the touch-action classes follow `dragPan` / `touchZoomRotate` by
    // themselves, which is what gives a finger's swipe back to the page.
    instance.getCanvasContainer().classList.toggle("maplibregl-interactive", on);
    if (!locking) return;
    selected = null;
    drivenAt = undefined;
    releaseDue = false;
    stepping = null;
    chosenZoom = null;
    shortfall = 0;
    if (!flying && commanded && !isAt(instance, commanded)) commanded = null;
    handedBack += 1;
  }

  const measured = $derived(box.height > 0);
  /** The control column's target and painted box — the split Nav.svelte and
   *  Modal.svelte use. The ring is on the painted box (see the markup). */
  const CONTROL_TARGET =
    "group grid h-11 w-11 cursor-pointer place-items-end bg-transparent pr-[10px] pb-[10px] focus-visible:outline-none";
  const CONTROL_PAINTED =
    "grid h-[20.88px] w-[20.884px] place-items-center rounded-[2px] bg-primary text-light group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary group-aria-disabled:opacity-40";
  /**
   * WHICH FRAME THIS BOX IS — and, since the operator's call of 2026-09-29,
   * which CONTROLS an in-page map carries. "On phones, drop + and −
   * (pinch-zoom covers it) and keep only expand, plus the (i) credit": "do
   * option two, happy not to have the zoom buttons on mobile since we've
   * thumbs".
   *
   * "Phone" is this, not a second test. `frameFor` is already this file's
   * only notion of a small map — it is the box's own measured height, it is
   * what picks the 22px pin, the compact raster and the camera — and a
   * /properties map crossing `lg` is `full` above it and `compact` below.
   * The expanded overlay is the window, which is NOT always a full frame: a
   * window under COMPACT_MAX_HEIGHT (a landscape phone, 800 x 280) makes it
   * `compact`. So the controls read `fullControls`, below, and not this.
   *
   * What it clears (#182, #188): the − target sat over the Seguin land pin
   * on 358–445px compact maps, and the whole credit chip over the downtown
   * cluster of 3 (#188 measured 265–545 on the live site; guard 2i's 224px
   * chip gives 265–457) and over the Loop 1604 at Dove Canyon pin (265–608,
   * which no issue named). src/lib/property-map.test.ts's plan guard 2i walks
   * both frames' furniture at every compact width from 265 and finds none.
   *
   * Before the box is measured it reads `compact` (a 0 × 0 box is under 300),
   * which nothing draws against: the control column waits for `measured`, and
   * MapLibre is not constructed until the box is on screen.
   */
  const frameName = $derived(frameFor(box));
  const frame = $derived(MAP_FRAMES[frameName]);
  /** + and − and the whole credit chip: a full frame, and the expanded overlay
   *  at every window height. The overlay is a phone's single-pointer way to
   *  zoom out (WCAG 2.5.1: a pinch is two pointers and a double-tap only zooms
   *  in), and a resize inside it must not take a focused control away. */
  const fullControls = $derived(expanded || frameName === "full");

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
      handOver();
      return;
    }
    const guard = setTimeout(handOver, MAP_HOME_FADE_MS * 10);
    return () => clearTimeout(guard);
  });
  /** Removes the picture, and with it its credit's two links — so a keyboard
   *  standing on one is first moved to the live credit's. */
  function handOver() {
    const held = document.activeElement;
    const picture = boxEl?.querySelector("[data-map-home-credit]");
    if (held instanceof HTMLAnchorElement && picture?.contains(held)) focusCredit(held.href);
    handedOver = true;
  }
  /**
   * Focus onto the live credit: its link to `href` (else its first) while its
   * line is showing, else its (i). For focus on credit furniture that is about
   * to be removed or hidden — the picture's credit at the hand-over, a credit
   * swapped when `fullControls` changes, a compact line collapsing — which
   * would otherwise drop a keyboard to <body>.
   */
  function focusCredit(href: string | null) {
    const live = canvasHost?.querySelector(".maplibregl-ctrl-attrib");
    if (!live) return;
    const line =
      !live.classList.contains("maplibregl-compact") ||
      live.classList.contains("maplibregl-compact-show");
    const links = [...live.querySelectorAll("a")];
    const target = line
      ? (links.find((a) => a.href === href) ?? links[0])
      : live.querySelector("summary");
    target?.focus();
  }
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
   * true there: the band opens on MAP_HOME and FLIES to slide 0 once the
   * picture has been handed over (`pictureUp` on `CameraState`, #132 — the
   * flight used to start on the first frame after `load`, which is INSIDE the
   * cross-fade, and put two cameras on screen at once). That is the
   * operator's own ask read plainly —
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
   *
   * `listing` says which of those it is, for `onListing`: only the one-point
   * fit is a listing's camera.
   */
  function camera(): { start: Camera | null; listing: boolean } {
    const opening = home?.[frameFor(box)];
    if (opening) return { start: opening, listing: false };
    const target = activeTarget(active, points) ?? null;
    return {
      start: fitCamera(target ? [target] : points, box, {
        padding: frame.padding,
        maxZoom: frame.maxZoom,
      }),
      listing: target !== null,
    };
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

    const { start, listing } = camera();
    commanded = start;
    onListing = listing;
    const instance = new maplibre.Map({
      container: host,
      style: styleUrl,
      center: start ? [start.lng, start.lat] : [0, 0],
      zoom: start ? start.zoom : 1,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      // The comp's map is flat and north-up; nothing on this site reads a
      // bearing, and a rotated map is a way to get lost on a 200px box. The
      // keyboard's Shift+arrows and the two-finger twist are switched off
      // below, once the instance exists (#154).
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // THE WHEEL BELONGS TO THE MAP. OPERATOR CALL, AND A REVERSAL of what
      // shipped the day before (see the journal entry for this change, and the
      // 2026-09-22 entry it supersedes in part): "if you scroll on the map it
      // should zoom in and out rather than scrolling the whole page".
      //
      // NOTHING IN THE OLD REASONING BECAME FALSE — it was outranked.
      // maplibre-gl 6.10.0's `ScrollZoomHandler.wheel` still ends in an
      // unconditional `preventDefault()`, so every wheel event that reaches
      // this map is taken from the document, and the box is still `lg:sticky`
      // for its whole section, so the obstacle still follows the visitor. What
      // it costs is bounded by the operator's second call, the same day: a
      // wheel belongs to whatever its SCROLL began on (`wheelRun`, and the
      // latch beside `forwardWheel` below), so a visitor scrolling the page
      // scrolls past this map and only a scroll that begins on it zooms it.
      //
      // ONE THING IS WORTH KNOWING AT THE CALL SITE: for a scroll that BEGINS
      // on the map, the trap is still UNBOUNDED. That `preventDefault()` does
      // not ask whether the zoom it is about to apply will be clamped, so a map
      // already at `maxZoom` 16 or `minZoom` 3 keeps eating that scroll and
      // never hands the leftover back to the page (measured: five more notches
      // at either bound move the page 0). The way out is to stop and move the
      // pointer, or the keyboard.
      //
      // THIS OPTION IS THE SETTING'S STARTING STATE. The `$effect` keyed off
      // `expanded` that used to turn it on and off is gone; what turns it off
      // now is `interactive` (`applyInteractive`), the homepage band's lock.
      // What makes the wheel reach it everywhere a visitor can aim is
      // `forwardWheel`, below.
      scrollZoom: true,
      attributionControl: false,
      // Belt to `$lib/transitions`' braces below: told the preference, MapLibre
      // collapses every easeTo/flyTo of its own to a jumpTo.
      reduceMotion: $reducedMotion,
    });
    map = instance;
    // #154. The handlers stay ENABLED — `touchZoomRotate.enable()` respects
    // this flag — so the lock's `navigation` set is unchanged.
    instance.keyboard.disableRotation();
    instance.touchZoomRotate.disableRotation();

    // THE CREDIT, one of two kinds by `fullControls` — the whole chip on a
    // full frame and in the expanded overlay, MapLibre's compact credit on an
    // in-page compact map (the whole line, then its (i)) — and swapped when
    // that changes (the `$effect` on `fullControls` below).
    //
    // WHY NOT MAPLIBRE'S OWN `compact: undefined`. That is "compact when the
    // container is ≤ 640 wide", which is not this file's frame: the 1440
    // /properties panel is 392 wide and would collapse too, and a compact
    // /properties map at 768 is 689 wide and would not. The frame is height.
    //
    // WHY IT IS RE-ADDED RATHER THAN RE-CLASSED. `compact` is read once, at
    // construction, and MapLibre re-applies its own reading on every `resize`
    // (`_updateCompact`): a `compact: false` control strips the compact
    // classes whenever the map is over 640 wide, and a `compact: true` one
    // puts them back whenever they are missing. Toggling the classes on one
    // control fights that; a control built for its frame agrees with it.
    //
    // THE OPEN WINDOW, AND HOW LITTLE OF IT IS OURS. Operator's call,
    // 2026-09-29, "option A": a compact map shows the WHOLE line at first and
    // collapses it to the (i) on the visitor's first pan, zoom or press, or
    // after MAP_CREDIT_OPEN_MS, whichever comes first — the three ways the OSMF
    // safe harbour lets an interactive map collapse its credit (quoted on the
    // constant). Measured against maplibre-gl 6.10.0 on /properties at 390
    // before a line of this was written, a `compact: true` control left alone:
    //
    //   at the first frame    the whole line: the first time the control has
    //                         text it adds `open` and `maplibregl-compact-show`
    //                         itself (0.9-1.8s BEFORE `load`, on a canvas still
    //                         transparent, so `load` is when a visitor sees it)
    //   a drag                collapsed (`_updateCompactMinimize`), but `open`
    //                         left on the <details>, so the (i) still reports
    //                         itself expanded
    //   a wheel zoom          still open
    //   a double-click zoom   still open
    //   6.3s later, untouched still open — it has no clock
    //
    // So the first row is maplibre's and is left to it, and what this adds is
    // the rest: the clock, zoom, a press, and the `open` a drag leaves behind.
    // `collapse` is the state maplibre's own drag leaves minus that `open`, and
    // `settled` makes it permanent: once the window has closed, a compact
    // credit placed later (a phone map expanded and collapsed again, a
    // /properties map crossing `lg`) starts as the (i) — marked
    // `maplibregl-compact` as it is added, and maplibre's `_updateCompact` then
    // sees a compact credit and leaves it alone. Pressing the (i) is
    // maplibre's own toggle from there, open and shut. A window still open when
    // the frame changes stays open, and the clock that was already running
    // closes it.
    //
    // The accepted cost, the operator's own: for those seconds the line sits
    // where the (i) will be, over the downtown cluster (#188) — plan guard 2i
    // in src/lib/property-map.test.ts describes the map after the window.
    let credit: {
      control: InstanceType<MapEngine["AttributionControl"]>;
      compact: boolean;
    } | null = null;
    let settled = false;
    const collapse = () => {
      if (!credit?.compact) return;
      const el = host.querySelector(".maplibregl-ctrl-attrib");
      const held = !!el?.contains(document.activeElement);
      el?.classList.add("maplibregl-compact");
      el?.classList.remove("maplibregl-compact-show");
      el?.removeAttribute("open");
      if (held) focusCredit(null);
    };
    placeCredit = (compact: boolean) => {
      if (credit?.compact === compact) return;
      const held = host.querySelector(".maplibregl-ctrl-attrib")?.contains(document.activeElement)
        ? document.activeElement
        : null;
      if (credit) instance.removeControl(credit.control);
      const control = new maplibre.AttributionControl({ compact });
      // Bottom-LEFT: the control column owns bottom-right, and a licence
      // notice may not be the thing a finger covers.
      instance.addControl(control, "bottom-left");
      credit = { control, compact };
      if (settled) collapse();
      if (held) focusCredit(held instanceof HTMLAnchorElement ? held.href : null);
      // A press on the (i) is the safe harbour's "dismiss interaction", and
      // from then on the credit is the visitor's to open and shut — so it
      // ends the window without collapsing anything itself. maplibre's own
      // toggle has already run (it listened first), and the <summary>'s
      // native toggle of `open` runs after both; a `collapse` here would
      // take `open` off before that toggle put it straight back on, over a
      // hidden line. Without this, a visitor who shut the line and opened it
      // again inside the window had the clock shut it on them.
      host
        .querySelector(".maplibregl-ctrl-attrib-button")
        ?.addEventListener("click", endWindow, { once: true });
    };
    const endWindow = () => {
      settled = true;
      clearTimeout(creditClock);
    };
    const settle = () => {
      if (settled) return;
      endWindow();
      collapse();
    };
    settleCredit = settle;
    placeCredit(untrack(() => !fullControls));

    // MapLibre names the canvas "Map" and gives it role="region", so two maps
    // on the Properties page would be two identically named landmarks. The
    // name is `applyInteractive`'s now, because it depends on whether the map
    // is one; that call is also what takes the inventory it switches.
    //
    // HERE, at construction, and not first in the effect that follows
    // `interactive`: that effect next runs when `ready` flips, and until then
    // a locked band's canvas would sit in the tab order, focusable and named
    // "interactive", under the placeholder picture.
    navigation = NAVIGATION.filter((name) => handler(instance, name).isEnabled());
    applyInteractive(
      instance,
      untrack(() => interactive),
    );

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
    // starts looks programmatic. This note used to go on to say that was why a
    // visitor's own zoom was thrown away at the very next card crossing. It
    // was not, and the 2026-09-23 entry measures why: the crossing ends the
    // suspension whether or not the wheel was counted, and the flight then
    // went at the frame's zoom. See the wheel listener below and `chosenZoom`.
    //
    // So the predicate is in two halves, one for each of those rows.
    //
    // The same two halves are the visitor's first pan or zoom for the credit
    // (`settle`): a pinch, a drag, a double-tap and the keyboard come through
    // the tagged `movestart`, the wheel through the listener below.
    instance.on("movestart", (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return;
      drivenAt = active;
      settle();
    });
    // The untagged half, AND IT IS LOAD-BEARING NOW. It was written when the
    // in-page map declined the wheel, and was noted as inert on the pages where
    // a camera runs. With `scrollZoom: true` every wheel that reaches this
    // container zooms the map — `forwardWheel` re-dispatches here the ones
    // that land on a marker — so every one of them IS the visitor driving it,
    // and this is the only thing that says so: maplibre's `movestart` for a
    // wheel zoom carries no `originalEvent` (the table above).
    //
    // WHAT IT HOLDS, which is less than the old comments here implied. It
    // suspends the camera until the visitor asks for a different listing, and
    // on /properties the next card crossing IS that ask — so on its own this
    // listener never kept a wheel zoom past a crossing. `chosenZoom` is what
    // carries the zoom across; this is what makes `chosenZoom` record it, and
    // what holds the view on the homepage band while its clock (not the
    // visitor) turns.
    //
    // `isEnabled()` is load-bearing again: scroll-zoom is off on the homepage
    // band's map while its slideshow runs (`interactive`), and a wheel over a
    // locked map is the page's, not the visitor driving the map.
    instance.getCanvasContainer().addEventListener(
      "wheel",
      () => {
        if (!instance.scrollZoom.isEnabled()) return;
        drivenAt = active;
        settle();
      },
      { passive: true },
    );
    // A press on the map that neither pans nor zooms it — maplibre's `click`,
    // which it does not fire for a drag. A press on a PIN never reaches
    // maplibre (the pins are ours, over its canvas), so `press` settles too.
    instance.on("click", settle);
    // THE VISITOR'S ZOOM, RECORDED — see `chosenZoom` for the three rules and
    // the defect behind each. One listener per event, in maplibre's order: a
    // move's `zoomend` fires before its `moveend`, in the same call, so the
    // zoom is recorded before the suspension it was chosen in can end.
    instance.on("zoomend", (e: unknown) => {
      if (ownMove(e)) {
        // The camera's own move ending, which is never the visitor's zoom.
        // Landed, no handler is active and it is on target: nothing to note.
        // Stopped by a gesture, the handler that stopped it IS active at this
        // moment (maplibre stops the flight because it went active), and the
        // gap is how far the arc was from where it was going. A +/− press is
        // not asked: it steps from the flight's target itself (`zoomBy`).
        if (commanded && handlerActive(instance)) shortfall = commanded.zoom - instance.getZoom();
        // Mutated, removing this `return` stays green: what it would record is
        // this flight's own zoom plus its own gap, i.e. `commanded.zoom`, which
        // is already what gets carried. It is the rule, stated, not a guard.
        return;
      }
      if (drivenAt !== undefined && onListing) chosenZoom = instance.getZoom() + shortfall;
    });
    // THE END OF A GESTURE THE VISITOR ASKED PAST (`releaseDue`). Not the
    // camera's own `moveend`, without saying so: a flight of ours cannot be in
    // the air while `releaseDue` is set, because the gesture it waits on is
    // what stopped it. A `moveend` with a handler still active — a `resize()`
    // mid-ease — is not the end of anything. A +/− ease's own `moveend` is its
    // end, so `stepping` clears first.
    instance.on("moveend", (e: { originalEvent?: unknown } | undefined) => {
      if (stepping && e?.originalEvent === stepping) stepping = null;
      if (!releaseDue || gestureInProgress(instance)) return;
      releaseDue = false;
      drivenAt = undefined;
    });
    instance.on("move", reposition);
    instance.on("zoom", () => {
      zoom = instance.getZoom();
      reposition();
    });
    instance.on("load", () => {
      zoom = instance.getZoom();
      ready = true;
      void tick().then(reposition);
      // The credit's clock starts at the first frame — see MAP_CREDIT_OPEN_MS
      // for why not at page load. The fade that brings the canvas up is 300ms
      // of it with motion allowed, and none under reduced motion.
      creditClock = setTimeout(settle, MAP_CREDIT_OPEN_MS);
    });
  }

  function destroy() {
    map?.remove();
    map = null;
    placeCredit = null;
    settleCredit = null;
    clearTimeout(creditClock);
    ready = false;
    // A re-boot gets a map that has been told nothing yet, and one nobody has
    // driven — both of these describe the instance, not the visitor.
    sized = { width: 0, height: 0 };
    commanded = null;
    onListing = false;
    drivenAt = undefined;
    releaseDue = false;
    stepping = null;
    chosenZoom = null;
    shortfall = 0;
    // A re-boot takes its own inventory and is its own first apply.
    navigation = [];
    applied = null;
    // The map that flight belonged to is gone. Without this the timer would
    // outlive the component and fire `landed += 1` on a destroyed one.
    endFlight();
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

  /**
   * THE MARKERS ARE HOLES IN THE MAP, AND THIS FILLS THEM — the reason the
   * operator's reversal is not one line.
   *
   * maplibre's HandlerManager listens for `wheel` on `map.getCanvasContainer()`
   * and nowhere else. Every overlay this component draws — the marker
   * `<button>`s, the pin sheet, the expand affordance, the attribution chip,
   * the focused list link — is outside that container, painted over it, so a
   * wheel that lands on one never reaches maplibre and the browser scrolls the
   * page with it instead. On a map whose camera pans the markers under a
   * pointer that has not moved, which of the two a visitor gets on the next
   * notch is decided by whatever happens to be under the cursor. The journal
   * entry for this change has the per-notch measurement.
   *
   * ON THE ROOT, so it covers every overlay rather than the markers it was
   * found on: that is the class, and the markers are one instance of it. A
   * wheel that started inside the canvas container is left alone — maplibre
   * already has it and prevents it itself. Anything else is taken from the
   * page and re-dispatched on the container, where maplibre's listener and
   * this component's own `wheel` listener both are, so a wheel on a pin
   * suspends the camera exactly as a wheel on the tiles does.
   *
   * A SYNTHETIC WHEEL EVENT PERFORMS NO DEFAULT ACTION — untrusted events
   * never do — so the re-dispatch cannot scroll the page a second time as it
   * bubbles back up through here (where `contains` sends it on its way). The
   * `preventDefault()` is what stops the real one, and it holds because this
   * is a plain element listener: Svelte 5.56 neither delegates `wheel` nor
   * makes it passive (`DELEGATED_EVENTS` / `PASSIVE_EVENTS` in svelte's
   * utils.js), and the browser's passive-by-default rule covers `window`,
   * `document` and `body`, not a `<div>`.
   *
   * NOT BEFORE THE FIRST FRAME. Until `ready` the canvas host is
   * `pointer-events-none opacity-0` and the box is showing either the list or
   * #122's committed picture, so there is nothing on screen for a wheel to
   * zoom — but the maplibre instance already exists, and forwarding to it
   * would zoom a map nobody can see, under a picture that says otherwise, and
   * take the page's scroll in exchange for nothing visible at all. So until
   * the map is drawn the wheel is left to the page, as it is with
   * `engine: "off"`.
   */
  function forwardWheel(e: WheelEvent) {
    const instance = map;
    if (!instance || !ready) return;
    // Only what maplibre would take. With scroll-zoom off its own `wheel`
    // returns before `preventDefault()` and the page scrolls over the tiles;
    // taking the page's scroll over a MARKER then would be the same hole the
    // other way round.
    if (!instance.scrollZoom.isEnabled()) return;
    const container = instance.getCanvasContainer();
    if (e.target instanceof Node && container.contains(e.target)) return;
    e.preventDefault();
    container.dispatchEvent(
      new WheelEvent("wheel", {
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  /**
   * THE WHEEL STAYS WITH WHATEVER THE SCROLL STARTED ON (operator call,
   * 2026-09-23, choosing the mitigation the scroll-zoom PR recommended).
   *
   * THE DEFECT, measured on a production build of /properties at 1440x900
   * with the pointer resting on the land map's column and 120px notches from
   * scrollY 0: the page stopped at 480 (pointer at y 150), 120 (y 405) — the
   * notch after the map slid under a pointer that had not moved went to the
   * map, which zoomed and `preventDefault()`ed it, and so did every notch
   * after. 4430 of the map's 4490px of pinned travel was out of the wheel's
   * reach. A visitor scrolling the page was stopped dead by a map they never
   * aimed at.
   *
   * THE RULE: every wheel event on the page is filed into a run (`wheelRun`,
   * $lib/property-map, where the two thresholds are argued), and a run that
   * did not BEGIN over this map, while this map was taking the wheel, is not
   * this map's — however much of it the map slides under. Such a wheel is
   * stopped at the map's root on the way DOWN (capture), so maplibre's
   * listener on the canvas container, this file's own suspension listener
   * beside it and `forwardWheel` on the way back up never see it; nothing
   * prevents it, so the page scrolls. A run that began over the map is left
   * alone and zooms, exactly as before.
   *
   * A WHEEL THAT CANNOT BE CANCELLED IS THE PAGE'S, ALWAYS — and that was
   * found measuring this, not designed in. Where the pointer is over nothing
   * with a blocking wheel listener, Chromium sends the wheel to the page
   * without waiting (`cancelable: false`) and the compositor starts scrolling
   * at once; the main thread hit-tests for the DOM target LATER, against the
   * page as it is by then. At 1440x900 with the pointer at y 405, 6 of 8 runs
   * delivered the FIRST notch — sent at scrollY 0, over the page, where
   * `elementFromPoint` had just answered the page — to the map's canvas, with
   * scrollY already 120 at dispatch: the map had slid under the pointer
   * before its own hit test ran. Filed as a run begun over the map, it made
   * every later notch the map's (the page stopped at 120); and maplibre's
   * `preventDefault()` on it was a no-op, so the map ZOOMED while the page
   * scrolled. That second half is older than this rule: the same shape, y 405
   * stopping at 120, is in the measurement that asked for it.
   * So an uncancellable wheel neither begins a run of this map's nor reaches
   * maplibre: the browser has already given it to the page, and the only thing
   * delivering it could still do is move the map as well.
   *
   * WHY `stopPropagation`, AND WHAT IT COSTS. maplibre listens on an element
   * INSIDE this one, so the root's capture phase is the last place anything of
   * ours runs before it does — there is no way to keep a wheel from maplibre
   * but to not deliver it. (Where the root is itself the target, the DOM's
   * at-target dispatch runs capture listeners first and checks the stop flag
   * before the bubble ones, so `forwardWheel` does not see it either — the
   * latch's unit case wheels the root itself and reads `defaultPrevented`
   * false.) The cost is that a listener on `window` or
   * `document` in the BUBBLE phase does not see that one wheel either. The
   * only one in this app is vimeoBackground's first-engagement listener,
   * which by then has long since fired on the pointer moving. Both listeners
   * here are passive: neither can hold up the compositor's scroll.
   *
   * The window listener is on EVERY wheel, not only the ones over this map,
   * because a run's beginning is usually somewhere else — that is the case
   * this exists for.
   */
  let run: WheelRun | null = null;

  /** This map would take a wheel that reached it right now: drawn, and
   *  scroll-zoom on (it is off whenever `interactive` is). */
  const takesWheel = () => map !== null && ready && map.scrollZoom.isEnabled();

  $effect(() => {
    const root = boxEl;
    if (!root) return;
    const track = (e: WheelEvent) => {
      run = wheelRun(
        run,
        e,
        () => e.cancelable && takesWheel() && e.target instanceof Node && root.contains(e.target),
      );
    };
    const withhold = (e: WheelEvent) => {
      if ((!run?.mine || !e.cancelable) && takesWheel()) e.stopPropagation();
    };
    window.addEventListener("wheel", track, { capture: true, passive: true });
    root.addEventListener("wheel", withhold, { capture: true, passive: true });
    return () => {
      window.removeEventListener("wheel", track, { capture: true });
      root.removeEventListener("wheel", withhold, { capture: true });
      run = null;
    };
  });

  // THE SWITCH, once the engine exists. `boot` applies the value the map was
  // built under; this follows it from then on — the band's Pause and Play.
  // `ready` is read for its DEPENDENCY, not its value: `map` is plain, so
  // without it this would never re-run after boot.
  $effect(() => {
    const on = interactive;
    void ready;
    const instance = map;
    if (!instance) return;
    untrack(() => applyInteractive(instance, on));
  });

  function press(cluster: MapCluster) {
    const instance = map;
    if (!instance) return;
    // A press on a marker is a press on the map: the credit's open window ends.
    settleCredit?.();
    if (cluster.points.length === 1) {
      const point = cluster.points[0]!;
      // The caller that draws its own detail takes the press instead. It must
      // NOT also set `active` from here: the one rule that decides which
      // listing is active is the caller's, and a press that wrote it directly
      // would be a second mechanism racing the first. So this only reports the
      // press; on /properties the caller scrolls that card to the centre and
      // the centre rule does the rest.
      const report = onselect;
      if (report) {
        selected = null;
        // Pressed inside the expanded overlay: close it onto the card (D4).
        // The report waits a tick so the scroll lock is off and the card is
        // back in flow when the caller scrolls it into view.
        if (expanded) {
          collapsingForPin = true;
          expanded = false;
          void tick().then(() => report(point.id));
          return;
        }
        report(point.id);
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

  // The zoom a +/− press leaves from, and why it is not always `getZoom()`:
  // over a flight of ours still in the air that is the arc's waypoint, so the
  // step goes from where the flight was GOING (`chosenZoom`'s rule 2).
  //
  // A press is the visitor driving, like a wheel notch: `drivenAt` here, and
  // `originalEvent` on the ease so `movestart` and `zoomend` read it as theirs.
  // Its ease is a gesture in progress (`stepping`), so a different listing
  // asked for during it waits for its `zoomend`, as a wheel's does (#173).
  // Set before `easeTo`: an ease of 0ms ends, and clears it, inside the call.
  function zoomBy(delta: 1 | -1, e: MouseEvent) {
    const instance = map;
    if (!instance || !ready) return;
    const z = instance.getZoom();
    if (delta > 0 ? z >= MAP_MAX_ZOOM - 1e-6 : z <= MAP_MIN_ZOOM + 1e-6) return;
    if (!interactive) {
      if (!onengage) return;
      onengage();
    }
    drivenAt = active;
    const base = flying && commanded ? commanded : null;
    if (base) endFlight();
    shortfall = 0;
    stepping = e;
    instance.easeTo(
      {
        ...(base ? { center: [base.lng, base.lat] as [number, number] } : {}),
        zoom: Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, (base?.zoom ?? z) + delta)),
        duration: $reducedMotion ? 0 : MAP_ZOOM_STEP_MS,
      },
      { originalEvent: e },
    );
  }

  function toggleExpanded() {
    if (!expanded && !interactive) onengage?.();
    expanded = !expanded;
  }

  // EXPANDED IS ONE FULL-WINDOW OVERLAY AT EVERY WIDTH (M1, operator call
  // 2026-09-28), replacing the in-place growth to min(70dvh, 520px) below lg.
  // The page behind does not scroll, and focus stays in the map until it
  // collapses (Escape, or the button). The spacer holds the map's slot.
  $effect(() => {
    if (!expanded) return;
    return lockBodyScroll();
  });
  /** A pin press closed the overlay (see `press`): focus must not be sent
   *  back to the expand button, whose `focus()` would scroll the page away
   *  from the card the caller is revealing. */
  let collapsingForPin = false;
  const restoreFocus = () => {
    if (!collapsingForPin) return undefined;
    collapsingForPin = false;
    return document.body;
  };

  // The container's box, which is the only thing that decides the frame: a
  // 200px-tall map takes the comp's 22px pin, a 595px one its 48px pin. No
  // viewport media query is consulted anywhere in this file, so the SAME rule
  // covers the expanded state — a phone map grown to the window takes the
  // window's frame: full, unless the window is under COMPACT_MAX_HEIGHT.
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

  // THE ONE PLACE THE CAMERA MOVES after boot — a box change, an `active`
  // change and a flight landing all come through the same door, because
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
      // THE PICTURE IS STILL UP, so `home` above is where the camera belongs
      // whatever is active — the placeholder and the live map are then the
      // same map for the whole cross-fade (#132). Computed from the SAME
      // expression the markup's `{#if home && !handedOver}` uses, so the
      // picture being on screen and the camera being held cannot part company.
      // Read for its dependency as much as for its value: `handedOver`
      // flipping is what re-runs this effect and releases the flight, exactly
      // as the flight timer's own `landed` bump does below.
      pictureUp: home !== null && !handedOver,
      commanded,
      // `cameraMove` answers `in-flight` while this is true and the move would
      // have been a flight. The re-ask is the LINE BELOW, not this one:
      // `flying` is a plain variable and cannot wake anything.
      flying,
      // How close a flight to a listing lands, once the visitor has said.
      zoom: chosenZoom,
    };
    // READ FOR ITS DEPENDENCY, NOT FOR ITS VALUE — the whole coalescing
    // mechanism, and the reason it is read here rather than left out. The
    // flight timer bumps `landed`, this effect re-runs, and the flight that
    // goes out is to wherever `active` got to while the last one was in the
    // air. Before the first `return`, like every other reactive read above:
    // Svelte re-tracks dependencies on each run, so a signal read after a bail
    // is not a dependency of the run that bailed.
    void landed;
    // The same, for a map handed back to the page (`applyInteractive`).
    void handedBack;
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
    // WHAT THAT CAMERA IS OF (`onListing`). `cameraMove` answers a listing's
    // own camera exactly when a listing is active and no picture is over the
    // map: an id with no pin never gets this far (`unknown-active`), and under
    // the picture every answer is MAP_HOME, which `pictureUp` implies exists.
    onListing = state.active !== null && !state.pictureUp;
    // A new target is a new baseline for the visitor's zoom. Zeroed BEFORE the
    // command, whose `jumpTo` / `flyTo` stops whatever of ours is still in the
    // air and fires that move's `zoomend` synchronously — with no gesture
    // active, so it writes nothing back.
    shortfall = 0;
    const center: [number, number] = [move.camera.lng, move.camera.lat];
    if (move.move === "jump") {
      // A jumpTo stops MapLibre's easing, so anything of ours in the air is
      // over — and a hold left standing after it would refuse the next flight
      // for up to 500ms for a flight that is not happening.
      endFlight();
      instance.jumpTo({ center, zoom: move.camera.zoom }, OWN_MOVE);
      return;
    }
    // No `essential: true`. That flag exists to override the browser's
    // reduced-motion preference, and this animation is decoration on a scroll
    // the visitor is already driving — exactly the kind that must obey it.
    // `cameraMove` has already answered `jump` in that case; not passing
    // `essential` is the second brace, since the map is constructed with
    // MapLibre's own `reduceMotion`.
    //
    // `OWN_MOVE` rides on every event this flight fires, its stop included, so
    // its `zoomend` is never taken for the visitor's (`chosenZoom`).
    instance.flyTo({ center, zoom: move.camera.zoom, duration: CAMERA_FLIGHT_MS }, OWN_MOVE);
    beginFlight();
  });

  $effect(() => {
    void clusters;
    void tick().then(reposition);
  });

  $effect(() => {
    void expanded;
    void tick().then(() => map?.resize());
  });

  // THE CREDIT FOLLOWS `fullControls`: expanding a phone map, collapsing it,
  // or a /properties map crossing `lg`. It is a boolean, so this runs when it
  // changes and not on every resize. Before the map exists `placeCredit` is
  // null and this does nothing — `boot` places the first one itself, reading
  // it after its `await`, so a change while the engine was loading is not
  // missed.
  $effect(() => {
    const compact = !fullControls;
    placeCredit?.(compact);
  });

  // + and − go with `fullControls` (a map crossing `lg`), before the DOM does:
  // a keyboard on one is moved to expand rather than dropped to <body>.
  $effect.pre(() => {
    if (fullControls) return;
    const held = document.activeElement;
    if (held?.matches("[data-map-control^='zoom']") && boxEl?.contains(held))
      boxEl.querySelector<HTMLElement>("[data-map-expand]")?.focus();
  });

  // (The `$effect` that used to hand scroll-zoom to the EXPANDED map and take
  // it back on collapse lived here. It is gone, not moved: the in-page map now
  // takes the wheel in every state, so the effect's two branches had become
  // `enable()` and `enable()`. `boot`'s `scrollZoom: true` is the whole
  // setting now, and the comment there says so.)

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
    // fold on the homepage — at 1455x900 the hero was 1007 tall and the map
    // slot's top at y = 1007 when this was measured (921 for both since the
    // revised one-column hero of 2026-09-28, with the seeded copy), so ZERO
    // pixels of it are on screen at rest.
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
    // 1440x900 the homepage band needed about 520px of scroll rather than 107
    // (434 rather than 21 since the revised hero, measured on /dev/home) —
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
    if (e.key !== "Escape") return;
    if (selected) selected = null;
    else if (expanded) expanded = false;
  }}
/>

{#if points.length > 0}
  {#if expanded}
    <div aria-hidden="true" data-map-spacer class={passedClasses}></div>
  {/if}
  <div
    bind:this={boxEl}
    use:trapFocus={{ enabled: expanded, restoreFocus }}
    role={expanded ? "dialog" : undefined}
    aria-modal={expanded ? "true" : undefined}
    aria-label={expanded ? `${label} map` : undefined}
    data-property-map
    data-map-ready={ready ? "" : undefined}
    data-map-home={home ? "" : undefined}
    data-expanded={expanded ? "true" : undefined}
    data-map-locked={ready && !interactive ? "" : undefined}
    onwheel={forwardWheel}
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
            onfocus={() => (heldLink = point.id)}
            onblur={() => {
              if (heldLink === point.id) heldLink = null;
            }}
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
         ONLY THE MATCHING LAYER IS FETCHED, and the mechanism is that the
         other layer HAS NO IMAGE — not that its image is hidden. This read
         "a background image on a `display: none` element is not requested",
         which is a claim about an optimisation rather than about the cascade,
         and it was false here: with `background-image` in both layers' inline
         `style` a production build fetched BOTH rasters on 4/16 loads of
         /properties at 1440, 8/16 at 390 and 16/16 of the homepage band at
         1440 (#133). The first style pass runs before the container has a
         size, so neither rule matches and nothing is `display: none` yet.
         The URL now comes from the SAME rule that grants `display: block`, so
         the losing layer never has an image to request at any point in the
         cascade: a phone pays 27.4 KB and a desktop 78.3 KB, never both.
         The two `--map-home-*` custom properties are written from
         `MAP_HOME[key].file` below, so the filename still has one source.
         The camera is fixed, so the box's centre pixel is MAP_HOME's
         coordinate at every container size — `background-position: center` at
         the raster's own pixel size (never `cover`, which would scale it and
         break alignment with the tiles), and the markers below are offsets
         from that same centre. -->
    {#if home && !handedOver}
      <!-- `--map-home-ground` is written from the constant rather than typed
           into the stylesheet, so the colour the margin paints and the colour
           `scripts/map-home.test.ts` checks against the style file are the
           same string. A second literal in CSS is a second thing to drift.
           `isolate` keeps its pins' z-index (0, 1 while shrinking, 2 active —
           see "THE ACTIVE PIN GROWS") inside the picture, as the live
           overlay's own `z-[1]` keeps theirs inside it: without it the
           picture's active pin would paint over the live overlay and the
           canvas through the cross-fade. -->
      <div
        data-map-home-box
        aria-hidden="true"
        style="--map-home-ground:{MAP_HOME_GROUND};--map-home-full:url(/{MAP_HOME.full
          .file});--map-home-compact:url(/{MAP_HOME.compact.file})"
        class="pointer-events-none absolute inset-0 isolate"
      >
        {#each homeLayers as layer (layer.key)}
          <div
            data-map-home-frame={layer.key}
            style="background-size:{layer.spec.raster.width}px {layer.spec.raster.height}px"
            class="absolute inset-0"
          >
            {#each layer.markers as marker (marker.id)}
              {@const at = `left:50%;top:50%;transform:translate(${marker.dx}px,${marker.dy}px)`}
              {@const dim = dimFor(marker.ids)}
              {#if marker.point}
                {@const isActive = active !== null && marker.point.id === active}
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
                  data-map-active={isActive ? "" : undefined}
                  data-map-dimmed={dim === undefined ? undefined : ""}
                  style="{at} translate(-50%,-100%)"
                  style:--map-dim={dim}
                  style:--pin-scale={isActive ? ACTIVE_PIN_SCALE : 1}
                  class="pointer-events-auto absolute"
                >
                  <!-- Drawn at the frame's size, always; the active listing's
                       is scaled by the stylesheet (see "THE ACTIVE PIN GROWS"). -->
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
                  data-map-dimmed={dim === undefined ? undefined : ""}
                  style="{at} translate(-50%,-50%);width:{d}px;height:{d}px;font-size:{Math.round(
                    d * 0.42,
                  )}px"
                  style:--map-dim={dim}
                  class="absolute grid place-items-center rounded-full bg-primary font-semibold
                    text-light tabular-nums transition-opacity motion-reduce:transition-none"
                >
                  {marker.count}
                </span>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
      <!-- THE PICTURE'S CREDIT (`MAP_HOME_CREDIT`): the style's own line, whole,
           for as long as the picture is up — and with scripting off that is
           for good. A picture has no gesture to collapse it on and no clock,
           so the OSMF safe harbour wants all of it on screen, on every frame.
           Outside the picture's `aria-hidden` box, because this is the same
           licence notice the live credit puts in the accessibility tree.
           `z-[1]`: over the picture's own active pin (`z-[1]`, earlier in the
           DOM). The canvas comes up over it and the live credit takes over at
           the swap, when this goes with the picture. Toned and sized by the
           live chip's own rule, below. -->
      <!-- eslint-disable-next-line svelte/no-at-html-tags -- a constant, held to the committed style's attribution by scripts/map-home.test.ts -->
      <p data-map-home-credit class="absolute bottom-0 left-0 z-[1] m-0">{@html MAP_HOME_CREDIT}</p>
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
        // THIS ELEMENT'S OWN FADE, and nothing else's (#134). The property is
        // named rather than assumed, and so is the target: `transitionend`
        // BUBBLES, so any descendant that transitions `opacity` would
        // otherwise retire the picture on its own schedule. maplibre-gl.css
        // ships `.maplibregl-marker { transition: opacity .2s }`, which is
        // SHORTER than MAP_HOME_FADE_MS — the day anyone reaches for a real
        // `maplibregl.Marker` the picture would go ~100ms early and the band's
        // #3d0707 would show through a canvas at two-thirds opacity, which is
        // the 0.535164 defect above arriving by a different door. Latent
        // today: the pins are plain SVG and `cooperativeGestures` is off.
        if (e.target === canvasHost && e.propertyName === "opacity" && ready) handOver();
      }}
      style="transition-duration:{MAP_HOME_FADE_MS}ms"
      class="absolute inset-0 transition-opacity motion-reduce:transition-none
        {ready ? '' : 'pointer-events-none opacity-0'}"
    ></div>

    {#if ready}
      <div aria-hidden="true" class="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
        {#each clusters as cluster (cluster.id)}
          {@const count = cluster.points.length}
          {@const isActive = count === 1 && active !== null && cluster.points[0]!.id === active}
          {@const dim = dimFor(cluster.points.map((p) => p.id))}
          <!-- `data-map-pin` carries the LISTING'S OWN ID, not an empty marker.
               A pin is a drawing of one list item, and saying which one costs
               nothing, keeps `[data-map-pin]` matching as a presence selector
               everywhere it already did, and is what lets a browser test assert
               that the ACTIVE listing's pin is the one at the map's centre
               rather than that some pin is. A cluster stands for no single
               listing, so it carries its count instead, as it already did.
               LOCKED (`interactive` false), a pin is `disabled` — no press,
               and no focus even from a click, which `tabindex="-1"` alone
               would still take — and lets the pointer through to the canvas
               under it, whose cursor is then the page's, not a hand. -->
          <button
            bind:this={clusterEls[cluster.id]}
            type="button"
            tabindex="-1"
            aria-hidden="true"
            disabled={!interactive}
            data-map-pin={count === 1 ? cluster.points[0]!.id : undefined}
            data-map-cluster={count > 1 ? count : undefined}
            data-map-active={isActive ? "" : undefined}
            data-map-dimmed={dim === undefined ? undefined : ""}
            style:--map-dim={dim}
            style:--pin-scale={count === 1 ? (isActive ? ACTIVE_PIN_SCALE : 1) : undefined}
            onclick={() => press(cluster)}
            class="absolute top-0 left-0 border-0 bg-transparent p-0
              {count === 1 ? '' : 'transition-opacity motion-reduce:transition-none'}
              {interactive ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none'}"
          >
            {#if count === 1}
              <!-- `np_pin-map_4984332` — see $lib/property-map for the five
                   measured numbers and the tangent construction they imply.
                   Drawn at the frame's size, always: the ACTIVE listing's pin
                   is ACTIVE_PIN_SCALE larger by a transform the stylesheet
                   eases, about its tip (see "THE ACTIVE PIN GROWS"). The
                   button's box stays the drawn-at size, so the anchor above
                   (a percentage of that box) still puts the tip on the point. -->
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
      <!-- `right-[54px]`: the control column's 44px targets on their 10px
           inset keep that strip, so the sheet's × is never under them. -->
      <div
        data-map-sheet
        class="absolute bottom-0 left-0 right-[54px] z-[2] flex items-start justify-between gap-4
          bg-light/95 p-4 text-primary"
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

    {#if measured}
      <!-- THE CONTROL COLUMN, bottom-right on every map (M1, P3): + above −
           above expand, each a 44 x 44 target (WCAG 2.5.8) around a painted
           20.88px garnet box — `np_expand_2178917`'s size, 2px radius, 10px
           from the map's right and bottom edges. The comp draws only the
           expand box, and only at 390; the zoom pair and the 1440 column are
           ours (no comp). The focus ring is on the PAINTED box, in garnet,
           inside the map: on the target it was clipped by the root's
           `overflow-hidden` and toned off-white by the band's `cream` ground,
           ~1:1 on the map. `aria-disabled` at a zoom bound keeps focus on it.
         + AND − ARE FULL-FRAME ONLY (operator, 2026-09-29): a compact map —
         the phone maps — carries expand alone, and a finger pinches. The
         column is bottom-anchored, so expand does not move when they go; the
         expanded overlay has all three at any window height. See
         `fullControls`. -->
      <div data-map-controls class="absolute right-0 bottom-0 z-[3] flex flex-col">
        {#if ready && fullControls}
          <button
            type="button"
            data-map-control="zoom-in"
            aria-label="Zoom in on the {label} map"
            aria-disabled={zoom >= MAP_MAX_ZOOM - 1e-6 ? "true" : undefined}
            onclick={(e) => zoomBy(1, e)}
            class={CONTROL_TARGET}
          >
            <span class={CONTROL_PAINTED}>
              <Plus size={13} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
          <button
            type="button"
            data-map-control="zoom-out"
            aria-label="Zoom out of the {label} map"
            aria-disabled={zoom <= MAP_MIN_ZOOM + 1e-6 ? "true" : undefined}
            onclick={(e) => zoomBy(-1, e)}
            class={CONTROL_TARGET}
          >
            <span class={CONTROL_PAINTED}>
              <Minus size={13} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
        {/if}
        <button
          type="button"
          data-js-only
          data-map-control="expand"
          data-map-expand={expanded ? "collapse" : "expand"}
          data-autofocus={expanded ? "" : undefined}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse the ${label} map` : `Enlarge the ${label} map`}
          onclick={toggleExpanded}
          class={CONTROL_TARGET}
        >
          <span class={CONTROL_PAINTED}>
            {#if expanded}
              <Shrink size={13} strokeWidth={2} aria-hidden="true" />
            {:else}
              <Expand size={13} strokeWidth={2} aria-hidden="true" />
            {/if}
          </span>
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The overlay. Scoped CSS sits outside every layer, so it beats Tailwind's
     `@layer utilities` (`h-50`, `lg:sticky`, `lg:top-…`, `mb-5`) on the root.
     z-70 puts it over the nav (z-50) and the pinned dividers (`lg:z-10`); no
     ancestor of either map sets a z-index or a transform. */
  [data-expanded="true"] {
    position: fixed;
    inset: 0;
    z-index: 70;
    width: auto;
    height: auto;
    margin: 0;
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
     RANGE SYNTAX, and it is not tidiness: `max-height: 299.98px` paired with
     `min-height: 300px` leaves (299.98, 300) matching NEITHER rule, so a box
     landing in it drew no layer at all — a blank ground with an `sr-only` list
     under it. 0.02px wide, never reached, and the upper bound is now
     `frameFor`'s own `< 300` rather than a transcription of it.
     THE LOWER BOUND IS NOT `frameFor`, and it is the half that mattered
     (#133). A container query is evaluated before layout has given the
     container a size, and an unresolved size reads as ZERO — which
     `height < 300px` matches. So the homepage band, whose box ends up 843.44
     tall, requested the COMPACT raster on every single load: 16 of 16, and
     moving the URL into these rules alone did not touch that. `frameFor` is
     never asked about a zero-height box (the component measures first), so
     this excludes a case the function does not have rather than contradicting
     it — and at height 0 there is nothing to paint either way.
     EACH RULE ALSO CARRIES THE IMAGE (#133). `background-image` used to sit in
     both layers' inline `style`, and the request for the layer that loses goes
     out anyway — measured as both rasters fetched on up to 16/16 loads, which
     also made this PR's own byte guard ~50% flaky. A URL that only exists in
     the branch that wins cannot be fetched by the branch that loses, whatever
     the browser does with `display: none`.
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
  @container (0px < height < 300px) {
    [data-map-home-frame="compact"] {
      display: block;
      background-image: var(--map-home-compact);
    }
  }
  @container (height >= 300px) {
    [data-map-home-frame="full"] {
      display: block;
      background-image: var(--map-home-full);
    }
  }

  /* THE ACTIVE LISTING, FEATURED (operator, 2026-09-29). Every marker that is
     not the active listing's — live or in the picture, pin or cluster — is
     drawn at `--map-dim`, which the markup writes from DIMMED_MARKER_OPACITY
     only while this map HAS an active listing (`markerDimmed`); with none, no
     marker carries the attribute and all of them stay at 1. The measurement
     behind the number is on the constant. A marker whose list link has focus,
     or that the details sheet names, is not dimmed at all (`dimFor`).
     A marker under the pointer or with keyboard focus goes back to 1: a
     control that looks disabled while it is being pointed at is lying, and
     `opacity` would dim the focus ring drawn on the element with it.
     The change animates on the SAME clock as the garnet card it follows —
     Tailwind's default duration and easing (`transition-opacity` on a
     cluster, the pin rules below on a pin), exactly what app.css's
     `transition-colors` on the card uses (150ms) — and not at all under
     reduced motion (`motion-reduce:transition-none`, as on the canvas host,
     and the pin rules' own media block). The expanded overlay is this same
     box, so it needs nothing of its own. */
  [data-map-dimmed] {
    opacity: var(--map-dim);
  }
  [data-map-dimmed]:is(:hover, :focus-visible) {
    opacity: 1;
  }

  /* THE ACTIVE PIN GROWS, AND THE ONE IT REPLACES SHRINKS, on the same clock
     as the dim above (operator, 2026-09-29: "the pin scale change needs a
     transition").

     It used to be the SVG's `width`/`height` attributes, 1.5x on the active
     pin, and an attribute swap does not transition: measured on a production
     build of /properties at 1440, the incoming pin was already 72 x 64.86 and
     the outgoing already 48 x 43.23 in the MutationObserver callback that saw
     `data-map-active` move — before a single frame was drawn.

     So every pin is drawn at its frame's size and `--pin-scale` (written from
     ACTIVE_PIN_SCALE on the pin, 1 on the rest) is a TRANSFORM on the SVG,
     which does transition. The origin is the SVG's bottom centre because that
     is the tip: PIN_VIEWBOX stops at PIN_PATH's first point (0.5, 0.901019),
     so the point the pin marks never moves while it grows or shrinks. The
     scale is on the SVG and not on the pin element because the per-frame
     loop owns the pin's own `transform` (every camera frame rewrites it, and
     a transition there would drag every marker 150ms behind the tiles), and
     because the element keeps the dim, the hover and the focus rules exactly
     as they were.

     WHAT A VISITOR CAN PRESS IS WHAT IS DRAWN. The button's box stays the
     frame's size; hit-testing follows the transform, so the scaled SVG is
     pressable across its whole drawn box and nothing outside it is — the
     same box the attribute size gave (elementFromPoint at 1px inside and
     outside each edge, before and after; the journal has the numbers).

     THE RING FOLLOWS THE DRAWING. An outline on the button would now wrap the
     frame-size box, cutting across the top third of a grown pin, and one on
     the SVG would be scaled with it (3px at 3px). So the ring is drawn by
     `::after`, sized from the same `--pin-scale` and eased on the same clock:
     2px at 2px round the drawn pin, at every scale.

     IT STAYS ON TOP IN BOTH DIRECTIONS. The active pin is z 2 from the first
     frame (`step-start`), and the pin it replaces holds z 1 until its shrink
     is over (`steps(1, jump-both)` puts 2 -> 0 at 1 for the whole run) — so a
     pin that is still larger than its neighbours never dips under one, and
     the incoming pin is never under the outgoing one. The containers are
     stacking contexts (the overlay's `z-[1]`, the picture's `isolate`), so
     none of these numbers reach the controls or the sheet.

     Reduced motion: none of it transitions — size, ring and z-order all
     change in one frame, as the dim does. */
  [data-map-pin],
  [data-map-home-pin] {
    z-index: 0;
    transition-property: opacity, z-index;
    transition-duration: var(--default-transition-duration);
    transition-timing-function: var(--default-transition-timing-function), steps(1, jump-both);
  }
  [data-map-pin][data-map-active],
  [data-map-home-pin][data-map-active] {
    z-index: 2;
    transition-timing-function: var(--default-transition-timing-function), step-start;
  }
  [data-map-pin] > svg,
  [data-map-home-pin] > svg {
    transform: scale(var(--pin-scale));
    transform-origin: 50% 100%;
    transition: transform var(--default-transition-duration)
      var(--default-transition-timing-function);
  }
  [data-map-pin]:focus-visible,
  [data-map-home-pin]:focus-visible {
    outline: none;
  }
  [data-map-pin]:focus-visible::after,
  [data-map-home-pin]:focus-visible::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    width: calc(100% * var(--pin-scale));
    height: calc(100% * var(--pin-scale));
    translate: -50% 0;
    outline: 2px solid var(--focus-ring, var(--color-primary));
    outline-offset: 2px;
    pointer-events: none;
    transition-property: width, height;
    transition-duration: var(--default-transition-duration);
    transition-timing-function: var(--default-transition-timing-function);
  }
  @media (prefers-reduced-motion: reduce) {
    [data-map-pin],
    [data-map-home-pin],
    [data-map-pin] > svg,
    [data-map-home-pin] > svg,
    [data-map-pin]:focus-visible::after,
    [data-map-home-pin]:focus-visible::after {
      transition: none;
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
     4.5:1 the palette already measures for that pair (9.38:1). */
  /* OPAQUE, not 88%. Two reasons and they are the same reason. A translucent
     chip over map tiles has no fixed contrast — the ratio depends on whatever
     imagery happens to be under it — and axe says so: it answers
     `color-contrast` for this element and its three links with `incomplete`,
     "Element's background color could not be determined because element
     contains an image node". That incomplete is what forced the whole map
     subtree out of the band's axe run, which in turn silenced axe over the
     OpenStreetMap credit this component argues is a LICENCE CONDITION. At
     100% it is garnet on sand, 9.38:1, measurable and fixed.

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
     `rgb(232, 225, 209)` after (the sand of the time; it has been
     `rgb(234, 231, 228)` since 2026-09-28). It was shipped, not a dev artefact. Every
     consequence the comment above describes was therefore still live — axe
     answered `color-contrast` with `imgNode` incomplete for
     `.maplibregl-ctrl-attrib-inner` and both licence links, on a chip this file
     claimed was opaque. Naming `.maplibregl-ctrl` here makes it (0,3,0) and
     wins on specificity rather than on injection order, which nothing in this
     repo controls. (Found by the axe case in featured-properties.spec.ts once
     that band's map was allowed to finish booting; review of #121.) */
  :global([data-property-map] .maplibregl-ctrl.maplibregl-ctrl-attrib),
  [data-map-home-credit] {
    background-color: var(--color-light);
    color: var(--color-primary);
    font-size: 10px;
    line-height: 1.4;
  }
  /* The whole chip's padding, and ONLY the whole chip's. Written on the rule
     above it beat maplibre's compact geometry too (0,3,0 against
     `.maplibregl-ctrl-attrib.maplibregl-compact`'s 0,2,0): the collapsed
     credit's `2px 24px 2px 0`, which is what makes it a 24 × 24 box with the
     (i) in it, came out `2px 6px` — a 12px sliver with the button hanging off
     its side. The compact credit keeps maplibre's own box, collapsed and open. */
  :global([data-property-map] .maplibregl-ctrl.maplibregl-ctrl-attrib:not(.maplibregl-compact)),
  [data-map-home-credit] {
    padding: 2px 6px;
  }
  /* The picture's credit is the live chip before MapLibre is here to draw it:
     the same box (224 x 18 in this container, guard 2i's chip), because the
     live chip is set in the page's own font too — measured, the control's
     computed family is the site's, not maplibre's `.maplibregl-map` stack;
     copying that stack here made this one 225.41 wide. It stops short of the
     control column's strip as the live corner does, so on a 265px map it
     wraps (211 x 32) instead of running under expand. */
  [data-map-home-credit] {
    max-width: calc(100% - 54px);
  }

  /* THE COLLAPSED CREDIT, compact frames only (`placeCredit`): maplibre's own
     <summary>, a 24 × 24 target (WCAG 2.5.8's minimum, and the no-pin zone
     plan guard 2i walks), keyboard-operable as a native disclosure. Toned to
     the brand the way the control column is: the SAME glyph maplibre ships —
     its data URI, copied, because a mask cannot point at another rule's
     `background-image` — painted garnet through a mask on a pseudo-element,
     over the sand the chip already has. On the pseudo-element and not on the
     summary so the summary's own focus ring is not masked away with it. The
     ring is the column's: 2px garnet, 2px off, and it has to be written here —
     maplibre's own `.maplibregl-ctrl-attrib-button { outline: none }` is
     unlayered, so it beats app.css's `@layer base` focus floor and the (i)
     had no ring at all without this (the spec's ring assertion goes red).
     (0,4,0) on purpose: maplibre's `.maplibregl-compact-show
     .maplibregl-ctrl-attrib-button` is (0,3,0) and injected after this file —
     the tie #121's review found on the chip. */
  :global(
    [data-property-map] .maplibregl-ctrl.maplibregl-ctrl-attrib .maplibregl-ctrl-attrib-button
  ) {
    background-color: transparent;
    background-image: none;
    box-shadow: none;
  }
  :global(
    [data-property-map]
      .maplibregl-ctrl.maplibregl-ctrl-attrib
      .maplibregl-ctrl-attrib-button::before
  ) {
    content: "";
    position: absolute;
    inset: 0;
    background-color: var(--color-primary);
    mask: url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20fill-rule%3D%22evenodd%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20d%3D%22M4%2010a6%206%200%201%200%2012%200%206%206%200%201%200-12%200m5-3a1%201%200%201%200%202%200%201%201%200%201%200-2%200m0%203a1%201%200%201%201%202%200v3a1%201%200%201%201-2%200%22%2F%3E%3C%2Fsvg%3E")
      center / 100% 100% no-repeat;
  }
  :global(
    [data-property-map]
      .maplibregl-ctrl.maplibregl-ctrl-attrib
      .maplibregl-ctrl-attrib-button:focus-visible
  ) {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
  /* Forced colours repaint a background to the backplate, which would leave a
     glyph painted in the backplate's colour on the backplate. */
  @media (forced-colors: active) {
    :global(
      [data-property-map]
        .maplibregl-ctrl.maplibregl-ctrl-attrib
        .maplibregl-ctrl-attrib-button::before
    ) {
      forced-color-adjust: none;
      background-color: CanvasText;
    }
  }
  /* Same tie, same fix: maplibre's `.maplibregl-ctrl-attrib a` is (0,1,1) and
     this was (0,2,1), so the COLOUR here always did win — but it is written
     with the same three classes as its parent so the pair cannot drift apart
     the next time one of them is edited. */
  :global([data-property-map] .maplibregl-ctrl.maplibregl-ctrl-attrib a),
  [data-map-home-credit] :global(a) {
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
     over it. property-map.spec.ts hit-tests both with a sheet open. (The
     control column is z-3 too, and the sheet now stops 54px short of it.) */
  /* `right: 54px` is the control column's strip, the same one the sheet
     stops short of. The corner is `pointer-events: none`, so this only bounds
     how wide the credit may grow: opened from its (i) on a 265px compact map
     (a 320px window) it was 245 wide, x 10..255, under the expand target at
     221..265 — the column is later in the DOM on the same z, so it hid the
     end of the licence line it sat over. Bounded, the line wraps instead. */
  :global([data-property-map] .maplibregl-ctrl-bottom-left) {
    z-index: 3;
    right: 54px;
  }
</style>

<script lang="ts" module>
  /** EIGHT SECONDS ON EACH LISTING — the OPERATOR'S number, not the comp's
   *  (operator call, 2026-09-23: "double the length on time on each property,
   *  it feels like we're rushing"). The comp's prototype runs a 4s
   *  SMART_ANIMATE on the bar before its 0.5s DISSOLVE (6843:993 → 6843:995 →
   *  6843:1089 …), and this band ran that 4000 from 2026-09-21 until the call.
   *  A lap is now DWELL + DISSOLVE = 8500ms, where it was 4500.
   *
   *  EVERYTHING TIMED OFF THE DWELL FOLLOWS IT, with no second number to
   *  keep in step: the bar fills over it (`progress` is elapsed / dwell), and
   *  the Ken Burns drift's transition crosses KEN_BURNS over it, on a clock
   *  turn and a visitor's turn alike (`zoom`, below). What does NOT follow it
   *  is the hand-over — DISSOLVE, the text cascade, the camera's flight —
   *  which is how long a turn takes to look finished, and the operator asked
   *  for longer on each listing, not for slower turns.
   *
   *  Exported so the unit tests time the band off this value, and read out of
   *  this file by tests/interaction/featured-properties.spec.ts for the same
   *  reason (a Playwright spec cannot import a .svelte module). */
  export const DWELL = 8000;

  /** How far the photo travels across its own dwell, as one CSS transition
   *  (see `zoom` below): 1.00 → 1.06. Operator, 2026-09-29, after the drift
   *  became one transition (#204): "the ken burns still feels stuttery" …
   *  "being too slow may be the answer, let's speed it up. ideally we aren't
   *  moving by fractions of pixels". It was 0.03 — half this speed — from the
   *  day the dwell doubled until then.
   *
   *  STILL FRACTIONS OF A PIXEL, AND FOR A ZOOM THAT IS UNAVOIDABLE. On the
   *  928 × 542 box the photo gains 55.7px of width over DWELL, so each edge
   *  moves 27.8px across the dwell, ~3.5px a second: ~0.058px a frame at
   *  60Hz, ~0.029 at 120Hz. A whole pixel a frame would be ~60px a second at
   *  each edge, ~480px over the dwell. Smooth sub-pixel motion is the GPU's
   *  job instead — see TILT_DEG, and `will-change` in `zoom`. */
  export const KEN_BURNS = 0.06;

  /** A rotation too small to see, in EVERY Ken Burns state (`zoom`), for
   *  FIREFOX. Measured by the operator on 2026-09-30, in Firefox, on a
   *  comparison page: scale 1 → 1.06 over 8s with `will-change` "ticks"
   *  ("feels like it's calculating every tick rather than interpolating");
   *  the same with rotate(0.02deg) at BOTH ends is smooth, and so is 1.12
   *  with it. A translateZ(0) variant and a no-will-change one still ticked.
   *  The accepted explanation: an axis-aligned scale lets Firefox's renderer
   *  snap the photo to whole device pixels each frame, and a transform that
   *  is not axis-aligned is resampled with filtering instead. 0.02deg is
   *  0.32px of skew across the 928px box.
   *
   *  NOT ANY SMALL ANGLE — read in Firefox's source, not measured (there is
   *  no Firefox in the build container): WebRender's
   *  `ScaleOffset::from_transform` (gfx/wr/webrender_api/src/fast_transform.rs)
   *  takes a matrix whose off-diagonal terms are within 1/4096 of zero for a
   *  plain scale. sin(0.02deg) is 1.43 times that; under 0.014deg is nothing
   *  to it. So the tilt must never be interpolated up from 0 either — see
   *  `primed`, below. */
  export const TILT_DEG = 0.02;
</script>

<script lang="ts">
  // The homepage's "Properties" band (6802:1460 at 1440, 6994:820 at 390): on
  // the #3d0707 ground, a reserved map column beside a sand card that turns
  // through the editor's featured listings — photo, a 2px timer, the eyebrow
  // and arrows, then the listing's size line, title, bullets and LEARN MORE.
  //
  // THE CAROUSEL IS $lib/carousel.svelte.ts — this file owns markup and layout
  // only: no clock, no index, no ARIA of its own. Slider.svelte was read and
  // declined for the reasons that module's header gives. PropertyCard.svelte
  // was read and declined too: its photo is 423.5/267.5 and sits BESIDE the
  // panel from `md`, it has no place for a bar between photo and text, and it
  // takes a whole PropertyDocument where this band holds a relationship's five
  // fields. Its PIECES are reused: the panel's 20/20/40 padding, the 15px
  // size-line/title gap, `t-h4` / `t-h3` / `t-body-2 list-disc ps-[21px]`, and
  // BrandButton with the `sr-only` "about {title}" suffix.
  //
  // ONE GRID, SO THE CHROME CAN SIT BETWEEN A SLIDE'S PHOTO AND ITS TEXT. The
  // comp interleaves them — photo, bar, [eyebrow | arrows], text at 390; the
  // eyebrow-over-arrows column BESIDE the text at 1440 — and the carousel's
  // contract is that controls stay OUTSIDE the slide elements in the DOM: a
  // slide that turns away goes `inert`, and an arrow inside it would turn its
  // own slide from under the keyboard focus it holds (#34). So the card is one
  // grid of four rows (photo / bar / chrome / text), the bar and the chrome are
  // its direct children, and every slide spans all four rows as a SUBGRID,
  // filling rows 1 and 4 and leaving 2 and 3 to the chrome. Each slide is still
  // one element — one APG group, one `inert` — and nothing is positioned over
  // anything: the chrome's real size makes the rows, so an eyebrow that wraps
  // (it does below 377px, where Pause makes the controls 140 wide) moves the
  // text down instead of printing over it. From `lg` the same four rows hold
  // two columns, 414fr | 514fr = the comp's 20 + 394 | 20 + 474 + 20.
  //
  // THE MAP IS IN (#13), and the paragraph this replaces was wrong twice. It
  // said the column was reserved "from `lg`" and that below `lg` the comp's
  // 390 × 200 box "would be 200px of blank scroll" — the comp draws that box,
  // full bleed, as the first thing in the band, and it has never been blank.
  // It also said pins were out because "those are Google's imagery"; the pins
  // are the comp's own `np_pin-map` component and the tiles are OpenStreetMap's.
  // The slot itself still has no fill, which is true of the comp's frame too.
  // See $lib/components/PropertyMap.svelte and the 2026-09-22 journal entry.
  //
  // THE CARD'S LEFT EDGE IS THE SITE'S COLUMN LINE, not the comp's 512. The
  // two-column bands put their right column at x=513 (1440) through the gutters
  // and `[397fr_847fr] gap-9`; the comp draws this one at 512 as a bare 512 : 928
  // ratio. The two are 1px apart at 1440 (513 against 512 — the pixel critic
  // ruling C3 accepts, and why the card measures 927 × 541.41 for the comp's
  // 928 × 542) and drift from there: 6.83px at 1280, where the ratio gives
  // 455.11 and the site's line is 461.94. The column below is the site's
  // arithmetic, so this card shares one edge with the Partners headline below
  // it and the footer's at every width. (It shared it with the hero's H1 until
  // the revised hero went one column, 2026-09-28: that H1 stands on the
  // gutter, x=80, now.)
  //
  // mocks.json CANNOT SHOW THIS BAND IN THE SLICE SIMULATOR, and that is not a
  // bug to chase. Slice Machine writes a content relationship as a bare
  // DocumentLink — an id and nothing else — while the band needs the listing's
  // fields embedded on it (see $lib/featured-properties). Every mock pick is
  // therefore counted `unembedded` and dropped, and the simulator draws the
  // empty state: one hidden marker, no card. The fixtures that DO draw it are
  // $lib/home-fixture's `featuredPropertiesFixture` / `featuredLaunchFixture`,
  // on /dev/home and /dev/a11y-fixtures, which is where every gate reads it.
  import type { Content } from "@prismicio/client";
  import { cappedWidths } from "@reddoorla/maintenance/images";

  import { animateIn } from "$lib/actions/animateIn";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import CarouselArrows from "$lib/components/CarouselArrows.svelte";
  import CarouselProgress from "$lib/components/CarouselProgress.svelte";
  import PropertyMap from "$lib/components/PropertyMap.svelte";
  import { createCarousel } from "$lib/carousel.svelte";
  import { cmsHref } from "$lib/cms-href";
  import { featuredListings } from "$lib/featured-properties";
  import { linkResolver } from "$lib/prismicio";
  import { CAMERA_FLIGHT_MS, slidePoints } from "$lib/property-map";
  import { DEFAULT_IMAGE_WIDTHS, imgix, srcset } from "$lib/utils/image";

  let { slice }: { slice: Content.FeaturedPropertiesSlice } = $props();

  const uid = $props.id();

  /** The comp's 0.5s DISSOLVE to the next variant (6843:993 → 6843:995 →
   *  6843:1089 …), after the bar has filled over DWELL (declared above, in the
   *  module script — the operator's 8000, not the comp's 4000).
   *
   *  IT IS THE CAMERA'S FLIGHT, IMPORTED, not a second 500 that happens to
   *  match. The band cross-fades the photo while the map flies to the same
   *  listing, and the pair only reads as ONE change if the two last the same
   *  time — which `property-map.ts` says in prose where `CAMERA_FLIGHT_MS` is
   *  declared, and said only in prose until now: both modules typed their own
   *  `500` and neither imported the other, so the coupling the comments on
   *  both sides claimed was real did not exist and tuning either one would
   *  have silently broken it. */
  const DISSOLVE = CAMERA_FLIGHT_MS;

  /** The srcset's widths: the defaults and 2048 (see `photoSizes`). */
  const PHOTO_WIDTHS = [...DEFAULT_IMAGE_WIDTHS, 2048].sort((a, b) => a - b);

  /** The card's scroll reveal: 24px and 600ms, not the action's 50% / 2400ms.
   *  `delayMax: 0` because the default 400 is multiplied by the element's
   *  `left / innerWidth` — at a 1440 window the card's left edge is 513 of a
   *  1455 layout width, so 400 × 513 / 1455 = 141.031ms of unasked-for delay
   *  before a reveal nobody staggered against.
   *
   *  `failSafe` because the card ships `data-reveal` from the server (#105,
   *  see the card's comment): hidden by CSS before script runs, it must not be
   *  stranded by an observer that never reports. It stands down on the
   *  observer's first report, so a card below the fold still waits for the
   *  reader rather than being revealed on the timer, unseen. */
  const REVEAL = { translateY: "24px", duration: 600, delayMax: 0, failSafe: 2500 } as const;

  /** The staggered text entrance, as FOUR LITERAL class strings, because
   *  Tailwind's source scan reads text and cannot see `delay-[${n}ms]` built
   *  at runtime — the class simply would not be generated.
   *
   *  THE CASCADE ENDS ON THE SETTLE, AND THAT IS WHAT FIXED THE NUMBERS. The
   *  bar starts filling at 500ms (`settle: DISSOLVE`) and the whole point of
   *  the settle is that it starts on a slide that has finished arriving. Four
   *  lines 60ms apart occupy 180ms of sequencing, so with the text's old 250ms
   *  exit the window left for each line's own fade was 500 − 250 − 180 = 70ms,
   *  which reads as a flick rather than a rise. Taking 100ms off the EXIT
   *  (250 → 150) buys each line 170ms instead. That is the trade this makes:
   *  the exit is a fade of words that are leaving and nobody re-reads, the
   *  entrance is the motion that was actually asked for. Nothing overruns the
   *  settle — the last line lands at 330 + 170 = 500 exactly.
   *
   *  A VISITOR'S TURN ENDS ON THE SAME 500 (operator call, 2026-09-23), and
   *  it is the one number that path can justify. The primitive runs no settle
   *  down after a manual turn — `elapsed` is parked at −settle with the clock
   *  stopped — so the settle itself is not something a manual cascade can be
   *  timed to. But the number was never really the settle's: it is DISSOLVE,
   *  how long the hand-over takes to LOOK finished, and everything else a
   *  manual turn does is on it. The photo cross-fades for DISSOLVE; the map's
   *  camera flies for CAMERA_FLIGHT_MS, which is the same constant; and the
   *  photo's drift is delayed by exactly that long (`zoom`, below) and starts
   *  moving on it. So the last word lands on the frame
   *  the photo is fully shown, the camera has landed and the drift begins —
   *  the same frame the clock's cascade lands on, where the bar starts to
   *  fill. Anything shorter would finish the words over a photo still fading
   *  in; anything longer would still be arriving after everything else had
   *  settled.
   *
   *  The durations are literals for the same reason, in `lines` below. */
  const TEXT_STEPS = ["delay-[150ms]", "delay-[210ms]", "delay-[270ms]", "delay-[330ms]"];

  const primary = $derived(slice.primary);
  const listings = $derived(featuredListings(primary.properties));
  const slides = $derived(listings.slides);
  /** Derived once rather than inline in the template: it is read twice (the
   *  map's pins and the active id's membership) and it drops slides with no
   *  GeoPoint, so recomputing it per read is a filter that could disagree with
   *  itself. */
  const mapPoints = $derived(slidePoints(slides));

  // The visible heading is the comp's H4 eyebrow, at h2 LEVEL: the hero owns
  // the h1 and the slide titles are h3s. It also names the carousel, so an
  // empty field falls back to the comp's words rather than to no name.
  const heading = $derived(primary.heading?.trim() || "Featured Properties");

  // A label AND somewhere to go, as the hero's buttons — and through cmsHref,
  // because /properties is a filesystem route an editor can only TYPE.
  const portfolio = $derived.by(() => {
    const text = primary.portfolio_label?.trim() ?? "";
    const href = cmsHref(primary.portfolio_link, { linkResolver });
    if (text === "" || href === null) return null;
    const link = primary.portfolio_link;
    return { text, href, blank: "target" in link && link.target === "_blank" };
  });

  // ONE listing is not a carousel: `enabled: false` hands back empty attribute
  // bags, so it renders as a plain card — no roles, no "1 of 1", no swipe —
  // and the arrows and the bar draw nothing on their own (count ≤ 1).
  //
  // HOVER IS NOT A PAUSE ON THIS BAND (operator call, 2026-09-23: "remove the
  // pause on hover, they have a pause button for that"). It answers an earlier
  // report, "the pause play button seems to take a moment", and the operator's
  // diagnosis was right. The Pause button is INSIDE the card, so the pointer
  // travelling to it stopped the clock before the press. MEASURED on a
  // production build of main's `/` at 1440 × 900, six runs:
  //  - Pause: the bar had stopped 804–919ms BEFORE the press, when the pointer
  //    crossed the card. The press changed only the label, so it looked late.
  //  - Play, with the pointer still on the button: the label flipped on
  //    release, 104–109ms after the press, and the bar moved only when the
  //    pointer left the band — 2108–2143ms after the press in that script, and
  //    never, for a visitor who kept it there.
  // So the rotation now stops for Pause, for focus entering (APG's sticky
  // pause, which a keyboard user needs) and for a hidden tab, and not for a
  // pointer. APG also RECOMMENDS the hover pause, and dropping it is the
  // operator's call; WCAG 2.2.2 is still met by the Pause button. The
  // primitive's default is unchanged (`pauseOnHover` is true for the
  // fixture and for any future consumer). What this changes is `rotating`
  // only: `paused` and `eligible` mean what they meant.
  const carousel = createCarousel({
    count: () => slides.length,
    labelledby: () => `${uid}-heading`,
    autoplay: DWELL,
    settle: DISSOLVE,
    enabled: () => slides.length > 1,
    pauseOnHover: false,
  });

  // THE USER'S TURNS ANIMATE NOW, AND THAT REVERSES A COMP READ — operator
  // call, 2026-09-23. This comment used to say: "The clock's turns dissolve;
  // the user's are instant, as the comp wires its arrows (ON_CLICK →
  // CHANGE_TO, no transition)." That is a faithful reading of the prototype
  // and it is no longer what the band does. The operator paged through by hand,
  // saw nothing move, and asked for the motion on that path too. A decision
  // overruled, not an oversight found.
  //
  // WHY IT READ AS BROKEN RATHER THAN AS A CHOICE — the part worth keeping.
  // `rotating` was `hydrated && eligible && !userPaused && !hovered &&
  // !pageHidden && !atEnd`. Pressing an arrow FOCUSES it (Chromium focuses a
  // button on mousedown; WebKit's behaviour is #32's to measure), and focus
  // entering a carousel sets `userPaused` and leaves it set until Play (APG).
  // So the old gate did not make ONE turn instant: it made every turn instant
  // for as long as the visitor kept paging, and the Ken Burns drift never
  // restarted either. A pointer merely RESTING on the card did the same
  // through `hovered`, and a swipe did it through the pointer it arrives on.
  // A visitor who drove the band was never once shown the dissolve the comp
  // draws — which is exactly what "animations don't fire" described. (Hover
  // stopped being a pause on this band later the same day — `pauseOnHover:
  // false` above — so of the two, the arrow's focus is the one left.)
  //
  // SO THE GATE IS `eligible`, the one `zoom` has used all along: "can this
  // carousel animate at all" — enabled, more than one slide, a dwell to run,
  // and not `prefers-reduced-motion`. It says nothing about WHO turned the
  // slide or whether the clock is running, which is now the whole point.
  // Reduced motion is still a plain swap: `eligible` is false there, every
  // string below drops to its bare form, and app.css zeroes what is left.
  //
  // A MANUAL TURN COSTS THE SAME 500 AS A CLOCK TURN, and not a second number.
  // DISSOLVE is CAMERA_FLIGHT_MS, and the map ALREADY flew for 500ms on this
  // path: `cameraMove` answers `fly` for a new active listing whoever turned
  // to it — `activeBy` ("visitor" for an arrow, a key or a swipe) only decides
  // whether the turn lifts a suspension the visitor's own map gesture set.
  // MEASURED at 1440, map booted: on an arrow press the camera's movestart came
  // 5.2ms before the first frame of the turn and its moveend 501.7ms after it,
  // and on a clock turn 0 and 500.8. So before this change the card snapped
  // while the camera took half a second over the same listing; now the photo
  // is opaque at ~515ms and the two land together again.
  //
  // The photo CROSS-fades: the incoming one fades in over the outgoing one,
  // which holds at 1 and drops out when the fade is done — two photos fading
  // through each other show the ground between them at the halfway mark. The
  // text fades THROUGH (out, then in): two listings' words overlaid are noise.
  // Under reduced motion app.css zeroes every duration and delay: a plain swap.
  // On top of that the incoming text arrives in FOUR staggered lines and the
  // photo drifts 1.00 → 1.06 across its dwell — see `lines` and `zoom` below.
  //
  // AN OFF-STAGE SLIDE LEAVES THE STACK when the dissolve is over — `invisible`
  // on the slide itself, delayed by exactly the 500 it takes. Two reasons, and
  // only one of them is tidiness. `opacity: 0` still paints a box: a slide left
  // at opacity 0 sits over the one on stage, and axe answers `color-contrast`
  // for every text node under it with "needs review" (`bgOverlap`) instead of a
  // ratio — measured at 1440, six of the card's seven text nodes unmeasurable,
  // which is not a pass (CLAUDE.md: a pass needs positive evidence). It is also
  // what a screen magnifier and a text-selection drag hit. `visibility` and not
  // `display`: the stack is what makes the card as tall as its tallest slide,
  // and hidden boxes still take their space.
  //
  // THAT WINDOW IS OPEN ON THE MANUAL PATH NOW, where no second slide was ever
  // in the stack before. It is bounded by CSS, not by the clock, so it closes
  // whether or not the carousel is rotating — which is the thing to check,
  // because after an arrow press the clock is stopped until Play. MEASURED on
  // a production build of `/` at 1440, two real mouse presses: the outgoing
  // slide left the stack 514.1 and 506.5ms after the frame each turn landed
  // on. With the window HELD open, axe resolved every text node on the card —
  // 7 of 7 on a Next, 10 of 10 on a Previous — because the slide on stage is
  // raised over the one leaving (see the slide's `z-[1]` below); without that
  // a Previous measured 2 of 7 and `bgOverlap` for the rest.
  // (featured-properties.spec.ts, "inside the hand-over and after it".) Under
  // reduced motion, and on a one-listing card, `eligible` is false, the bare
  // `invisible` applies with no delay, and the window does not exist at all.
  const fade = $derived(
    carousel.eligible
      ? {
          photoIn: "opacity-100 transition-opacity duration-500 ease-linear",
          photoOut: "opacity-0 transition-opacity delay-500 duration-0",
          slideIn: "visible transition-[visibility] duration-0",
          slideOut: "invisible transition-[visibility] delay-500 duration-0",
        }
      : {
          photoIn: "opacity-100",
          photoOut: "opacity-0",
          slideIn: "visible",
          slideOut: "invisible",
        },
  );

  // THE TEXT IS FOUR LINES NOW, NOT ONE BLOCK. The block's own fade is gone:
  // two opacities in a row multiply, so the children own the whole channel and
  // their wrapper owns none of it. `transition` (the whole default set) rather
  // than a named pair, because Tailwind 4 moves a `translate-y-*` utility onto
  // the `translate` property and not `transform`, and a hand-written list that
  // named the wrong one would transition nothing while looking right.
  //
  // The EXIT is not staggered and does not wait: the outgoing lines fade and
  // sink together over 150ms, which both clears the stage before the first
  // incoming line starts and parks every line at +8px ready to rise. That
  // parking is why the exit carries `translate-y-2` at all.
  const lines = $derived(
    carousel.eligible
      ? TEXT_STEPS.map((step) => `translate-y-0 opacity-100 transition duration-[170ms] ${step}`)
      : TEXT_STEPS.map(() => "translate-y-0 opacity-100"),
  );
  const lineOut = $derived(
    carousel.eligible
      ? "translate-y-2 opacity-0 transition duration-[150ms]"
      : "translate-y-2 opacity-0",
  );

  // KEN BURNS IS ONE CSS TRANSITION on the <img>'s transform (operator call,
  // 2026-09-29: "can it be one clean transform scale with a transition? this
  // seems overbuilt"). It used to be drawn by script, a style written every
  // frame off a rAF loop, so it stalled whenever the main thread was busy. A
  // transition on `transform` runs on the compositor instead.
  //  - ON STAGE: to 1 + KEN_BURNS over DWELL, linear. A photo a TURN brings
  //    on waits out the settle, so it starts on a photo that has finished
  //    arriving; the first slide has nothing to arrive and starts at once,
  //    with the bar's first dwell. (`i !== shown` is the turn being drawn:
  //    the effect below that records it runs after the markup.)
  //  - LEAVING: held where it was while it still shows under the incoming
  //    photo — a transition back to 1 in 0s after a whole DWELL holds its
  //    start value through its delay — until its wrapper's fade-out ENDS.
  //    Then it RESTS at 1 with no transition, hidden. So every activation
  //    starts from 1, except a photo brought back while it still shows, which
  //    carries on from its held value. NOT reset on a timer: Chromium starts a
  //    transition that replaces a running one at once, on the last frame's
  //    time, and the dissolve's fresh ones on the next frame (766ms later, at
  //    worst, at 4x CPU throttle), so a reset at 500, then at 1000, fired in
  //    view; at DWELL, a photo brought back sooner drifted on from its held
  //    value — two seconds after a clock turn, 1.02994 to 1.03 (KEN_BURNS was
  //    0.03 then): a still photo.
  //  - NOT `eligible` (reduced motion, one listing) OR NOT HYDRATED: no style
  //    at all. Under reduced motion app.css cuts every transition to 0.01ms,
  //    which would SNAP a declared end scale and hold it; and an end scale in
  //    the server's markup would be the photo's first style, with nothing for
  //    a transition to start from. Nor before `primed` (below).
  //  - EVERY STATE CARRIES THE SAME TILT, in the same place — `rotate(TILT_DEG)`
  //    after the scale, through `tilted` — so every transition runs between
  //    two lists of the same functions: the scale moves and the rotation is
  //    TILT_DEG on every frame (see TILT_DEG: Firefox, operator, 2026-09-30).
  //    A state without it would interpolate the rotation to or from 0.
  //  - `will-change: transform` on every photo that can drift, and only
  //    there (`LAYER`), for Firefox: it keeps the photo on its own compositor
  //    layer. It was meant to have each sub-pixel step filtered on the GPU
  //    rather than re-rasterised; in the operator's Firefox (2026-09-30) the
  //    drift still ticked with it alone, and stopped only with the tilt — on
  //    a comparison page whose photos carried it from load, so here too it
  //    is on before a drift starts and for all of it. In headless Chromium,
  //    1440 × DPR 2, it changed no layer and no pixel of the drift.
  //  - AND OFF A PHOTO WHOSE DRIFT HAS ENDED ON STAGE (`ended`), which is the
  //    trade. A layer with will-change keeps the raster it was first drawn
  //    at, so in Chromium the drift's end frame is its start raster stretched
  //    by 1 + KEN_BURNS — and a photo HELD there stayed that soft for as long
  //    as it was held, never re-sharpening: a visitor's turn, whose drift
  //    runs to its end with the clock stopped by the arrow's focus, and
  //    #156's Play after that. Mean |Laplacian| of the photo Next brings on,
  //    held, 1440 × DPR 2: 7.678 with the layer against 9.3835 without it,
  //    ~18% (review of #212, 2026-09-30). Without will-change Chromium
  //    re-rasters ~150ms after the transition ends, and that one visible
  //    re-sharpening, on a photo that has stopped moving, is the price. So
  //    the on-stage photo's own `transitionend` on `transform` drops it (a
  //    Pause does not: a paused transition has not ended), and it comes back
  //    when the photo RESTS, hidden, before its next drift — not when that
  //    drift is written, because the turn's first render runs before the
  //    effect below records the turn. A photo brought back while it still
  //    shows after its drift ended is already at 1 + KEN_BURNS: nothing
  //    drifts, and it stays off.
  // What the script did and this does not, on purpose ("overbuilt"): keep the
  // photo on the bar's clock frame for frame (both wait the settle and run
  // DWELL, so they agree to within frames, not by construction), stop for a
  // hidden tab, hand a visitor's drift to the clock on Play, and park each
  // photo at the value it left with until it is next shown. Never on the
  // wrapper: its transition-duration is the comp's 0.5s dissolve.
  const LAYER = "will-change: transform";

  // THE PHOTO IS FETCHED FOR THE WIDTH IT IS DRAWN AT, AT THE END OF ITS
  // DRIFT. `sizes` said 65vw — the box — and at 1440 × DPR 2 Chromium took
  // the 1920 candidate for a photo drawn 927 × 1.06 × 2 = 1965.2 device px
  // wide at the end: upscaled, and softer through the whole drift, not only
  // at its end (mean |Laplacian| of the composited photo frozen at 1.03,
  // headless Chromium at 1440 × DPR 2: 6.66 from 1920, 8.35 from 2048, 9.67
  // from 2560; 9.82 for a still, never-composited 1920). So `sizes` is the
  // box times the end scale (none on a one-listing band, which never
  // drifts), times how far an image wider than the box overflows it under
  // object-cover: a 1717 × 866 photo is drawn 1073.6 wide in a 927 box, and
  // at DPR 1 it was fetched at 1024. Reduced motion cannot be known in the
  // server's markup, so it pays the 6% too.
  //
  // 2048 BESIDE THE DEFAULTS because Chromium takes the smallest candidate at
  // least as dense as the screen: at 1440–1470 × DPR 2 the end frame needs
  // 1965–2006px, which 1920 misses and 2560 overshoots — 191 KB of AVIF at
  // 2048 against 172 at 1920 and 268 at 2560. cappedWidths still stops at the
  // source's own width.
  const BOX = 928 / 542;
  const photoSizes = ({ width, height }: { width: number; height: number }) => {
    const drawn = (carousel.enabled ? 1 + KEN_BURNS : 1) * Math.max(1, width / height / BOX);
    const vw = (n: number) => +(n * drawn).toFixed(2);
    return `(min-width: 1024px) ${vw(65)}vw, ${vw(100)}vw`;
  };
  const resting: boolean[] = $state([]);
  /** The photo's drift ran to its end ON STAGE, and it has not rested since:
   *  it is held still, so it carries no `LAYER`. */
  const ended: boolean[] = $state([]);
  let shown = carousel.index;
  let turned = false;
  let primed = $state(false);
  /** A photo's transform at `scale`, tilted: the one function list every
   *  state below is written in. */
  const tilted = (scale: number) => `transform: scale(${scale}) rotate(${TILT_DEG}deg)`;
  const zoom = (i: number) => {
    if (!carousel.hydrated || !carousel.eligible || !primed) return undefined;
    const layer = ended[i] ? "" : `${LAYER}; `;
    if (carousel.isActive(i)) {
      const delay = turned || i !== shown ? carousel.settle : 0;
      return `${layer}${tilted(1 + KEN_BURNS)}; transition: transform ${DWELL}ms linear ${delay}ms`;
    }
    return resting[i]
      ? `${layer}${tilted(1)}; transition: none`
      : `${layer}${tilted(1)}; transition: transform 0ms linear ${DWELL}ms`;
  };

  // PAUSE FREEZES THE DRIFT AND PLAY RESUMES IT (WCAG 2.2.2), through the
  // transition's own Animation: resumed, it has exactly the time it had left,
  // which on a linear curve is the travel left. A TURN only records itself: an
  // arrow press focuses the arrow, which the primitive counts as a pause, and
  // that pause — on already, or landing in the same flush — must not freeze
  // the drift the visitor's turn has just started. Until the next turn this
  // runs again only when `paused` changes, so only a Pause AFTER the turn
  // freezes it.
  const photos: HTMLImageElement[] = $state([]);
  $effect(() => {
    const i = carousel.index;
    const paused = carousel.paused;
    if (i !== shown) {
      shown = i;
      turned = true;
      resting[i] = false;
      return;
    }
    // `?.()`: jsdom has no Web Animations.
    for (const animation of photos[i]?.getAnimations?.() ?? [])
      if (paused) animation.pause();
      else animation.play();
  });

  // THE TILT IS IN PLACE BEFORE THE FIRST STYLE IS WRITTEN, or the first
  // transitions interpolate it up from nothing. The server's markup carries
  // no style, so at hydration every photo's transform is `none`, and a
  // transition from `none` to `scale(1.06) rotate(0.02deg)` turns the photo
  // 0 → TILT_DEG across the whole DWELL — under WebRender's 1/4096 (see
  // TILT_DEG) until 5378ms in, so the first listing would tick in Firefox
  // for two thirds of its dwell. The photos held off stage at load were the
  // same: `none` through their DWELL-long hold, so the first clock turn
  // brought its photo on from `none` too. MEASURED in headless Chromium with
  // the write and the read below removed: slide 1 at 0deg on the frame its
  // drift started and 0.0000417deg (b = 7.3e-7) 16.7ms in; the photo the
  // first clock turn brought on at 0.0055deg (b = 9.7e-5) a second into its
  // drift. So each photo is given its tilted rest here, and only then does
  // `zoom` write anything; its first write replaces the whole style
  // attribute, this transform with it. Again after reduced motion is turned
  // off, which drops every photo back to no style.
  //
  // THE READ IS WHAT GUARANTEES THE BROWSER SAW THE REST before the drift
  // replaced it: without a style resolution between the two writes they are
  // one style change, and the transition starts from `none` as though the
  // rest had never been written. On this page something else in the same
  // flush happens to resolve style first — with the read removed, slide 1
  // still read 0.02deg on every frame of its first dwell (Chromium,
  // 2026-09-30) — so no browser test can tell the read is there. It stays so
  // that the priming does not depend on what else hydrates alongside it;
  // FeaturedProperties.test.ts pins the order.
  $effect(() => {
    if (!carousel.hydrated || !carousel.eligible) {
      primed = false;
      return;
    }
    if (primed) return;
    // `if`: a slide removed in a Prismic preview leaves its binding null.
    for (const photo of photos)
      if (photo) {
        photo.style.cssText = tilted(1);
        getComputedStyle(photo).getPropertyValue("transform");
      }
    // Every photo starts again from its rest, so none has ended a drift.
    ended.length = 0;
    primed = true;
  });
</script>

{#if slides.length === 0}
  <!-- THE EMPTY STATE IS NO BAND: a dark 827px box around an empty card is a
       broken page, and every listing is still one link away (the hero's and
       the footer's "Properties"). What is left is a hidden marker carrying
       the counts, so "the editor picked nothing showable" and "the API sent the
       picks bare" (`unembedded`, see $lib/featured-properties) can be told
       apart from View Source instead of guessed at. -->
  <section
    hidden
    data-slice-type={slice.slice_type}
    data-slice-variation={slice.variation}
    data-featured-picked={listings.picked}
    data-featured-shown="0"
    data-featured-unembedded={listings.unembedded}
  ></section>
{:else}
  <section
    data-slice-type={slice.slice_type}
    data-slice-variation={slice.variation}
    data-featured-picked={listings.picked}
    data-featured-shown={slides.length}
    data-featured-unembedded={listings.unembedded}
    aria-labelledby={carousel.enabled ? undefined : `${uid}-heading`}
    class="featured-band relative bg-dark lg:grid"
  >
    <!-- The card. With more than one listing it is the carousel's region, named
         by the eyebrow; with one, `region` is empty and the <section> takes the
         name instead (never both — two landmarks, one name).
         `data-carousel-ready` is `hydrated` made visible: what a browser test
         waits on before it presses anything.

         THE CARD REVEALS ON SCROLL, AND SHIPS `data-reveal` FROM THE SERVER
         (#105, the issue's option 2, operator call). It used to ship none,
         because app.css hides `[data-reveal]` at the action's default 50% and
         this card travels 24px: the card painted in place and was hidden at
         hydration, which was only safe below the fold — and on a viewport
         tall enough to show it at load, `hide()` and `show()` collapsed into
         one style recalc and the reveal simply did not play. After the
         revised hero (2026-09-28) the card's top is 921 at 1440 (947 on the
         live document until it is re-seeded), so from `lg` it played only in
         windows shorter than that: not at 1920 × 1080, nor at 1455 × 960.
         See #105 for the full table.

         Now the marker is in the markup, and the 24px it is hidden at is this
         file's own rule (<style> below), which src/reveal-hidden-state.test.ts
         holds against REVEAL's travel. The card is hidden at first paint in
         both places, so hydration re-writes identical values and the reveal
         plays whether the card is on screen at load or scrolled to later.
         With scripting off, app.html's <noscript> rule shows it; `failSafe`
         covers an observer that never reports (see REVEAL). What nothing
         covers is scripting ON with a bundle that never arrives: the card
         stays hidden, as the homepage wordmark does in the same state (#43).

         `use:animateIn` and not a local IntersectionObserver: one-shot on
         first intersection at threshold 0 is already what the action does, and
         a second copy of it here is exactly the re-derivation CLAUDE.md names
         (Slider, trapFocus, prefersReducedMotion). Under reduced motion it
         hides nothing — it drops the server's marker and tears itself down,
         and app.css never hid the card there — which is this animation's
         reduced-motion answer. -->
    <div
      {...carousel.region}
      data-reveal
      use:animateIn={REVEAL}
      data-featured-card
      data-carousel-ready={carousel.hydrated ? "" : undefined}
      class="@container relative isolate bg-light text-primary lg:col-start-2 lg:row-start-1"
    >
      <div
        {...carousel.swipe}
        class="grid grid-cols-1 grid-rows-[auto_auto_auto_1fr_auto] lg:grid-cols-[414fr_514fr]"
      >
        <!-- The chrome comes FIRST in the DOM so Pause is the first stop inside
             the carousel (APG), and sits in row 3 by placement. From `lg` it is
             the comp's 200px column: eyebrow pinned to the top, arrows to the
             bottom, 43 above the card's foot (40 of padding and 3 of the comp's
             own slack — 203 against 200). That column, not the text, is what
             holds the panel at the comp's 285 when a listing has two bullets.
             `items-start`: at 390 the eyebrow's cap top is flush with the
             arrows' top edge, not centred on them.

             THE 200 IS A FLOOR (`lg:min-h`), NOT A HEIGHT. As `lg:h-[200px]`
             it was a fixed box top-aligned in its own grid area, so the moment
             any slide's text ran taller than 203 the area grew underneath it
             and the arrows stayed where they were: measured 60.03 above the
             card's foot instead of 43 at 1024/1100/1280 with the fixture's own
             copy, and at a true 1440 with the launch listing's five bullets —
             arrows, LEARN MORE and the foot on three different lines. A grid
             item stretches by default, so `h-auto` + the floor keeps 20 + 200
             + 43 = the comp's 285 for short content AND the arrows 43 above
             the foot at every width and every length.

             `lg:row-start-3` LOOKS redundant beside `row-start-3` and is not.
             `lg:row-span-2` is the `grid-row` SHORTHAND, and inside the `lg`
             media block it lands later in the stylesheet than the unprefixed
             `grid-row-start: 3`, resetting the start to `auto`: the chrome was
             auto-placed into implicit rows 5–6 UNDER the slides (they fill
             rows 1–4 of both columns), and the card measured 1086 tall for the
             comp's 827 with the eyebrow at y=843. Restating the start inside
             `lg` puts it after the shorthand. The text block below needs the
             same pair for the same reason. -->
        <div
          data-featured-chrome
          class="relative z-[2] col-start-1 row-start-3 mx-5 mt-[10px] flex items-start
            justify-between gap-5 lg:row-span-2 lg:row-start-3 lg:mt-5 lg:mr-0 lg:mb-[43px]
            lg:h-auto lg:min-h-[200px] lg:flex-col"
        >
          <h2 id="{uid}-heading" class="t-h4 min-w-0">{heading}</h2>
          <CarouselArrows {carousel} />
        </div>

        <!-- The bar's 2px and the 20 above it are held whether or not there is a
             bar to draw (one listing; no script), so the card is the same card
             in every state. -->
        <div class="relative z-[2] col-span-full row-start-2 mx-5 mt-5 h-0.5">
          <CarouselProgress {carousel} />
        </div>

        {#each slides as slide, i (slide.id)}
          {@const active = carousel.isActive(i)}
          {@const widths = cappedWidths(slide.image, PHOTO_WIDTHS)}
          <div
            {...carousel.slide(i)}
            data-featured-slide
            class="col-span-full row-span-4 row-start-1 grid grid-cols-subgrid grid-rows-subgrid
              {active ? `z-[1] ${fade.slideIn}` : `pointer-events-none ${fade.slideOut}`}"
          >
            <!-- THE SLIDE ON STAGE PAINTS OVER THE ONE LEAVING, WHATEVER THEIR
                 DOM ORDER — `z-[1]` on the whole slide, where it used to sit on
                 the photo alone. On the photo it did half the job: the incoming
                 photo faded in over the outgoing one, but the outgoing slide's
                 WORDS (opacity 0, still `visible` for the 500ms the photo takes)
                 painted over the incoming words whenever the outgoing slide came
                 later in the DOM — Previous, and Next from the last slide to the
                 first, which the clock does once a lap. MEASURED at 1440 with
                 that window held open: axe resolved 2 of the card's 7 text
                 nodes on a Previous turn and answered `bgOverlap` for the other
                 five; 7 of 7 on a Next. With the slide raised: 7 of 7 both ways.
                 (The chrome, the bar and the portfolio button are `z-[2]`, so
                 they still sit over any slide.) -->
            <!-- 928 × 542 at 1440 and 390 × 227.8 at 390: one ratio. Every slide
                 is in the DOM and the band starts below the fold at both widths,
                 so every photo is lazy. Centred; an editor crops in Prismic. -->
            <div
              class="col-span-full row-start-1 aspect-[928/542] overflow-hidden bg-background
                {active ? fade.photoIn : fade.photoOut}"
              ontransitionend={(e) => {
                if (e.target === e.currentTarget && e.propertyName === "opacity" && !active) {
                  resting[i] = true;
                  ended[i] = false;
                }
              }}
            >
              <img
                src={imgix(slide.image.url, { w: Math.min(1920, Math.max(...widths)) })}
                srcset={srcset(slide.image.url, widths)}
                sizes={photoSizes(slide.image.dimensions)}
                width={slide.image.dimensions.width}
                height={slide.image.dimensions.height}
                alt={slide.image.alt ?? ""}
                loading="lazy"
                decoding="async"
                data-featured-photo
                bind:this={photos[i]}
                style={zoom(i)}
                ontransitionend={(e) => {
                  if (e.target === e.currentTarget && e.propertyName === "transform" && active)
                    ended[i] = true;
                }}
                class="size-full object-cover"
              />
            </div>

            <!-- The wrapper holds NO opacity of its own: the four lines below
                 own the whole channel, and two nested fades would multiply
                 (0.5 over 0.5 is 0.25 at the halfway mark, not 0.5). The
                 indices are positional and fixed — a listing with no size line
                 leaves index 0 unrendered and the title still waits its own
                 210ms rather than sliding up a place. LEARN MORE is wrapped
                 rather than given the classes directly: BrandButton ships
                 `transition-colors`, and a second `transition-property` on the
                 same element would silently drop one of the two lists (the
                 defect animateIn's own release() exists for). -->
            <div
              class="col-start-1 row-start-4 mx-5 mt-5 mb-10 flex min-w-0 flex-col gap-5
                lg:col-start-2 lg:row-span-2 lg:row-start-3"
            >
              <div class="flex flex-col gap-[15px]">
                {#if slide.sizeLabel}
                  <p data-featured-line="0" class="t-h4 {active ? lines[0] : lineOut}">
                    {slide.sizeLabel}
                  </p>
                {/if}
                <h3 data-featured-line="1" class="t-h3 {active ? lines[1] : lineOut}">
                  {slide.title}
                </h3>
              </div>
              {#if slide.highlights.length}
                <ul
                  data-featured-line="2"
                  class="t-body-2 list-disc ps-[21px] {active ? lines[2] : lineOut}"
                >
                  {#each slide.highlights as highlight, j (j)}
                    <li>{highlight}</li>
                  {/each}
                </ul>
              {/if}
              {#if slide.href}
                <!-- `flex`, not a bare block: an inline-flex BrandButton in a
                     block wrapper sits in a LINE box, whose strut would put a
                     few px of descender under the button and move its bottom
                     off the card's 40px foot (the spec measures exactly that). -->
                <div data-featured-line="3" class="flex self-start {active ? lines[3] : lineOut}">
                  <BrandButton href={slide.href} arrow>
                    Learn more <span class="sr-only">about {slide.title}</span>
                  </BrandButton>
                </div>
              {/if}
            </div>
          </div>
        {/each}

        {#if portfolio}
          <!-- THE BAND'S OWN LINK TO THE REST OF THE PORTFOLIO. Restored after
               review removed it (operator call, 2026-09-21), and NOT where it
               was: it used to be a `lg:absolute lg:inset-0` overlay across the
               whole band, which parked it on the RESERVED MAP COLUMN (#13) and
               made axe answer `color-contrast` with `bgOverlap` for every word
               in the card under it — 1 node measured and 9 incomplete at 1440
               on the one-listing state. It is a grid item in the CARD now, so
               there is no overlay and nothing is painted over anything.

               ON LEARN MORE'S OWN LINE, not the arrows'. It is pinned to the
               text column's bottom edge — the card's 40px foot padding, the
               same `mb-10` the slide's text block carries — and right-aligned
               on the card's 20, so it clears the arrows (bottom-LEFT, 43 above
               the foot) and clears LEARN MORE (bottom-left of the text
               column). Where the slide's own text is what sizes the panel,
               which is every one-listing state, that puts the two buttons'
               bottoms on one line to the pixel. Where the chrome's 200px floor
               or a TALLER SIBLING SLIDE sizes it instead, the active slide's
               LEARN MORE floats above that edge by the difference and no
               static placement can follow it.

               THE 40rem IS A COLLISION, MEASURED, AND IT IS THE CARD'S WIDTH
               AND NOT THE VIEWPORT'S. In the two-column layout the text column
               starts at 0.446 × the card, so clearance between LEARN MORE's
               right edge and this button's left edge falls linearly with it:
               158.86 at a 927 card (1440), 98.50 at 818.06 (1280), 40.26 at
               712.88 (1100), 11.58 at 661.13 (1024) — 0 at about 640. Below
               that they overlap, and an element painted over text is the
               `bgOverlap` defect this button was removed for in the first
               place: rendered inside /dev/a11y-fixtures' `max-w-3xl` wrapper,
               which squeezes the card to 425.89, the row-4 placement put this
               button across LEARN MORE (left 236.42 against its right 355.13)
               and axe answered the launch band with 9 measured and 1
               INCOMPLETE. A viewport media query cannot see that — the
               viewport there is 1440 — so the query is on the CARD
               (`@container`), and under 40rem the button takes its own row
               under the text instead. That is also what every phone gets (390
               at 390), where the single-column card puts LEARN MORE's left
               edge on the same 20 as this button's.

               `row-start-5` is a row the four-row grid did not have; over
               40rem the button moves into row 4 and row 5 collapses to
               nothing, so the comp's 285 panel and the arrows' 43 above the
               card's foot are untouched at every width the site is drawn at.
               Focus landing here stops the clock and ArrowLeft/Right turn the
               slide, both for free: the primitive's handlers sit on the region
               and treat anything in it that is not inside a slide as a
               control (see carousel.svelte.ts — "a consumer's own control
               (dots, a 'view all' link in the header) gets the keys"). -->
          <div
            data-featured-portfolio
            class="relative z-[2] col-span-full row-start-5 mx-5 mb-10 justify-self-start
              @min-[40rem]:row-start-4 @min-[40rem]:self-end @min-[40rem]:justify-self-end"
          >
            <BrandButton
              href={portfolio.href}
              arrow
              target={portfolio.blank ? "_blank" : undefined}
              rel={portfolio.blank ? "noopener noreferrer" : undefined}
            >
              {portfolio.text}
            </BrandButton>
          </div>
        {/if}
      </div>

      {#if carousel.enabled}
        <p class="sr-only" {...carousel.status}>{carousel.statusText}</p>
      {/if}
    </div>

    <!-- THE MAP (#13). The comp draws it 512 x 827 at (0, 0) at 1440 — full
         bleed to the left viewport edge, the band's whole height, no gap to
         the card — and 390 x 200 full bleed at (0, 0) at 390, where it is the
         FIRST thing in the band and sits flush on top of the card. The build
         used to render nothing below `lg`; that was a reading of the comp, and
         the comp was re-read.
         It is LAST in the DOM and first on the phone. That is deliberate and
         it is `order`, not a move: the card is the band's content and the map
         is a picture of three of its listings, so the card stays first for a
         screen reader and for anything that ignores CSS, while the `max-lg`
         grid in this file's <style> puts the map above it visually where the
         comp draws it there. Above `lg` grid PLACEMENT decides, so the DOM
         order is not consulted at all.
         `tone="cream"`, AND THE SLOT'S OWN TRANSPARENCY IS NOT ENOUGH. This
         comment used to say the slot has no background so the band's #3d0707
         shows through while the tiles arrive. The slot is indeed transparent —
         and it was never the element that paints. `PropertyMap`'s own root
         filled it, hard-coded `bg-light`, so what actually showed was a
         full-bleed SAND rectangle over the dark band: measured 513 × 826.4 at
         1455 × 900 and 375 × 200 at 390 × 844. The guard "measuring" it read
         the slot, which is transparent whatever the child does, so it passed
         throughout. The ground is the child's to draw, so the child is told
         which one: off-white on #3d0707, 15.13:1. -->
    <div data-map-slot class="max-lg:order-first lg:col-start-1 lg:row-start-1">
      <!-- THE CAMERA FOLLOWS THE ACTIVE SLIDE, AND THAT IS THE WHOLE GATE.
           WCAG 2.2.2 is live on this band: it autoplays, so a camera that
           moved on its own every eight seconds (`DWELL`) would be auto-moving
           content in parallel with other content. It cannot. `active` is read
           off `carousel.index`, and the clock only advances it while the
           carousel is `rotating` — which is already `hydrated && eligible &&
           !userPaused && !pageHidden && !atEnd` here (hover is not a pause on
           this band, `pauseOnHover: false`), i.e. every pause, a hidden tab and
           `prefers-reduced-motion` all stop it. Pressing the band's Pause
           control stops the index, so it stops the map; under reduced motion
           the index never moves at all, so the map never does.
           That is ONE mechanism. A second gate here — a `paused` prop the map
           also consulted — could only ever disagree with this one, and the
           first thing it would disagree about is a MANUAL turn: pressing an
           arrow focuses a control, which stops the clock, and a camera gated
           on `rotating` would then refuse to follow the slide the visitor just
           asked for.
           The map is also CONSTRUCTED on the active point rather than easing
           to it (see PropertyMap's `camera()`), so nothing moves at load
           either.
           `mapPoints` is indexed by the SLIDE's index, never by its own: a
           slide whose `location` is empty is not in `slidePoints` at all, so
           the two lists are different lengths and `mapPoints[index]` would
           point at the wrong listing. Matching by id is the only safe read,
           and an id this map has no pin for is a request the map holds on
           rather than serves (`cameraMove`'s `unknown-active`). -->
      <!-- `activeBy` IS WHAT KEEPS A VISITOR'S OWN ZOOM. The map suspends its
           camera when the visitor drives it and lifts that suspension when the
           visitor asks for a different listing — and on this band the index
           moves on an 8000ms clock with nobody touching anything, which the map
           cannot tell from an arrow press by watching `active` alone. It read
           every auto-advance as the visitor asking, so a pinch or a wheel-zoom
           on the expanded map was thrown away one dwell later: measured on a
           production build of `/` at 390x844, four wheel-up ticks took it to
           z12.5387 and ~9s later the camera had flown back to z12 twice with
           no further input. `carousel.turnedBy` is the only thing that knows,
           because the carousel is what turned it. -->
      <!-- `onengage` ANSWERS #150's OPEN QUESTION the client's way (M1,
           operator call 2026-09-28): pressing +, − or expand on a running
           slideshow pauses it, and the unlocked map then acts. Collapsing does
           not resume it; only Play does. `interactive` stays the one switch. -->
      <PropertyMap
        points={mapPoints}
        active={slides[carousel.index]?.id ?? null}
        activeBy={carousel.turnedBy}
        interactive={carousel.paused || !carousel.eligible}
        onengage={carousel.pause}
        label={heading}
        tone="cream"
        class="h-50 w-full lg:h-full"
      />
    </div>
  </section>
{/if}

<style>
  /* The card's hidden state at first paint (#105): app.css's `[data-reveal]`
     rule with this card's own 24px travel, which is REVEAL's `translateY` —
     src/reveal-hidden-state.test.ts holds the two together. Under the same
     no-preference gate, and released by app.html's <noscript> rule. */
  @media (prefers-reduced-motion: no-preference) {
    [data-featured-card][data-reveal] {
      transform: translateY(24px);
    }
  }

  /* Below `lg` the band is a one-column grid rather than block flow, for one
     reason: so the map slot — last in the DOM, because the card is the band's
     content — can take `order: -1` and sit where the 390 comp draws it, on
     top of the card. A single-column grid is layout-neutral against the block
     flow it replaces here (the section has exactly two children, neither of
     which carries a vertical margin to collapse), and it stops at `lg`, where
     the explicit `col-start` / `row-start` placements below take over. */
  @media (width < 64rem) {
    .featured-band {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* The site's column line, as every gutter-ed band computes it:
     gutter + (content − gap) × 397/1244 + gap, with content capped at 1440 and
     centred. 513px at 1440. Tailwind's `lg` and `xl`, where the gutter changes
     (px-5 sm:px-8 xl:px-20). `100%` is the band's own width, never `vw` — the
     layout is 15px narrower than the viewport wherever a scrollbar takes space. */
  @media (min-width: 64rem) {
    .featured-band {
      --gutter: 2rem;
      grid-template-columns:
        calc(
          max(0px, (100% - 1440px) / 2) + var(--gutter) +
            (min(100%, 1440px) - 2 * var(--gutter) - 36px) * 397 / 1244 + 36px
        )
        minmax(0, 1fr);
    }
  }
  @media (min-width: 80rem) {
    .featured-band {
      --gutter: 5rem;
    }
  }
</style>

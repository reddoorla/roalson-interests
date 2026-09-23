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
  // THE CARD'S LEFT EDGE IS THE SITE'S COLUMN LINE, not the comp's 512. Every
  // other band puts its right column at x=513 (1440) through the gutters and
  // `[397fr_847fr] gap-9`; the comp draws this one at 512 as a bare 512 : 928
  // ratio. The two are 1px apart at 1440 (513 against 512 — the pixel critic
  // ruling C3 accepts, and why the card measures 927 × 541.41 for the comp's
  // 928 × 542) and drift from there: 6.83px at 1280, where the ratio gives
  // 455.11 and the site's line is 461.94. The column below is the site's
  // arithmetic, so the H1 above and this card share one edge at every width.
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
  import { untrack } from "svelte";

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

  /** The comp's prototype: a 4s SMART_ANIMATE fills the bar, then a 0.5s
   *  DISSOLVE to the next variant (6843:993 → 6843:995 → 6843:1089 …).
   *
   *  IT IS THE CAMERA'S FLIGHT, IMPORTED, not a second 500 that happens to
   *  match. The band cross-fades the photo while the map flies to the same
   *  listing, and the pair only reads as ONE change if the two last the same
   *  time — which `property-map.ts` says in prose where `CAMERA_FLIGHT_MS` is
   *  declared, and said only in prose until now: both modules typed their own
   *  `500` and neither imported the other, so the coupling the comments on
   *  both sides claimed was real did not exist and tuning either one would
   *  have silently broken it. */
  const DWELL = 4000;
  const DISSOLVE = CAMERA_FLIGHT_MS;

  /** How far the photo travels across its own dwell, drawn by script off the
   *  clock or off a visitor's own run of it (see `zoom` below): 1.00 → 1.03.
   *  On the 928 × 542 box that is 27.8px of extra width and 16.3px of height,
   *  13.9 / 8.1 of it clipped off each edge. */
  const KEN_BURNS = 0.03;

  /** The card's scroll reveal: 24px and 600ms, not the action's 50% / 2400ms.
   *  `delayMax: 0` because the default 400 is multiplied by the element's
   *  `left / innerWidth` — at a 1440 window the card's left edge is 513 of a
   *  1455 layout width, so 400 × 513 / 1455 = 141.031ms of unasked-for delay
   *  before a reveal nobody staggered against. */
  const REVEAL = { translateY: "24px", duration: 600, delayMax: 0 } as const;

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
   *  visitor's own run of the drift (`kick`, below) holds still for exactly
   *  that long and starts moving on it. So the last word lands on the frame
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
  const carousel = createCarousel({
    count: () => slides.length,
    labelledby: () => `${uid}-heading`,
    autoplay: DWELL,
    settle: DISSOLVE,
    enabled: () => slides.length > 1,
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
  // `rotating` is `hydrated && eligible && !userPaused && !hovered &&
  // !pageHidden && !atEnd`. Pressing an arrow FOCUSES it (Chromium focuses a
  // button on mousedown; WebKit's behaviour is #32's to measure), and focus
  // entering a carousel sets `userPaused` and leaves it set until Play (APG).
  // So the old gate did not make ONE turn instant: it made every turn instant
  // for as long as the visitor kept paging, and the Ken Burns drift never
  // restarted either. A pointer merely RESTING on the card does the same
  // through `hovered`, and a swipe does it through the pointer it arrives on.
  // A visitor who drove the band was never once shown the dissolve the comp
  // draws — which is exactly what "animations don't fire" described.
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
  // photo drifts 1.00 → 1.03 across its dwell — see `lines` and `zoom` below.
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

  // KEN BURNS, DRAWN BY SCRIPT — no @keyframes and no CSS transition on the
  // transform. app.css zeroes animation-duration to 0.01ms with iteration-count
  // 1, so a `forwards` fill would SNAP to the end scale and HOLD it: a
  // statically zoomed photo under reduced motion, which is not "no animation".
  // A value script writes is instead simply NOT WRITTEN where the carousel is
  // not `eligible` — which folds reduced motion in, because `eligible` does —
  // so `zoom` returns undefined and the photo carries no transform at all.
  // That holds for both of the clocks below; neither is consulted without it.
  //
  // ON THE <img>, NEVER ON ITS WRAPPER. The wrapper's `transition-duration` is
  // the assertion that the comp's 0.5s dissolve is wired at all
  // (featured-properties.spec.ts) and a second transitioned property there
  // makes the computed value a two-item list.

  /** A VISITOR'S TURN DRIFTS TOO — on a run of its own, because it cannot be
   *  the carousel's clock, and that is the part worth writing down.
   *
   *  The drift used to be `progress` and nothing else: the dwell, drawn, on
   *  the one clock the 2px bar draws. A visitor never saw any of it, because
   *  every way a visitor turns this band is ITSELF A PAUSE. A mouse press
   *  focuses the arrow (APG: rotation stops until Play), the pointer that
   *  pressed is resting on the card (`hovered`), and a swiping finger arrives
   *  as a pointer too. MEASURED on main at 1440, two real mouse presses 1.5s
   *  apart: the photo sat at exactly scale(1) for the 5000ms after the second.
   *
   *  RESTARTING THE DWELL on a manual turn — "normal carousel behaviour" —
   *  would not have fixed that, which is why it was not done. The pointer is
   *  still on the card, so the clock would still be stopped for exactly the
   *  person who pressed; and clearing the focus pause is a change to the
   *  primitive's APG contract (carousel.svelte.ts, 58 tests) for every
   *  consumer. The rotation stays stopped, as the primitive says.
   *
   *  So a visitor's turn runs ONE DWELL'S WORTH OF DRIFT on the photo it
   *  brought on stage, and turns nothing. It is `restart()`'s own shape —
   *  elapsed from −settle, `clamp01(elapsed / DWELL)` — i.e. the curve the
   *  clock would have drawn had it been running: still through the 500ms
   *  dissolve, then 1.00 → 1.03 over 4000ms, then held at 1.03. The photo
   *  shows the `max` of the two, so where rotation DOES resume (Play; or the
   *  pointer leaving when nothing took focus, as after a swipe) the clock
   *  takes over from underneath without the photo ever moving backwards.
   *
   *  WHAT KEEPS IT HONEST:
   *   - reduced motion never starts it — the loop needs `eligible` — and
   *     `zoom` writes no transform without `eligible` anyway;
   *   - it ENDS: 500 + 4000 = 4.5s from the visitor's own press, then still.
   *     Under WCAG 2.2.2's five seconds, and started by the user, which is not
   *     the "starts automatically" that criterion governs;
   *   - a PAUSE AFTER THE TURN FREEZES IT where it stands, as it freezes the
   *     bar. "Pause stops the bar and not the photo" is exactly the defect the
   *     one-clock rule exists to prevent, so it is not reintroduced here.
   *     `paused` turning true is the Pause button, or focus entering, which
   *     APG treats as the same request. A pause that was ALREADY on when the
   *     turn happened — the arrow's own focus, on the press that made it — is
   *     not a request to stop the turn the visitor just asked for;
   *   - a hidden tab re-bases the loop, as the primitive's clock stops for
   *     one, so a tab brought back does not jump the photo by however long it
   *     was away. */
  let kick = $state<{ index: number } | null>(null);
  /** ms into the visitor's run; negative through the dissolve — the
   *  primitive's own `elapsed`, restarted by the same turn. */
  let kickElapsed = $state(0);
  let kickFrozen = $state(false);

  /** The on-stage photo's drift: the clock's, or the visitor's run, whichever
   *  is further on. */
  const live = $derived(
    Math.max(
      carousel.progress,
      kick?.index === carousel.index ? Math.min(1, Math.max(0, kickElapsed / DWELL)) : 0,
    ),
  );

  /** WHERE EACH PHOTO IS HELD WHILE IT IS OFF STAGE: at the drift it had when
   *  it left, and at the end scale if it has never been on.
   *
   *  It used to be the end scale for every off-stage slide, and the reasoning
   *  was sound for the only hand-over that existed: "at a CLOCK turn the
   *  outgoing slide has just run its dwell out, so it is already there to
   *  within a frame and nothing moves". A visitor's turn hands over at
   *  whatever the drift had reached, and the outgoing photo is FULLY OPAQUE
   *  for the whole 500ms (its `opacity-0` waits out `delay-500` while the
   *  incoming one fades in over it), so an unconditional 1.03 would jump it in
   *  full view: pressing at the top of a dwell is the worst case, 1.000 →
   *  1.030 — 27.8px of width and 16.3px of height on the 928 × 542 box, in
   *  one frame. PER SLIDE, not "the one that just left": two presses inside
   *  500ms leave TWO outgoing photos showing, and the older would otherwise
   *  jump under the newer.
   *
   *  The value parked is the one last DRAWN, which only an effect can know:
   *  `step()` and `goTo()` both `restart()`, so `progress` is already 0 by the
   *  time anything can read it. On a clock turn that is the last frame before
   *  `elapsed >= dwell`, ~0.996 at 60Hz, so the old behaviour survives there
   *  to ~0.0001 of scale. `$effect.pre`: written before the DOM is, or the
   *  outgoing photo paints one frame at the wrong scale. */
  let parked = $state<number[]>([]);

  // Plain variables: a record of what was last drawn, not inputs to anything.
  let shownIndex = carousel.index;
  let shownDrift = 0;
  let wasPaused = carousel.paused;
  $effect.pre(() => {
    const i = carousel.index;
    const paused = carousel.paused;
    const drift = live;
    untrack(() => {
      // BEFORE the turn is handled, so a pause and a turn landing in one flush
      // (a script focusing the arrow and clicking it in one task) read as the
      // arrow's own focus — already on when the turn happened — and not as a
      // Pause pressed after it.
      if (paused && !wasPaused) kickFrozen = true;
      wasPaused = paused;
      if (i === shownIndex) {
        shownDrift = drift;
        return;
      }
      parked[shownIndex] = shownDrift;
      shownIndex = i;
      shownDrift = 0;
      kick = carousel.turnedBy === "visitor" ? { index: i } : null;
      kickElapsed = -carousel.settle;
      kickFrozen = false;
    });
  });

  // The visitor's run. Torn down by a freeze, by the next turn (a new `kick`
  // object) and by losing `eligible`; it stops itself at the end of the dwell.
  $effect(() => {
    if (kick === null || kickFrozen || !carousel.eligible) return;
    let before = performance.now();
    let frame = 0;
    const tick = () => {
      const now = performance.now();
      // max(0): a frame can be stamped a hair before the effect's own sample.
      const total = kickElapsed + Math.max(0, now - before);
      before = now;
      kickElapsed = Math.min(total, DWELL);
      if (total < DWELL) frame = requestAnimationFrame(tick);
    };
    const rebase = () => (before = performance.now());
    document.addEventListener("visibilitychange", rebase);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", rebase);
    };
  });

  /** How far through KEN_BURNS slide `i` is. The incoming photo's own jump
   *  back to 1 happens on the frame it becomes active, when its opacity is
   *  still 0. */
  const drift = (i: number) => (carousel.isActive(i) ? live : (parked[i] ?? 1));

  const zoom = (i: number) =>
    carousel.eligible ? `transform: scale(${(1 + KEN_BURNS * drift(i)).toFixed(5)})` : undefined;
</script>

{#if slides.length === 0}
  <!-- THE EMPTY STATE IS NO BAND: a dark 827px box around an empty card is a
       broken page, and every listing is still one link away (the hero's and
       the footer's "Our portfolio"). What is left is a hidden marker carrying
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

         THE CARD REVEALS ON SCROLL, and carries NO `data-reveal` in the
         server's markup — deliberately, and the two facts are one decision.
         app.css hides `[data-reveal]` at `translateY(50%)`, hard-coded, and
         `src/reveal-hidden-state.test.ts` holds that number against the
         action's default; a call site travelling its own 24px may therefore
         not ship the marker, or CSS would hide it at one distance and JS
         reveal it from another. The cost is that the card paints in its final
         position and is yanked to opacity 0 at hydration, so this is only safe
         where nobody is looking at it when that happens.

         MEASURED — and the first version of this comment was WRONG, which is
         why the numbers are spelled out rather than summarised. It claimed
         1391px at 1440 × 900 and 1072 at 390 × 844, "2.5 and 2.3 viewports
         below the fold". Its own arithmetic did not agree with itself
         (1391 / 900 = 1.55) and it had the two widths the wrong way round
         relative to each other. Re-measured on a production build of the real
         `/`: the card's top is ~1031px at 1440 × 900 and ~1173px at 390 × 844,
         i.e. 1.15 and 1.39 viewports — only 131px of headroom at 1440, not two
         and a half screens of it.

         WHAT THAT MEANS, SAID PLAINLY: on a tall viewport the card is ALREADY
         IN VIEW on load, so the observer fires immediately, `hide()` and
         `show()` collapse into one style recalc, and THE REVEAL SIMPLY DOES
         NOT PLAY. Measured above the fold at 1920 × 1080 (card top 1007), and
         also at 1920 × 1200, 2560 × 1440, 3440 × 1440, 1024 × 1366 and
         834 × 1112. There is no yank there — 460 sampled frames never dropped
         below opacity 1 — so nothing is broken; the animation is just absent
         on the most common desktop resolution there is. That is the honest
         cost of shipping no marker, and it is a product call, not a bug: #105.

         If the band ever moves up the page, or the reveal has to play at 1080,
         this goes back to the action's default travel with a server-rendered
         marker and a `failSafe`.

         `use:animateIn` and not a local IntersectionObserver: one-shot on
         first intersection at threshold 0 is already what the action does, and
         a second copy of it here is exactly the re-derivation CLAUDE.md names
         (Slider, trapFocus, prefersReducedMotion). It is also a complete no-op
         under reduced motion — it tears itself down before it hides anything —
         which is this animation's reduced-motion answer. -->
    <div
      {...carousel.region}
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
          {@const widths = cappedWidths(slide.image, DEFAULT_IMAGE_WIDTHS)}
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
            >
              <img
                src={imgix(slide.image.url, { w: Math.min(1920, Math.max(...widths)) })}
                srcset={srcset(slide.image.url, widths)}
                sizes="(min-width: 1024px) 65vw, 100vw"
                width={slide.image.dimensions.width}
                height={slide.image.dimensions.height}
                alt={slide.image.alt ?? ""}
                loading="lazy"
                decoding="async"
                data-featured-photo
                style={zoom(i)}
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
         which one: off-white on #3d0707, 14.85:1. -->
    <div data-map-slot class="max-lg:order-first lg:col-start-1 lg:row-start-1">
      <!-- THE CAMERA FOLLOWS THE ACTIVE SLIDE, AND THAT IS THE WHOLE GATE.
           WCAG 2.2.2 is live on this band: it autoplays, so a camera that
           moved on its own every four seconds would be auto-moving content in
           parallel with other content. It cannot. `active` is read off
           `carousel.index`, and the index only advances while the carousel is
           `rotating` — which is already `hydrated && eligible && !userPaused &&
           !hovered && !pageHidden && !atEnd`, i.e. every pause, every hover,
           a hidden tab and `prefers-reduced-motion` all stop it. Pressing the
           band's Pause control stops the index, so it stops the map; under
           reduced motion the index never moves at all, so the map never does.
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
           moves on a 4000ms clock with nobody touching anything, which the map
           cannot tell from an arrow press by watching `active` alone. It read
           every auto-advance as the visitor asking, so a pinch or a wheel-zoom
           on the expanded map was thrown away one dwell later: measured on a
           production build of `/` at 390x844, four wheel-up ticks took it to
           z12.5387 and ~9s later the camera had flown back to z12 twice with
           no further input. `carousel.turnedBy` is the only thing that knows,
           because the carousel is what turned it. -->
      <PropertyMap
        points={mapPoints}
        active={slides[carousel.index]?.id ?? null}
        activeBy={carousel.turnedBy}
        label={heading}
        tone="cream"
        class="h-50 w-full lg:h-full"
      />
    </div>
  </section>
{/if}

<style>
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

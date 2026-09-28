<script lang="ts" module>
  // The comp's 2px carousel progress bar (`progress bar` 6843:964: 888 × 2 at
  // 1440, 350 × 2 at 390, 20px under the photo) for a `createCarousel`
  // instance. While the carousel can autoplay it draws `progress` — the
  // current slide's dwell, off the carousel's one clock, so it freezes on
  // every pause and cannot drift from the rotation. Where nothing is timing
  // out (no autoplay, as on issue #14's cards, or reduced motion) it draws
  // `position`, (index + 1) / count, instead of a dead empty track.
  //
  // THE COLOURS ARE NOT THE COMP'S, ON PURPOSE. The comp fills garnet over a
  // dust track on the sand card: fill against track is 5.11:1, but the TRACK
  // is 1.73:1 on sand (1.97 on off-white) — dust is a fill-only token exactly
  // because it disappears on light grounds — and on #14's cards the comp draws
  // fill and track in ONE colour, so there is no bar at all. In position mode
  // this bar is the only visible "2 of 3", so both of its edges are
  // information (WCAG 1.4.11): the fill must be 3:1 against the track AND the
  // track 3:1 against the ground. Three colours each 3:1 apart need at least
  // 9:1 between the outer two, and garnet on sand is 8.87 — no track colour
  // exists for the comp's fill on the homepage card; the best possible is
  // 2.98 / 2.97. So:
  //
  //   "garnet" — light grounds: fill `dark` #3d0707 (13.09:1 on sand), track
  //              the same colour at 53%.   sand      3.66 fill:track  3.57 track:ground
  //                                        off-white 4.03             3.69
  //                                        white     4.47             3.81
  //   "cream"  — dark grounds: fill off-white, track off-white at 44%.
  //                                        garnet    3.17             3.17
  //                                        #3d0707   4.04             3.68
  //
  // The track is an ALPHA of the fill rather than a fourth and fifth token, so
  // one class serves every ground of its tone; the passing windows are 48–59%
  // and 42–46%. It must therefore sit on the flat card ground, never over a
  // photo. CarouselProgress.test.ts recomputes every ratio above from app.css
  // and these strings. On a 2px line #3d0707 for #652323 is not a visible
  // change; the track going from near-invisible to visible is, and is the point.
  export const PROGRESS_TONES = {
    garnet: { fill: "bg-dark", track: "bg-dark/53" },
    cream: { fill: "bg-background", track: "bg-background/44" },
  } as const;
</script>

<script lang="ts">
  import type { Carousel } from "$lib/carousel.svelte";

  interface Props {
    /** The `createCarousel` instance whose clock (or position) this draws. */
    carousel: Carousel;
    tone?: keyof typeof PROGRESS_TONES;
    class?: string;
  }

  let { carousel, tone = "garnet", class: passedClasses = "" }: Props = $props();

  const timed = $derived(carousel.eligible);

  // THE BAR DISSOLVES AT A CLOCK TURN — a decision REVERSED, not a bug fixed.
  // It used to snap to 0 on the frame the index changed and wait out the
  // handover there, on the reading that a bar still fading says "counting"
  // after the count is over. The comp cross-dissolves a full bar into an empty
  // one and the operator asked for the comp. See the journal entry of
  // 2026-09-21 on the featured band, and the forward pointer under it.
  //
  // WHAT DISSOLVES IS OPACITY, AND ONLY OPACITY. There is no
  // `transition-transform` here and never will be: that would be the second
  // clock this component's header refuses — it would keep sliding after a
  // pause — and app.css would zero it under reduced motion anyway. The value
  // is written from carousel state every frame; only its opacity eases.
  //
  // `rotating`, not `settling` alone: after a MANUAL turn `elapsed` is parked
  // at -settle with no frame loop to run it down, so `settling` stays true
  // indefinitely and a bar gated on it alone would fade out and never come
  // back.
  //
  // AND ONLY A CLOCK TURN HANDS OVER — `turnedBy === "auto"` (2026-09-23).
  // Without it, the two conditions above were also true for the settle a
  // VISITOR's turn parks, the moment rotation resumed over it: press an arrow
  // (focus is a pause), then Play — or swipe, where the pointer that stopped
  // the clock leaves with the finger — and the bar drew FULL, 887px at 1440,
  // and faded out over 500ms, for a dwell that had been abandoned at whatever
  // it had reached and was never counted out. Measured on the featured band
  // before this line: 41 frames in `handover` at 887px after a manual turn
  // and Play. So the paragraph below — "a handover only ever follows a
  // COMPLETED dwell" — was false on the visitor's path, and is true now.
  // A visitor's turn restarts the dwell, so the bar sits at 0 through the
  // settle and fills from there.
  //
  // WHAT THE BAR DOES AT THE VISITOR'S TURN ITSELF is unchanged, and on
  // purpose: it drops to 0 on the frame of the turn. The consumer's slide
  // dissolves there now (the featured band's `fade`, operator call
  // 2026-09-23), but a full bar is not what the clock last said, and a
  // partial one fading out would need the pre-turn value remembered and a
  // timer to end a fade the stopped clock never will — the second clock this
  // header refuses.
  const handover = $derived(
    timed && carousel.rotating && carousel.settling && carousel.turnedBy === "auto",
  );

  // AND IT HOLDS FULL WHILE IT FADES. This is the correction that made the
  // dissolve exist: `progress` is `clamp01(elapsed / dwell)` and `elapsed` is
  // NEGATIVE through the settle, so it reads 0 for the whole handover. The
  // first version of this drew `scaleX(0)` and faded the opacity of that —
  // a 500ms cross-fade on a box with no width, which paints nothing. Measured
  // on a production build: painted width 0.00px for every frame of the
  // handover (max 0.02) while computed opacity went 1.000 -> 0.102, and three
  // element screenshots 290ms apart were byte-identical. The bar snapped to
  // empty exactly as it had before, and four new assertions all passed,
  // because every one of them read `opacity` — a channel that ramps just as
  // prettily on something invisible.
  //
  // So the handover draws 1. That is not a second clock and not a lie about
  // the value: a handover only ever follows a COMPLETED dwell (the turn fires
  // when `elapsed >= dwell`, i.e. at progress 1, and `restart()` then parks
  // `elapsed` at -settle), so "full" is what the clock last said. It is still
  // a pure function of carousel state with no transition on the transform.
  //
  // The same flag drives both, which is what keeps the two ends honest. When
  // the clock stops mid-handover — a hover, a hidden tab — `rotating` goes
  // false, and the fill returns to `progress` (0) in the SAME frame that its
  // opacity returns to 1. A `scaleX(0)` box paints nothing at any opacity, so
  // there is no pop to see: the review that caught the bug above predicted one
  // here, and it is answered by the gating rather than by new state.

  const value = $derived(timed ? (handover ? 1 : carousel.progress) : carousel.position);

  // The arrows' rule, for the same reason (#47): a bar drawn before script
  // runs is a timer that will never move, or a "2 of 3" that cannot change.
  // It holds its 2px of the row either way — `visibility`, never `display`.
  const quiet = $derived(!carousel.hydrated);
</script>

<!-- aria-hidden: it is a timer, or a picture of "n of N" — the slide labels and
     the live region already say both. No CSS transition on the TRANSFORM while
     it is timed: the clock draws every frame, and easing on top would be a
     second clock that keeps moving after a pause. Opacity is not the value, so
     it may dissolve — see `handover` above. Position mode has no clock, so its
     transform may glide (and app.css zeroes that under reduced motion).
     `data-js-only`, like the arrows: without script nothing will ever move it.

     The fade's duration is the carousel's OWN `settle`, not a number written
     here, so the bar is gone exactly when the consumer's slide has finished
     handing over whatever that consumer's dissolve costs. Coming back it is
     0ms: by then the fill is already at scaleX(0) and there is nothing to
     watch arrive. -->
{#if carousel.enabled && carousel.count > 1}
  <div
    aria-hidden="true"
    data-js-only
    data-carousel-progress={timed ? "timed" : "position"}
    data-carousel-quiet={quiet ? "" : undefined}
    class="relative h-0.5 w-full overflow-hidden {quiet ? 'invisible' : ''} {PROGRESS_TONES[tone]
      .track} {passedClasses}"
  >
    <div
      data-carousel-fill={handover ? "handover" : timed ? "timed" : "position"}
      class="absolute inset-0 origin-left {PROGRESS_TONES[tone].fill} {timed
        ? `transition-opacity ease-linear ${handover ? 'opacity-0' : 'opacity-100'}`
        : 'transition-transform duration-300 ease-out'}"
      style="transform: scaleX({value}){timed
        ? `; transition-duration: ${handover ? carousel.settle : 0}ms`
        : ''}"
    ></div>
  </div>
{/if}

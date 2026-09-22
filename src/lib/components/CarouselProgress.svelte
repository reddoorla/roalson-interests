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
  const value = $derived(timed ? carousel.progress : carousel.position);

  // The arrows' rule, for the same reason (#47): a bar drawn before script
  // runs is a timer that will never move, or a "2 of 3" that cannot change.
  // It holds its 2px of the row either way — `visibility`, never `display`.
  const quiet = $derived(!carousel.hydrated);
</script>

<!-- aria-hidden: it is a timer, or a picture of "n of N" — the slide labels and
     the live region already say both. No CSS transition while it is timed: the
     clock draws every frame, and easing on top would be a second clock that
     keeps moving after a pause. Position mode has no clock, so it may glide
     (and app.css zeroes that under reduced motion). `data-js-only`, like the
     arrows: without script nothing will ever move it. -->
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
      class="absolute inset-0 origin-left {PROGRESS_TONES[tone].fill} {timed
        ? ''
        : 'transition-transform duration-300 ease-out'}"
      style="transform: scaleX({value})"
    ></div>
  </div>
{/if}

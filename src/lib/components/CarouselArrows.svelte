<script lang="ts" module>
  // The comp's carousel arrows (`l arrow` / `r arrow`, 6843:972 / 6843:977 in
  // the homepage `properties slideshow` set; the same pair on issue #14's 390
  // cards) for a `createCarousel` instance, plus the pause / play control the
  // comp does not draw and WCAG 2.2.2 requires of anything that autoplays.
  //
  // Measured: 40 × 40, radius 20, a 1px stroke drawn INSIDE the frame, no fill,
  // the 25 × 25 glyph centred (7.5 inset), 10px between the two. The glyph is
  // `np_arrow-right_888647` — both arrows were exported from Figma and the
  // right one's two paths are ArrowRight.svelte's numbers shifted by the 7.5
  // inset, to the fourth decimal; the left is the same frame rotated 180°
  // (`rotate(-180 …)` in the export), not a second drawing. So this renders
  // ArrowRight, turned, rather than shipping the path a second time.
  //
  // The hit area is 44 × 44 (a `::before` 2px proud of the circle): the comp's
  // 40 clears WCAG 2.5.8's 24 but not the 44 a thumb wants, and the 10px gap
  // leaves 6 between neighbouring targets. The inset is -3px, not -2: an
  // absolute box is placed from the PADDING box, which starts inside the 1px
  // ring. `-inset-0.5` measured 42 × 42 in Chromium.
  //
  // Tones are named for the CONTROL's colour, as BrandButton's are, and take
  // its hovers: "garnet" on the light grounds (sand, off-white; hover fills
  // garnet with dust glyph, 5.11:1), "cream" on the garnet card and the dark
  // band (hover fills off-white with garnet glyph, 10.07:1).
  //
  // Neither tone sets a focus ring. app.css's floor draws it in `--focus-ring`,
  // which each GROUND class sets for what sits on it (`.bg-primary > *` and
  // `.bg-dark > *` give off-white, the light grounds garnet) — so the ring
  // follows the card these are placed on, not the tone. A cream arrow therefore
  // needs a classified dark ground somewhere above it, which is the only place
  // it is legible anyway; src/focus-floor.test.ts fails on a ground class that
  // is in neither list. Read in Chromium on the fixtures, arrows and slide
  // links both: off-white on the garnet card, garnet on the sand one
  // (tests/interaction/carousel.spec.ts).
  export const ARROW_TONES = {
    garnet:
      "border-primary text-primary not-aria-disabled:hover:bg-primary not-aria-disabled:hover:text-dust",
    cream:
      "border-background text-background not-aria-disabled:hover:bg-background not-aria-disabled:hover:text-primary",
  } as const;

  // `border` on a `size-10` border-box IS Figma's inside stroke: the circle
  // stays 40 wide with the 1px ring inside it.
  //
  // Exported because the homepage hero's video control is the same 40px ring
  // with the same hit area and the same glyph, on a surface that has no
  // carousel in it (HeroBackgroundVideo). Sharing the string is what keeps the
  // site's ONE control shape one string — the alternative was a second
  // transcription of these eleven utilities, which is how two controls drift.
  export const ARROW_SHAPE =
    "relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border " +
    "border-solid transition-colors before:absolute before:-inset-[3px] before:content-[''] " +
    "aria-disabled:cursor-default aria-disabled:opacity-40";
</script>

<script lang="ts">
  import ArrowRight from "$lib/components/ArrowRight.svelte";
  import PlayPauseGlyph from "$lib/components/PlayPauseGlyph.svelte";
  import type { Carousel } from "$lib/carousel.svelte";

  interface Props {
    /** The `createCarousel` instance these buttons drive. */
    carousel: Carousel;
    tone?: keyof typeof ARROW_TONES;
    class?: string;
  }

  let { carousel, tone = "garnet", class: passedClasses = "" }: Props = $props();

  // QUIET UNTIL SCRIPT PROVES ITSELF (#47). `data-js-only` only covers the
  // browser that says it will never run script; a browser that WOULD run it
  // and never receives the bundle (a CDN 404, a blocked host, a parse error)
  // gets controls that look live and do nothing. `carousel.hydrated` is the
  // one signal that is false in both cases and true only once an effect has
  // run — so the controls SHIP, holding the row's height, and stay
  // `visibility: hidden` + `inert` until then: not visible, not focusable,
  // not clickable. `visibility` and not `display`, because the reserved space
  // is the point: this row must not jump when script arrives.
  const quiet = $derived(!carousel.hydrated);

  const button = $derived(`${ARROW_SHAPE} ${ARROW_TONES[tone]}`);
</script>

<!-- Nothing to drive with one slide (or a carousel switched off), so nothing is
     drawn. `data-js-only`: these ship in the server's markup so the row does
     not jump in at hydration, and app.html's <noscript> rule hides them from a
     browser that could never run them. `data-carousel-quiet` is `quiet` made
     visible — the attribute a browser test reads to prove the state exists at
     all, rather than inferring it from a class name. -->
{#if carousel.enabled && carousel.count > 1}
  <div
    data-js-only
    data-carousel-quiet={quiet ? "" : undefined}
    inert={quiet}
    class="flex items-center gap-[10px] {quiet ? 'invisible' : ''} {passedClasses}"
  >
    {#if carousel.eligible}
      <!-- First in the carousel's tab order (APG), and only where rotation is
           possible: under reduced motion it never starts, so there is nothing
           to pause. The glyphs are drawn for this — the comp has none — and
           live in PlayPauseGlyph.svelte since the homepage hero's video control
           needs the same pair. -->
      <button {...carousel.pauseButton} class={button}>
        <PlayPauseGlyph paused={carousel.paused} />
      </button>
    {/if}
    <button {...carousel.prevButton} class={button}>
      <ArrowRight class="rotate-180" />
    </button>
    <button {...carousel.nextButton} class={button}><ArrowRight /></button>
  </div>
{/if}

<script lang="ts">
  // The pause / play glyph for every WCAG 2.2.2 control on this site — the
  // carousel's (CarouselArrows) and the homepage hero's video
  // (HeroBackgroundVideo). The comp draws neither, so these two paths were
  // drawn for the job in the carousel arrow's own box and weight: a 25 box,
  // bars 14 tall like the arrowhead and as thick as its 2.083 shaft, and a
  // triangle on the same 14.
  //
  // It is a file rather than two inline <svg>s because it is now used twice:
  // written out again it would be a redrawing of an asset this repo already
  // ships, and the copies would drift the first time either box changed.
  // Extracted verbatim from CarouselArrows — the paths, the 25 box, the
  // `aria-hidden`/`focusable` pair and the `currentColor` fill are all
  // unchanged, so CarouselArrows.test.ts's path-count assertions still measure
  // the same DOM.
  interface Props {
    /** True draws PLAY (the triangle) — i.e. what pressing it will do next. */
    paused: boolean;
  }
  let { paused }: Props = $props();
</script>

<svg viewBox="0 0 25 25" width="25" height="25" aria-hidden="true" focusable="false">
  {#if paused}
    <path d="M9 5.52L20 12.5L9 19.48V5.52Z" fill="currentColor" />
  {:else}
    <path d="M8.4 5.52H10.483V19.48H8.4V5.52Z" fill="currentColor" />
    <path d="M14.517 5.52H16.6V19.48H14.517V5.52Z" fill="currentColor" />
  {/if}
</svg>

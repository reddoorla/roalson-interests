<script lang="ts">
  // The reference assembly of the headless carousel ($lib/carousel.svelte.ts)
  // with its two parts, on plain slides. It has two readers: the axe gate, via
  // the fixtures page, and carousel.svelte.test.ts, which renders THIS file —
  // so the markup axe audits is the markup whose semantics are pinned, not a
  // look-alike written for the test.
  //
  // The layout is the one both real consumers need: every slide stacked in one
  // grid cell (so the box is as tall as the tallest and never changes height),
  // the inactive ones transparent and `inert`; the controls BEFORE the slides
  // in the DOM so Pause is first in the carousel's tab order (APG).
  import CarouselArrows from "$lib/components/CarouselArrows.svelte";
  import CarouselProgress from "$lib/components/CarouselProgress.svelte";
  import { createCarousel } from "$lib/carousel.svelte";

  interface Props {
    count?: number;
    label?: string;
    labelledby?: string;
    loop?: boolean;
    autoplay?: number;
    settle?: number;
    enabled?: boolean;
    /** "garnet" controls on the sand card, "cream" on the garnet one. */
    tone?: "garnet" | "cream";
  }

  let {
    count = 3,
    label = "Example carousel",
    labelledby = "",
    loop = true,
    autoplay = 0,
    settle = 0,
    enabled = true,
    tone = "garnet",
  }: Props = $props();

  const carousel = createCarousel({
    count: () => count,
    label: () => label,
    labelledby: () => labelledby,
    loop: () => loop,
    autoplay: () => autoplay,
    settle: () => settle,
    enabled: () => enabled,
  });
</script>

<!-- `data-carousel-ready` is `hydrated` made visible: absent in the server's
     markup, present once script has adopted the carousel — what a browser test
     waits on before it presses anything. -->
<div
  {...carousel.region}
  data-carousel-fixture={tone}
  data-carousel-ready={carousel.hydrated ? "" : undefined}
  class="p-5 {tone === 'cream' ? 'bg-primary text-background' : 'bg-light text-primary'}"
>
  <div class="flex min-h-10 items-start justify-between gap-5">
    <p class="t-h4">Slide {carousel.index + 1}</p>
    <CarouselArrows {carousel} {tone} />
  </div>
  <CarouselProgress {carousel} {tone} class="mt-5" />
  <!-- Switched off (`enabled: false`, issue #14 from `md` up) it is a plain
       stacked list: no stacking cell, nothing transparent. -->
  <div class="mt-5 {carousel.enabled ? 'grid' : 'space-y-5'}" {...carousel.swipe}>
    {#each Array(count) as _, i (i)}
      <div
        {...carousel.slide(i)}
        class={!carousel.enabled
          ? ""
          : carousel.isActive(i)
            ? "col-start-1 row-start-1 opacity-100 transition-opacity duration-500"
            : "pointer-events-none col-start-1 row-start-1 opacity-0 transition-opacity duration-500"}
      >
        <p class="t-body-2">Slide body {i + 1}</p>
        <a href="#carousel-heading" class="t-body-2 underline">Link in slide {i + 1}</a>
      </div>
    {/each}
  </div>
  <p class="sr-only" {...carousel.status}>{carousel.statusText}</p>
</div>

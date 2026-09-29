<script lang="ts">
  // One section of the Properties listing as the 390 comp's in-card carousel
  // (#14; `feature scroll` 6997:1607 and `regular scroll` 6997:1749): the
  // `createCarousel` instance, the element that is its region, and its live
  // region. The LIST is the caller's — PropertyListing renders the <ul>, the
  // cards and the controls through `children`, because the same <ul> is the
  // stacked list with no script and from `lg` up, where the map's centre rule
  // watches it, and it must not be a different element in the two states.
  //
  // A component rather than a call in PropertyListing's script because
  // `createCarousel` registers effects and needs an owner per section, and
  // the sections are a list: one instance per `{#each}` item lives and dies
  // with that item.
  //
  // Switched off (`enabled` false: no script, before hydration, `lg` and up,
  // or a single listing) this is a plain <div> around the list — the
  // primitive's bags come back empty — and the live region is an empty,
  // silent <p>.
  import { untrack, type Snippet } from "svelte";

  import { createCarousel, type Carousel } from "$lib/carousel.svelte";

  interface Props {
    /** How many slides — the section's listings. */
    count: number;
    /** The region's accessible name. */
    label: string;
    /** The caller's switch: true below `lg` once hydrated. One listing is
     *  never a carousel, whatever this says. */
    enabled: boolean;
    /** Handed the instance once, so the caller can drive it (a pin press). */
    onready?: (carousel: Carousel) => void;
    children: Snippet<[Carousel]>;
    class?: string;
  }

  let { count, label, enabled, onready, children, class: passedClasses = "" }: Props = $props();

  // No autoplay: the comp wires the arrows only (ON_CLICK → CHANGE_TO, no
  // AFTER_TIMEOUT on these sets), so there is no clock and no Pause to owe.
  // Loop, as the comp's last variant's right arrow goes back to the first.
  const own = createCarousel({
    count: () => count,
    label: () => label,
    enabled: () => enabled && count > 1,
  });
  // Once: the instance never changes, so neither does what the caller holds.
  untrack(() => onready?.(own));
</script>

<!-- `data-carousel-ready` is `hydrated` made visible, as on the fixture: what
     a browser test waits on before it presses anything. -->
<div
  {...own.region}
  data-listing-carousel
  data-carousel-ready={own.enabled && own.hydrated ? "" : undefined}
  class={passedClasses}
>
  {@render children(own)}
  <p class="sr-only" {...own.status}>{own.statusText}</p>
</div>

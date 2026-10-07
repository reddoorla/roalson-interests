<script lang="ts">
  // The homepage's photo band — the comp's `Frame 205` (6825:530 at 1440,
  // 6994:881 at 390): 800px tall, 240 on a phone, one full-width photo and
  // NOTHING drawn over it — no scrim, no text, no stroke. It is
  // STICKY_SCROLLS, and the footer is later in the comp's z-order and scrolls
  // normally: the band pins, and the footer slides up over it.
  //
  // THE PHOTO. The comp's is `weston-m-…-unsplash`, one of the five unlicensed
  // stock files issue #3 lists. It is not in this repo, in `mocks.json` or in
  // the fixtures, and it must never be. `image` is the field a licensed one
  // goes in. Empty — the launch state — the band keeps the comp's height on
  // the brand gradient: what PageMasthead does for the Properties masthead
  // (#15) and what operator call 11 chose for the hero, so ONE treatment means
  // "licensed photo pending" site-wide. (The comp gives this band no ground of
  // its own at all: delete the photo and the page frame's pale blue #eff9fb
  // shows, a colour used nowhere else.)
  //
  // THE CROP is `object-fit: cover` anchored to the BOTTOM. The comp's image
  // box is a full-width 3:2 at every width with its bottom edge on the band's
  // — 1440×960.1 at y=−160.1, 1280×853 at −53, 390×260 at −20 — which is
  // exactly what a 3:2 source does in a cover box with `object-position: 50%
  // 100%`. No parallax is needed to explain those numbers, and none is built.
  //
  // THE PIN is CSS, and it is in src/app.css (`[data-pinned-band]`), not in
  // this file's classes — read the comment there before changing either half.
  // This component's share of it is two ELEMENTS:
  //
  //   <section data-pinned-band>      the band
  //   <div class="pinned-band-spacer"> exactly one footer-height of room
  //
  // `position: sticky` is bounded by its PARENT. The band is the last thing in
  // <main> and the footer is outside <main>, so on its own the band's
  // containing block ends where the band ends and it has nowhere to stick.
  // The spacer is that room; app.css sizes it from the `--footer-h` the footer
  // publishes and lays the footer back over it with an equal negative margin,
  // so the document is not one pixel taller. (`padding-bottom` on <main> would
  // NOT do: a sticky box is held inside the content box.)
  //
  // The spacer is a SIBLING, never a child: inside the band it would be part
  // of the sticky box and give it no travel at all.
  //
  // `overflow-clip`, not `overflow-hidden`: the band clips its own photo
  // either way, but `clip` does not make it a scroll container.
  import { isFilled, type Content } from "@prismicio/client";
  import PinnedPhotoBand from "$lib/components/PinnedPhotoBand.svelte";

  let { slice }: { slice: Content.PhotoBandSlice } = $props();

  const image = $derived(isFilled.image(slice.primary.image) ? slice.primary.image : undefined);
</script>

<PinnedPhotoBand
  {image}
  data-slice-type={slice.slice_type}
  data-slice-variation={slice.variation}
  height="[--band-h:240px] lg:[--band-h:800px]"
/>

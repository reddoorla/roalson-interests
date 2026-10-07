<script lang="ts">
  // A full-width photo band that pins while the footer slides up over it,
  // shared by the homepage's PhotoBand slice and the Properties page. The pin
  // is app.css's `[data-pinned-band]` block, and only holds when this is the
  // last thing in <main>: the band, then the spacer as its SIBLING (inside the
  // band it would give the sticky box no travel). `--band-h`, set by `height`,
  // is read twice: by the band's own height and by the pin's `top`. The photo
  // is lazy (`preload={false}`): below the fold wherever this is placed, so it
  // never competes for the LCP.
  import type { ImageField } from "@prismicio/client";
  import type { HTMLAttributes } from "svelte/elements";

  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";

  interface Props extends Omit<HTMLAttributes<HTMLElement>, "class"> {
    image?: ImageField;
    height: string;
    crop?: string;
  }

  let { image, height, crop = "object-bottom", ...rest }: Props = $props();
</script>

<section
  {...rest}
  data-pinned-band
  class="h-(--band-h) overflow-clip bg-gradient-to-b from-primary to-dark {height}"
>
  {#if image}
    <HeroBackgroundImage {image} preload={false} class="block h-full w-full object-cover {crop}" />
  {/if}
</section>
<div aria-hidden="true" class="pinned-band-spacer"></div>

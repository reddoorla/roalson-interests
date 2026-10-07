<script lang="ts">
  import type { ImageField } from "@prismicio/client";
  import type { HTMLAttributes } from "svelte/elements";

  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";

  interface Props extends HTMLAttributes<HTMLElement> {
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

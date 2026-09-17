<script lang="ts">
  import HeroBackgroundImage from "$lib/components/HeroBackgroundImage.svelte";
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import ContentBand from "$lib/components/ContentBand.svelte";
  import { PrismicLink, PrismicRichText } from "@prismicio/svelte";
  import type { Content } from "@prismicio/client";

  let { slice }: { slice: Content.HeroSlice } = $props();

  let hasImage = $derived(!!slice.primary.background_image?.url);
</script>

<!-- Full-bleed image band. When the slice carries a background image we
     stand the band 45vh tall so the photo shows; white overlay copy comes
     from the section class. -->
<ContentBand
  sliceType={slice.slice_type}
  variation={slice.variation}
  fallbackHeight={hasImage ? "45vh" : undefined}
  sectionClass="hero-band relative isolate overflow-hidden bg-neutral-900 text-white"
  contentClass="relative z-10 max-w-4xl px-6 py-24 text-center"
>
  {#snippet background()}
    {#if hasImage}
      <HeroBackgroundImage image={slice.primary.background_image} preload={false} />
    {/if}
  {/snippet}
  <PrismicRichText field={slice.primary.heading} />
  <RichTextBody field={slice.primary.body} />
  {#if slice.primary.cta_label && slice.primary.cta_link}
    <PrismicLink
      field={slice.primary.cta_link}
      class="mt-6 inline-block bg-white px-6 py-3 font-medium text-black"
    >
      {slice.primary.cta_label}
    </PrismicLink>
  {/if}
</ContentBand>

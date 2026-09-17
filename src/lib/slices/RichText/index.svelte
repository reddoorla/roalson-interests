<script lang="ts">
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import ContentBand from "$lib/components/ContentBand.svelte";
  import type { Content } from "@prismicio/client";

  let { slice }: { slice: Content.RichTextSlice } = $props();
</script>

<!-- Standalone copy blocks are centered section openers and interstitial
     blurbs — centered, on a comfortable measure. -->
<ContentBand
  sliceType={slice.slice_type}
  variation={slice.variation}
  contentClass="richtext-block max-w-3xl px-6 py-10 text-center"
>
  <RichTextBody field={slice.primary.content} />
</ContentBand>

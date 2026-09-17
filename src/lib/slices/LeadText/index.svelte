<script lang="ts">
  import RichTextBody from "$lib/components/RichTextBody.svelte";
  import ContentBand from "$lib/components/ContentBand.svelte";
  import type { RichTextField } from "@prismicio/client";

  // Inline prop types keep this slice's contract readable at a glance; they
  // mirror the generated Content.LeadTextSlice shape.
  type Props = {
    slice: {
      slice_type: string;
      variation?: string;
      primary: {
        eyebrow?: string | null;
        body: RichTextField;
      };
    };
  };
  let { slice }: Props = $props();
</script>

<!-- A labelled lead paragraph: a small eyebrow above the opening copy. Plain,
     token-driven styling so a site can restyle it freely. -->
<ContentBand
  sliceType={slice.slice_type}
  variation={slice.variation}
  contentClass="richtext-block max-w-2xl px-6 py-10"
>
  {#if slice.primary.eyebrow}
    <!-- The eyebrow names the section → it's the section heading (h2). -->
    <h2 class="mb-3 text-sm font-semibold tracking-wide text-secondary uppercase">
      {slice.primary.eyebrow}
    </h2>
  {/if}
  <div class="text-lg">
    <RichTextBody field={slice.primary.body} />
  </div>
</ContentBand>

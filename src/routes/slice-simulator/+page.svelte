<script lang="ts">
  import { SliceSimulator, SliceZone } from "@prismicio/svelte";
  import { components } from "$lib/slices";
</script>

<SliceSimulator>
  {#snippet children({ slices })}
    <SliceZone {slices} {components} />
  {/snippet}
</SliceSimulator>

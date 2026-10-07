<script lang="ts">
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import PinnedPhotoBand from "$lib/components/PinnedPhotoBand.svelte";
  import PropertyListing from "$lib/components/PropertyListing.svelte";
  import { PROPERTIES_BAND_HEIGHT, PROPERTIES_BAND_CROP } from "$lib/properties-band";

  let { data } = $props();
</script>

<PageMasthead title={data.title} image={data.masthead} />
<PropertyListing sections={data.sections} />
{#if data.band}
  <PinnedPhotoBand image={data.band} height={PROPERTIES_BAND_HEIGHT} crop={PROPERTIES_BAND_CROP} />
{/if}

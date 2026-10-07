<script lang="ts">
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import PropertyListing from "$lib/components/PropertyListing.svelte";

  import type { Snapshot } from "./$types";

  let { data } = $props();

  let listing: ReturnType<typeof PropertyListing> | undefined = $state();

  export const snapshot: Snapshot<Record<string, string>> = {
    capture: () => listing?.capture() ?? {},
    restore: (saved) => listing?.restore(saved),
  };
</script>

<PageMasthead title={data.title} image={data.masthead} />
<PropertyListing bind:this={listing} sections={data.sections} />

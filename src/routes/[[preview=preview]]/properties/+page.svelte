<script lang="ts">
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import PropertyListing from "$lib/components/PropertyListing.svelte";

  let { data } = $props();
</script>

<PageMasthead title={data.title} image={data.masthead} />
<PropertyListing sections={data.sections} />

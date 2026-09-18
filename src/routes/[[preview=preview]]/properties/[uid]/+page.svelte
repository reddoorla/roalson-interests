<script lang="ts">
  import PropertyDetail from "$lib/components/PropertyDetail.svelte";

  let { data } = $props();
</script>

<PropertyDetail property={data.property} />

<script lang="ts">
  import PersonProfile from "$lib/components/PersonProfile.svelte";

  let { data } = $props();
</script>

<PersonProfile person={data.person} />

<script lang="ts">
  // The property page at full width, through the real layout, with a filled
  // fixture listing. /properties/<uid> cannot render until the Prismic repo is
  // wired and a listing is published, and /dev/* 404s on every deployed build
  // (see ../+layout.server.ts) — so this is where the design is reviewed until
  // then. /dev/a11y-fixtures carries the same component for the axe gate, but
  // inside a 768px column that never reaches its two-column layout.
  import { page } from "$app/state";
  import PropertyDetail from "$lib/components/PropertyDetail.svelte";
  import { propertyFixture } from "$lib/property-fixture";

  // ?status=Sold (or "Under Contract") to review the other states.
  const status = $derived(page.url.searchParams.get("status") ?? "Available");
</script>

<PropertyDetail
  property={propertyFixture({ status: status as "Available" | "Under Contract" | "Sold" })}
/>

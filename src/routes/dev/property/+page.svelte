<script lang="ts">
  // The property page at full width, through the real layout, with a filled
  // fixture listing. /properties/<uid> cannot render until the Prismic repo is
  // wired and a listing is published, and /dev/* 404s on every deployed build
  // (see ../+layout.server.ts) — so this is where the design is reviewed until
  // then. /dev/a11y-fixtures carries the same component for the axe gate, but
  // inside a 768px column that never reaches its two-column layout.
  //
  //   ?status=Sold | Under Contract   the other listing states
  //   ?photo                          with the fixture's photo — which renders
  //                                   as alt text here: the fixture image is a
  //                                   data: pixel, and PrismicImage appends
  //                                   imgix params to it. No-photo is the
  //                                   default because it is the common case.
  import { page } from "$app/state";
  import PropertyDetail from "$lib/components/PropertyDetail.svelte";
  import { propertyFixture } from "$lib/property-fixture";

  const params = $derived(page.url.searchParams);
  const status = $derived(params.get("status") ?? "Available");
</script>

<PropertyDetail
  property={propertyFixture({
    status: status as "Available" | "Under Contract" | "Sold",
    ...(params.has("photo") ? {} : { feature_image: {} }),
  })}
/>

<script lang="ts">
  // The listing page at full width, through the real layout, with the fixture
  // portfolio. /properties renders empty until the Prismic repo is wired and
  // listings are published, and /dev/* 404s on every deployed build (see
  // ../+layout.server.ts) — so this is where the page is reviewed until then.
  // /dev/a11y-fixtures carries the same components for the axe gate, inside a
  // 768px column that never reaches the two-column layout.
  //
  //   ?empty   the no-listings state
  //
  // Fixture photos are data: pixels, which PrismicImage turns into imgix URLs,
  // so cards render their alt text where the photo would be.
  import { page } from "$app/state";
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import PropertyListing from "$lib/components/PropertyListing.svelte";
  import { propertyListingFixture } from "$lib/property-fixture";
  import { groupListings } from "$lib/property-listing";
  import { LISTING_TITLE } from "$lib/property-listing-load";

  const sections = $derived(
    page.url.searchParams.has("empty") ? [] : groupListings(propertyListingFixture()),
  );
</script>

<PageMasthead title={LISTING_TITLE} />
<PropertyListing {sections} />

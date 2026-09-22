<script lang="ts">
  // The listing page at full width, through the real layout, with the fixture
  // portfolio. /properties renders empty until the Prismic repo is wired and
  // listings are published, and /dev/* 404s on every deployed build (see
  // ../+layout.server.ts) — so this is where the page is reviewed until then.
  // /dev/a11y-fixtures carries the same components for the axe gate, inside a
  // 768px column that never reaches the two-column layout.
  //
  //   ?empty     the no-listings state
  //   ?nophoto   the masthead with no `page_media` photo — the brand gradient,
  //              which is what /properties draws until an editor fills the
  //              field (#15). The default carries the photo, because that is
  //              the page as designed.
  //
  // Fixture photos are data: pixels, which PrismicImage turns into imgix URLs,
  // so cards render their alt text where the photo would be. The masthead's is
  // a drawing for the same reason (see PROPERTIES_MASTHEAD_FIXTURE) — and a
  // deliberately near-white one, so the scrim is reviewed against the ground it
  // was sized for rather than a forgiving one.
  import { page } from "$app/state";
  import PageMasthead from "$lib/components/PageMasthead.svelte";
  import PropertyListing from "$lib/components/PropertyListing.svelte";
  import { PROPERTIES_MASTHEAD_FIXTURE, propertyListingFixture } from "$lib/property-fixture";
  import { groupListings } from "$lib/property-listing";
  import { LISTING_TITLE } from "$lib/property-listing-load";

  const sections = $derived(
    page.url.searchParams.has("empty") ? [] : groupListings(propertyListingFixture()),
  );
  const masthead = $derived(
    page.url.searchParams.has("nophoto") ? null : PROPERTIES_MASTHEAD_FIXTURE,
  );
</script>

<PageMasthead title={LISTING_TITLE} image={masthead} />
<PropertyListing {sections} />

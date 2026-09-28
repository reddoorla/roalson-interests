<script lang="ts">
  // The profile page through the real layout, with a fixture person —
  // /team/<uid> cannot render until a `person` is published (see dev/property).
  //
  //   ?real    a real biography: no placeholder chip
  //   ?photo   with a generated headshot
  import { page } from "$app/state";
  import PersonProfile from "$lib/components/PersonProfile.svelte";
  import { PARTNER_PHOTO_FIXTURE } from "$lib/home-fixture";
  import { personFixture } from "$lib/person-fixture";

  const params = $derived(page.url.searchParams);
</script>

<PersonProfile
  person={personFixture({
    ...(params.has("real") ? { bio_is_placeholder: false } : {}),
    ...(params.has("photo") ? { photo: PARTNER_PHOTO_FIXTURE } : {}),
  } as never)}
/>

<script lang="ts">
  // The homepage at full width, through the real layout, from fixture data.
  // `/` answers 404 until the Prismic repo is wired and a `home` document is
  // published, and /dev/* 404s on every deployed build (see
  // ../+layout.server.ts) — so this is where the homepage is reviewed until
  // then, and what tests/interaction/home-hero.spec.ts drives.
  //
  // It is the home route's own markup over $lib/home-fixture: every later
  // homepage band adds its builder to `homeFixture()` and shows up here with no
  // edit to this file.
  //
  //   ?poster   with a poster in the hero — a generated drawing, not a photo
  //             (the comp's still is watermarked stock, #3). No poster is the
  //             default because it is the launch state.
  //   ?bare     a `home` document with NO hero slice: the route still opens on
  //             the dark 528px ground its `navOver` claim promises.
  //   ?bio      the first partner has a bio, so ONE card carries PROFILE and the
  //             other does not. No bio is the default: it is the launch state.
  //   ?photos   both partner cards carry a headshot — a generated drawing (the
  //             comp's two are placeholders, #3). Launch has none.
  //   ?photo    with a picture in the photo band — again a drawing, not the
  //             comp's unlicensed stock. Empty (the gradient) is the default.
  import { SliceZone } from "@prismicio/svelte";
  import { page } from "$app/state";
  import {
    HOME_PHOTO_FIXTURE,
    HOME_POSTER_FIXTURE,
    homeFixture,
    partnersFixtureState,
  } from "$lib/home-fixture";
  import { splitHomeHero } from "$lib/home-page";
  import { components } from "$lib/slices";
  import HomeHero from "$lib/slices/HomeHero/index.svelte";

  const params = $derived(page.url.searchParams);
  const slices = $derived(
    homeFixture(
      params.has("poster") ? { poster: HOME_POSTER_FIXTURE as never } : {},
      params.has("photo") ? { image: HOME_PHOTO_FIXTURE as never } : {},
    ).map((slice) =>
      slice.slice_type === "partners" && (params.has("bio") || params.has("photos"))
        ? partnersFixtureState({ bio: params.has("bio"), photos: params.has("photos") })
        : slice,
    ),
  );
  const home = $derived(
    splitHomeHero(params.has("bare") ? slices.filter((s) => s.slice_type !== "home_hero") : slices),
  );
</script>

<HomeHero slice={home.hero} />
<SliceZone slices={home.rest} {components} />

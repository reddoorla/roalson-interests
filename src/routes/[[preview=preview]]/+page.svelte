<script lang="ts">
  // The home route does not leave its first band to the SliceZone. It claims
  // `navOver: "dark"` as a literal (+page.server.ts), so the dark band has to be
  // there for EVERY `home` document: the first `home_hero` is lifted out of the
  // slices and rendered first — with none, HomeHero still paints the dark 528px
  // ground — and the rest go to the SliceZone in the editor's order.
  //
  // <HomeHero> must stay this file's FIRST tag, outside any block:
  // src/routes/nav-over.test.ts reads it, and cannot tell a band inside an
  // {#if} from an unconditional one.
  import { SliceZone } from "@prismicio/svelte";
  import { splitHomeHero } from "$lib/home-page";
  import { components } from "$lib/slices";
  import HomeHero from "$lib/slices/HomeHero/index.svelte";

  let { data } = $props();

  const home = $derived(splitHomeHero(data.page.data.slices));
</script>

<HomeHero slice={home.hero} />
<SliceZone slices={home.rest} {components} />

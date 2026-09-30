<script lang="ts">
  // The site's error page, inside the root layout's bar and footer, in the
  // Properties page's vocabulary: its column and gutters, its section divider
  // (a 2px garnet rule over a label) and `button dark`.
  //
  // The <h1> is the status and nothing else. reddoor-maintenance's launch gate
  // tells THIS site's 404 from a parked domain or a CDN's by
  // `<h1[^>]*>\s*404\s*<\/h1>` (SITE_404_MARKER, src/recipes/launch.ts).
  import { page } from "$app/state";
  import BrandButton from "$lib/components/BrandButton.svelte";
  import { OFFICE } from "$lib/office";
  import { composeTitle } from "$lib/seo";

  const missing = $derived(page.status === 404);
  const label = $derived(missing ? "Page not found" : "Something went wrong");
</script>

<svelte:head>
  <title>{composeTitle(label)}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-[1440px] px-5 pt-10 pb-[100px] text-primary sm:px-8 lg:pt-20 xl:px-20">
  <div class="border-t-2 border-primary pt-[18px]">
    <p class="t-h3">{label}</p>
  </div>
  <h1 class="t-h1 pt-10">{page.status}</h1>
  <p class="t-body-1 mt-5 max-w-[560px]">
    {#if missing}
      We couldn't find that page. It may have moved when our website was redesigned — our properties
      and how to reach us are one click away.
    {:else}
      Please try again in a moment, or call us at
      <a
        href={OFFICE.phone.href}
        class="inline-block underline underline-offset-4 hover:no-underline"
        >{OFFICE.phone.display}</a
      >.
    {/if}
  </p>
  <div class="mt-10 flex flex-wrap gap-2.5">
    <BrandButton href="/properties" arrow>Properties</BrandButton>
    <BrandButton href="/contact" arrow>Contact us</BrandButton>
    <BrandButton href="/">Home</BrandButton>
  </div>
</div>

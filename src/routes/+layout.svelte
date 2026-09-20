<script lang="ts">
  import { PrismicPreview } from "@prismicio/svelte/kit";
  import { page } from "$app/state";
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { repositoryName } from "$lib/prismicio";
  import "../app.css";
  import Seo from "$lib/components/Seo.svelte";
  import { composeTitle, DEFAULT_OG_IMAGE, isNoindexPage, NOINDEX_ENFORCED } from "$lib/seo";
  import TransitionOverlay from "$lib/components/TransitionOverlay.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { loadSiteConfig, footerColumns } from "$lib/site-config";
  import { disableSmoothScroll, restoreSmoothScroll } from "$lib/utils/instantNavScroll";

  let { data, children } = $props();

  // Site chrome from src/lib/site-config.json (empty stub → logo-only Nav +
  // placeholder Footer). A route's own page data takes precedence in each
  // chrome component.
  const siteConfig = loadSiteConfig();

  // Kit's own post-nav scroll (top / hash anchor / popstate restore) runs
  // instantly instead of gliding under app.css's smooth-scroll. See the util.
  beforeNavigate(disableSmoothScroll);
  afterNavigate(restoreSmoothScroll);
</script>

<!-- Single head source for the whole app. Static routes feed their title
     (and optional description/image) through `page.data`; per-page <svelte:head>
     title overrides would desync og:title, so pages set data, not tags. -->
<Seo
  title={composeTitle(page.data.meta_title || page.data.title)}
  description={page.data.meta_description}
  image={page.data.meta_image || DEFAULT_OG_IMAGE || undefined}
  imageAlt={page.data.meta_image_alt}
  url={page.url}
  noindex={NOINDEX_ENFORCED && isNoindexPage(page.url.pathname, page.data.noindex)}
  jsonLd={page.data.jsonLd}
/>
<a
  href="#main-content"
  class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:bg-white focus:text-primary focus:px-4 focus:py-2 focus:rounded focus:shadow"
>
  Skip to main content
</a>
<!-- Chrome renders from page data when a route supplies navLinks/footerColumns,
     else from the site-config stub. Each component applies its own
     page-data-over-config precedence. -->
<div class="flex flex-col min-h-screen">
  <Nav navLinks={page.data.navLinks} items={siteConfig.nav.items} logo={siteConfig.nav.logo} />

  <main id="main-content" tabindex="-1" class="flex-1">
    {@render children?.()}
  </main>

  <Footer
    columns={footerColumns(page.data.footerColumns, siteConfig)}
    socials={siteConfig.footer.socials}
    owner={siteConfig.footer.owner}
    text={siteConfig.footer.text}
  />
</div>
<TransitionOverlay />
{#if data.isPreviewSession}
  <PrismicPreview {repositoryName} />
{/if}

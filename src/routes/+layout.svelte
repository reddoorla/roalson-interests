<script lang="ts">
  import { PrismicPreview } from "@prismicio/svelte/kit";
  import { page } from "$app/state";
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { repositoryName } from "$lib/prismicio";
  import "../app.css";
  import Seo from "$lib/components/Seo.svelte";
  import {
    composeTitle,
    DEFAULT_OG_IMAGE,
    DEFAULT_OG_IMAGE_ALT,
    isNoindexPage,
    NOINDEX_ENFORCED,
  } from "$lib/seo";
  import TransitionOverlay from "$lib/components/TransitionOverlay.svelte";
  import Nav from "$lib/components/Nav.svelte";
  import Footer from "$lib/components/Footer.svelte";
  import { loadSiteConfig, footerNav } from "$lib/site-config";
  import { canvasTopStyle } from "$lib/canvas-top";
  import { disableSmoothScroll, restoreSmoothScroll } from "$lib/utils/instantNavScroll";

  let { data, children } = $props();

  // Site chrome from src/lib/site-config.json. A route speaks to it through
  // page data: `navOver` (what the bar sits on), `navWordmark` (whether the
  // bar's wordmark waits for the hero's cutout to leave — the homepage only)
  // and `footerGround` (what the footer's ground grades from).
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
  imageAlt={page.data.meta_image_alt ?? (page.data.meta_image ? undefined : DEFAULT_OG_IMAGE_ALT)}
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
<!-- The page's ground above its own top edge (`.canvas-top` in app.css): a
     100vh block sitting entirely above y=0, which a rubber-band pull at the top
     of the page translates into view. It is here, ONCE, rather than in each
     route, and OUTSIDE the wrapper below so it cannot come between <main> and
     <footer> — the pinned photo band's rules in app.css are written on that
     adjacency. The colour is the route's own claim; a route that claims nothing
     keeps the page ground. The foot of the page is the canvas (`html` in
     app.css) and needs no element. -->
<div class="canvas-top" aria-hidden="true" style={canvasTopStyle(page.data.canvasTop)}></div>
<!-- Chrome renders from site-config; a route says what its first band is with
     `navOver`, and the homepage asks for the footer's graded ground with
     `footerGround`. -->
<div class="flex flex-col min-h-screen">
  <Nav
    items={siteConfig.nav.items}
    logo={siteConfig.nav.logo}
    cta={siteConfig.nav.cta}
    over={page.data.navOver}
    wordmark={page.data.navWordmark}
    currentPath={page.url.pathname}
  />

  <!-- The bar is out of flow (70px, 80 from `lg`), so <main> clears it — unless
       the route's first band is the dark one the bar floats over (`navOver`),
       which starts at y=0 as the comp draws it. -->
  <main
    id="main-content"
    tabindex="-1"
    class="flex-1 {page.data.navOver === 'dark' ? '' : 'pt-[70px] lg:pt-20'}"
  >
    {@render children?.()}
  </main>

  <Footer
    cta={siteConfig.footer.cta}
    nav={footerNav(siteConfig)}
    legal={siteConfig.footer.legal}
    logo={siteConfig.nav.logo}
    ground={page.data.footerGround}
    currentPath={page.url.pathname}
    owner={siteConfig.footer.owner}
    text={siteConfig.footer.text}
  />
</div>
<TransitionOverlay />
{#if data.isPreviewSession}
  <PrismicPreview {repositoryName} />
{/if}
